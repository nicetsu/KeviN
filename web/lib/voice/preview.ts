/**
 * ฟังตัวอย่างเสียงก่อนเลือก
 *
 * ⚠️ **เปิดสาย Live API จริง ไม่ได้ใช้ TTS มาเล่นตัวอย่าง**
 *    เพราะพิสูจน์แล้วว่า Live ให้เสียงไม่เหมือน TTS — โมเดล native audio
 *    ทับเสียงที่เราตั้งในบางภาษา (doc/TRAPS.md) · ถ้าให้ฟังจาก TTS
 *    ผู้ใช้จะเลือกเสียงจากสิ่งที่ไม่ใช่สิ่งที่ได้ยินตอนโทรจริง คือหลอกกันเอง
 *
 * ราคาที่จ่าย: กดฟังหนึ่งครั้ง = เปิดสายจริงหนึ่งครั้ง กินโควตาเสียง
 *
 * **ไม่ขอสิทธิ์ไมค์** เพราะแค่ฟังอย่างเดียว ไม่ต้องส่งเสียงขึ้นไป
 */
import type { Lang } from '@/lib/ai/lang'
import type { VoiceChoice } from '@/lib/ai/voices'

const WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/' +
  'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained'

const OUT_RATE = 24_000

/**
 * ประโยคตัวอย่าง — จงใจใส่ตัวเลข เวลา และรหัสห้อง
 * เพราะนั่นคือจุดที่เสียงสังเคราะห์เพี้ยนบ่อยที่สุด และเป็นสิ่งที่ KeviN พูดจริง
 */
const SAMPLE: Record<Lang, string> = {
  th: 'พูดประโยคนี้: สวัสดีครับ ผม KeviN พรุ่งนี้คุณมีเรียนสองวิชา สิบโมงเช้าที่ห้อง E 17501 ครับ',
  en: 'Say exactly this: Hi, I am KeviN. You have two classes tomorrow, the first at ten in room E 17501.',
}

const fromBase64 = (b64: string) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export class PreviewError extends Error {}

/**
 * เปิดสายสั้น ๆ ให้พูดหนึ่งประโยคแล้ววาง
 *
 * คืนค่าเมื่อพูดจบ หรือโยน error พร้อมเหตุผลจริงจาก Google
 * `cancel()` ที่คืนมาใช้หยุดกลางคันได้ ตอนผู้ใช้กดเสียงอื่นทับ
 */
export function previewVoice(
  lang: Lang,
  voice: VoiceChoice,
  onDone: (error?: string) => void
): () => void {
  let ws: WebSocket | null = null
  let ctx: AudioContext | null = null
  let playAt = 0
  let stopped = false
  let lastEnd = 0

  const cleanup = () => {
    stopped = true
    try { ws?.close() } catch { /* ปิดไปแล้ว */ }
    void ctx?.close().catch(() => {})
    ctx = null
  }

  const finish = (error?: string) => {
    if (stopped) return
    cleanup()
    onDone(error)
  }

  void (async () => {
    try {
      const res = await fetch('/api/voice/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lang, voice }),
      })
      const data = await res.json()
      if (!data.ok) throw new PreviewError(data.error ?? 'ขอ token ไม่สำเร็จ')
      if (stopped) return

      // สร้างหลังกดปุ่ม จึงยังอยู่ในบริบทของ user gesture ที่เบราว์เซอร์ต้องการ
      ctx = new AudioContext({ sampleRate: OUT_RATE })
      await ctx.resume()

      ws = new WebSocket(`${WS_BASE}?access_token=${encodeURIComponent(data.token)}`)

      ws.onopen = () => ws?.send(JSON.stringify({ setup: { model: `models/${data.model}` } }))

      ws.onmessage = async (e) => {
        const text = typeof e.data === 'string' ? e.data : await (e.data as Blob).text()
        let msg: Record<string, unknown>
        try { msg = JSON.parse(text) } catch { return }

        if ('setupComplete' in msg) {
          ws?.send(JSON.stringify({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: SAMPLE[lang] }] }],
              turnComplete: true,
            },
          }))
          return
        }

        /* eslint-disable @typescript-eslint/no-explicit-any */
        const sc = (msg as any).serverContent
        for (const part of sc?.modelTurn?.parts ?? []) {
          if (!part.inlineData?.data || !ctx) continue
          const pcm = new Int16Array(fromBase64(part.inlineData.data).buffer)
          const buf = ctx.createBuffer(1, pcm.length, OUT_RATE)
          const ch = buf.getChannelData(0)
          for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000
          const src = ctx.createBufferSource()
          src.buffer = buf
          src.connect(ctx.destination)
          playAt = Math.max(playAt, ctx.currentTime)
          src.start(playAt)
          playAt += buf.duration
          lastEnd = playAt
        }

        if (sc?.turnComplete) {
          // รอให้เสียงที่ต่อคิวไว้เล่นจนจบก่อนค่อยปิด ไม่งั้นเสียงขาดกลางคัน
          const waitMs = Math.max(0, (lastEnd - (ctx?.currentTime ?? 0)) * 1000)
          setTimeout(() => finish(), waitMs + 150)
        }
        /* eslint-enable @typescript-eslint/no-explicit-any */
      }

      ws.onerror = () => finish('ต่อสายทดสอบไม่ได้')
      ws.onclose = (e) => {
        // เหตุผลจริงจาก Google — ถ้าชื่อเสียงไม่ถูกต้อง จะบอกไว้ตรงนี้
        const why = (e.reason ?? '').trim()
        if (why) finish(`ฟังตัวอย่างไม่ได้ · ${why.slice(0, 200)}`)
      }
    } catch (e) {
      finish(e instanceof Error ? e.message : 'ฟังตัวอย่างไม่ได้')
    }
  })()

  return cleanup
}
