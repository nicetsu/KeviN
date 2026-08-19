'use client'

import { useEffect, useState } from 'react'

export type NextClassInfo = {
  projectName: string
  location: string | null
  label: string | null
  /** ISO ของเวลาเริ่ม–เลิก */
  startsAt: string
  endsAt: string
  startLabel: string
  endLabel: string
}

/**
 * hero บนหน้าวันนี้ · ตอบหลักการ UX ข้อ 1 —
 * เปิดมาต้องรู้ทันทีว่าตอนนี้ต้องทำอะไร โดยไม่ต้องกวาดตาหาเอง
 *
 * นับถอยหลังฝั่งเบราว์เซอร์ เพราะถ้าเรนเดอร์ฝั่งเซิร์ฟเวอร์อย่างเดียว
 * ตัวเลขจะค้างอยู่ที่ตอนโหลดหน้า แล้วโกหกทันทีที่ผ่านไปหนึ่งนาที
 */
export default function NextClass({ info }: { info: NextClassInfo }) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const start = new Date(info.startsAt).getTime()
  const end = new Date(info.endsAt).getTime()

  let kicker = 'คาบถัดไป'
  if (now !== null) {
    if (now >= start && now < end) {
      const left = Math.round((end - now) / 60000)
      kicker = left >= 60
        ? `กำลังเรียนอยู่ · เหลืออีก ${Math.floor(left / 60)} ชม. ${left % 60} นาที`
        : `กำลังเรียนอยู่ · เหลืออีก ${left} นาที`
    } else if (now < start) {
      const mins = Math.round((start - now) / 60000)
      kicker = mins >= 60
        ? `คาบถัดไป · อีก ${Math.floor(mins / 60)} ชม. ${mins % 60} นาที`
        : `คาบถัดไป · อีก ${mins} นาที`
    }
  }

  const detail = [info.projectName, info.location, info.label].filter(Boolean).join(' · ')

  return (
    <div className="hero">
      <div className="hero__kick">{kicker}</div>
      <div className="hero__big">
        {info.startLabel}
        <small> – {info.endLabel}</small>
      </div>
      <div className="hero__sub">{detail}</div>
    </div>
  )
}
