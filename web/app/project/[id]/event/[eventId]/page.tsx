import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { bangkokTime, thaiDateLabel } from '@/lib/time'
import { resolveAgenda, agendaDayKey, agendaClock, type AgendaRow } from '@/lib/agenda'
import Autolink from '@/lib/autolink'
import ItemList, { type Row } from '@/components/ItemList'
import EventItemAdd from './EventItemAdd'

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

type Item = {
  id: string
  type: 'task' | 'reminder' | 'shortnote'
  title: string
  body: string | null
  due_at: string | null
  remind_at: string | null
  done_at: string | null
}

/** วันไทย YYYY-MM-DD ของจุดเวลาหนึ่ง */
function dayKeyOf(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

/** "22 ส.ค. 14:30" — วันไทยแบบสั้นพร้อมเวลา */
function stamp(iso: string) {
  return `${thaiDateLabel(dayKeyOf(iso)).split(' ').slice(1).join(' ')} ${bangkokTime(iso)}`
}

/**
 * หน้ารายละเอียด event · เป็น route ไม่ใช่ overlay (เจ้าของเคาะ 21 ส.ค.)
 *
 * ต่างจาก S7 แผงรายละเอียดที่เป็นการ "แวะดู" — หน้านี้เป็นปลายทางที่มีเนื้อหา
 * ของตัวเอง (กำหนดการเป็นสิบบรรทัด) เหมือน S6 ตัวจัดการช่วงเวลา
 * และเหตุผลสำคัญกว่านั้นคือ **มันมี URL** — Claude สร้าง event ให้แล้วตอบกลับ
 * พร้อมลิงก์ให้กดดูได้ทันที ซึ่ง overlay ทำไม่ได้เลย
 */
export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>
}) {
  const { id, eventId } = await params
  const supabase = await createClient()

  const [evRes, agRes, itemRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, project_id, title, body, starts_at, ends_at, location, label, archived_at, projects(name)')
      .eq('id', eventId)
      .maybeSingle(),
    supabase
      .from('event_agenda')
      .select('id, day_offset, start_time, end_time, title')
      .eq('event_id', eventId),
    supabase
      .from('items')
      .select('id, type, title, body, due_at, remind_at, done_at')
      .eq('event_id', eventId)
      .is('archived_at', null),
  ])

  if (evRes.error) {
    return (
      <main className="wrap">
        <p className="alert" role="alert">โหลดไม่สำเร็จ · {evRes.error.message}</p>
      </main>
    )
  }
  // RLS ทำให้ของคนอื่นออกมาเป็น "ไม่พบ" อยู่แล้ว ไม่ต้องเช็ก user เอง
  if (!evRes.data) notFound()

  const ev = evRes.data as unknown as EventRow
  // ป้องกันลิงก์ที่ project กับ event ไม่ตรงกัน — FK บังคับความจริงไว้แล้ว
  // แต่ URL ปลอมขึ้นมาเองได้ ถ้าไม่เช็กจะได้ breadcrumb ที่ชี้ผิดที่
  if (ev.project_id !== id) notFound()

  const startKey = dayKeyOf(ev.starts_at)
  const endKey = dayKeyOf(ev.ends_at)
  const sameDay = startKey === endKey

  const agenda = resolveAgenda(
    (agRes.data ?? []) as AgendaRow[],
    ev.ends_at ? bangkokTime(ev.ends_at) : null
  )
  const items = (itemRes.data ?? []) as Item[]

  // กำหนดการของงานหลายวันต้องมีหัววันคั่น ไม่งั้น 09:00 ของวันไหนก็ไม่รู้
  const byDay = new Map<number, typeof agenda>()
  for (const line of agenda) {
    const list = byDay.get(line.day_offset) ?? []
    list.push(line)
    byDay.set(line.day_offset, list)
  }
  const dayKeys = [...byDay.keys()].sort((a, b) => a - b)

  const when = sameDay
    ? `${thaiDateLabel(startKey)} · ${bangkokTime(ev.starts_at)}–${bangkokTime(ev.ends_at)}`
    : `${stamp(ev.starts_at)} – ${stamp(ev.ends_at)}`

  return (
    <main className="wrap">
      <div className="page-head">
        <Link href={`/project/${id}`} className="back">‹ {ev.projects?.name ?? 'วิชา'}</Link>
        <h1>{ev.title}</h1>
        {ev.archived_at && <div className="sub">เก็บเข้าคลังแล้ว</div>}
      </div>

      <div className="pills">
        <span className="pill pill--time">{when}</span>
        {ev.location && <span className="pill">{ev.location}</span>}
        {ev.label && <span className="pill">{ev.label}</span>}
      </div>

      <div style={{ marginBottom: '0.9rem' }}>
        <Link href={`/project/${id}/event/${eventId}/edit`} className="back">แก้กิจกรรม ›</Link>
      </div>

      {ev.body && (
        <div className="prose">
          <Autolink text={ev.body} />
        </div>
      )}

      <div className="sec">
        <span>กำหนดการ</span>
        <span>{agenda.length || ''}</span>
      </div>

      {agenda.length === 0 ? (
        <p className="none">ยังไม่มีกำหนดการ</p>
      ) : (
        dayKeys.map((offset) => (
          <div key={offset}>
            {!sameDay && (
              <div className="agenda__day">{thaiDateLabel(agendaDayKey(startKey, offset))}</div>
            )}
            <div className="agenda">
              {byDay.get(offset)!.map((line) => (
                <div className="agenda__row" key={line.id}>
                  <div className="agenda__time">{agendaClock(line)}</div>
                  <div className="agenda__title">{line.title}</div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="sec">
        <span>ที่เกี่ยวข้อง</span>
        <span>{items.length || ''}</span>
      </div>

      {items.length === 0 ? (
        <p className="none">ยังไม่มีงานหรือการเตือนที่ผูกกับกิจกรรมนี้</p>
      ) : (
        <ItemList
          rows={items.map((it): Row => {
            const at = it.type === 'reminder' ? it.remind_at : it.due_at
            return {
              id: it.id,
              color:
                it.type === 'shortnote'
                  ? 'var(--note)'
                  : it.type === 'reminder' || it.due_at
                    ? 'var(--due)'
                    : 'var(--task)',
              title: it.title,
              meta: it.done_at
                ? `เสร็จ ${stamp(it.done_at)}`
                : at
                  ? stamp(at)
                  : 'ไม่กำหนดวัน',
              done: it.done_at !== null,
              checkable: it.type === 'task',
              tag: null,
              panel: {
                id: it.id,
                projectId: id,
                type: it.type,
                title: it.title,
                body: it.body,
                at,
                done: it.done_at !== null,
                projectName: ev.projects?.name ?? '',
              },
            }
          })}
        />
      )}

      <EventItemAdd projectId={id} eventId={eventId} />
    </main>
  )
}
