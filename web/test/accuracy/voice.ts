/**
 * โหมดโทร — ต่อ Live API **ของจริง** ผ่าน WebSocket ด้วย config ชุดเดียวกับ
 * `app/api/voice/token/route.ts` แล้วป้อนประโยคเป็น **ข้อความแทนเสียง**
 *
 * ⚠️ ที่ป้อนเป็นข้อความไม่ใช่เสียง เพราะสิ่งที่วัดคือ **ความเข้าใจกับความแม่นของร่าง**
 *    ไม่ใช่คุณภาพการถอดเสียง · ถ้าป้อนเสียงจริงแล้วผิด จะแยกไม่ออกว่าผิดที่หูหรือที่หัว
 *    ประโยคในชุดจึงเขียนแบบ "ที่ ASR ถอดออกมา" คือไม่มีเครื่องหมายวรรคตอน
 *
 * ⚠️ ยังใช้ `responseModalities: ['AUDIO']` ตามของจริง — พฤติกรรมการเรียก tool
 *    ของโหมดเสียงกับโหมดข้อความไม่เท่ากัน เปลี่ยนตรงนี้แล้วผลที่วัดจะไม่ใช่ของจริง
 *
 * ทั้งหมดนี้เดินตาม `lib/voice/session.ts` — tool วิ่งผ่าน `runTool()` ตัวเดียวกัน
 * ซึ่งเป็นที่อยู่ของตัวกรอง Area
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { runTool, toolDeclarations } from '../../lib/ai/tools'
import { systemPrompt } from '../../lib/ai/prompt'
import type { Draft } from '../../lib/drafts'
import { stubDb, TODAY } from './fixtures'
import type { Call, Turn } from './harness'

const WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/' +
  'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained'

const VOICE_MODEL = process.env.GEMINI_VOICE_MODEL ?? 'gemini-3.1-flash-live-preview'

/** เงียบเกินเท่านี้หลัง turnComplete = จบจริง · เผื่อ toolCall ที่ตามมาทีหลัง */
const QUIET_MS = 1500
const TURN_TIMEOUT_MS = 75_000

/** ขอ token ด้วย config เดียวกับที่เซิร์ฟเวอร์จริงล็อกไว้ให้เบราว์เซอร์ */
async function mintToken(): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('ยังไม่ได้ตั้ง GEMINI_API_KEY')

  const now = Date.now()
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      bidiGenerateContentSetup: {
        model: `models/${VOICE_MODEL}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
        },
        systemInstruction: { parts: [{ text: systemPrompt('voice', TODAY, 'th') }] },
        tools: [{ functionDeclarations: toolDeclarations() }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        sessionResumption: {},
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ขอ token ไม่สำเร็จ (${res.status}) ${body.slice(0, 300)}`)
  }
  const json = (await res.json()) as { name?: string }
  if (!json.name) throw new Error('ไม่ได้ token กลับมา')
  return json.name
}

/**
 * สายหนึ่งเส้น พูดได้หลายประโยค — เหมือนของจริงที่ผู้ใช้ไม่ได้วางสายทุกประโยค
 * และประหยัดโควตาด้วย เพราะ token หนึ่งใบเปิดสายได้ครั้งเดียว
 */
export class VoiceProbe {
  private ws!: WebSocket
  private db = stubDb()
  private onMessage: ((msg: Record<string, any>) => void) | null = null

  async open(): Promise<void> {
    const token = await mintToken()
    this.ws = new WebSocket(`${WS_BASE}?access_token=${encodeURIComponent(token)}`)

    await new Promise<void>((resolve, reject) => {
      const fail = (why: string) => reject(new Error(why))
      this.ws.onerror = () => fail('ต่อสายไม่ได้')
      this.ws.onclose = (e) => fail(`สายปิดก่อนเริ่ม · ${(e as CloseEvent).reason || 'ไม่บอกเหตุผล'}`)
      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({ setup: { model: `models/${VOICE_MODEL}` } }))
      }
      this.ws.onmessage = async (e: MessageEvent) => {
        const raw = typeof e.data === 'string' ? e.data : await (e.data as Blob).text()
        let msg: Record<string, any>
        try { msg = JSON.parse(raw) } catch { return }
        if (msg.setupComplete) {
          this.ws.onclose = null
          this.ws.onerror = null
          resolve()
          return
        }
        this.onMessage?.(msg)
      }
    })

    // หลัง setup แล้วให้ทุกเฟรมวิ่งเข้า handler ของ turn ที่กำลังรออยู่
    this.ws.onmessage = async (e: MessageEvent) => {
      const raw = typeof e.data === 'string' ? e.data : await (e.data as Blob).text()
      try { this.onMessage?.(JSON.parse(raw)) } catch { /* เฟรมที่อ่านไม่ออก ข้ามไป */ }
    }
  }

  close() {
    try { this.ws?.close() } catch { /* ปิดไปแล้วก็ไม่เป็นไร */ }
  }

  /** พูดหนึ่งประโยคแล้วรอจนจบ turn (รวมรอบ tool ทั้งหมด) */
  async say(text: string): Promise<Turn> {
    const calls: Call[] = []
    const drafts: Draft[] = []
    let reply = ''
    let sawTurnComplete = false
    let pendingTools = 0

    return new Promise<Turn>((resolve) => {
      let quiet: NodeJS.Timeout | null = null
      const hard = setTimeout(() => finish('หมดเวลารอคำตอบ'), TURN_TIMEOUT_MS)

      const finish = (error?: string) => {
        if (quiet) clearTimeout(quiet)
        clearTimeout(hard)
        this.onMessage = null
        resolve({ calls, drafts, reply: reply.trim(), error })
      }

      const maybeDone = () => {
        if (quiet) clearTimeout(quiet)
        if (!sawTurnComplete || pendingTools > 0) return
        quiet = setTimeout(() => finish(), QUIET_MS)
      }

      this.onMessage = (msg) => {
        const sc = msg.serverContent
        if (sc?.outputTranscription?.text) reply += sc.outputTranscription.text
        if (sc?.turnComplete) sawTurnComplete = true

        if (msg.toolCall?.functionCalls?.length) {
          sawTurnComplete = false
          pendingTools++
          void this.answerTools(msg.toolCall.functionCalls, calls, drafts).finally(() => {
            pendingTools--
            maybeDone()
          })
        }
        maybeDone()
      }

      this.ws.send(JSON.stringify({
        clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true },
      }))
    })
  }

  /** เหมือน `runTools()` ใน `lib/voice/session.ts` เป๊ะ — รวมทั้งสิ่งที่ส่งกลับเข้าสาย */
  private async answerTools(
    fns: { id: string; name: string; args?: Record<string, unknown> }[],
    calls: Call[],
    drafts: Draft[]
  ) {
    const responses = await Promise.all(fns.map(async (call) => {
      const logged: Call = { name: call.name, args: call.args ?? {} }
      calls.push(logged)
      const result = await runTool(call.name, call.args ?? {}, { db: this.db, today: TODAY })

      let response: unknown
      if (!result.ok) {
        logged.outcome = `ปฏิเสธ: ${result.error}`
        response = { ok: false, error: result.error }
      } else if ('draft' in result) {
        drafts.push(result.draft)
        logged.outcome = `ร่าง “${result.draft.title}”`
        response = {
          ok: true,
          note: 'ร่างขึ้นบนจอแล้ว ยังไม่ได้บันทึก — บอกผู้ใช้สั้น ๆ ให้ทานแล้วกดยืนยัน',
          title: result.draft.title,
        }
      } else {
        logged.outcome = `${result.rows.length} แถว`
        response = { rows: result.rows, hidden: result.hidden }
      }
      return { id: call.id, name: call.name, response }
    }))

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }))
    }
  }
}
