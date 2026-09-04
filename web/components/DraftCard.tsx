'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { applyDraft, undoApply } from '@/app/actions/propose'
import { confirmLabel, type Draft, type DraftAction } from '@/lib/drafts'

/**
 * การ์ดยืนยัน — สิ่งที่ผู้ช่วยเสนอ ยังไม่ได้ทำ
 *
 * รูปแบบที่เจ้าของเลือกไว้คือ **แบบ 07** (`CONFIRM-CARD.html`) — การ์ดอยู่ในกล่อง
 * เดียวกับคำพูดของ KeviN ทั้งในแชตและระหว่างสาย เพื่อให้อ่านแล้วรู้ทันทีว่า
 * ร่างนี้มาจากประโยคไหน · กด "แก้" แล้วชั้นสอง (**แบบ 10**) เปิดขึ้นมาเป็นครึ่งจอล่าง
 *
 * ⚠️ **ปุ่มยืนยันคือเส้นแบ่งเดียวระหว่างการเสนอกับการเขียนจริง**
 *    ห้ามมีทางไหนที่ทำให้ `applyDraft` ถูกเรียกโดยที่ผู้ใช้ไม่ได้กด —
 *    ไม่ auto-confirm ไม่ confirm ด้วยเสียง ไม่ยืนยันให้เพราะ "ดูชัดเจนแล้ว"
 */

type Props = {
  draft: Draft
  /** เรียกเมื่อการ์ดจบหน้าที่แล้ว (ยืนยันสำเร็จ หรือผู้ใช้ทิ้ง) — ใช้เอาการ์ดออกจากจอ */
  onSettled?: (id: string) => void
}

export default function DraftCard({ draft, onSettled }: Props) {
  const router = useRouter()
  const [pending, run] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  /** เก็บผลไว้เพื่อขึ้นแถบเลิกทำ — การ์ดกลายเป็นคำยืนยันผลหลังกดสำเร็จ */
  const [done, setDone] = useState<{ message: string; undo?: { itemId: string; field: 'done' | 'archived' } } | null>(null)
  /** ค่าที่แก้จากชั้นสอง — ยังไม่เขียนจนกว่าจะกดยืนยัน */
  const [action, setAction] = useState<DraftAction>(draft.action)
  const [lines, setLines] = useState(draft.lines)

  function confirm() {
    setError(null)
    run(async () => {
      const res = await applyDraft(action)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setDone({ message: res.message, undo: res.undo })
      // ต้องเห็นผลทันที ไม่งั้นผู้ใช้กดซ้ำเพราะคิดว่าไม่ติด (doc/WRITE.md §8)
      router.refresh()
    })
  }

  function undo() {
    if (!done?.undo) return
    const { itemId, field } = done.undo
    run(async () => {
      const res = await undoApply(itemId, field)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setDone(null)
      setError(null)
      router.refresh()
      onSettled?.(draft.id)
    })
  }

  if (done) {
    return (
      <div className="dcard dcard--done" role="status">
        <div className="dcard__ok">
          <CheckIcon />
          <span>{done.message}</span>
        </div>
        {done.undo && (
          <button className="dcard__undo" onClick={undo} disabled={pending}>
            {pending ? 'กำลังเลิกทำ…' : 'เลิกทำ'}
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="dcard">
        <div className="dcard__kind">
          <span className="dcard__dot" aria-hidden="true" />
          {draft.heading}
        </div>
        <div className="dcard__title">{draft.title}</div>

        <dl className="dcard__lines">
          {lines.map((l, i) => (
            <div key={i} className="dcard__line">
              <dt>{l.label}</dt>
              <dd className={l.tone === 'due' ? 'dcard__v dcard__v--due' : 'dcard__v'}>
                {/* ค่าเดิมขึ้นคู่กันเสมอเมื่อเป็นการแก้ — ไม่งั้นทานไม่ได้ว่าเปลี่ยนอะไร */}
                {l.was !== undefined && <s className="dcard__was">{l.was}</s>}
                {l.value}
              </dd>
            </div>
          ))}
        </dl>

        {error && <p className="dcard__err" role="alert">{error}</p>}

        <div className="dcard__acts">
          <button className="dcard__go" onClick={confirm} disabled={pending}>
            {pending ? 'กำลังบันทึก…' : confirmLabel(action.kind)}
          </button>
          <button className="dcard__alt" onClick={() => setEditing(true)} disabled={pending}>
            แก้
          </button>
          <button className="dcard__alt" onClick={() => onSettled?.(draft.id)} disabled={pending}>
            ทิ้ง
          </button>
        </div>
      </div>

      {editing && (
        <DraftEditor
          draft={{ ...draft, action, lines }}
          onClose={() => setEditing(false)}
          onSave={(nextAction, nextLines) => {
            setAction(nextAction)
            setLines(nextLines)
            setEditing(false)
          }}
        />
      )}
    </>
  )
}

/**
 * ชั้นสอง — **แบบ 10** ครึ่งจอล่าง แยกทีละฟิลด์ให้แตะแก้ได้
 *
 * ⚠️ เปิดจากปุ่ม "แก้" เท่านั้น ไม่ใช่ตัวเริ่มต้น — มันบังปุ่มวางสาย
 *    ซึ่งยอมได้เฉพาะตอนที่ผู้ใช้ตั้งใจจะทานรายละเอียดอยู่แล้ว
 *
 * ⚠️ แก้ได้เฉพาะ **ชื่อ** กับ **เวลา** โดยตั้งใจ · การย้ายวิชาต้องพูดใหม่
 *    เพราะต้องหาวิชาจากชื่อ ซึ่งเป็นงานของชั้นเสนอ ไม่ใช่ของฟอร์มนี้
 */
function DraftEditor({
  draft,
  onClose,
  onSave,
}: {
  draft: Draft
  onClose: () => void
  onSave: (action: DraftAction, lines: Draft['lines']) => void
}) {
  const a = draft.action
  const canTitle = a.kind === 'add_item' || a.kind === 'edit_item' || a.kind === 'add_event'
  const [title, setTitle] = useState(draft.title)

  /** ค่าเวลาในกล่องแก้เป็นรูป `YYYY-MM-DDTHH:mm` ตามที่ `datetime-local` ต้องการ */
  const timeOf = (iso?: string | null) => {
    if (!iso) return ''
    const t = new Date(new Date(iso).getTime() + 7 * 3600 * 1000)
    return t.toISOString().slice(0, 16)
  }
  const isoOf = (local: string) => (local ? new Date(`${local}:00+07:00`).toISOString() : null)

  const initialTime =
    a.kind === 'add_item' ? (a.dueAt ?? a.remindAt ?? '')
    : a.kind === 'edit_item' ? (a.dueAt ?? a.remindAt ?? '')
    : a.kind === 'add_event' ? a.startsAt
    : ''
  const [when, setWhen] = useState(timeOf(typeof initialTime === 'string' ? initialTime : ''))
  const hasTime = a.kind !== 'complete_item' && a.kind !== 'archive_item'

  function save() {
    const next = { ...a } as DraftAction
    if (canTitle && title.trim()) {
      ;(next as { title?: string }).title = title.trim()
    }

    if (hasTime) {
      const iso = isoOf(when)
      if (next.kind === 'add_item') {
        if (next.type === 'task') next.dueAt = iso ?? undefined
        if (next.type === 'reminder') next.remindAt = iso ?? undefined
      } else if (next.kind === 'edit_item') {
        // ในโหมดแก้ `null` มีความหมายว่าล้างค่า จึงส่งต่อไปตรง ๆ ไม่แปลงเป็น undefined
        if (next.dueAt !== undefined) next.dueAt = iso
        if (next.remindAt !== undefined) next.remindAt = iso
      } else if (next.kind === 'add_event' && iso) {
        const span = new Date(next.endsAt).getTime() - new Date(next.startsAt).getTime()
        next.startsAt = iso
        next.endsAt = new Date(new Date(iso).getTime() + span).toISOString()
      }
    }

    // บรรทัดบนการ์ดต้องเดินตามค่าใหม่ ไม่งั้นจะยืนยันสิ่งที่ไม่ตรงกับที่เห็น
    const label = when ? thaiLabelLocal(when) : ''
    const lines = draft.lines.map((l) =>
      l.tone === 'due' && label ? { ...l, value: label } : l
    )
    onSave(next, lines)
  }

  return (
    <div className="dsheet" role="dialog" aria-modal="true" aria-label="แก้ร่างก่อนยืนยัน">
      <div className="dsheet__panel">
        <div className="dsheet__grab" aria-hidden="true" />
        <div className="dcard__kind">
          <span className="dcard__dot" aria-hidden="true" />
          {draft.heading} — ทานก่อนบันทึก
        </div>

        {canTitle && (
          <label className="dsheet__field">
            <span>ชื่อ</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </label>
        )}

        {hasTime && (
          <label className="dsheet__field">
            <span>{a.kind === 'add_event' ? 'เริ่ม' : 'เวลา'}</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
        )}

        {/* ของที่แก้ในนี้ไม่ได้ ยังต้องให้เห็นว่ามันคืออะไร ไม่ใช่หายไปเฉย ๆ */}
        {draft.lines
          .filter((l) => l.tone !== 'due')
          .map((l, i) => (
            <div key={i} className="dsheet__field dsheet__field--ro">
              <span>{l.label}</span>
              <b>{l.value}</b>
            </div>
          ))}

        <div className="dsheet__acts">
          <button className="dcard__go" onClick={save}>เอาตามนี้</button>
          <button className="dcard__alt" onClick={onClose}>ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}

/** ป้ายเวลาไทยจากค่าในกล่อง `datetime-local` — ซ้ำกับฝั่งเซิร์ฟเวอร์โดยตั้งใจ
 *  เพราะที่นี่ทำงานก่อนที่ร่างจะกลับไปหาเซิร์ฟเวอร์ จึงถามใครไม่ได้ */
function thaiLabelLocal(local: string): string {
  const days = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  const [d, t] = local.split('T')
  const [y, mo, da] = d.split('-').map(Number)
  const dow = new Date(Date.UTC(y, mo - 1, da)).getUTCDay()
  return `${days[dow]} ${da} ${months[mo - 1]} ${t}`
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
