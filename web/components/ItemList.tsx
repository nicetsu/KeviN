'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleDone, archiveItem, restoreItem } from '@/app/actions/items'
import ItemPanel, { type PanelItem } from './ItemPanel'

export type Row = {
  /** id ของ item · คาบเรียนไม่ใช่ item จึงเป็น null และแก้ไม่ได้ที่นี่ */
  id: string | null
  color: string
  title: string
  meta: string
  done: boolean
  /** ช่องติ๊กมีเฉพาะ task (doc/DESIGN.md) */
  checkable: boolean
  tag?: { text: string; kind: 'late' | 'soon' } | null
  /** ข้อมูลสำหรับแผงรายละเอียด · ไม่มี = แถวนี้เปิดแผงไม่ได้ (เช่น คาบเรียน) */
  panel?: PanelItem
}

const UNDO_MS = 8000

export default function ItemList({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // ติ๊กแล้วต้องขยับทันที ไม่รอเซิร์ฟเวอร์
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<PanelItem | null>(null)

  const isDone = (r: Row) => (r.id && r.id in optimistic ? optimistic[r.id] : r.done)

  function onToggle(r: Row) {
    if (!r.id) return
    const next = !isDone(r)
    setOptimistic((p) => ({ ...p, [r.id!]: next }))
    startTransition(async () => {
      const res = await toggleDone(r.id!, next)
      if (!res.ok) {
        setOptimistic((p) => ({ ...p, [r.id!]: !next })) // ย้อนกลับถ้าพลาด
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function onArchive(r: Row) {
    if (!r.id) return
    const id = r.id
    setHidden((p) => new Set(p).add(id))
    setUndo({ id, title: r.title })

    startTransition(async () => {
      const res = await archiveItem(id)
      if (!res.ok) {
        setHidden((p) => { const n = new Set(p); n.delete(id); return n })
        setUndo(null)
        setError(res.error)
      }
    })

    // แถบเลิกทำค้าง 8 วินาที ตาม PLAN.md เฟส 4
    window.setTimeout(() => {
      setUndo((u) => (u?.id === id ? null : u))
      router.refresh()
    }, UNDO_MS)
  }

  function onUndo() {
    if (!undo) return
    const id = undo.id
    setUndo(null)
    startTransition(async () => {
      const res = await restoreItem(id)
      if (!res.ok) { setError(res.error); return }
      setHidden((p) => { const n = new Set(p); n.delete(id); return n })
      router.refresh()
    })
  }

  const visible = rows.filter((r) => !(r.id && hidden.has(r.id)))

  return (
    <>
      {error && <p className="alert alert--gap" role="alert">{error}</p>}

      {visible.map((r, i) => {
        const done = isDone(r)
        return (
          <div className={`row${done ? ' row--done' : ''}`} key={r.id ?? `x${i}`}>
            <span className="row__stripe" style={{ background: r.color }} />

            {r.checkable && r.id ? (
              <button
                type="button"
                className="cb"
                data-on={done}
                aria-pressed={done}
                aria-label={done ? `เอาติ๊กออก ${r.title}` : `ติ๊กว่าเสร็จ ${r.title}`}
                onClick={() => onToggle(r)}
              >
                {done && (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2.5 6.2 4.8 8.5 9.5 3.8" stroke="#0A0912" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ) : r.checkable ? (
              <span className="cb" aria-hidden="true" />
            ) : null}

            {r.panel ? (
              <button type="button" className="row__body row__body--tap"
                onClick={() => setPanel(r.panel!)}
                aria-label={`เปิดรายละเอียด ${r.title}`}>
                <span className="row__title">{r.title}</span>
                {r.meta && <span className="row__meta">{r.meta}</span>}
              </button>
            ) : (
              <div className="row__body">
                <div className="row__title">{r.title}</div>
                {r.meta && <div className="row__meta">{r.meta}</div>}
              </div>
            )}

            {r.tag && <span className={`tag tag--${r.tag.kind}`}>{r.tag.text}</span>}

            {r.id && (
              <button
                type="button"
                className="rowbtn"
                aria-label={`เก็บเข้าคลัง ${r.title}`}
                title="เก็บเข้าคลัง"
                onClick={() => onArchive(r)}
              >
                ×
              </button>
            )}
          </div>
        )
      })}

      {panel && <ItemPanel item={panel} onClose={() => setPanel(null)} />}

      {undo && (
        <div className="undo" role="status">
          <span>เก็บ “{undo.title}” เข้าคลังแล้ว</span>
          <button type="button" onClick={onUndo}>เลิกทำ</button>
        </div>
      )}
    </>
  )
}
