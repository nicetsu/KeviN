/**
 * สายคุยกับ Live API — จับไมค์ ต่อ WebSocket เล่นเสียงกลับ และรัน tool
 *
 * เบราว์เซอร์ต่อตรงไป Google (ephemeral token) แต่ **tool วิ่งกลับมาที่เซิร์ฟเวอร์เรา**
 * เสมอผ่าน `/api/read/*` เพราะตัวกรอง Area อยู่ที่นั่น — ถ้าลัดไปถาม Supabase
 * จากเบราว์เซอร์ตรง ๆ ตัวกรองจะถูกข้าม (doc/CHAT.md §3)
 *
 * ⚠️ เพดาน 15 นาทีของ Live API ต้องไม่มีใครเห็น · `startedAt` ไม่รีเซ็ตตอนต่อสายใหม่
 *    ถ้าตัวจับเวลาเด้งกลับเป็น 00:00 ผู้ใช้จะอ่านว่าสายหลุด ทั้งที่บทสนทนาต่อเนื่องอยู่
 */

export type CallState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'reconnecting'

export type Caption = { who: 'user' | 'kevin'; text: string }

export type CallHooks = {
  onState: (state: CallState) => void
  /** ข้อความที่พูด/ตอบ · ต่อท้ายเรื่อย ๆ จนจบ turn */
  onCaption: (c: Caption) => void
  /** จบหนึ่ง turn แล้ว — เอาไปปิดก้อนคำบรรยายและบันทึกลงประวัติ */
  onTurnEnd: () => void
  onError: (message: string) => void
  onEnded: (reason: string) => void
}

const WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/' +
  'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained'

/** Live API รับ 16 kHz · ตอบกลับ 24 kHz */
const IN_RATE = 16_000
const OUT_RATE = 24_000

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  // แบ่งเป็นช่วงเพราะ String.fromCharCode รับอาร์กิวเมนต์ได้จำกัด
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

const fromBase64 = (b64: string) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * แปลงสาเหตุที่เปิดไมค์ไม่ได้เป็นคำที่บอกทางออก
 *
 * "เริ่มสายไม่สำเร็จ" เฉย ๆ ไม่ช่วยอะไรเลยทั้งที่เรารู้สาเหตุจริง —
 * แนวเดียวกับหน้า /settings ที่แยก "ยังไม่ได้ขอสิทธิ์" ออกจาก "ถูกปฏิเสธ"
 */
export function micReason(e: unknown): string {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'ไม่ได้รับอนุญาตให้ใช้ไมค์ — เปิดสิทธิ์ไมโครโฟนของเว็บนี้ในตั้งค่าเบราว์เซอร์แล้วลองใหม่'
  }
  if (name === 'NotFoundError') return 'ไม่พบไมโครโฟนบนเครื่องนี้'
  if (name === 'NotReadableError') return 'ไมโครโฟนถูกแอปอื่นใช้อยู่ ปิดแอปนั้นแล้วลองใหม่'
  return e instanceof Error && e.message ? e.message : 'เริ่มสายไม่สำเร็จ'
}

export class VoiceCall {
  private ws: WebSocket | null = null
  private micCtx: AudioContext | null = null
  private outCtx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null

  /** จุดเวลาที่เสียงถัดไปควรเริ่มเล่น · ทำให้ก้อนเสียงต่อกันสนิทไม่ขาดเป็นห้วง */
  private playAt = 0
  private playing: AudioBufferSourceNode[] = []

  private handle: string | null = null
  private muted = false
  private closing = false
  private model = ''
  private token = ''

  /** เวลาที่เริ่มสายจริง ๆ · **ห้ามรีเซ็ตตอนต่อสายใหม่** */
  readonly startedAt = Date.now()

  constructor(private hooks: CallHooks) {}

  // ---- วงจรชีวิต -------------------------------------------------------

  async start(): Promise<void> {
    this.hooks.onState('connecting')
    try {
      await this.openMic()
      await this.connect()
    } catch (e) {
      this.hooks.onError(micReason(e))
      await this.stop('')
    }
  }

  async stop(reason = 'วางสายแล้ว'): Promise<void> {
    this.closing = true
    this.stopPlayback()
    try { this.ws?.close() } catch { /* ปิดไปแล้วก็ไม่เป็นไร */ }
    this.ws = null
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    await this.micCtx?.close().catch(() => {})
    await this.outCtx?.close().catch(() => {})
    this.micCtx = this.outCtx = null
    // เหตุผลว่าง = ล้มตั้งแต่ยังไม่ได้สาย · onError บอกไปแล้ว ไม่ต้องทับด้วยข้อความกว้าง ๆ
    this.hooks.onEnded(reason)
  }

  setMuted(muted: boolean) {
    this.muted = muted
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = !muted })
  }

  // ---- ไมค์ ------------------------------------------------------------

  private async openMic() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })

    // บังคับ 16 kHz ตั้งแต่ต้นทาง เบราว์เซอร์รีแซมเปิลให้เอง
    this.micCtx = new AudioContext({ sampleRate: IN_RATE })
    await this.micCtx.audioWorklet.addModule('/pcm-recorder.js')

    this.node = new AudioWorkletNode(this.micCtx, 'pcm-recorder')
    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (this.muted || this.ws?.readyState !== WebSocket.OPEN) return
      this.ws.send(JSON.stringify({
        realtimeInput: { audio: { data: toBase64(e.data), mimeType: `audio/pcm;rate=${IN_RATE}` } },
      }))
    }
    this.micCtx.createMediaStreamSource(this.stream).connect(this.node)

    // AudioContext ต้องเริ่มจาก user gesture — อีกเหตุผลที่หน้าโทรต้องมีปุ่ม "เริ่มโทร"
    this.outCtx = new AudioContext({ sampleRate: OUT_RATE })
    await this.outCtx.resume()
  }

  // ---- สาย -------------------------------------------------------------

  private async token_() {
    const res = await fetch('/api/voice/token', { method: 'POST' })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error ?? 'ขอ token ไม่สำเร็จ')
    this.token = data.token
    this.model = data.model
  }

  private async connect() {
    if (!this.token) await this.token_()

    const ws = new WebSocket(`${WS_BASE}?access_token=${encodeURIComponent(this.token)}`)
    this.ws = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({
        setup: {
          model: `models/${this.model}`,
          // config ที่เหลือถูกล็อกไว้กับ token แล้วตั้งแต่ฝั่งเซิร์ฟเวอร์
          // ส่งเฉพาะ handle ที่เปลี่ยนได้ตามรอบการต่อสาย
          ...(this.handle ? { sessionResumption: { handle: this.handle } } : {}),
        },
      }))
      this.hooks.onState('listening')
    }

    ws.onmessage = async (e) => {
      const text = typeof e.data === 'string' ? e.data : await (e.data as Blob).text()
      try { this.handle_(JSON.parse(text)) } catch { /* เฟรมที่อ่านไม่ออก ข้ามไป */ }
    }

    ws.onerror = () => this.hooks.onError('สายมีปัญหา')

    ws.onclose = () => {
      if (this.closing) return
      // ครบ 15 นาที หรือเน็ตสะดุด — ต่อใหม่ด้วย handle เดิม ผู้ใช้ไม่ต้องรู้
      if (this.handle) {
        this.hooks.onState('reconnecting')
        // token อายุ 30 นาที ยาวกว่าสายหนึ่งเส้นเท่าตัว รอบแรกจึงไม่ต้องขอใหม่
        this.connect().catch(() => this.stop('สายหลุด ต่อใหม่ไม่ได้'))
      } else {
        this.stop('สายหลุด')
      }
    }
  }

  // ---- ข้อความจากเซิร์ฟเวอร์ -------------------------------------------

  private handle_(msg: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (msg.sessionResumptionUpdate?.newHandle) {
      // เก็บไว้ตลอดสาย ไม่ใช่ตอนใกล้ครบเวลา — เน็ตหลุดกลางทางก็ใช้อันเดียวกัน
      this.handle = msg.sessionResumptionUpdate.newHandle
    }

    const sc = msg.serverContent
    if (sc?.interrupted) {
      // ผู้ใช้พูดแทรก — ทิ้งเสียงที่ยังไม่ได้เล่นทันที ไม่งั้นสองเสียงทับกัน
      this.stopPlayback()
      this.hooks.onState('listening')
    }

    if (sc?.inputTranscription?.text) {
      this.hooks.onCaption({ who: 'user', text: sc.inputTranscription.text })
    }
    if (sc?.outputTranscription?.text) {
      this.hooks.onCaption({ who: 'kevin', text: sc.outputTranscription.text })
    }

    for (const part of sc?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) this.play(part.inlineData.data)
    }

    if (sc?.turnComplete) {
      this.hooks.onTurnEnd()
      this.hooks.onState('listening')
    }

    if (msg.toolCall?.functionCalls?.length) {
      this.hooks.onState('thinking')
      void this.runTools(msg.toolCall.functionCalls)
    }
  }

  private async runTools(calls: { id: string; name: string; args?: Record<string, unknown> }[]) {
    const responses = await Promise.all(calls.map(async (call) => {
      let response: unknown
      try {
        const res = await fetch(`/api/read/${encodeURIComponent(call.name)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(call.args ?? {}),
        })
        response = await res.json()
      } catch {
        // ต้องบอกโมเดลว่าดึงไม่ได้ **ห้ามคืนว่าง** ไม่งั้นมันจะสรุปว่า "ไม่มีอะไร"
        response = { ok: false, error: 'ต่อเซิร์ฟเวอร์ไม่ได้' }
      }
      return { id: call.id, name: call.name, response }
    }))

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }))
    }
  }

  // ---- เล่นเสียง -------------------------------------------------------

  private play(b64: string) {
    const ctx = this.outCtx
    if (!ctx) return

    const pcm = new Int16Array(fromBase64(b64).buffer)
    const buf = ctx.createBuffer(1, pcm.length, OUT_RATE)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000

    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)

    // ต่อคิวจากจุดที่ก้อนก่อนจบ · ถ้าเลยไปแล้วให้เริ่มเดี๋ยวนี้
    this.playAt = Math.max(this.playAt, ctx.currentTime)
    src.start(this.playAt)
    this.playAt += buf.duration

    this.playing.push(src)
    src.onended = () => { this.playing = this.playing.filter((s) => s !== src) }
    this.hooks.onState('speaking')
  }

  private stopPlayback() {
    for (const s of this.playing) { try { s.stop() } catch { /* จบไปแล้ว */ } }
    this.playing = []
    this.playAt = 0
  }
}
