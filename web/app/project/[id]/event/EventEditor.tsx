'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addDays, thaiDateLabel } from '@/lib/time'
import { resolveAgenda, agendaClock, agendaDayKey } from '@/lib/agenda'
import {
  createEvent, updateEvent, saveAgenda, archiveEvent,
  type EventDraft, type AgendaInput,
} from '@/app/actions/events'

export type Line = {
  key: string
  day_offset: number
  start_time: string
  /** ว่าง = ให้ระบบเติมจากบรรทัดถัดไป */
  end_time: string
  title: string
}

const uid = () => Math.random().toString(36).slice(2, 9)

export function newLine(day = 0, start = '09:00'): Line {
  return { key: uid(), day_offset: day, start_time: start, end_time: '', title: '' }
}

/** จำนวนวันที่งานกินไป · 1 = จบในวันเดียว */
function daySpan(startDate: string, endDate: string) {
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)
  return Math.max(1, Math.floor(ms / 86_400_000) + 1)
}

/**
 * ตัวแก้กิจกรรม — ใช้ทั้งตอนสร้างใหม่และตอนแก้
 *
 * โครงเดียวกับ S6 ตัวจัดการช่วงเวลา รวมถึง "ตัวอย่างผลลัพธ์อัปเดตสดขณะพิมพ์"
 * ซึ่งที่นี่สำคัญเป็นพิเศษ เพราะ **เวลาจบของกำหนดการไม่บังคับ** — ตัวอย่างคือ
 * สิ่งเดียวที่บอกได้ว่าระบบเติมเวลาจบให้เป็นอะไร ก่อนจะกดบันทึก
 */
export default function EventEditor({
  projectId,
  projectName,
  eventId,
  archived,
  initial,
  initialLines,
}: {
  projectId: string
  projectName: string
  eventId: string | null
  archived: boolean
  initial: EventDraft
  initialLines: Line[]
}) {
  const router = useRouter()
  const [d, setD] = useState<EventDraft>(initial)
  const [lines, setLines] = useState<Line[]>(initialLines)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (p: Partial<EventDraft>) => setD((prev) => ({ ...prev, ...p }))
  const patch = (key: string, p: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)))

  // ย้ายวันเริ่มแล้ววันจบต้องตามไปด้วย ไม่งั้นกลายเป็นเวลาจบก่อนเวลาเริ่มทันที
  const setStartDate = (v: string) =>
    set({ startDate: v, endDate: d.endDate < v ? v : d.endDate })

  const span = daySpan(d.startDate, d.endDate)
  const multi = span > 1

  // ตัวอย่างผลลัพธ์ · ใช้ตรรกะตัวเดียวกับที่หน้า event ใช้แสดงจริง
  const preview = useMemo(() => {
    const rows = lines
      .filter((l) => l.title.trim() && /^\d{2}:\d{2}$/.test(l.start_time))
      .map((l) => ({
        id: l.key,
        day_offset: multi ? Math.min(l.day_offset, span - 1) : 0,
        start_time: l.start_time,
        end_time: l.end_time || null,
        title: l.title.trim(),
      }))
    return resolveAgenda(rows, d.endTime || null)
  }, [lines, multi, span, d.endTime])

  async function onSave() {
    setError(null)
    setBusy(true)

    const payload: AgendaInput[] = lines
      .filter((l) => l.title.trim())
      .map((l) => ({
        day_offset: multi ? Math.min(l.day_offset, span - 1) : 0,
        start_time: l.start_time,
        end_time: l.end_time || null,
        title: l.title,
      }))

    // สร้าง event ให้เสร็จก่อน เพราะกำหนดการต้องมี event_id ที่มีอยู่จริงถึงจะเขียนได้
    let id = eventId
    if (id) {
      const res = await updateEvent(projectId, id, d)
      if (!res.ok) { setBusy(false); setError(res.error); return }
    } else {
      const res = await createEvent(projectId, d)
      if (!res.ok) { setBusy(false); setError(res.error); return }
      if (!res.id) { setBusy(false); setError('สร้างกิจกรรมแล้ว แต่ไม่ได้ id กลับมา'); return }
      id = res.id
    }

    const ag = await saveAgenda(projectId, id, payload)
    setBusy(false)
    if (!ag.ok) {
      // event บันทึกไปแล้ว บอกให้ชัดว่าค้างตรงไหน จะได้ไม่กดซ้ำแล้วได้ของซ้ำ
      setError(`บันทึกกิจกรรมแล้ว แต่กำหนดการไม่สำเร็จ · ${ag.error}`)
      return
    }

    router.push(`/project/${projectId}/event/${id}`)
    router.refresh()
  }

  async function onArchive() {
    if (!eventId) return
    setBusy(true)
    const res = await archiveEvent(projectId, eventId, !archived)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    router.push(`/project/${projectId}`)
    router.refresh()
  }

  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 'var(--s-1)' }}>
          {eventId ? 'แก้กิจกรรม' : 'กิจกรรมใหม่'} — {projectName}
        </h1>
      </div>

      <label className="field">
        <span>ชื่อกิจกรรม</span>
        <input
          className="input" value={d.title} autoFocus
          placeholder="Orientation Day"
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>

      <div className="slot__row">
        <input
          className="input" type="date" value={d.startDate} aria-label="วันเริ่ม"
          onChange={(e) => setStartDate(e.target.value)}
        />
        <input
          className="input" type="time" value={d.startTime} aria-label="เวลาเริ่ม"
          onChange={(e) => set({ startTime: e.target.value })}
        />
      </div>
      <div className="slot__row" style={{ marginTop: '0.4rem' }}>
        <input
          className="input" type="date" value={d.endDate} min={d.startDate} aria-label="วันจบ"
          onChange={(e) => set({ endDate: e.target.value })}
        />
        <input
          className="input" type="time" value={d.endTime} aria-label="เวลาจบ"
          onChange={(e) => set({ endTime: e.target.value })}
        />
      </div>
      {multi && (
        <small className="hint">งานข้ามวัน {span} วัน · ปฏิทินจะหั่นเป็นบล็อกรายวันให้เอง</small>
      )}

      <div className="slot__row" style={{ marginTop: '0.6rem' }}>
        <input
          className="input" placeholder="สถานที่" value={d.location ?? ''}
          onChange={(e) => set({ location: e.target.value })}
        />
        <input
          className="input" placeholder="onsite / ออนไลน์" value={d.label ?? ''}
          onChange={(e) => set({ label: e.target.value })}
        />
      </div>

      <label className="field" style={{ marginTop: '0.6rem' }}>
        <span>รายละเอียด · วางลิงก์ลงทะเบียนหรืออีเมลติดต่อไว้ตรงนี้ได้ ระบบทำให้กดได้เอง</span>
        <textarea
          className="input" rows={4} value={d.body ?? ''}
          onChange={(e) => set({ body: e.target.value })}
        />
      </label>

      <div className="sec sec--gap">
        <span>กำหนดการ</span>
        <span>{lines.length || ''}</span>
      </div>

      {lines.map((l) => (
        <div key={l.key} className="slot">
          <div className="slot__row">
            {multi && (
              <select
                className="input" value={Math.min(l.day_offset, span - 1)} aria-label="วันที่"
                onChange={(e) => patch(l.key, { day_offset: Number(e.target.value) })}
              >
                {Array.from({ length: span }, (_, n) => (
                  <option key={n} value={n}>{thaiDateLabel(addDays(d.startDate, n))}</option>
                ))}
              </select>
            )}
            <input
              className="input" type="time" value={l.start_time} aria-label="เวลาเริ่ม"
              onChange={(e) => patch(l.key, { start_time: e.target.value })}
            />
            <span className="dash">–</span>
            <input
              className="input" type="time" value={l.end_time} aria-label="เวลาจบ (ไม่บังคับ)"
              onChange={(e) => patch(l.key, { end_time: e.target.value })}
            />
            <button
              type="button" className="linkbtn"
              onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
            >
              ลบ
            </button>
          </div>
          <div className="slot__row" style={{ marginTop: '0.4rem' }}>
            <input
              className="input" placeholder="Registration" value={l.title}
              onChange={(e) => patch(l.key, { title: e.target.value })}
            />
          </div>
        </div>
      ))}

      <button
        type="button" className="btn btn--ghost add-slot"
        onClick={() =>
          setLines((p) => {
            const last = p[p.length - 1]
            // บรรทัดใหม่เริ่มตรงที่บรรทัดก่อนหน้าจบ — กำหนดการจริงต่อกันสนิทเป็นปกติ
            const start = last?.end_time || last?.start_time || d.startTime
            return [...p, newLine(last?.day_offset ?? 0, start)]
          })
        }
      >
        + เพิ่มบรรทัด
      </button>

      {preview.length > 0 && (
        <div className="sched-strip" style={{ marginTop: '0.9rem' }}>
          <div className="muted">ตัวอย่าง · เวลาจบที่เว้นว่างถูกเติมให้แล้ว</div>
          {preview.map((l) => (
            <div key={l.id}>
              {multi ? `${thaiDateLabel(agendaDayKey(d.startDate, l.day_offset))} · ` : ''}
              {agendaClock(l)} · {l.title}
            </div>
          ))}
        </div>
      )}

      {error && <p className="alert alert--gap" role="alert">{error}</p>}

      <div className="actions">
        <button type="button" className="btn" onClick={onSave} disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        <button
          type="button" className="btn btn--quiet" disabled={busy}
          onClick={() => router.push(eventId ? `/project/${projectId}/event/${eventId}` : `/project/${projectId}`)}
        >
          ยกเลิก
        </button>
        {eventId && (
          <button type="button" className="btn btn--quiet" onClick={onArchive} disabled={busy}>
            {archived ? 'เอาออกจากคลัง' : 'เก็บเข้าคลัง'}
          </button>
        )}
      </div>
    </>
  )
}
