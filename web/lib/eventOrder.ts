/**
 * ลำดับของกิจกรรมในหน้าวิชา
 *
 * ก่อนหน้านี้เรียงตาม `starts_at` อย่างเดียว งานที่ผ่านไปแล้วจึงกองอยู่หัวกลุ่ม
 * แล้วดันของที่ยังไม่เกิดลงไปล่าง ซึ่งกลับหัวกลับหางกับสิ่งที่คนเปิดมาดู
 * (เจ้าของขอให้ย้ายลงล่าง 1 ก.ย. 2026)
 *
 * ⚠️ **วัดที่ `ends_at` ไม่ใช่ `starts_at`** — งานที่เริ่มไปแล้วแต่ยังไม่จบ
 *    ต้องนับว่ายังไม่ผ่าน ไม่งั้นค่ายสามวันจะร่วงลงล่างตั้งแต่ชั่วโมงแรก
 */

export type Ordered = { starts_at: string; ends_at: string }

/** จบไปแล้วหรือยัง · `now` เป็น ISO string เพื่อเทียบสตริงตรง ๆ ได้ */
export function isPastEvent(e: Ordered, now: string): boolean {
  return e.ends_at < now
}

/**
 * ที่ยังไม่ผ่านอยู่บน เรียงจากใกล้ที่สุด · ที่ผ่านแล้วอยู่ล่าง เรียงจากล่าสุด
 *
 * ครึ่งล่างเรียงกลับทางโดยตั้งใจ — ไล่จากบนลงล่างจะได้ "ใกล้ปัจจุบันที่สุด"
 * ตลอดทั้งกลุ่ม ไม่ใช่กระโดดไปไกลสุดตรงรอยต่อระหว่างสองครึ่ง
 *
 * ไม่แก้อาร์เรย์ต้นฉบับ
 */
export function orderEvents<T extends Ordered>(events: readonly T[], now: string): T[] {
  return [...events].sort((a, b) => {
    const pa = isPastEvent(a, now)
    const pb = isPastEvent(b, now)
    if (pa !== pb) return pa ? 1 : -1
    return pa ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at)
  })
}
