import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { bangkokToday } from '@/lib/time'
import { summarize, type Slot } from '@/lib/schedule'

export const dynamic = 'force-dynamic'

// คีย์สีจาก DESIGN.md map ไปเป็นคลาสที่มี gradient ใน globals.css
const AREA_CLASS: Record<string, string> = {
  class: 'acard--class',
  hack: 'acard--hack',
  fin: 'acard--fin',
  pers: 'acard--pers',
}

type Area = { id: string; name: string; color: string | null; sort_order: number }
type Project = {
  id: string
  area_id: string
  name: string
  status: string
  archived_at: string | null
  sort_order: number
}

export default async function LibraryPage() {
  const supabase = await createClient()
  const { end } = bangkokToday()

  const [areaRes, projRes, schedRes, itemRes] = await Promise.all([
    supabase.from('areas').select('id, name, color, sort_order').is('archived_at', null).order('sort_order'),
    supabase.from('projects').select('id, area_id, name, status, archived_at, sort_order').order('sort_order'),
    supabase
      .from('project_schedules')
      .select('project_id, day_of_week, start_time, end_time, location, label, week_offsets'),
    // ตัวเลขนับเฉพาะของที่ "ต้องสนใจ" — เลยกำหนด + ครบวันนี้ (doc/ux.html)
    supabase
      .from('items')
      .select('project_id')
      .is('archived_at', null)
      .is('done_at', null)
      .in('type', ['task', 'reminder'])
      .or(`due_at.lt.${end.toISOString()},remind_at.lt.${end.toISOString()}`),
  ])

  const err = areaRes.error ?? projRes.error ?? schedRes.error ?? itemRes.error
  if (err) {
    return (
      <main className="wrap">
        <div className="page-head"><h1>คลัง</h1></div>
        <p className="alert" role="alert">โหลดข้อมูลไม่สำเร็จ · {err.message}</p>
      </main>
    )
  }

  const areas = (areaRes.data ?? []) as Area[]
  const projects = (projRes.data ?? []) as Project[]
  const slots = (schedRes.data ?? []) as (Slot & { project_id: string })[]

  const attention = new Map<string, number>()
  for (const r of (itemRes.data ?? []) as { project_id: string }[]) {
    attention.set(r.project_id, (attention.get(r.project_id) ?? 0) + 1)
  }

  const slotsOf = (pid: string) => slots.filter((s) => s.project_id === pid)
  const isArchived = (p: Project) => p.archived_at !== null || p.status === 'archived'

  return (
    <main className="wrap">
      <div className="page-head">
        <h1>คลัง</h1>
        <div className="sub">Area › โปรเจกต์</div>
      </div>

      <div className="areas">
        {areas.map((area) => {
          const kids = projects.filter((p) => p.area_id === area.id)
          const open = kids.filter((p) => !isArchived(p))
          const count = kids.reduce((n, p) => n + (attention.get(p.id) ?? 0), 0)
          const label = area.name === 'Class' ? 'วิชา' : 'โปรเจกต์'
          return (
            <a
              key={area.id}
              href={`#area-${area.id}`}
              className={`acard ${AREA_CLASS[area.color ?? ''] ?? ''}`}
            >
              <span className="acard__nm">{area.name}</span>
              <span className="acard__ct">
                {open.length > 0 ? `${open.length} ${label}` : 'ว่าง'}
              </span>
              {count > 0 && <span className="acard__badge">{count}</span>}
            </a>
          )
        })}
      </div>

      {areas.map((area) => {
        // archived ร่วงท้าย จางลง แต่ไม่ซ่อน
        const kids = projects
          .filter((p) => p.area_id === area.id)
          .sort(
            (a, b) =>
              Number(isArchived(a)) - Number(isArchived(b)) || a.sort_order - b.sort_order
          )

        if (kids.length === 0) return null

        return (
          <section key={area.id} id={`area-${area.id}`}>
            <div className="sec">
              <span>{area.name}</span>
              <span>{kids.length}</span>
            </div>
            {kids.map((p) => {
              const archived = isArchived(p)
              const when = summarize(slotsOf(p.id))
              const n = attention.get(p.id) ?? 0
              return (
                <Link
                  key={p.id}
                  href={`/project/${p.id}`}
                  className={`proj${archived ? ' proj--archived' : ''}`}
                >
                  <span className="proj__name">{p.name}</span>
                  <span className="proj__when">{archived ? 'เก็บเข้าคลังแล้ว' : when}</span>
                  {n > 0 && <span className="tag tag--late">{n}</span>}
                </Link>
              )
            })}
          </section>
        )
      })}
    </main>
  )
}
