'use client'

import { useState } from 'react'
import AreaEditor from './AreaEditor'

/**
 * ปุ่มเพิ่ม Area · มุมขวาบนของหน้าคลัง
 *
 * เคยเป็นการ์ดเส้นประท้ายตะแกรง ซึ่งอ่านผิดได้ว่าเป็น Area ใบหนึ่ง — มันอยู่ใน
 * ตะแกรงเดียวกัน ขนาดเท่ากัน และตกลงมาข้างล่างเรื่อย ๆ ตามจำนวน Area ที่เพิ่มขึ้น
 * · ย้ายมาอยู่ในหัวหน้าแล้วมันบอกตัวเองว่าเป็น *การกระทำของหน้านี้* ไม่ใช่ของในคลัง
 * และอยู่ที่เดิมเสมอไม่ว่าจะมีกี่ใบ (เจ้าของขอ 8 ก.ย. 2026)
 */
export default function AreaAdd() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="headbtn" onClick={() => setOpen(true)}>
        <span className="headbtn__plus" aria-hidden="true">+</span>
        <span>Area</span>
      </button>
      {open && <AreaEditor area={null} onClose={() => setOpen(false)} />}
    </>
  )
}
