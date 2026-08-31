import { Content } from '@/components/Reveal'
import { ViewTransition } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { describe, type Slot } from '@/lib/schedule'
import { bangkokTime, thaiDateLabel } from '@/lib/time'
import { ENTRY_COLOR } from '@/lib/calendar'
import { orderEvents, isPastEvent } from '@/lib/eventOrder'
import ItemList, { type Row } from '@/components/ItemList'
import ProjectMenu from '@/components/ProjectMenu'

export const dynamic = 'force-dynamic'

type Item = {
  id: string
  type: 'task' | 'reminder' | 'shortnote'
  title: string
  body: string | null
  due_at: string | null
  remind_at: string | null
  done_at: string | null
  sort_order: number
  event_id: string | null
}

type EventRow = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  location: string | null
  label: string | null
}

/** "22 ส.ค. 14:30" — วันไทยแบบสั้นพร้อมเวลา */
function stamp(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + 7 * 3600 * 1000)
  const key = shifted.toISOString().slice(0, 10)
  return `${thaiDateLabel(key).split(' ').slice(1).join(' ')} ${bangkokTime(iso)}`
}

/** วันไทย YYYY-MM-DD ของจุดเวลาหนึ่ง */
function dayKeyOf(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

/** "22 ส.ค. 09:30 – 12:30" · ข้ามวันจะบอกวันจบด้วย "5 ก.ย. 20:00 – 7 ก.ย. 09:00" */
function eventStamp(e: EventRow) {
  const sameDay = dayKeyOf(e.starts_at) === dayKeyOf(e.ends_at)
  return `${stamp(e.starts_at)} – ${sameDay ? bangkokTime(e.ends_at) : stamp(e.ends_at)}`
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [projRes, schedRes, itemRes, eventRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, description, status, archived_at, areas(name)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('project_schedules')
      .select('day_of_week, start_time, end_time, location, label, week_offsets')
      .eq('project_id', id),
    supabase
      .from('items')
      .select('id, type, title, body, due_at, remind_at, done_at, sort_order, event_id')
      .eq('project_id', id)
      .is('archived_at', null),
    supabase
      .from('events')
      .select('id, title, starts_at, ends_at, location, label')
      .eq('project_id', id)
      .is('archived_at', null)
      .order('starts_at'),
  ])

  if (projRes.error) {
    return (
      <main className="wrap">
        <p className="alert" role="alert">โหลดไม่สำเร็จ · {projRes.error.message}</p>
      </main>
    )
  }
  if (!projRes.data) notFound()

  const project = projRes.data as unknown as {
    id: string
    name: string
    description: string | null
    archived_at: string | null
    areas: { name: string } | null
  }
  const slots = (schedRes.data ?? []) as Slot[]
  const items = (itemRes.data ?? []) as Item[]
  const events = (eventRes.data ?? []) as EventRow[]

  // ตรรกะการเรียงอยู่ใน lib/eventOrder.ts ที่มีเทสต์กำกับ
  const now = new Date().toISOString()
  const isPast = (e: EventRow) => isPastEvent(e, now)
  const sortedEvents = orderEvents(events, now)

  // ป้ายบอกว่างานชิ้นนี้เป็นของกิจกรรมไหน · null = ไม่ได้ผูกกับกิจกรรมใด
  const eventName = new Map(events.map((e) => [e.id, e.title]))
  const chip = (i: Item): Row['tag'] =>
    i.event_id && eventName.has(i.event_id)
      ? { text: eventName.get(i.event_id)!, kind: 'event' }
      : null

  const tasks = items.filter((i) => i.type === 'task')
  const reminders = items.filter((i) => i.type === 'reminder')
  const notes = items.filter((i) => i.type === 'shortnote')

  // เสร็จแล้วร่วงท้าย ไม่ซ่อน
  const sink = (a: Item, b: Item) =>
    Number(a.done_at !== null) - Number(b.done_at !== null) ||
    (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') ||
    a.sort_order - b.sort_order

  tasks.sort(sink)
  reminders.sort((a, b) => (a.remind_at ?? '').localeCompare(b.remind_at ?? ''))
  notes.sort((a, b) => a.sort_order - b.sort_order)

  const doneCount = tasks.filter((t) => t.done_at !== null).length
  const sortedSlots = slots
    .slice()
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))

  return (
    <Content>
      <main className="wrap">
        <div className="page-head">
          <Link href="/library" className="back">‹ {project.areas?.name ?? 'คลัง'}</Link>
          {/* ปลายทางของ morph จากหน้าคลัง — ชื่อต้องตรงกับฝั่งโน้นเป๊ะ */}
        <ViewTransition name={`project-${id}`}>
          <h1>{project.name}</h1>
        </ViewTransition>
          {project.description && <div className="sub">{project.description}</div>}
          {project.archived_at && <div className="sub">เก็บเข้าคลังแล้ว</div>}
        </div>

        <div className="sched-strip">
          {sortedSlots.length > 0 ? (
            sortedSlots.map((s, i) => <div key={i}>{describe(s)}</div>)
          ) : (
            <div>ยังไม่ได้ตั้งช่วงเวลาประจำ</div>
          )}
          <div style={{ marginTop: '0.5rem' }}>
            <Link href={`/project/${id}/schedule`} className="back">แก้ช่วงเวลาประจำ ›</Link>
          </div>
        </div>

        {/*
          กิจกรรมมาก่อนงาน เพราะมันคือ "ต้องไปที่ไหนตอนไหน" ซึ่งเปลี่ยนไม่ได้
          ส่วนงานเป็นสิ่งที่จัดเวลาเองได้ · ลากจัดลำดับไม่ได้ เวลาเป็นตัวตัดสิน
          ที่ยังไม่ผ่านอยู่บน ที่ผ่านแล้วจางลงและร่วงไปท้ายกลุ่ม
        */}
        <Group title="กิจกรรม" count={events.length || null}>
          <ItemList
            rows={sortedEvents.map(
              (e): Row => ({
                id: null,               // event ไม่ใช่ item · ติ๊กไม่ได้และลากไม่ได้
                color: ENTRY_COLOR.event,
                title: e.title,
                meta: [eventStamp(e), e.location, e.label].filter(Boolean).join(' · '),
                done: false,
                past: isPast(e),
                checkable: false,
                tag: null,
                href: `/project/${id}/event/${e.id}`,
                // เก็บเข้าคลังได้จากแถวนี้เลย พร้อมแถบเลิกทำแบบเดียวกับงาน
                event: { projectId: id, eventId: e.id },
              })
            )}
          />
        </Group>
        <Link href={`/project/${id}/event/new`} className="btn btn--ghost add-slot">
          + กิจกรรมใหม่
        </Link>

        <Group title="งาน" count={tasks.length ? `${doneCount} / ${tasks.length}` : null}>
          <ItemList
            rows={tasks.map(
              (t): Row => ({
                id: t.id,
                color: t.due_at ? 'var(--due)' : 'var(--task)',
                title: t.title,
                meta: t.done_at
                  ? `เสร็จ ${stamp(t.done_at)}`
                  : t.due_at
                    ? stamp(t.due_at)
                    : 'ยังไม่กำหนดวัน',
                done: t.done_at !== null,
                checkable: true,
                tag: chip(t),
                // due_at มาก่อน sort_order ใน sink() งานที่มีวันกำหนดจึงลากไม่ได้
                movable: t.done_at === null && t.due_at === null,
                panel: {
                  id: t.id, projectId: id, type: 'task' as const, title: t.title,
                  body: t.body, at: t.due_at, done: t.done_at !== null,
                  projectName: project.name,
                },
              })
            )}
          />
        </Group>

        <Group title="เตือน" count={reminders.length || null}>
          <ItemList
            rows={reminders.map(
              (r): Row => ({
                id: r.id,
                color: 'var(--due)',
                title: r.title,
                meta: r.remind_at ? stamp(r.remind_at) : '',
                done: false,
                checkable: false,
                tag: chip(r),
                panel: {
                  id: r.id, projectId: id, type: 'reminder' as const, title: r.title,
                  body: r.body, at: r.remind_at, done: false,
                  projectName: project.name,
                },
              })
            )}
          />
        </Group>

        <Group title="โน้ต" count={notes.length || null}>
          <ItemList
            rows={notes.map(
              (n): Row => ({
                id: n.id,
                color: 'var(--note)',
                title: n.title,
                meta: n.body ?? '',
                done: false,
                checkable: false,
                tag: chip(n),
                movable: true,
                panel: {
                  id: n.id, projectId: id, type: 'shortnote' as const, title: n.title,
                  body: n.body, at: null, done: false,
                  projectName: project.name,
                },
              })
            )}
          />
        </Group>

        <div className="actions actions--end">
          <ProjectMenu projectId={id} archived={project.archived_at !== null} />
        </div>
      </main>
    </Content>
  )
}

function Group({
  title,
  count,
  children,
}: {
  title: string
  count: string | number | null
  children: React.ReactNode
}) {
  /*
   * ⚠️ **ห้ามตัด children ทิ้งตอนกลุ่มว่าง**
   *
   * ของเดิมเขียน `{empty ? <p>ยังไม่มี</p> : children}` ซึ่งทำให้ ItemList
   * ถูก unmount ทันทีที่เก็บของ**ชิ้นสุดท้าย**ในกลุ่มเข้าคลัง —
   * แถบเลิกทำที่ควรค้าง 8 วินาทีจึงหายไปพร้อมกัน กดคืนไม่ได้เลย
   * ซึ่งเป็นจังหวะที่คนอยากกดเลิกทำมากที่สุดพอดี (เจอ 1 ก.ย. 2026)
   *
   * ข้อความ "ยังไม่มี" ย้ายไปอยู่ใน ItemList แทน มันรู้จำนวนแถวจริงอยู่แล้ว
   */
  return (
    <>
      <div className="sec">
        <span>{title}</span>
        {count && <span>{count}</span>}
      </div>
      {children}
    </>
  )
}
