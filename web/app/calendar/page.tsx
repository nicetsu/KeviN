import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  bangkokToday, mondayOf, addDays, addMonths,
  thaiMonthLabel, thaiRangeLabel, bangkokTime,
} from '@/lib/time'
import { spanLabel, type CalendarEntry } from '@/lib/calendar'
import WeekGrid from './WeekGrid'
import MonthGrid, { type DayEntry } from './MonthGrid'

export const dynamic = 'force-dynamic'

type Item = {
  id: string
  type: 'task' | 'reminder' | 'shortnote'
  title: string
  due_at: string | null
  remind_at: string | null
  done_at: string | null
  projects: { name: string } | null
}

/** ISO -> YYYY-MM-DD ตามวันไทย */
function dayKeyOf(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; d?: string }>
}) {
  const sp = await searchParams
  const today = bangkokToday().dateKey
  // เปิดมาเป็นโหมดเดือน · ลิงก์เก่าที่ระบุ ?mode=week ยังใช้ได้เหมือนเดิม
  const mode = sp.mode === 'week' ? 'week' : 'month'
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? '') ? sp.d! : today

  const from = mode === 'week' ? mondayOf(anchor) : `${anchor.slice(0, 8)}01`
  const monthStart = `${anchor.slice(0, 8)}01`

  // เดือนต้องเผื่อวันที่ล้นจากเดือนก่อน/หลังในตาราง 6 สัปดาห์
  const rangeFrom = mode === 'week' ? from : addDays(monthStart, -7)
  const rangeTo = mode === 'week' ? addDays(from, 6) : addDays(monthStart, 41)

  const supabase = await createClient()

  const [entryRes, itemRes] = await Promise.all([
    // คาบเรียน + event มาจากฟังก์ชันเดียว · event ข้ามคืนถูกหั่นเป็นบล็อกรายวันให้แล้ว
    supabase.rpc('calendar_entries', { p_from: rangeFrom, p_to: rangeTo }),
    // โหมดเดือนต้องมีจุดของงานและการเตือนด้วย ไม่ใช่แค่ช่วงเวลาที่ถูกจอง
    mode === 'month'
      ? supabase
          .from('items')
          .select('id, type, title, due_at, remind_at, done_at, projects(name)')
          .is('archived_at', null)
          .in('type', ['task', 'reminder'])
          .or(
            `and(due_at.gte.${rangeFrom},due_at.lte.${rangeTo}),` +
              `and(remind_at.gte.${rangeFrom},remind_at.lte.${rangeTo})`
          )
      : Promise.resolve({ data: [], error: null }),
  ])

  const error = entryRes.error ?? itemRes.error
  const entries = (entryRes.data ?? []) as CalendarEntry[]
  const items = (itemRes.data ?? []) as unknown as Item[]
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))

  // รวมทุกอย่างของเดือนเป็นรายวัน
  const byDay: Record<string, DayEntry[]> = {}
  const push = (day: string, e: DayEntry) => {
    ;(byDay[day] ??= []).push(e)
  }

  if (mode === 'month') {
    for (const e of entries) {
      push(e.occurs_on, {
        kind: e.kind,
        title: e.title,
        time: spanLabel(e),
        // คาบเรียนใช้ชื่อ project เป็นชื่อบล็อกอยู่แล้ว บรรทัดล่างจึงเป็นห้อง/ชนิดคาบ
        // ส่วน event มีชื่อของตัวเอง ต้องบอกด้วยว่าเป็นของงานไหน
        detail: (e.kind === 'event'
          ? [e.project_name, e.location]
          : [e.location, e.label]
        ).filter(Boolean).join(' · '),
        skipped: e.skipped,
      })
    }
    for (const it of items) {
      const at = it.type === 'reminder' ? it.remind_at : it.due_at
      if (!at) continue
      push(dayKeyOf(at), {
        // เสร็จแล้วเป็นเขียว ยังไม่เสร็จเป็นส้ม — เห็นความคืบหน้าได้จากปฏิทินเลย
        kind: it.done_at ? 'done' : 'due',
        title: it.title,
        time: bangkokTime(at),
        detail: it.projects?.name ?? '',
      })
    }
    for (const list of Object.values(byDay)) {
      list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
    }
  }

  const prev = mode === 'week' ? addDays(from, -7) : addMonths(monthStart, -1)
  const next = mode === 'week' ? addDays(from, 7) : addMonths(monthStart, 1)
  const q = (d: string) => `/calendar?mode=${mode}&d=${d}`

  return (
    <main className="wrap wrap--wide">
      <div className="cal-head">
        <h1>
          {mode === 'week' ? thaiRangeLabel(from, addDays(from, 6)) : thaiMonthLabel(monthStart)}
        </h1>
        <div className="seg">
          <Link href={`/calendar?mode=month&d=${anchor}`} data-on={mode === 'month'}>เดือน</Link>
          <Link href={`/calendar?mode=week&d=${anchor}`} data-on={mode === 'week'}>สัปดาห์</Link>
        </div>
      </div>

      <div className="cal-nav">
        <Link href={q(prev)} aria-label="ก่อนหน้า">‹</Link>
        <Link href={q(today)} aria-label="วันนี้">วันนี้</Link>
        <Link href={q(next)} aria-label="ถัดไป">›</Link>
      </div>

      {error ? (
        <p className="alert" role="alert">โหลดปฏิทินไม่สำเร็จ · {error.message}</p>
      ) : mode === 'week' ? (
        <>
          <WeekGrid entries={entries} days={days} />
          <p className="none" style={{ marginTop: '1rem' }}>ปฏิทินไว้ดู · แก้ที่หน้าคลัง</p>
        </>
      ) : (
        <MonthGrid monthKey={monthStart} today={today} byDay={byDay} />
      )}
    </main>
  )
}
