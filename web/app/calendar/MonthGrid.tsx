'use client'

import { useState } from 'react'
import { addDays, thaiDateLabel } from '@/lib/time'

const DOW = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

/** สี่ชนิดที่ลงปฏิทินได้ · โน้ตกับงานที่ไม่กำหนดวันไม่มีวันให้ลง */
export type EntryKind = 'class' | 'event' | 'due' | 'done'

export type DayEntry = {
  kind: EntryKind
  title: string
  /** "09:00–11:00" หรือ "14:30" · null = ไม่มีเวลา */
  time: string | null
  detail: string
}

const COLOR: Record<EntryKind, string> = {
  class: 'var(--sched)',
  event: 'var(--event)',
  due: 'var(--due)',
  done: 'var(--task)',
}

/**
 * โหมดเดือน (S2) ตาม ui-kit.html
 *
 * ช่องวันแสดงเป็น "จุดสี" ไม่ใช่ข้อความ — ทำให้ทั้งเดือนพอดีจอมือถือ
 * โดยไม่ต้องเลื่อน แล้วรายละเอียดของวันที่เลือกอยู่ข้างล่าง
 */
export default function MonthGrid({
  monthKey,
  today,
  byDay,
}: {
  monthKey: string // YYYY-MM-01
  today: string
  byDay: Record<string, DayEntry[]>
}) {
  // เปิดมาเลือกวันนี้ไว้ก่อนถ้าอยู่ในเดือนที่ดูอยู่ ไม่งั้นเลือกวันแรกของเดือน
  const [picked, setPicked] = useState<string>(
    today.slice(0, 7) === monthKey.slice(0, 7) ? today : monthKey
  )

  const [y, m] = monthKey.split('-').map(Number)
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const gridStart = addDays(monthKey, -firstDow)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  const weeks: string[][] = []
  for (let i = 0; i < 42; i += 7) weeks.push(cells.slice(i, i + 7))
  const kept = weeks.filter((w) => w.some((d) => d.slice(0, 7) === monthKey.slice(0, 7)))

  const entriesOf = (d: string) => byDay[d] ?? []
  const dotKinds = (d: string): EntryKind[] => {
    const set = new Set(entriesOf(d).map((e) => e.kind))
    return (['class', 'event', 'due', 'done'] as EntryKind[]).filter((k) => set.has(k))
  }

  const chosen = entriesOf(picked)

  return (
    <>
      <div className="mo">
        {DOW.map((d) => (
          <div key={d} className="mo__hd">{d}</div>
        ))}

        {kept.flat().map((day) => {
          const inMonth = day.slice(0, 7) === monthKey.slice(0, 7)
          const kinds = dotKinds(day)
          return (
            <button
              type="button"
              key={day}
              onClick={() => setPicked(day)}
              aria-pressed={day === picked}
              aria-label={`${thaiDateLabel(day)}${kinds.length ? ` มี ${entriesOf(day).length} รายการ` : ''}`}
              className={[
                'mo__day',
                inMonth ? '' : 'mo__day--out',
                day === today ? 'mo__day--today' : '',
                day === picked ? 'mo__day--picked' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="mo__n">{Number(day.slice(8))}</span>
              <span className="mo__dots">
                {kinds.map((k) => (
                  <i key={k} style={{ background: COLOR[k] }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <div className="legend">
        <span><i style={{ background: COLOR.class }} />คาบ</span>
        <span><i style={{ background: COLOR.event }} />กิจกรรม</span>
        <span><i style={{ background: COLOR.due }} />กำหนดส่ง</span>
        <span><i style={{ background: COLOR.done }} />งานที่เสร็จแล้ว</span>
      </div>

      <div className="sec">
        <span>{thaiDateLabel(picked)}</span>
        <span>{chosen.length ? `${chosen.length} รายการ` : 'ว่าง'}</span>
      </div>

      {chosen.length === 0 ? (
        <p className="none">วันนี้ไม่มีอะไร</p>
      ) : (
        chosen.map((e, i) => (
          <div className="row" key={`${e.title}-${i}`}>
            <span className="row__stripe" style={{ background: COLOR[e.kind] }} />
            <div className="row__body">
              <div className="row__title">{e.title}</div>
              <div className="row__meta">
                {[e.time, e.detail].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
        ))
      )}
    </>
  )
}
