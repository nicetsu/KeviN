import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { bangkokToday } from '@/lib/time'
import { summarize, type Slot } from '@/lib/schedule'

export const dynamic = 'force-dynamic'

const AREA_GRADIENT: Record<string, string> = {
  class: 'var(--g-class)',
  hack: 'var(--g-hack)',
  fin: 'var(--g-fin)',
  pers: 'var(--g-pers)',
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
    supabase.from('project_schedules').select('project_id, day_of_week, start_time, end_time, location, label, week_offsets'),
    // ตัวเลขขวานับเฉพาะของที่ "ต้องสนใจ" — เลยกำหนด + ครบวันนี้ (doc/ux.html)
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

  return (
    <main className="wrap">
      <div className="page-head">
        <h1>คลัง</h1>
        <div className="sub">Area › โปรเจกต์</div>
      </div>

      {areas.map((area) => {
        // archived ร่วงท้าย จางลง แต่ไม่ซ่อน
        const kids = projects
          .filter((p) => p.area_id === area.id)
          .sort((a, b) => {
            const aArc = a.archived_at !== null || a.status === 'archived'
            const bArc = b.archived_at !== null || b.status === 'archived'
            return Number(aArc) - Number(bArc) || a.sort_order - b.sort_order
          })

        const count = kids.reduce((n, p) => n + (attention.get(p.id) ?? 0), 0)
        const label = area.name === 'Class' ? 'วิชา' : 'โปรเจกต์'

        return (
          <section className="area" key={area.id}>
            <div className="area__head">
              <span
                className="area__dot"
                style={{ background: AREA_GRADIENT[area.color ?? ''] ?? 'var(--line)' }}
              />
              <span className="area__name">{area.name}</span>
              <span className="area__sum">
                {kids.length} {label}
              </span>
              {count > 0 && <span className="area__count">{count}</span>}
            </div>

            {kids.length === 0 ? (
              <div className="area__kids">
                <p style={{ color: 'var(--faint)', fontSize: 'var(--s--1)', margin: '0 0 0.5rem' }}>
                  ยังไม่มี{label}ใน Area นี้
                </p>
              </div>
            ) : (
              <div className="area__kids">
                {kids.map((p) => {
                  const archived = p.archived_at !== null || p.status === 'archived'
                  const when = summarize(slotsOf(p.id))
                  const n = attention.get(p.id) ?? 0
                  return (
                    <Link
                      key={p.id}
                      href={`/project/${p.id}`}
                      className={`proj${archived ? ' proj--archived' : ''}`}
                    >
                      <span className="proj__name">{p.name}</span>
                      <span className="proj__when">
                        {archived ? 'เก็บเข้าคลังแล้ว' : when}
                      </span>
                      {n > 0 && <span className="area__count">{n}</span>}
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </main>
  )
}
