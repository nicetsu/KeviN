/**
 * คุยกับ Gemini ผ่าน REST — ไม่มี SDK เพราะโปรเจกต์นี้ไม่เพิ่ม dependency ถ้าไม่จำเป็น
 *
 * ⚠️ **API key อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น** ไม่มี `NEXT_PUBLIC_` นำหน้าเด็ดขาด
 *    ตัวแปรที่ขึ้นต้นด้วย NEXT_PUBLIC_ ทุกตัวไปอยู่ใน bundle ที่ผู้ใช้เปิดดูได้ (doc/TRAPS.md)
 */

import {
  classifyRateLimit,
  isTransient,
  rateLimitMessage,
  upstreamMessage,
  type RateLimit,
} from './quota'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * ชื่อรุ่นย้ายมาอยู่ใน env เพราะรุ่นของ Gemini เปลี่ยนชื่อบ่อยกว่าโค้ดของเรา
 * และโหมดเสียงกับโหมดแชตต้องใช้คนละรุ่นเพื่อให้ **โควตาแยกกัน** (ARCHITECTURE.md §6)
 */
export const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL ?? 'gemini-3.1-flash-lite'

/**
 * ⚠️ `Part` มีฟิลด์อื่นที่เราไม่ได้ประกาศไว้ด้วย และ**ต้องส่งกลับไปครบ**
 *
 * Gemini 3 แนบ `thoughtSignature` มากับ part ที่เป็น `functionCall`
 * ถ้าประกอบ turn ของโมเดลขึ้นมาใหม่เองแล้วใส่แค่ `functionCall` รอบถัดไปจะได้
 * **400 Function call is missing a thought_signature** · จึงใช้ index signature
 * ไว้รับฟิลด์ที่ไม่รู้จัก แล้วส่ง `parts` ชุดเดิมกลับไปทั้งก้อน ไม่แกะประกอบใหม่
 */
export type Part = {
  text?: string
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
  /**
   * รูปที่แนบมากับข้อความ · `data` เป็น base64 เปล่า ๆ ไม่มี `data:` นำหน้า
   *
   * ⚠️ **ขาไปเท่านั้น** — เราไม่เคยส่ง part ชนิดนี้กลับเข้าไปในรอบถัดไป
   *    รูปมีชีวิตแค่คำขอเดียวแล้วหายไป ประวัติเก็บเป็น `[รูป]` (lib/chat/image.ts)
   */
  inlineData?: { mimeType: string; data: string }
  [extra: string]: unknown
}

export type Content = { role: 'user' | 'model'; parts: Part[] }

export type FunctionDeclaration = {
  name: string
  description: string
  parameters: unknown
}

/**
 * 429 ต้องแยกว่า "หมดโควตาวัน" กับ "เร็วเกินไป" — เหมารวมแล้วบอกผู้ใช้ผิด
 * และในโหมดเสียงยังดันเขาออกจากโหมดนั้นทั้งรอบด้วย (lib/chat/quota.ts)
 */
function rateLimitOr(status: number, body: string): GeminiError {
  if (status !== 429) {
    /*
     * ⚠️ **body ดิบห้ามขึ้นจอ** — ของเดิมต่อ `body.slice(0, 200)` เข้าไปในข้อความ
     *    ผู้ใช้จึงเห็น JSON ก้อนหนึ่งกลางห้องแชต (เจ้าของเจอบนเครื่องจริง
     *    9 ก.ย. 2026 ตอนแนบรูปโปสเตอร์แล้วเจอ 503) · มันอ่านเหมือนแอปพัง
     *    ทั้งที่แค่ฝั่ง Google แน่นชั่วคราว และไม่ได้บอกว่าต้องทำอะไรต่อ
     *
     *    ของดิบไม่ได้หายไป — ลง log ฝั่งเซิร์ฟเวอร์ให้ตามได้ แค่ไม่ให้ผู้ใช้เห็น
     */
    console.error(`[gemini] ${status} ${body.slice(0, 500)}`)
    return new GeminiError(upstreamMessage(status, 'chat'), status)
  }
  const limit = classifyRateLimit(body)
  return new GeminiError(rateLimitMessage(limit, 'chat'), status, limit)
}

/**
 * ยิงซ้ำเมื่อฝั่ง Google แน่น — **ก่อนเริ่มอ่านสาย เท่านั้น**
 *
 * ⚠️ ปลอดภัยเพราะ 5xx เกิดที่ตัว response แรก **ก่อนมี `delta` สักตัวไหลออกไป**
 *    ยิงซ้ำหลังจากข้อความเริ่มไหลแล้วจะได้คำตอบซ้อนกันสองชุด
 *
 * ⚠️ **ไม่ยิงซ้ำเมื่อ 429** ต่างจากชุดวัดใน `test/accuracy/chat.ts` ที่รอ 20 วินาที
 *    ได้เพราะไม่มีคนนั่งรอ · ที่นี่มีคนถือมือถือรออยู่ · 429 มีข้อความบอกความจริง
 *    อยู่แล้วว่าให้รอเท่าไร ปล่อยให้เขาตัดสินใจเองดีกว่าค้างจอไว้เฉย ๆ
 *
 * สองครั้งพอ · รวมเวลาที่เพิ่มมาแย่สุด ~2.6 วินาทีก่อนยอมแพ้
 */
async function fetchOrRetry(url: string, init: RequestInit): Promise<Response> {
  const WAITS = [600, 2000]
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init)
    if (res.ok || !isTransient(res.status) || attempt >= WAITS.length) return res
    // body ต้องถูกอ่านหรือยกเลิกทิ้ง ไม่งั้น connection ค้าง
    await res.body?.cancel().catch(() => {})
    await new Promise((r) => setTimeout(r, WAITS[attempt]))
  }
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /**
     * มีค่าเฉพาะตอน 429 · **`'day'` เท่านั้นที่แปลว่าให้ไปใช้อีกโหมด**
     * อย่างอื่นคือรออีกไม่กี่วินาทีก็ได้ (lib/chat/quota.ts)
     */
    readonly limit?: RateLimit
  ) {
    super(message)
    this.name = 'GeminiError'
  }
}

type Reply = {
  text: string
  calls: { name: string; args: Record<string, unknown> }[]
  /** parts ดิบของ turn นี้ · ต้อง push กลับเข้า contents ทั้งก้อน ห้ามประกอบใหม่ */
  parts: Part[]
}

export async function generate(opts: {
  system: string
  contents: Content[]
  tools: FunctionDeclaration[]
  signal?: AbortSignal
}): Promise<Reply> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new GeminiError('ยังไม่ได้ตั้ง GEMINI_API_KEY ฝั่งเซิร์ฟเวอร์')

  const res = await fetchOrRetry(`${ENDPOINT}/${CHAT_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: opts.contents,
      tools: [{ functionDeclarations: opts.tools }],
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw rateLimitOr(res.status, body)
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: Part[] } }[]
    promptFeedback?: { blockReason?: string }
  }

  if (json.promptFeedback?.blockReason) {
    throw new GeminiError(`คำถามถูกปฏิเสธ (${json.promptFeedback.blockReason})`)
  }

  const parts = json.candidates?.[0]?.content?.parts ?? []
  const text = parts.map((p) => p.text ?? '').join('').trim()
  const calls = parts
    .flatMap((p) => (p.functionCall ? [p.functionCall] : []))
    .map((c) => ({ name: c.name, args: c.args ?? {} }))

  return { text, calls, parts }
}

/**
 * เหมือน `generate()` ทุกอย่าง แต่ **ส่งข้อความออกมาทีละชิ้นระหว่างที่โมเดลคิด**
 *
 * คืนรูปเดียวกันเป๊ะ (`text` · `calls` · `parts`) วงจร tool ฝั่งเรียกจึงไม่ต้องรู้
 * ว่าใช้ตัวไหนอยู่ · สิ่งเดียวที่เพิ่มมาคือ `onText` ที่ถูกเรียกระหว่างทาง
 *
 * ⚠️ **`parts` ต้องเป็นชิ้นดิบเรียงตามที่ได้มา** — Gemini 3 แนบ `thoughtSignature`
 *    มากับ part ที่เป็น `functionCall` และบังคับให้ส่งกลับครบ · ตรงนี้จึงต่อ
 *    `parts` ของทุกก้อนเข้าด้วยกันตามลำดับ **ไม่ยุบ text หลายชิ้นให้เหลือชิ้นเดียว**
 *    การยุบทำให้ต้องประกอบ part ขึ้นใหม่ ซึ่งเป็นจุดที่ฟิลด์ที่เรามองไม่เห็นหล่นหาย
 */
export async function generateStream(opts: {
  system: string
  contents: Content[]
  tools: FunctionDeclaration[]
  signal?: AbortSignal
  /** เรียกทุกครั้งที่ได้ข้อความเพิ่ม · ยังไม่ผ่านด่านตรวจลิงก์ ห้ามถือเป็นคำตอบสุดท้าย */
  onText?: (delta: string) => void
}): Promise<Reply> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new GeminiError('ยังไม่ได้ตั้ง GEMINI_API_KEY ฝั่งเซิร์ฟเวอร์')

  const res = await fetchOrRetry(`${ENDPOINT}/${CHAT_MODEL}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: opts.contents,
      tools: [{ functionDeclarations: opts.tools }],
    }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    throw rateLimitOr(res.status, body)
  }

  const parts: Part[] = []
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let blocked = ''

  /** SSE หนึ่งก้อนคือหนึ่ง `data:` ที่จบด้วยบรรทัดว่าง · แต่ข้อความอาจถูกหั่นกลางบรรทัด */
  const take = (line: string) => {
    if (!line.startsWith('data:')) return
    const raw = line.slice(5).trim()
    if (!raw || raw === '[DONE]') return

    let chunk: {
      candidates?: { content?: { parts?: Part[] } }[]
      promptFeedback?: { blockReason?: string }
    }
    try {
      chunk = JSON.parse(raw)
    } catch {
      return // ก้อนที่อ่านไม่ออกข้ามไป ดีกว่าล้มทั้งคำตอบเพราะบรรทัดเดียว
    }

    if (chunk.promptFeedback?.blockReason) blocked = chunk.promptFeedback.blockReason

    for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
      parts.push(p)
      if (typeof p.text === 'string' && p.text) opts.onText?.(p.text)
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) take(line.trim())
  }
  if (buffer.trim()) take(buffer.trim())

  if (blocked) throw new GeminiError(`คำถามถูกปฏิเสธ (${blocked})`)

  const text = parts.map((p) => p.text ?? '').join('').trim()
  const calls = parts
    .flatMap((p) => (p.functionCall ? [p.functionCall] : []))
    .map((c) => ({ name: c.name, args: c.args ?? {} }))

  return { text, calls, parts }
}
