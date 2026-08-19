import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { describe, type Slot } from '@/lib/schedule'
import { bangkokTime, thaiDateLabel } from '@/lib/time'
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
}

/** "22 ส.ค. 14:30" — วันไทยแบบสั้นพร้อมเวลา */
function stamp(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + 7 * 3600 * 1000)
  const key = shifted.toISOString().slice(0, 10)
  return `${thaiDateLabel(key).split(' ').slice(1).join(' ')} ${bangkokTime(iso)}`
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [projRes, schedRes, itemRes] = await Promise.all([
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
      .select('id, type, title, body, due_at, remind_at, done_at, sort_order')
      .eq('project_id', id)
      .is('archived_at', null),
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
    <main className="wrap">
      <div className="page-head">
        <Link href="/library" className="back">‹ {project.areas?.name ?? 'คลัง'}</Link>
        <h1>{project.name}</h1>
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
  const empty = !count
  return (
    <>
      <div className="sec">
        <span>{title}</span>
        {count && <span>{count}</span>}
      </div>
      {empty ? <p className="none">ยังไม่มี</p> : children}
    </>
  )
}
