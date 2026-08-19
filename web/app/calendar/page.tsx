import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  bangkokToday, mondayOf, addDays, addMonths,
  thaiMonthLabel, thaiRangeLabel,
} from '@/lib/time'
import WeekGrid, { type Occ } from './WeekGrid'
import MonthGrid from './MonthGrid'

export const dynamic = 'force-dynamic'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; d?: string }>
}) {
  const sp = await searchParams
  const today = bangkokToday().dateKey
  const mode = sp.mode === 'month' ? 'month' : 'week'
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? '') ? sp.d! : today

  const from = mode === 'week' ? mondayOf(anchor) : `${anchor.slice(0, 8)}01`
  const monthStart = `${anchor.slice(0, 8)}01`

  // เดือนต้องเผื่อวันที่ล้นจากเดือนก่อน/หลังในตาราง 6 สัปดาห์
  const rangeFrom = mode === 'week' ? from : addDays(monthStart, -7)
  const rangeTo = mode === 'week' ? addDays(from, 6) : addDays(monthStart, 41)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('schedule_occurrences', {
    p_from: rangeFrom,
    p_to: rangeTo,
  })

  const occurrences = (data ?? []) as Occ[]
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))

  const prev = mode === 'week' ? addDays(from, -7) : addMonths(monthStart, -1)
  const next = mode === 'week' ? addDays(from, 7) : addMonths(monthStart, 1)
  const q = (d: string) => `/calendar?mode=${mode}&d=${d}`

  return (
    <main className="wrap wrap--wide">
      <div className="page-head">
        <h1>ปฏิทิน</h1>
        <div className="sub">
          {mode === 'week' ? thaiRangeLabel(from, addDays(from, 6)) : thaiMonthLabel(monthStart)}
        </div>
      </div>

      <div className="cal-bar">
        <div className="seg">
          <Link href={`/calendar?mode=week&d=${anchor}`} data-on={mode === 'week'}>สัปดาห์</Link>
          <Link href={`/calendar?mode=month&d=${anchor}`} data-on={mode === 'month'}>เดือน</Link>
        </div>
        <div className="cal-nav">
          <Link href={q(prev)} aria-label="ก่อนหน้า">‹</Link>
          <Link href={q(today)} aria-label="วันนี้">•</Link>
          <Link href={q(next)} aria-label="ถัดไป">›</Link>
        </div>
      </div>

      {error ? (
        <p className="alert" role="alert">โหลดปฏิทินไม่สำเร็จ · {error.message}</p>
      ) : mode === 'week' ? (
        <WeekGrid occurrences={occurrences} days={days} />
      ) : (
        <MonthGrid monthKey={monthStart} occurrences={occurrences} today={today} />
      )}

      <p style={{ color: 'var(--faint)', fontSize: 'var(--s--2)', marginTop: '1rem' }}>
        ปฏิทินไว้ดู · แก้ที่หน้าคลัง
      </p>
    </main>
  )
}
