'use client'

import { useState } from 'react'
import AreaEditor, { type AreaDraft } from '../AreaEditor'

/**
 * ทางเข้าแผงแก้ไข Area · อยู่ในหัวของหน้าคู่กับปุ่มย้อนกลับ
 *
 * ⚠️ เคยใช้ `.linkbtn` ซึ่งเป็น **สีส้ม** — ส้มในระบบนี้แปลว่า "สิ่งที่ต้องระวัง"
 *    (ปุ่มวางสาย · เลยกำหนด) ส่วนการแก้ไขคือของที่กดได้ธรรมดา ต้องเป็นม่วง
 */
export default function AreaEdit({ area }: { area: AreaDraft }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="headbtn" onClick={() => setOpen(true)}>
        แก้ไข Area
      </button>
      {open && <AreaEditor area={area} onClose={() => setOpen(false)} />}
    </>
  )
}
