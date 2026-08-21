import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EventEditor, { type Line } from '../../EventEditor'

export const dynamic = 'force-dynamic'

type EventRow = {
  id: string
  project_id: string
  title: string
  body: string | null
  starts_at: string
  ends_at: string
  location: string | null
  label: string | null
  archived_at: string | null
  projects: { name: string } | null
}

/** ISO -> "YYYY-MM-DDTHH:MM" ตามเวลาไทย · ไทยไม่มี DST จึงบวก 7 ตรง ๆ ได้ */
function localParts(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString()
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) }
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>
}) {
  const { id, eventId } = await params
  const supabase = await createClient()

  const [evRes, agRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, project_id, title, body, starts_at, ends_at, location, label, archived_at, projects(name)')
      .eq('id', eventId)
      .maybeSingle(),
    supabase
      .from('event_agenda')
      .select('id, day_offset, start_time, end_time, title')
      .eq('event_id', eventId)
      .order('day_offset')
      .order('start_time'),
  ])

  if (evRes.error) {
    return (
      <main className="wrap">
        <p className="alert" role="alert">โหลดไม่สำเร็จ · {evRes.error.message}</p>
      </main>
    )
  }
  if (!evRes.data) notFound()

  const ev = evRes.data as unknown as EventRow
  if (ev.project_id !== id) notFound()

  const s = localParts(ev.starts_at)
  const e = localParts(ev.ends_at)

  const lines: Line[] = ((agRes.data ?? []) as {
    id: string; day_offset: number; start_time: string; end_time: string | null; title: string
  }[]).map((l) => ({
    key: l.id,
    day_offset: l.day_offset,
    start_time: l.start_time.slice(0, 5),
    // เวลาจบที่เว้นว่างต้องกลับมาเป็นช่องว่าง ไม่ใช่เวลาที่ระบบเติมให้ตอนแสดงผล
    // ไม่งั้นแค่เปิดหน้าแก้แล้วกดบันทึก ค่าที่อนุมานไว้จะกลายเป็นค่าที่กรอกเองถาวร
    end_time: l.end_time ? l.end_time.slice(0, 5) : '',
    title: l.title,
  }))

  return (
    <main className="wrap">
      <EventEditor
        projectId={id}
        projectName={ev.projects?.name ?? 'วิชา'}
        eventId={ev.id}
        archived={ev.archived_at !== null}
        initial={{
          title: ev.title,
          body: ev.body ?? '',
          startDate: s.date,
          startTime: s.time,
          endDate: e.date,
          endTime: e.time,
          location: ev.location ?? '',
          label: ev.label ?? '',
        }}
        initialLines={lines}
      />
    </main>
  )
}
