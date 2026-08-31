/**
 * ให้การ์ดที่กด "บิน" ไปเป็นหัวของหน้าถัดไป
 *
 * เจ้าของอยากได้ผลแบบที่ร่างไว้ในแผนเคลื่อนไหวเฟส A — กดการ์ดแล้วมันขยาย
 * กลายเป็นหัวของหน้าถัดไป ผู้ใช้จะได้ไม่ต้องอ่านชื่อหน้าซ้ำเพื่อยืนยันว่ากดถูกใบ
 *
 * ⚠️ **ไม่ใช้ View Transition API** — ทดสอบแล้วว่าทำไม่ได้ในสถาปัตยกรรมนี้
 *    Next.js ทำ transition สองรอบต่อการเปลี่ยนหน้าหนึ่งครั้งบน route ที่เป็น
 *    `force-dynamic` ฝั่งเก่าหายไปก่อนฝั่งใหม่มาเสมอ เบราว์เซอร์จึงจับคู่ไม่ได้
 *    (doc/TRAPS.md)
 *
 *    ที่นี่**เราบอกเองว่าของชิ้นนี้มาจากไหน** โดยจดตำแหน่งไว้ตอนกด แล้วให้
 *    หน้าถัดไปอ่านไปใช้ — ไม่ต้องพึ่งให้เบราว์เซอร์จับคู่ จึงไม่ติดข้อจำกัดนั้น
 *
 * ⚠️ **มีอายุ** ถ้าโหลดหน้าช้ากว่านี้ ไม่ต้องบิน — การเคลื่อนไหวที่มาช้ากว่า
 *    การกระทำอ่านไม่ออกว่าเกี่ยวกัน และผู้ใช้รอนานพอที่จะลืมไปแล้วว่ากดใบไหน
 */

const KEY = 'kevin.card.flight'

/** เกินเท่านี้แล้วไม่บิน · 400ms คือช่วงที่คนยังโยงการเคลื่อนไหวกับการกดได้ */
export const FLIGHT_TTL_MS = 400

export type Flight = {
  /** id ของสิ่งที่กด · ใช้กันไม่ให้หัวของ Area อื่นหยิบไปใช้ */
  id: string
  x: number
  y: number
  w: number
  h: number
  at: number
}

/** จดตำแหน่งจริงบนจอตอนกด */
export function takeOff(id: string, rect: DOMRect, now: number): void {
  const f: Flight = {
    id,
    x: rect.left,
    y: rect.top,
    w: rect.width,
    h: rect.height,
    at: now,
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(f))
  } catch {
    /* จำไม่ได้ก็แค่ไม่มี animation · การเปลี่ยนหน้ายังทำงานปกติ */
  }
}

/**
 * อ่านแล้ว**ลบทิ้งทันที** ไม่ว่าจะใช้ได้หรือไม่
 *
 * ถ้าไม่ลบ ค่าจะค้างข้ามการนำทางครั้งถัดไป แล้วหัวของหน้าอื่นจะบินมาจาก
 * ตำแหน่งที่ไม่เกี่ยวอะไรเลย · เกิดได้จริงเมื่อผู้ใช้กดแล้วกดย้อนกลับเร็ว ๆ
 */
export function land(id: string, now: number): Flight | null {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let f: Flight
  try {
    f = JSON.parse(raw) as Flight
  } catch {
    return null
  }

  if (f.id !== id) return null
  if (!(f.w > 0) || !(f.h > 0)) return null
  if (now - f.at > FLIGHT_TTL_MS) return null
  return f
}

/**
 * ท่าเริ่มต้นของหัว — อยู่ตรงที่การ์ดเคยอยู่ ขนาดเท่าการ์ดเดิม
 *
 * ใช้ `transform` อย่างเดียวเพราะ `width`/`top` บังคับให้คำนวณ layout ใหม่
 * ทุกเฟรม ซึ่งกระตุกบนมือถือทันที (doc/TRAPS.md)
 *
 * `transform-origin` ต้องเป็นมุมซ้ายบน ไม่งั้นการย่อจะดึงตำแหน่งเพี้ยนไปครึ่งหนึ่ง
 */
export function startTransform(from: Flight, to: DOMRect): string {
  const dx = Math.round(from.x - to.left)
  const dy = Math.round(from.y - to.top)
  const sx = to.width > 0 ? from.w / to.width : 1
  const sy = to.height > 0 ? from.h / to.height : 1
  return `translate(${dx}px, ${dy}px) scale(${round(sx)}, ${round(sy)})`
}

const round = (n: number) => Math.round(n * 1000) / 1000
