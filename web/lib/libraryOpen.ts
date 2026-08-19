/**
 * สถานะ "กางอะไรค้างไว้" ของหน้าคลัง — เก็บใน cookie ไม่ใช่ localStorage
 *
 * เหตุผล: cookie เดินทางไปกับ request เซิร์ฟเวอร์จึงรู้ตั้งแต่เฟรมแรกว่าต้องกางอันไหน
 * วาดครั้งเดียวถูกเลย · ของเดิมอ่าน localStorage ใน effect ซึ่งอ่านตอน server render
 * ไม่ได้ ผลคือเฟรมแรกหุบหมดเสมอแล้วค่อยเด้งกาง = หน้าคลังกระพริบทุกครั้งที่เข้า
 *
 * ⚠️ ต้องแยกสองสถานะนี้ออกจากกันให้ได้ ไม่งั้นบั๊กเก่าจะกลับมา:
 *
 *   ไม่มี cookie      → ยังไม่เคยบันทึก → ปิดหมด (ให้เห็นภาพรวมทุก Area ก่อน)
 *   cookie = "v1"     → เคยบันทึกว่าปิดหมด → ต้องปิดหมด **ห้ามเด้งกางเอง**
 *   cookie = "v1.a.b" → กาง a กับ b
 *
 * ค่าว่างจึงเขียนเป็น `"v1"` ไม่ใช่สตริงเปล่า เพราะ cookie ที่ค่าเป็นสตริงเปล่า
 * แยกจาก cookie ที่ไม่มีอยู่ไม่ได้ — ตรงนี้แหละที่ localStorage ทำได้ง่ายกว่า
 * (มี `null` ให้ใช้) แต่ cookie ต้องออกแบบเอง
 */

export const LIBRARY_OPEN_COOKIE = 'kevin.library.open'

/** UUID ไม่มีจุด จึงใช้จุดเป็นตัวคั่นได้ปลอดภัย */
const SEP = '.'
const TAG = 'v1'

/** `null` = ยังไม่เคยบันทึก · `[]` = เคยบันทึกว่าปิดหมด */
export function decodeOpen(raw: string | undefined | null): string[] | null {
  if (!raw) return null
  if (raw === TAG) return []
  if (!raw.startsWith(TAG + SEP)) return null // รูปแบบที่ไม่รู้จัก = ถือว่ายังไม่เคยบันทึก
  return raw.slice(TAG.length + 1).split(SEP).filter(Boolean)
}

export function encodeOpen(ids: Iterable<string>): string {
  const list = [...ids]
  return list.length === 0 ? TAG : TAG + SEP + list.join(SEP)
}
