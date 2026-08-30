/**
 * คุยกับ Gemini ผ่าน REST — ไม่มี SDK เพราะโปรเจกต์นี้ไม่เพิ่ม dependency ถ้าไม่จำเป็น
 *
 * ⚠️ **API key อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น** ไม่มี `NEXT_PUBLIC_` นำหน้าเด็ดขาด
 *    ตัวแปรที่ขึ้นต้นด้วย NEXT_PUBLIC_ ทุกตัวไปอยู่ใน bundle ที่ผู้ใช้เปิดดูได้ (doc/TRAPS.md)
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * ชื่อรุ่นย้ายมาอยู่ใน env เพราะรุ่นของ Gemini เปลี่ยนชื่อบ่อยกว่าโค้ดของเรา
 * และโหมดเสียงกับโหมดแชตต้องใช้คนละรุ่นเพื่อให้ **โควตาแยกกัน** (doc/CHAT.md §4)
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
  [extra: string]: unknown
}

export type Content = { role: 'user' | 'model'; parts: Part[] }

export type FunctionDeclaration = {
  name: string
  description: string
  parameters: unknown
}

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number) {
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

  const res = await fetch(`${ENDPOINT}/${CHAT_MODEL}:generateContent`, {
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
    // 429 คือโควตาหมด ซึ่งเป็นสถานะที่หน้าจอต้องรู้จักเพื่อดันผู้ใช้ไปอีกโหมด
    throw new GeminiError(
      res.status === 429 ? 'โควตาของวันนี้หมดแล้ว' : `เรียกโมเดลไม่สำเร็จ (${res.status}) ${body.slice(0, 200)}`,
      res.status
    )
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
