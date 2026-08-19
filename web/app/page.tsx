import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  bangkokToday,
  thaiDateLabel,
  bangkokTime,
  clockLabel,
  overdueLabel,
  soonLabel,
  addDays,
  dayAheadLabel,
} from '@/lib/time'
import ItemList, { type Row } from '@/components/ItemList'
import NextClass, { type NextClassInfo } from '@/components/NextClass'

export const dynamic = 'force-dynamic'

type Occurrence = {
  schedule_id: string
  project_name: string
  area_name: string
  occurs_on: string
  start_time: string
  end_time: string
  location: string | null
  label: string | null
}

type Item = {
  id: string
  project_id: string
  type: 'task' | 'reminder' | 'shortnote'
  title: string
  body: string | null
  due_at: string | null
  remind_at: string | null
  done_at: string | null
  projects: { name: string } | null
}

type Line = Row & { sortAt: number }

/**
 * มองไปข้างหน้ากี่วันเพื่อหา "คาบถัดไป"
 *
 * ต้องเผื่อให้ข้ามสัปดาห์ที่ไม่มีเรียนได้ — ตารางเทอมนี้เว้นสัปดาห์สอบกลางภาค
 * กับ Commencement Week ทำให้ช่องว่างยาวสุดราว 10 วัน (ศุกร์ก่อนหยุด ถึงจันทร์
 * ที่กลับมาเรียน) · 14 วันจึงครอบคลุม และยังถูกเมื่อหมดเทอมแล้วคือไม่เจออะไรเลย
 */
const LOOKAHEAD_DAYS = 14

/**
 * เวลาปัจจุบัน ณ ตอนที่ request เข้ามา
 *
 * `await connection()` ประกาศชัดว่าหน้านี้ขึ้นกับ request จริง จึง prerender
 * ตอน build ไม่ได้ · ถ้าเรียก `Date.now()` เปล่า ๆ มันจะถูกต้องอยู่ก็เพราะบังเอิญ
 * มี `force-dynamic` กำกับ — วันไหนมีคนถอดบรรทัดนั้นออกเพราะคิดว่าเป็นตัวถ่วง
 * เวลาจะถูกตรึงไว้ที่ตอน build แล้ว "เลยกำหนด" กับ "อีก 30 นาที" จะคำนวณจากอดีต
 * **ผิดเงียบ ๆ ไม่มี error ให้เห็น**
 *
 * ที่แยกออกมาเป็นฟังก์ชันเพราะการเรียกอะไรที่ให้ค่าไม่คงที่กลางตัว component
 * ผิดกฎ React และ eslint จับ — แม้ที่นี่จะเป็น Server Component ที่ render รอบเดียวจบ
 */
async function requestNow() {
  await connection()
  return Date.now()
}

export default async function TodayPage() {
  const supabase = await createClient()
  const { start, end, dateKey } = bangkokToday()

  const [occRes, itemRes] = await Promise.all([
    supabase.rpc('schedule_occurrences', {
      p_from: dateKey,
      p_to: addDays(dateKey, LOOKAHEAD_DAYS),
    }),
    supabase
      .from('items')
      .select('id, project_id, type, title, body, due_at, remind_at, done_at, projects(name)')
      .is('archived_at', null)
      .in('type', ['task', 'reminder'])
      .or(
        `and(due_at.gte.${start.toISOString()},due_at.lt.${end.toISOString()}),` +
          `and(remind_at.gte.${start.toISOString()},remind_at.lt.${end.toISOString()}),` +
          `and(due_at.lt.${start.toISOString()},done_at.is.null)`
      ),
  ])

  const loadError = occRes.error ?? itemRes.error
  if (loadError) {
    return (
      <main className="wrap">
        <Head dateKey={dateKey} />
        <p className="alert" role="alert">โหลดข้อมูลไม่สำเร็จ · {loadError.message}</p>
      </main>
    )
  }

  const occurrences = (occRes.data ?? []) as Occurrence[]
  const items = (itemRes.data ?? []) as unknown as Item[]
  const now = await requestNow()

  // คาบเรียนไม่ใช่ item — ติ๊กไม่ได้ เก็บเข้าคลังไม่ได้ แก้ที่หน้าวิชา
  // รายการข้างล่างเป็น "วันนี้" จึงตัดคาบของวันอื่นทิ้ง — ต่างจาก hero ที่มองข้ามวันได้
  const todayOcc = occurrences.filter((o) => o.occurs_on === dateKey)

  const classLines: Line[] = todayOcc.map((o) => ({
    id: null,
    sortAt: new Date(`${dateKey}T${o.start_time}+07:00`).getTime(),
    color: 'var(--sched)',
    title: o.project_name,
    meta: [`${clockLabel(o.start_time)}–${clockLabel(o.end_time)}`, o.location, o.label]
      .filter(Boolean)
      .join(' · '),
    done: false,
    checkable: false,
    tag: null,
  }))

  // คาบถัดไป = คาบแรกที่ยังไม่จบ **ข้ามวันได้**
  //
  // เดิมดูแค่วันนี้ พอคาบสุดท้ายเลิก การ์ดก็หายไปทั้งใบจนถึงเช้าวันรุ่งขึ้น ซึ่งเป็น
  // ช่วงเย็นที่คนอยากรู้พอดีว่าพรุ่งนี้เริ่มกี่โมง (เจ้าของเคาะให้เปลี่ยน 19 ส.ค.)
  //
  // ใช้ `o.occurs_on` ไม่ใช่ `dateKey` — คาบที่เจอไม่จำเป็นต้องเป็นของวันนี้แล้ว
  const upcoming = occurrences
    .map((o) => ({
      o,
      start: new Date(`${o.occurs_on}T${o.start_time}+07:00`).getTime(),
      end: new Date(`${o.occurs_on}T${o.end_time}+07:00`).getTime(),
    }))
    .filter((x) => x.end > now)
    .sort((a, b) => a.start - b.start)[0]

  const nextClass: NextClassInfo | null = upcoming
    ? {
        projectName: upcoming.o.project_name,
        location: upcoming.o.location,
        label: upcoming.o.label,
        startsAt: new Date(upcoming.start).toISOString(),
        endsAt: new Date(upcoming.end).toISOString(),
        startLabel: clockLabel(upcoming.o.start_time),
        endLabel: clockLabel(upcoming.o.end_time),
        dayLabel: dayAheadLabel(dateKey, upcoming.o.occurs_on),
      }
    : null

  const overdue: Line[] = []
  const today: Line[] = []

  for (const it of items) {
    const at = it.type === 'reminder' ? it.remind_at : it.due_at
    if (!at) continue

    const done = it.done_at !== null
    const isOverdue = !done && new Date(at).getTime() < start.getTime()

    // ในหน้าวันนี้ บรรทัดข้อมูลขึ้นต้นด้วยชื่อ project เสมอ (doc/DESIGN.md)
    const project = it.projects?.name ?? '—'
    const late = overdueLabel(at, now)
    const soon = soonLabel(at, now)

    const line: Line = {
      id: it.id,
      sortAt: new Date(at).getTime(),
      color: it.type === 'reminder' || it.due_at ? 'var(--due)' : 'var(--task)',
      title: it.title,
      meta: isOverdue
        ? `${project} · ${late ?? ''}`.trim()
        : `${project} · ${bangkokTime(at)}`,
      done,
      checkable: it.type === 'task',
      tag: isOverdue ? { text: 'เลยกำหนด', kind: 'late' } : !done && soon ? { text: soon, kind: 'soon' } : null,
      panel: {
        id: it.id,
        projectId: it.project_id,
        type: it.type,
        title: it.title,
        body: it.body,
        at,
        done,
        projectName: project,
      },
    }

    if (isOverdue) overdue.push(line)
    else today.push(line)
  }

  // เสร็จแล้วร่วงท้ายกลุ่ม · ไม่ซ่อน (doc/DECISIONS.md)
  const byTime = (a: Line, b: Line) => Number(a.done) - Number(b.done) || a.sortAt - b.sortAt
  overdue.sort(byTime)
  const timeline = [...classLines, ...today].sort(byTime)

  const nothing = overdue.length === 0 && timeline.length === 0

  return (
    <main className="wrap">
      <Head dateKey={dateKey} />

      {nextClass && <NextClass info={nextClass} />}

      {nothing && (
        <div className="empty">
          <strong>วันนี้ว่าง</strong>
          ไม่มีคาบเรียน งาน หรือการเตือนในวันนี้
        </div>
      )}

      {overdue.length > 0 && (
        <>
          <div className="sec">
            <span>เลยกำหนด</span>
            <span>{overdue.length}</span>
          </div>
          <ItemList rows={overdue} />
        </>
      )}

      {timeline.length > 0 && (
        <>
          <div className="sec">
            <span>วันนี้</span>
            <span>{timeline.length}</span>
          </div>
          <ItemList rows={timeline} />
        </>
      )}
    </main>
  )
}

function Head({ dateKey }: { dateKey: string }) {
  // วันที่คือหัวข้อของหน้านี้ · คำว่า "วันนี้" อยู่ในแถบนำทางแล้ว ไม่ต้องซ้ำ
  return (
    <div className="page-head">
      <h1>{thaiDateLabel(dateKey)}</h1>
    </div>
  )
}
