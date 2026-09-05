'use client'

import { useState } from 'react'
import DraftCard from '@/components/DraftCard'
import { draftKey, type Draft } from '@/lib/drafts'

/**
 * ร่างหลายใบพร้อมกัน — **แบบ 06** จาก `CONFIRM-CARD.html` (กองการ์ดซ้อน)
 *
 * การพูดออกมาเป็นชุด ("เพิ่มสามงาน") เป็นเรื่องปกติของโหมดเสียง · ของเดิม
 * เรียงทุกใบต่อกันในกล่องที่เลื่อนได้ ซึ่งอ่านครบกว่าแต่กินที่มากจนบนจอ 360×640
 * มันดันวงเสียงและปุ่มวางสายจนแทบไม่เหลือ (ARCHITECTURE.md §11)
 *
 * กองซ้อนแก้ข้อนั้นด้วยการให้เห็น**ใบเดียวเต็ม ๆ** แล้วบอกด้วยเงาข้างหลังกับตัวเลข
 * ว่ายังมีอีกกี่ใบ · ใบเดียวโดด ๆ หน้าตาเหมือนเดิมทุกอย่าง ไม่มีเงา ไม่มีตัวนับ
 *
 * ⚠️ **ไม่มีปุ่ม "ยืนยันทั้งหมด"** ทั้งที่ในภาพร่าง 06 มี — ป้ายกำกับในภาพนั้น
 *    เขียนเองว่า "ยืนยันรวดเดียวเสี่ยง" · การกดยืนยันของที่ยังไม่ได้อ่านขัดกับ
 *    เหตุผลทั้งหมดที่ทำให้ระบบนี้มีการ์ดยืนยันตั้งแต่แรก (doc/WRITE.md §3)
 *    ปุ่มเดินหน้า/ถอยหลังทำให้ทานครบทุกใบโดยยังกินที่เท่าใบเดียว
 */
export default function DraftStack({
  drafts,
  onSettled,
  className,
}: {
  drafts: Draft[]
  onSettled?: (id: string) => void
  /** คลาสของกล่องที่ห่อการ์ดแต่ละใบ — ที่วางแต่ละแห่งมีเส้นคั่นของตัวเอง */
  className?: string
}) {
  const [at, setAt] = useState(0)

  if (drafts.length === 0) return null

  /*
   * ใบที่ถูกยืนยันหรือกดทิ้งจะหายออกจากรายการ ตำแหน่งเดิมจึงชี้เลยขอบได้
   * ถอยกลับมาที่ใบสุดท้ายแทน · เก็บ `at` ดิบไว้เพื่อไม่ให้ต้องเขียน state
   * ตอน render ซึ่งเป็นทางที่วนไม่รู้จบ
   */
  const i = Math.min(at, drafts.length - 1)
  const d = drafts[i]
  const behind = drafts.length - 1 - i

  return (
    <div className="dstack">
      {/*
        ชั้นในมีแค่เงากับการ์ด — แถวปุ่มอยู่นอกมัน

        เงาสูง 100% ของกล่องที่มันอยู่ · ถ้าอยู่กล่องเดียวกับแถวปุ่ม ขอบของเงา
        จะลากคลุมปุ่มไปด้วย แล้วอ่านเป็นกรอบที่ล้อมปุ่ม ไม่ใช่การ์ดที่ซ้อนกัน
      */}
      <div className="dstack__deck">
        {/* เงาข้างหลังบอกว่ายังมีอีก — สองชั้นพอ มากกว่านั้นตัวเลขเล่าได้ดีกว่า */}
        {behind >= 2 && <span className="dstack__ghost dstack__ghost--b" aria-hidden="true" />}
        {behind >= 1 && <span className="dstack__ghost dstack__ghost--a" aria-hidden="true" />}

        <div className={className}>
          <DraftCard
            key={draftKey(d)}
            draft={d}
            onSettled={onSettled}
            position={drafts.length > 1 ? { at: i + 1, total: drafts.length } : undefined}
          />
        </div>
      </div>

      {drafts.length > 1 && (
        <div className="dstack__nav">
          <button
            className="dstack__step"
            onClick={() => setAt(Math.max(0, i - 1))}
            disabled={i === 0}
            aria-label="ร่างใบก่อนหน้า"
          >
            ก่อนหน้า
          </button>
          <span className="dstack__count" aria-live="polite">
            {behind > 0 ? `อีก ${behind} ใบรออยู่` : 'ใบสุดท้าย'}
          </span>
          <button
            className="dstack__step"
            onClick={() => setAt(Math.min(drafts.length - 1, i + 1))}
            disabled={behind === 0}
            aria-label="ร่างใบถัดไป"
          >
            ถัดไป
          </button>
        </div>
      )}
    </div>
  )
}
