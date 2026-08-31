/**
 * กันผู้ช่วยยื่นลิงก์ที่ไม่มีอยู่จริง
 *
 * เจอตอนทดสอบจริง 30 ส.ค. — โมเดลปฏิเสธการแก้ข้อมูลได้ถูกต้อง แต่ยื่นลิงก์
 * `https://tasks.google.com/` ให้ · พอสั่งใน prompt ว่าห้ามลิงก์นอกระบบ
 * มันเปลี่ยนไปแต่ง path ภายในปลอมแทน (`/items/overdue` ซึ่งไม่มีในแอป)
 *
 * prompt ห้ามได้แค่สิ่งที่โมเดลตั้งใจ · **การเช็กตอนส่งออกกันได้ทุกกรณี**
 * ตรงกับหลักของโปรเจกต์ที่ว่ากติกาสำคัญต้องบังคับด้วยโครงสร้าง ไม่ใช่คำขอร้อง
 *
 * เจตนาไม่ใช่ความปลอดภัย (ข้อความไม่ได้ถูกเรนเดอร์เป็น HTML อยู่แล้ว)
 * แต่คือ **ห้ามพาผู้ใช้ไปหน้าที่ไม่มีอยู่** ซึ่งแย่กว่าการไม่ให้ลิงก์เลย
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** เส้นทางทั้งหมดที่แอปมีจริง · เพิ่มหน้าใหม่ต้องมาเติมที่นี่ */
const ROUTES: readonly RegExp[] = [
  /^\/$/,
  /^\/calendar$/,
  /^\/library$/,
  /^\/settings$/,
  /^\/kevin$/,
  new RegExp(`^/project/${UUID}$`),
  new RegExp(`^/project/${UUID}/schedule$`),
  new RegExp(`^/project/${UUID}/event/new$`),
  new RegExp(`^/project/${UUID}/event/${UUID}$`),
  new RegExp(`^/project/${UUID}/event/${UUID}/edit$`),
]

export function isRealRoute(path: string): boolean {
  return ROUTES.some((re) => re.test(path))
}

/** URL เต็ม หรือ path ภายในที่ขึ้นต้นด้วย / และไม่ได้อยู่กลางคำ */
const CANDIDATE = /(https?:\/\/[^\s<>"')\]]+|(?<![\w/])\/[A-Za-z0-9][\w/-]*)/g

/** วรรคตอนท้ายที่คนเขียนติดมา ไม่ใช่ส่วนหนึ่งของลิงก์ */
const TRAILING = /[.,;:!?)\]}]+$/

/**
 * ข้อความที่ไปแทนที่ลิงก์ปลอม
 *
 * ของเดิมเขียนแค่ `(ลิงก์ไม่ถูกต้อง)` ซึ่งบอกว่ามีอะไรพัง แต่**ไม่บอกว่าจะไปต่อยังไง**
 * เจ้าของเจอเองบนมือถือ 31 ส.ค. — ประโยคที่ได้คือ
 * "แก้ไขได้ที่นี่ครับ: (ลิงก์ไม่ถูกต้อง)" ซึ่งเป็นทางตัน
 *
 * ที่ชี้ไปหน้าคลังเพราะเกือบทุกครั้งที่โมเดลแต่งลิงก์ มันกำลังจะบอกว่า
 * "ไปแก้เองที่นี่" และหน้าคลังคือที่ที่แก้ข้อมูลได้จริงหน้าเดียว
 */
export const BAD_LINK = '(ลิงก์ไม่ถูกต้อง — แก้ข้อมูลได้ที่หน้าคลัง)'

/**
 * แทนที่ลิงก์ที่ไม่ใช่เส้นทางจริงของแอปด้วยข้อความบอกตรง ๆ
 *
 * ไม่ลบทิ้งเฉย ๆ เพราะประโยคจะขาดหายแล้วผู้ใช้ไม่รู้ว่าเกิดอะไรขึ้น —
 * ตรงกับหลัก UX ข้อ 5 "ไม่มีอะไรหายเงียบ ๆ"
 */
export function sanitizeLinks(text: string): { text: string; removed: number } {
  let removed = 0

  const clean = text.replace(CANDIDATE, (raw) => {
    const trail = raw.match(TRAILING)?.[0] ?? ''
    const link = trail ? raw.slice(0, -trail.length) : raw
    if (link.startsWith('/') && isRealRoute(link)) return raw
    removed++
    return BAD_LINK + trail
  })

  return { text: clean, removed }
}
