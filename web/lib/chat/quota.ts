/**
 * แยก 429 ของ Gemini ออกเป็นสองเรื่องที่ต่างกันคนละโลก
 *
 * ของเดิมเหมา 429 ทุกแบบเป็น "โควตาของวันนี้หมดแล้ว" ซึ่ง**บอกผู้ใช้ผิด**
 * เวลาชนแค่เพดานต่อนาที · ชุดวัดความแม่นเจอเองตอนรันรวดเดียว: 13 ข้อล้มด้วย 429
 * แล้วยิงข้อเดียวใหม่ทันทีกลับผ่าน (ARCHITECTURE.md §5)
 *
 * ความผิดสองแบบมีราคาไม่เท่ากัน
 *   - บอกว่า "รอสักครู่" ทั้งที่หมดโควตาวัน → เขาลองใหม่แล้วไม่ได้ · น่ารำคาญ
 *   - บอกว่า "หมดโควตาวันนี้" ทั้งที่แค่เร็วไป → **เขาเลิกใช้ทั้งวัน** ทั้งที่รอ
 *     ยี่สิบวินาทีก็ได้แล้ว · และในโหมดเสียงมันยังดันผู้ใช้ออกไปโหมดแชตทั้งรอบด้วย
 *
 * แบบหลังแพงกว่าชัดเจน **เมื่อไม่แน่ใจจึงต้องไม่ประกาศว่าหมดทั้งวัน**
 *
 * ⚠️ ตั้งแต่เปิดให้ใช้หลายคน (8 ก.ย. 2026) โควตาเป็นของ **ทั้งโปรเจกต์ร่วมกัน**
 *    ไม่ใช่ของรายคน · ผู้ใช้จึงเจอ 429 ที่เกิดจากคนอื่นใช้ได้ โดยตัวเองไม่ได้
 *    ทำอะไรเลย — ข้อความที่บอกความจริงจึงสำคัญกว่าเดิม ไม่ใช่น้อยลง
 */

/** `day` = โควตารายวันหมดจริง · `minute` = เร็วเกินไป · `unknown` = 429 ที่อ่านไม่ออก */
export type RateLimitKind = 'day' | 'minute' | 'unknown'

export type RateLimit = {
  kind: RateLimitKind
  /** วินาทีที่ Google บอกให้รอ · ไม่มีก็ไม่ต้องเดา */
  retryAfterSec?: number
}

/**
 * อ่าน body ของ 429
 *
 * Google ใส่ชื่อโควตาที่ชนมาใน `quotaId`/`quotaMetric` เช่น
 * `GenerateRequestsPerDayPerProjectPerModel` กับ `...PerMinutePerProjectPerModel`
 * และบางครั้งแนบ `RetryInfo.retryDelay` มาเป็น `"20s"`
 *
 * ที่รับ body เป็นสตริงดิบแทนที่จะ parse JSON เพราะรูปของ error ฝั่ง Google
 * ไม่คงที่ (บางเส้นทางห่อ `error`, บางเส้นทางเป็น array) — การมองหาคำที่ต้องมี
 * ทนกว่าและพังยากกว่าการเดินตามรูปที่เดาไว้
 */
export function classifyRateLimit(body: string): RateLimit {
  const text = body.toLowerCase()

  const retry = /"?retrydelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/.exec(text)
  const retryAfterSec = retry ? Math.ceil(Number(retry[1])) : undefined

  // ตรวจ "วัน" ก่อนเสมอ — body ที่ชนเพดานวันมักมีคำว่า minute ปนอยู่ด้วย
  // เพราะมันไล่รายชื่อโควตาทุกตัวมา ถ้าตรวจนาทีก่อนจะอ่านผิดเป็นนาทีตลอด
  if (/per\s*day|perday|daily/.test(text)) return { kind: 'day', retryAfterSec }
  if (/per\s*minute|perminute/.test(text)) return { kind: 'minute', retryAfterSec }

  // มี retryDelay สั้น ๆ แต่ไม่บอกชื่อโควตา = เป็นการหน่วงชั่วคราว ไม่ใช่หมดวัน
  if (retryAfterSec !== undefined && retryAfterSec <= 120) return { kind: 'minute', retryAfterSec }

  return { kind: 'unknown', retryAfterSec }
}

/**
 * ข้อความที่ผู้ใช้อ่าน
 *
 * `channel` เปลี่ยนแค่คำว่าจะแนะให้ไปทางไหนต่อ — เสียงกับแชตใช้คนละรุ่นจึง
 * **คนละโควตา** การดันไปอีกโหมดจึงเป็นทางออกจริงเฉพาะตอนหมดโควตารายวัน
 */
export function rateLimitMessage(limit: RateLimit, channel: 'chat' | 'voice'): string {
  const wait =
    limit.retryAfterSec !== undefined
      ? `ลองใหม่อีกครั้งในอีก ${limit.retryAfterSec} วินาที`
      : 'ลองใหม่อีกครั้งในอีกสักครู่'

  if (limit.kind === 'day') {
    return channel === 'voice'
      ? 'โควตาเสียงของวันนี้หมดแล้ว — พิมพ์คุยต่อได้ตามปกติ คนละโควตากัน'
      : 'โควตาแชตของวันนี้หมดแล้ว — พรุ่งนี้ใช้ได้ตามปกติ'
  }

  if (limit.kind === 'minute') {
    return `คุยเร็วเกินไปนิดหนึ่ง — ${wait}`
  }

  return `ตอนนี้เรียกโมเดลไม่ได้ — ${wait}`
}
