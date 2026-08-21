'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createItem } from '@/app/actions/items'

type Kind = 'task' | 'reminder' | 'shortnote'

/**
 * เพิ่มงาน/เตือน/โน้ตที่ผูกกับกิจกรรมนี้
 *
 * นี่คือ **ที่เดียว** ที่ผูก `items.event_id` ได้ · เพิ่มเร็ว (S8) หน้าวิชา และการ
 * สั่งผ่าน Claude ไม่ถามเรื่องกิจกรรมเลย เพื่อไม่ให้เสียหลัก UX ข้อ 3
 * "งานที่ทำบ่อยต้องกดน้อยที่สุด" (doc/DECISIONS.md)
 */
export default function EventItemAdd({
  projectId,
  eventId,
}: {
  projectId: string
  eventId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<Kind>('task')
  const [title, setTitle] = useState('')
  const [at, setAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timed = type !== 'shortnote'

  async function onAdd() {
    setError(null)
    if (!title.trim()) { setError('ต้องมีหัวเรื่อง'); return }
    if (type === 'reminder' && !at) { setError('การเตือนต้องมีเวลา'); return }

    setBusy(true)
    const res = await createItem({
      project_id: projectId,
      type,
      title,
      // ไทยไม่มี DST · ค่าจาก datetime-local เป็นเวลาไทยอยู่แล้ว เติม offset ตรง ๆ ได้
      at: timed && at ? new Date(`${at}:00+07:00`).toISOString() : null,
      event_id: eventId,
    })
    setBusy(false)

    if (!res.ok) { setError(res.error); return }
    setTitle('')
    setAt('')
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--ghost add-slot" onClick={() => setOpen(true)}>
        + เพิ่มงานให้กิจกรรมนี้
      </button>
    )
  }

  return (
    <div className="slot">
      <div className="slot__row">
        <select
          className="input" value={type} aria-label="ชนิด"
          onChange={(e) => setType(e.target.value as Kind)}
        >
          <option value="task">งาน</option>
          <option value="reminder">เตือน</option>
          <option value="shortnote">โน้ต</option>
        </select>
        <input
          className="input" placeholder="ลงทะเบียนผ่าน Google Forms" value={title} autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }}
        />
      </div>

      {timed && (
        <div className="slot__row" style={{ marginTop: '0.4rem' }}>
          <input
            className="input" type="datetime-local" value={at}
            aria-label={type === 'reminder' ? 'เวลาเตือน' : 'วันกำหนดส่ง (ไม่บังคับ)'}
            onChange={(e) => setAt(e.target.value)}
          />
        </div>
      )}

      {type === 'reminder' && (
        <small className="hint">การเตือนเท่านั้นที่เด้งเข้ามือถือ · กิจกรรมไม่เตือนเอง</small>
      )}

      {error && <p className="alert alert--gap" role="alert">{error}</p>}

      <div className="actions" style={{ marginTop: '0.5rem' }}>
        <button type="button" className="btn" onClick={onAdd} disabled={busy}>
          {busy ? 'กำลังเพิ่ม…' : 'เพิ่ม'}
        </button>
        <button type="button" className="btn btn--quiet" onClick={() => setOpen(false)} disabled={busy}>
          ยกเลิก
        </button>
      </div>
    </div>
  )
}
