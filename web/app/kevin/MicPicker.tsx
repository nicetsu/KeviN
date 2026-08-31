'use client'

import { useState } from 'react'
import { useCall } from '@/components/CallProvider'
import { useMic, useMicList } from '@/lib/voice/micStore'
import { resolveMic, MIC_AUTO } from '@/lib/voice/mic'

/**
 * ตัวเลือกไมค์ในหน้าโทร
 *
 * ⚠️ **ชื่ออุปกรณ์ถูกปิดไว้จนกว่าจะได้สิทธิ์ไมค์** เบราว์เซอร์คืน `label` ว่าง
 *    ถ้ายังไม่เคยอนุญาต — ก่อนโทรครั้งแรกจึงเห็นแค่ "ไมโครโฟน 1 / 2"
 *    ซึ่งบอกจำนวนได้แต่ไม่บอกว่าตัวไหนคืออะไร · บอกตรง ๆ ดีกว่าซ่อน
 *
 * รายการมาจาก external store ที่ฟัง `devicechange` ให้แล้ว — เสียบหูฟัง
 * กลางสายแล้วตัวเลือกโผล่เพิ่มเอง ไม่ต้องรีเฟรชหน้า
 */
export default function MicPicker() {
  const call = useCall()
  const chosen = useMic()
  const options = useMicList()
  const [open, setOpen] = useState(false)

  // อุปกรณ์ที่จำไว้อาจถูกถอดไปแล้ว — ปัดกลับเป็นอัตโนมัติ ไม่ค้างชื่อเดิมไว้
  const active = resolveMic(chosen, options)
  const current = options.find((o) => o.id === active)

  // เหลือแค่แถว "อัตโนมัติ" กับไมค์ตัวเดียว = ไม่มีอะไรให้เลือก อย่าไปรกจอ
  if (options.length <= 2 && active === MIC_AUTO) return null

  return (
    <div className="mic">
      <button
        type="button"
        className="mic__btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ไมค์ · {current?.label ?? 'อัตโนมัติ'}
      </button>

      {open && (
        <ul className="mic__list">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                data-on={o.id === active}
                onClick={() => {
                  setOpen(false)
                  void call.switchMic(o.id)
                }}
              >
                <span>{o.label}</span>
                {o.hint && <small>{o.hint}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
