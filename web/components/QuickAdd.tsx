'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseQuickAdd } from '@/lib/parse'
import { thaiDateLabel } from '@/lib/time'
import { createItem } from '@/app/actions/items'

export type QuickProject = { id: string; name: string; aliases?: string[] }

/**
 * S8 · เพิ่มเร็ว
 *
 * พิมพ์บรรทัดเดียว → ตีความให้ → **โชว์ให้แก้ก่อน ไม่บันทึกทันที**
 * การเดาผิดไม่เป็นไร แต่ต้องเห็นว่าเดาอะไรไว้ก่อนกดบันทึก
 */
export default function QuickAdd({
  projects,
  today,
}: {
  projects: QuickProject[]
  today: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ฟิลด์ที่ผู้ใช้แก้ทับการเดา
  const [override, setOverride] = useState<{
    type?: 'task' | 'reminder'
    projectId?: string
    date?: string
    time?: string
  }>({})

  const guess = useMemo(
    () => parseQuickAdd({ text, today, projects }),
    [text, today, projects]
  )

  const type = override.type ?? guess.type
  const projectId = override.projectId ?? guess.projectId ?? ''
  const date = override.date ?? guess.date ?? ''
  const time = override.time ?? guess.time ?? ''

  // กด N เปิดแผง (เดสก์ท็อป) · Esc ปิด
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      if (!open && !typing && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        setOpen(true)
      }
      if (open && e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function close() {
    setOpen(false)
    setText('')
    setOverride({})
    setError(null)
  }

  async function onSave() {
    setError(null)
    if (!guess.title.trim()) { setError('ยังไม่มีหัวเรื่อง'); return }
    if (!projectId) { setError('เลือกวิชาหรือโปรเจกต์ก่อน'); return }
    if (type === 'reminder' && !(date && time)) {
      setError('การเตือนต้องมีทั้งวันและเวลา'); return
    }

    // ประกอบเป็นเวลาไทยแล้วให้ Postgres เก็บเป็น UTC เอง
    const at = date ? `${date}T${time || '00:00'}:00+07:00` : null

    setBusy(true)
    const res = await createItem({
      project_id: projectId,
      type,
      title: guess.title.trim(),
      at: type === 'task' ? (date ? at : null) : at,
    })
    setBusy(false)

    if (!res.ok) { setError(res.error); return }
    close()
    router.refresh()
  }

  if (!open) {
    return (
      <button className="fab" onClick={() => setOpen(true)} aria-label="เพิ่มเร็ว" title="เพิ่มเร็ว (N)">
        +
      </button>
    )
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="เพิ่มเร็ว">
      <div className="sheet__panel">
        <div className="sheet__head">
          <strong>เพิ่มเร็ว</strong>
          <button className="linkbtn" onClick={close}>ปิด</button>
        </div>

        <input
          className="input"
          autoFocus
          placeholder="พรุ่งนี้ 14:00 ประชุมกลุ่มซอฟต์แวร์"
          value={text}
          onChange={(e) => { setText(e.target.value); setOverride({}); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') onSave() }}
        />

        {text.trim() && (
          <>
            <p className="hint">ตีความได้แบบนี้ — แก้ได้ก่อนบันทึก</p>

            <label className="field">
              <span>หัวเรื่อง</span>
              <div className="readout">{guess.title || '—'}</div>
            </label>

            <div className="slot__row">
              <label className="field grow">
                <span>ชนิด</span>
                <select className="input" value={type}
                  onChange={(e) => setOverride((o) => ({ ...o, type: e.target.value as 'task' | 'reminder' }))}>
                  <option value="task">งาน</option>
                  <option value="reminder">เตือน</option>
                </select>
              </label>
              <label className="field grow">
                <span>วิชา / โปรเจกต์</span>
                <select className="input" value={projectId}
                  onChange={(e) => setOverride((o) => ({ ...o, projectId: e.target.value }))}>
                  <option value="">— เลือก —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>

            <div className="slot__row">
              <label className="field grow">
                <span>วันที่{type === 'reminder' ? '' : ' (ไม่บังคับ)'}</span>
                <input className="input" type="date" value={date}
                  onChange={(e) => setOverride((o) => ({ ...o, date: e.target.value }))} />
              </label>
              <label className="field grow">
                <span>เวลา{type === 'reminder' ? '' : ' (ไม่บังคับ)'}</span>
                <input className="input" type="time" value={time}
                  onChange={(e) => setOverride((o) => ({ ...o, time: e.target.value }))} />
              </label>
            </div>

            {date && (
              <p className="hint">
                จะบันทึกเป็น {type === 'reminder' ? 'การเตือน' : 'งานกำหนดส่ง'} วัน
                {' '}{thaiDateLabel(date)}{time ? ` ${time}` : ''}
              </p>
            )}
          </>
        )}

        {error && <p className="alert alert--gap" role="alert">{error}</p>}

        <div className="actions">
          <button className="btn" disabled={busy || !text.trim()} onClick={onSave}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          <button className="btn btn--quiet" onClick={close}>ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}
