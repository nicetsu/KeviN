'use client'

import { useState } from 'react'
import { useCall } from '@/components/CallProvider'
import DraftStack from '@/components/DraftStack'

/**
 * ร่างที่ค้างอยู่ตอนผู้ใช้ **ออกไปหน้าอื่นระหว่างสาย** — รูปแบบ **02** จาก
 * `CONFIRM-CARD.html` แผ่นเลื่อนขึ้นจากล่าง (เจ้าของเคาะ 2 ก.ย. 2026)
 *
 * ที่ใช้แผ่นเต็มแทนแถบบางได้เพราะ**หน้าอื่นไม่มีปุ่มวางสายให้บัง** — ข้อกังวล
 * เดียวที่ทำให้แบบนี้ตกรอบสำหรับหน้าโทร ไม่มีอยู่ตรงนี้
 *
 * ⚠️ **ต้องมีปุ่ม "ไว้ก่อน"** ที่ยุบลงเป็นแถบบาง · แผ่นนี้บังแถบล่างซึ่งเป็นทาง
 *    เปลี่ยนหน้า · ถ้าบังค้างจนกว่าจะตัดสินใจ ผู้ใช้ที่แค่จะกดไปหน้าอื่นจะติดกับ
 */
export default function DraftSheet() {
  const call = useCall()
  const [folded, setFolded] = useState(false)

  if (call.drafts.length === 0) return null

  if (folded) {
    return (
      <button className="dfold" onClick={() => setFolded(false)}>
        <span className="dfold__dot" aria-hidden="true" />
        มีร่างรอยืนยัน {call.drafts.length} รายการ
        <span className="dfold__hint">แตะเพื่อดู</span>
      </button>
    )
  }

  return (
    <div className="dpop" role="dialog" aria-label="ร่างที่รอการยืนยัน">
      <div className="dpop__panel">
        <div className="dsheet__grab" aria-hidden="true" />
        <DraftStack drafts={call.drafts} onSettled={call.dropDraft} />
        <button className="dcard__alt dpop__later" onClick={() => setFolded(true)}>
          ไว้ก่อน
        </button>
      </div>
    </div>
  )
}
