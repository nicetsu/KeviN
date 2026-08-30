/**
 * เส้นแบ่งข้อมูล — Area ไหนออกจากเครื่องไปหาโมเดลได้บ้าง
 *
 * เงื่อนไข free tier ของ Gemini ระบุเองว่าเอาสิ่งที่ส่งไป **ไปพัฒนาผลิตภัณฑ์**
 * และเตือนไว้ว่าอย่าส่งข้อมูลส่วนตัวเข้ามา · ตัวกรองนี้คือคำตอบของข้อนั้น
 * (doc/CHAT.md §5)
 *
 * ⚠️ **เป็น allowlist ไม่ใช่ blocklist โดยตั้งใจ**
 *    Area ที่สร้างใหม่จะมองไม่เห็นไว้ก่อนจนกว่าจะเติมชื่อลงที่นี่
 *    ถ้าใช้ blocklist แล้ววันหนึ่งสร้าง Area ชื่อ "การเงินส่วนตัว" ขึ้นมา
 *    มันจะรั่วออกไปทันทีโดยไม่มีอะไรเตือน — ตัวกรองความเป็นส่วนตัว
 *    ต้องพลาดไปทางเงียบ ไม่ใช่พลาดไปทางรั่ว
 *
 * ⚠️ กรองได้แค่ **ข้อมูลที่ tool ตอบกลับ** ไม่ได้กรอง **คำถามที่ผู้ใช้พูด**
 *    ถ้าพูดว่า "เดือนนี้ใช้เงินไปเท่าไหร่" ประโยคนั้นถึง Google แล้ว
 *    แม้ระบบจะไม่มีข้อมูลให้ตอบก็ตาม
 */

/** ชื่อ Area ตรงตามที่อยู่ใน DB จริง (doc/DECISIONS.md — Class · Hackathon · Financial · Personal) */
export const VISIBLE_AREAS: readonly string[] = ['Class', 'Hackathon']

/** `null`/`undefined` = ไม่รู้ว่าอยู่ Area ไหน ซึ่งแปลว่า **ไม่ปล่อย** */
export function areaIsVisible(name: string | null | undefined): boolean {
  if (typeof name !== 'string' || name.length === 0) return false
  return VISIBLE_AREAS.includes(name)
}

/**
 * คัดเฉพาะแถวที่ปล่อยออกไปได้
 *
 * `areaOf` เป็นพารามิเตอร์บังคับเพราะ tool ทุกตัวต้องบอกให้ได้ว่า Area
 * ของแถวตัวเองอยู่ตรงไหน — tool ที่บอกไม่ได้คือ tool ที่กรองไม่ได้
 */
export function keepVisible<T>(
  rows: readonly T[],
  areaOf: (row: T) => string | null | undefined
): T[] {
  return rows.filter((row) => areaIsVisible(areaOf(row)))
}
