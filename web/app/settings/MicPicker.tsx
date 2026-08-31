'use client'

import { useState } from 'react'
import { useCall } from '@/components/CallProvider'
import { useMic, useMicList, askMicPermission } from '@/lib/voice/micStore'
import { resolveMic, MIC_AUTO } from '@/lib/voice/mic'

/**
 * ตัวเลือกไมค์ · อยู่ในหน้าตั้งค่า (ย้ายมาจากหน้าโทร 1 ก.ย. 2026)
 *
 * ⚠️ **สลับได้แม้กำลังโทรอยู่** — สายอยู่ที่ `CallProvider` ระดับ layout
 *    `switchMic` เรียก `session.current?.switchMic` แบบ optional จึงทำงาน
 *    ทั้งตอนมีสายและไม่มีสาย · ไม่ต้องมีตัวเลือกซ้ำในหน้าโทรอีก
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
  const [asking, setAsking] = useState(false)

  // อุปกรณ์ที่จำไว้อาจถูกถอดไปแล้ว — ปัดกลับเป็นอัตโนมัติ ไม่ค้างชื่อเดิมไว้
  const active = resolveMic(chosen, options)
  const current = options.find((o) => o.id === active)

  /*
   * ⚠️ ที่นี่ **ไม่ซ่อนตัวเองเหมือนตอนอยู่หน้าโทร**
   *
   *    เดิมมันซ่อนเมื่อไม่มีอะไรให้เลือก เพื่อไม่ให้รกหน้าโทร · แต่ตอนนี้ที่นี่
   *    เป็นที่เดียวที่เปลี่ยนไมค์ได้ ถ้าซ่อนก็เท่ากับไม่มีทางเปลี่ยนเลย
   *    และรายการจะว่างเสมอจนกว่าจะเคยให้สิทธิ์ — ซึ่งวนกลับมาที่ปุ่มนี้อีก
   *
   *    ยังไม่มีตัวเลือก = ให้ปุ่มทำหน้าที่ขอสิทธิ์แทน แล้วรายการจะโผล่เอง
   */
  const noChoice = options.length <= 2 && active === MIC_AUTO

  async function onTap() {
    if (!noChoice) { setOpen((o) => !o); return }
    setAsking(true)
    const ok = await askMicPermission()
    setAsking(false)
    if (ok) setOpen(true)
  }

  return (
    <div className="mic mic--settings">
      <button
        type="button"
        className="mic__btn"
        aria-expanded={open}
        disabled={asking}
        onClick={() => void onTap()}
      >
        {asking ? 'กำลังขอสิทธิ์…' : noChoice ? 'เลือกไมค์…' : `ไมค์ · ${current?.label ?? 'อัตโนมัติ'}`}
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
