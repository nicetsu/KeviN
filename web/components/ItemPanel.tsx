'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateItem, archiveItem, toggleDone } from '@/app/actions/items'
import { thaiDateLabel } from '@/lib/time'

export type PanelItem = {
  id: string
  projectId: string
  type: 'task' | 'reminder' | 'shortnote'
  title: string
  body: string | null
  /** ISO ของ due_at หรือ remind_at แล้วแต่ชนิด */
  at: string | null
  done: boolean
  projectName: string
}

/** ISO -> ['YYYY-MM-DD', 'HH:MM'] ตามเวลาไทย */
function split(iso: string | null): [string, string] {
  if (!iso) return ['', '']
  const t = new Date(new Date(iso).getTime() + 7 * 3600 * 1000)
  return [t.toISOString().slice(0, 10), t.toISOString().slice(11, 16)]
}

/**
 * S7 · แผงรายละเอียด
 *
 * เปิดทับหน้าเดิม ไม่เปลี่ยน route — ปิดแล้วจึงกลับมาที่เดิมพร้อมตำแหน่งเลื่อนเอง
 * โดยไม่ต้องจำ scroll ไว้ (doc/ux.html: ความลึกเกินสามชั้นให้เปิดเป็นแผงทับ)
 */
export default function ItemPanel({
  item,
  onClose,
}: {
  item: PanelItem
  onClose: () => void
}) {
  const router = useRouter()
  const [d0, t0] = split(item.at)

  const [title, setTitle] = useState(item.title)
  const [body, setBody] = useState(item.body ?? '')
  const [date, setDate] = useState(d0)
  const [time, setTime] = useState(t0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    // กันหน้าหลังเลื่อนตามขณะแผงเปิด
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const timeless = item.type === 'shortnote'
  const needsTime = item.type === 'reminder'

  async function onSave() {
    setError(null)
    if (!title.trim()) { setError('ต้องมีหัวเรื่อง'); return }
    if (needsTime && !(date && time)) { setError('การเตือนต้องมีทั้งวันและเวลา'); return }

    const at = timeless ? null : date ? `${date}T${time || '00:00'}:00+07:00` : null

    setBusy(true)
    const res = await updateItem(item.id, {
      project_id: item.projectId,
      type: item.type,
      title: title.trim(),
      body: body.trim() || null,
      at,
    })
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    onClose()
    router.refresh()
  }

  async function onArchive() {
    setBusy(true)
    const res = await archiveItem(item.id)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    onClose()
    router.refresh()
  }

  async function onToggle() {
    setBusy(true)
    const res = await toggleDone(item.id, !item.done)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    onClose()
    router.refresh()
  }

  const kind = item.type === 'task' ? 'งาน' : item.type === 'reminder' ? 'เตือน' : 'โน้ต'

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="รายละเอียด"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet__panel">
        <div className="sheet__head">
          <strong>{kind} · {item.projectName}</strong>
          <button className="linkbtn" onClick={onClose}>ปิด</button>
        </div>

        <label className="field">
          <span>หัวเรื่อง</span>
          <input className="input" value={title} autoFocus
            onChange={(e) => { setTitle(e.target.value); setError(null) }} />
        </label>

        <label className="field">
          <span>รายละเอียด</span>
          <textarea className="input" rows={3} value={body}
            onChange={(e) => setBody(e.target.value)} />
        </label>

        {!timeless && (
          <>
            <div className="slot__row">
              <label className="field grow">
                <span>วันที่{needsTime ? '' : ' (ไม่บังคับ)'}</span>
                <input className="input" type="date" value={date}
                  onChange={(e) => { setDate(e.target.value); setError(null) }} />
              </label>
              <label className="field grow">
                <span>เวลา{needsTime ? '' : ' (ไม่บังคับ)'}</span>
                <input className="input" type="time" value={time}
                  onChange={(e) => { setTime(e.target.value); setError(null) }} />
              </label>
            </div>
            {date && <p className="hint">{thaiDateLabel(date)}{time ? ` ${time}` : ''}</p>}
          </>
        )}

        {timeless && <p className="hint">โน้ตไม่มีเวลาและไม่มีสถานะเสร็จ</p>}

        {error && <p className="alert alert--gap" role="alert">{error}</p>}

        <div className="actions">
          <button className="btn" disabled={busy} onClick={onSave}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          {item.type === 'task' && (
            <button className="btn btn--quiet" disabled={busy} onClick={onToggle}>
              {item.done ? 'เอาติ๊กออก' : 'ติ๊กว่าเสร็จ'}
            </button>
          )}
          <button className="btn btn--danger" disabled={busy} onClick={onArchive}>
            เก็บเข้าคลัง
          </button>
        </div>
      </div>
    </div>
  )
}
