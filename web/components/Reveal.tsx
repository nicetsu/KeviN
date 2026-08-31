import { ViewTransition, type ReactNode } from 'react'

/**
 * โครงร่างที่ **กลายเป็น** เนื้อจริง แทนที่จะถูกสลับทิ้ง
 *
 * ทุกหน้าเป็น `force-dynamic` (ข้อมูลผูกกับ `auth.uid()` แคชร่วมกันไม่ได้)
 * กดเปลี่ยนหน้าจึงต้องรอเซิร์ฟเวอร์เสมอ และเห็นโครงร่างทุกครั้ง —
 * รอยต่อตรงนั้นเลยเป็นสิ่งที่ผู้ใช้เห็นบ่อยที่สุดในแอป
 *
 * `loading.tsx` ของ Next คือ fallback ของ Suspense ที่ Next ห่อ page ให้เอง
 * เราจึงครอบสองฝั่งของคู่นั้น: โครงร่างเป็น `exit` เนื้อจริงเป็น `enter`
 *
 * ⚠️ **`default="none"` สำคัญ** — กันไม่ให้ตัวนี้ไปเล่นด้วยตอนมี transition
 *    อย่างอื่นเกิดขึ้น เช่นตอนการ์ด Area morph เป็นหน้าวิชา ซึ่งควรเป็น
 *    การเคลื่อนไหวเดียวบนจอ ไม่ใช่สองอย่างซ้อนกัน
 *
 * ⚠️ **จังหวะไม่สมมาตรโดยตั้งใจ** — ของเก่าออกเร็ว ของใหม่เข้าช้ากว่าและรอ
 *    ให้ของเก่าออกไปก่อน ถ้าเข้าออกพร้อมกันจะเห็นสองชั้นทับกันแล้วดูรก
 */

/** ครอบเนื้อหาใน `loading.tsx` */
export function Skeleton({ children }: { children: ReactNode }) {
  return (
    <ViewTransition exit="skel-out" default="none">
      {children}
    </ViewTransition>
  )
}

/** ครอบเนื้อหาจริงใน `page.tsx` */
export function Content({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="skel-in" default="none">
      {children}
    </ViewTransition>
  )
}
