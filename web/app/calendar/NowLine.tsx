'use client'

import { useEffect, useState } from 'react'
import { bangkokNow } from '@/lib/time'

/**
 * เส้น "ตอนนี้" ในปฏิทินสัปดาห์ · **เลื่อนเองทุกนาที**
 *
 * เดิมคำนวณฝั่งเซิร์ฟเวอร์ตอนเรนเดอร์ แล้วค้างอยู่ตรงนั้นจนกว่าจะรีเฟรช —
 * เปิดปฏิทินทิ้งไว้ครึ่งชั่วโมงแล้วเส้นยังอยู่ที่เดิม ซึ่งโกหกว่าเวลาไม่เดิน
 *
 * ⚠️ **แยกเป็น client component เฉพาะเส้นเดียว** ไม่ได้ทำทั้งตารางเป็น client
 *    ตารางทั้งใบคำนวณจากข้อมูลที่เซิร์ฟเวอร์ดึงมาแล้วและไม่เปลี่ยนระหว่างวัน
 *    การลากมันมาฝั่งเบราว์เซอร์เพื่อขยับเส้นเดียวคือการจ่ายแพงเกินเหตุ
 *
 * ⚠️ ตั้ง `null` ไว้ตอนแรกแล้วค่อยเติมหลัง mount — เวลาของเซิร์ฟเวอร์กับ
 *    ของเครื่องผู้ใช้ไม่ตรงกันเสมอไป ถ้าเรนเดอร์ค่าฝั่งเซิร์ฟเวอร์มาก่อน
 *    React จะเจอ hydration mismatch
 */
export default function NowLine({
  from,
  to,
  slot,
  rows,
}: {
  /** ชั่วโมงซ้ายสุดของตาราง */
  from: number
  /** ชั่วโมงขวาสุดของตาราง */
  to: number
  /** ความกว้างของหนึ่งคอลัมน์ เป็นชั่วโมง */
  slot: number
  /** จำนวนแถววันในตาราง */
  rows: number
}) {
  const [hour, setHour] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setHour(bangkokNow().hour)
    tick()
    // ทุก 30 วินาที — ครึ่งหนึ่งของความละเอียดที่ตาเห็น (หนึ่งคอลัมน์ = 30 นาที)
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  if (hour === null || hour < from || hour > to) return null

  return (
    <div
      className="wk__now"
      style={{ gridRow: `2 / span ${rows}`, gridColumn: Math.round((hour - from) / slot) + 2 }}
      aria-label="เวลาปัจจุบัน"
    />
  )
}
