'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toggleDone, archiveItem, restoreItem, reorderItems } from '@/app/actions/items'
import { archiveEvent } from '@/app/actions/events'
import { clearTimeOffset } from '@/app/actions/timeOffsets'
import ItemPanel, { type PanelItem } from './ItemPanel'
import { useFlip } from '@/lib/useFlip'
import { tap, away } from '@/lib/haptic'

export type Row = {
  /** id ของ item · คาบเรียนไม่ใช่ item จึงเป็น null และแก้ไม่ได้ที่นี่ */
  id: string | null
  color: string
  title: string
  meta: string
  done: boolean
  /** ช่องติ๊กมีเฉพาะ task (ARCHITECTURE.md §9) */
  checkable: boolean
  /** ป้ายขวาสุด · `event` ใช้บอกว่างานชิ้นนี้เป็นของกิจกรรมไหน */
  tag?: { text: string; kind: 'late' | 'soon' | 'sched' | 'event' | 'skip' } | null
  /** ข้อมูลสำหรับแผงรายละเอียด · ไม่มี = แถวนี้เปิดแผงไม่ได้ (เช่น คาบเรียน) */
  panel?: PanelItem
  /**
   * พาไปหน้าอื่นแทนการเปิดแผง — ใช้กับ event ที่มีหน้าของตัวเอง
   * `panel` มาก่อนถ้าใส่มาทั้งคู่ เพราะแผงคือการแวะดูที่ไม่ทิ้งตำแหน่งเลื่อน
   */
  href?: string | null
  /**
   * แถวนี้เป็น event ไม่ใช่ item — ปุ่มเก็บเข้าคลังจะเรียก `archiveEvent` แทน
   *
   * event ไม่มี `id` ในความหมายของ item (ติ๊กไม่ได้ ลากไม่ได้) แต่ก่อนหน้านี้
   * การไม่มี `id` ทำให้ปุ่มเก็บเข้าคลังหายไปด้วย ต้องเข้าไปกดในหน้าแก้กิจกรรม
   * ซึ่งลึกลงไปอีกสองชั้น (เจ้าของขอให้ลบได้จากตรงนี้ 1 ก.ย. 2026)
   */
  event?: { projectId: string; eventId: string } | null
  /**
   * ผ่านไปแล้ว — จางลงแต่ **ไม่ขีดฆ่า**
   *
   * ต่างจาก `done` ตรงที่ขีดฆ่าแปลว่า "จัดการแล้ว" ส่วนกิจกรรมที่ผ่านไป
   * ไม่ได้แปลว่าใครทำอะไรกับมัน มันแค่เลยเวลาไปเฉย ๆ
   */
  past?: boolean
  /**
   * ปุ่มคืนค่าการตัดทอนของวันนั้น · ใส่เฉพาะแถวที่ถูกตัดเวลาหรือตั้งใจไม่ไป
   *
   * เว็บ **ตั้ง** ค่าตัดทอนไม่ได้ (นั่นเป็นงานของ Claude เพราะต้องถามกลับ)
   * แต่ต้อง **คืนค่า** ได้จากที่ที่เห็น ไม่งั้นจะขัดหลัก "ไม่มีอะไรหายเงียบ ๆ"
   */
  restore?: { kind: 'class' | 'event'; sourceId: string; occursOn: string } | null
  /**
   * ลากจัดลำดับได้ไหม — ตั้ง true เฉพาะแถวที่ `sort_order` เป็นตัวตัดสินลำดับจริง
   * ถ้าตั้งกับแถวที่เรียงด้วย due_at/remind_at ลากแล้วจะเด้งกลับตอนโหลดใหม่
   * แถวที่ลากได้ต้องอยู่ติดกันเป็นบล็อกเดียว (ตัวลากสลับกันเองภายในบล็อก)
   */
  movable?: boolean
}

const UNDO_MS = 8000

/**
 * คีย์ของแถวสำหรับซ่อน/เลิกทำ — item ใช้ id ของตัวเอง · event ใช้ id ของ event
 * ทั้งคู่เป็น uuid จากคนละตาราง จึงไม่มีทางชนกัน
 */
function keyOf(r: Row): string | null {
  return r.id ?? r.event?.eventId ?? null
}

/**
 * ตัวตนของแถวสำหรับ FLIP — ต้องมีทุกแถว **รวมแถวที่ไม่ใช่ item**
 *
 * คาบเรียนไม่มี `id` เพราะแก้จากที่นี่ไม่ได้ แต่มันก็ถูกดันขึ้นลงเวลาแถวอื่น
 * ถูกเก็บเข้าคลัง — ถ้าไม่ให้ตัวตนไว้ ครึ่งรายการจะเดินทางส่วนอีกครึ่งกระโดด
 * ซึ่งดูแย่กว่ากระโดดทั้งหมด · ชื่อกับสีรวมกันพอแยกแถวในหน้าเดียวได้
 */
function flipId(r: Row): string {
  return keyOf(r) ?? `${r.color}|${r.title}`
}

export default function ItemList({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // ติ๊กแล้วต้องขยับทันที ไม่รอเซิร์ฟเวอร์
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  // `restore` เก็บวิธีเลิกทำของแถวนั้นไว้เลย — item กับ event คืนค่าคนละทาง
  // และตอนกดเลิกทำ แถวต้นทางอาจถูกวาดใหม่ไปแล้ว
  const [undo, setUndo] = useState<
    { key: string; title: string; restore: () => Promise<{ ok: boolean; error?: string }> } | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<PanelItem | null>(null)

  // ลำดับที่ผู้ใช้ลากไว้ · null = ใช้ลำดับจากเซิร์ฟเวอร์
  const [moveOrder, setMoveOrder] = useState<string[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [say, setSay] = useState('')
  const dragging = useRef(false)

  const isDone = (r: Row) => (r.id && r.id in optimistic ? optimistic[r.id] : r.done)

  function onToggle(r: Row) {
    if (!r.id) return
    const next = !isDone(r)
    // สั่นเฉพาะตอนติ๊กว่าเสร็จ ไม่สั่นตอนเอาติ๊กออก — อย่างหลังคือการแก้ที่พลาด
    // ไม่ใช่ความสำเร็จที่ต้องฉลอง
    if (next) tap()
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
    const key = keyOf(r)
    if (!key) return
    const ev = r.event

    // event กับ item เก็บเข้าคลังคนละ action แต่ผู้ใช้เห็นเป็นปุ่มเดียวกัน
    const archive = () => (ev ? archiveEvent(ev.projectId, ev.eventId, true) : archiveItem(key))
    const restore = () => (ev ? archiveEvent(ev.projectId, ev.eventId, false) : restoreItem(key))

    away()
    setHidden((p) => new Set(p).add(key))
    setUndo({ key, title: r.title, restore })

    startTransition(async () => {
      const res = await archive()
      if (!res.ok) {
        setHidden((p) => { const n = new Set(p); n.delete(key); return n })
        setUndo(null)
        setError(res.error)
      }
    })

    // แถบเลิกทำค้าง 8 วินาที ตามเฟส 4 (doc/HISTORY.md)
    window.setTimeout(() => {
      setUndo((u) => (u?.key === key ? null : u))
      router.refresh()
    }, UNDO_MS)
  }

  function onUndo() {
    if (!undo) return
    const { key, restore } = undo
    setUndo(null)
    startTransition(async () => {
      const res = await restore()
      if (!res.ok) { setError(res.error ?? 'คืนค่าไม่สำเร็จ'); return }
      setHidden((p) => { const n = new Set(p); n.delete(key); return n })
      router.refresh()
    })
  }

  /** คืนเวลาเดิมของคาบหรือกิจกรรมในวันนั้น — ลบแถวตัดทอนทิ้ง */
  function onRestoreTime(r: Row) {
    if (!r.restore) return
    const { kind, sourceId, occursOn } = r.restore
    startTransition(async () => {
      const res = await clearTimeOffset(kind, sourceId, occursOn)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  const visible = rows.filter((r) => { const k = keyOf(r); return !(k && hidden.has(k)) })

  // ---- ลากจัดลำดับ ----------------------------------------------------
  // แถวที่ลากได้อยู่ติดกันเป็นบล็อกเดียว จึงสลับกันเองได้โดยไม่กระทบแถวอื่น
  const serverOrder = useMemo(
    () => visible.filter((r) => r.movable && r.id).map((r) => r.id!),
    [visible]
  )

  // ถ้าชุด id เปลี่ยน (เพิ่ม/เก็บเข้าคลัง) ลำดับที่ลากไว้ใช้ไม่ได้แล้ว กลับไปใช้ของเซิร์ฟเวอร์
  const order = useMemo(() => {
    if (!moveOrder) return serverOrder
    const live = new Set(serverOrder)
    const kept = moveOrder.filter((id) => live.has(id))
    return kept.length === serverOrder.length ? kept : serverOrder
  }, [moveOrder, serverOrder])

  // เอาลำดับที่ลากไว้ไปวางทับ โดยแถวที่ลากไม่ได้อยู่ที่เดิมทุกแถว
  const shown = useMemo(() => {
    if (order === serverOrder) return visible
    const byId = new Map(visible.filter((r) => r.id).map((r) => [r.id!, r]))
    let k = 0
    return visible.map((r) => (r.movable && r.id ? byId.get(order[k++]) ?? r : r))
  }, [visible, order, serverOrder])

  const canMove = order.length > 1

  /*
   * ให้แถวที่ย้ายตำแหน่งเดินทางแทนที่จะกระโดด
   *
   * การเรียงจริงเกิดฝั่งเซิร์ฟเวอร์ (`sink()` ในหน้าวิชา · `byTime()` ในหน้าวันนี้)
   * ตำแหน่งใหม่จึงมาถึงตอน re-render หลัง `router.refresh()` ไม่ใช่ตอนกดปุ่ม —
   * การวัดตำแหน่งทุกรอบ render จึงจับได้ทุกสาเหตุโดยไม่ต้องรู้ว่าใครสั่งย้าย
   */
  const listRef = useRef<HTMLDivElement | null>(null)
  useFlip(listRef, shown.map(flipId).join('~'))

  function commit(next: string[], moved: string, title: string) {
    setMoveOrder(next)
    setSay(`ย้าย ${title} ไปตำแหน่งที่ ${next.indexOf(moved) + 1} จาก ${next.length}`)
    startTransition(async () => {
      const res = await reorderItems(next)
      if (!res.ok) {
        setMoveOrder(null) // เด้งกลับลำดับเดิมถ้าเขียนไม่สำเร็จ
        setError(res.error)
      }
      // ไม่ต้อง router.refresh() — จอแสดงลำดับใหม่อยู่แล้วและ DB ตรงกันแล้ว
      // การ refetch ทั้งหน้าเพื่อข้อมูลชุดเดิมคือค่า round trip ที่จ่ายฟรี
    })
  }

  /** ย้ายทีละขั้นด้วยแป้นพิมพ์ · ที่จับเป็นปุ่มจึงโฟกัสได้อยู่แล้ว */
  function nudge(id: string, title: string, step: -1 | 1) {
    const from = order.indexOf(id)
    const to = from + step
    if (from < 0 || to < 0 || to >= order.length) return
    const next = order.slice()
    next.splice(to, 0, ...next.splice(from, 1))
    commit(next, id, title)
  }

  function onGripDown(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    setDragId(id)
  }

  function onGripMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging.current || !dragId) return

    // หาแถวที่ปลายนิ้วอยู่ตรงนั้น แล้วสลับเข้าไปเลย — ไม่ต้องขยับด้วย transform
    const list = e.currentTarget.closest('[data-list]')
    if (!list) return
    const nodes = Array.from(list.querySelectorAll<HTMLElement>('[data-movable="true"]'))
    const over = nodes.find((n) => {
      const box = n.getBoundingClientRect()
      return e.clientY >= box.top && e.clientY <= box.bottom
    })
    if (!over?.dataset.id) return

    const from = order.indexOf(dragId)
    const to = order.indexOf(over.dataset.id)
    if (from < 0 || to < 0 || from === to) return

    const next = order.slice()
    next.splice(to, 0, ...next.splice(from, 1))
    setMoveOrder(next)
  }

  function onGripUp(id: string, title: string) {
    if (!dragging.current) return
    dragging.current = false
    setDragId(null)
    if (order.join() === serverOrder.join()) return // ไม่ได้ขยับ ไม่ต้องเขียน
    commit(order.slice(), id, title)
  }
  // ---------------------------------------------------------------------

  return (
    <>
      {error && <p className="alert alert--gap" role="alert">{error}</p>}

      {shown.length === 0 && <p className="none">ยังไม่มี</p>}

      <div data-list ref={listRef}>
        {shown.map((r, i) => {
          const done = isDone(r)
          const movable = Boolean(canMove && r.movable && r.id)
          return (
            <div
              className={`row${done ? ' row--done' : ''}${r.past ? ' row--past' : ''}${dragId && dragId === r.id ? ' row--drag' : ''}`}
              key={keyOf(r) ?? `x${i}`}
              data-flip={flipId(r)}
              data-movable={movable ? 'true' : undefined}
              data-id={r.id ?? undefined}
            >
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
              ) : r.href ? (
                <Link className="row__body row__body--tap" href={r.href}
                  aria-label={`เปิด ${r.title}`}>
                  <span className="row__title">{r.title}</span>
                  {r.meta && <span className="row__meta">{r.meta}</span>}
                </Link>
              ) : (
                <div className="row__body">
                  <div className="row__title">{r.title}</div>
                  {r.meta && <div className="row__meta">{r.meta}</div>}
                </div>
              )}

              {r.tag && <span className={`tag tag--${r.tag.kind}`}>{r.tag.text}</span>}

              {r.restore && (
                <button
                  type="button"
                  className="tagbtn"
                  aria-label={`คืนค่าเวลาเดิมของ ${r.title}`}
                  title="คืนค่าเวลาเดิม"
                  onClick={() => onRestoreTime(r)}
                >
                  คืนค่า
                </button>
              )}

              {movable && (
                <button
                  type="button"
                  className="grip"
                  aria-label={`จัดลำดับ ${r.title} · ตำแหน่งที่ ${order.indexOf(r.id!) + 1} จาก ${order.length} · ใช้ลูกศรขึ้นลงเพื่อย้าย`}
                  title="ลากเพื่อจัดลำดับ"
                  onPointerDown={(e) => onGripDown(e, r.id!)}
                  onPointerMove={onGripMove}
                  onPointerUp={() => onGripUp(r.id!, r.title)}
                  onPointerCancel={() => onGripUp(r.id!, r.title)}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                    e.preventDefault()
                    nudge(r.id!, r.title, e.key === 'ArrowUp' ? -1 : 1)
                  }}
                >
                  <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
                    <g fill="currentColor">
                      <circle cx="2.5" cy="3" r="1.15" /><circle cx="7.5" cy="3" r="1.15" />
                      <circle cx="2.5" cy="7" r="1.15" /><circle cx="7.5" cy="7" r="1.15" />
                      <circle cx="2.5" cy="11" r="1.15" /><circle cx="7.5" cy="11" r="1.15" />
                    </g>
                  </svg>
                </button>
              )}

              {keyOf(r) && (
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
      </div>

      <span className="sr-only" role="status" aria-live="polite">{say}</span>

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
