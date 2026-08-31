import { Content } from '@/components/Reveal'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { bangkokToday, mondayOf } from '@/lib/time'
import Editor, { newSlot, type Slot, type OtherSlot } from './Editor'

export const dynamic = 'force-dynamic'

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [projRes, mineRes, othersRes] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).maybeSingle(),
    supabase
      .from('project_schedules')
      .select('day_of_week, start_time, end_time, location, label, start_date, week_offsets')
      .eq('project_id', id)
      .order('day_of_week'),
    supabase
      .from('project_schedules')
      .select('day_of_week, start_time, end_time, start_date, week_offsets, projects(name)')
      .neq('project_id', id),
  ])

  if (projRes.error) {
    return (
      <main className="wrap">
        <p className="alert" role="alert">โหลดไม่สำเร็จ · {projRes.error.message}</p>
      </main>
    )
  }
  if (!projRes.data) notFound()

  const rows = (mineRes.data ?? []) as {
    day_of_week: number
    start_time: string
    end_time: string
    location: string | null
    label: string | null
    start_date: string
    week_offsets: number[]
  }[]

  // สัปดาห์ที่ติ๊กเป็นชุดต่อเนื่องจาก 0 = โหมด "ซ้ำทุกสัปดาห์" · นอกนั้นคือเลือกเอง
  const isRange = (o: number[]) => o.length > 0 && o.every((v, i) => v === i)

  const initialSlots: Slot[] = rows.map((r, i) => ({
    ...newSlot(),
    key: `db-${i}`,
    day_of_week: r.day_of_week,
    start_time: r.start_time.slice(0, 5),
    end_time: r.end_time.slice(0, 5),
    location: r.location ?? '',
    label: r.label ?? '',
    mode: isRange(r.week_offsets) ? 'range' : 'pick',
    weeks: r.week_offsets.length,
    picked: r.week_offsets,
  }))

  const others: OtherSlot[] = ((othersRes.data ?? []) as unknown as {
    day_of_week: number
    start_time: string
    end_time: string
    start_date: string
    week_offsets: number[]
    projects: { name: string } | null
  }[]).map((o) => ({
    project_name: o.projects?.name ?? 'โปรเจกต์อื่น',
    day_of_week: o.day_of_week,
    start_time: o.start_time.slice(0, 5),
    end_time: o.end_time.slice(0, 5),
    start_date: o.start_date,
    week_offsets: o.week_offsets,
  }))

  const initialStart = rows[0]?.start_date ?? mondayOf(bangkokToday().dateKey)

  return (
    <Content>
      <main className="wrap">
        <Link href={`/project/${id}`} className="back">‹ กลับไปหน้าวิชา</Link>
        <Editor
          projectId={id}
          projectName={projRes.data.name}
          initialStart={initialStart}
          initialSlots={initialSlots}
          others={others}
        />
      </main>
    </Content>
  )
}
