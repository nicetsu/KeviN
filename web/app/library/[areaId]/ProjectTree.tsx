'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createProject } from '@/app/actions/items'
import { LIBRARY_OPEN_COOKIE, encodeOpen } from '@/lib/libraryOpen'

export type TreeItem = {
  id: string
  kind: 'task' | 'reminder' | 'note'
  title: string
  meta: string
  done: boolean
}

export type TreeProject = {
  id: string
  name: string
  archived: boolean
  when: string
  attention: number
  items: TreeItem[]
}

const COLOR: Record<TreeItem['kind'], string> = {
  task: 'var(--task)',
  reminder: 'var(--due)',
  note: 'var(--note)',
}

/** จำไว้หนึ่งปี · ไม่ใช่ความลับอะไร JavaScript จึงเขียนเองได้ (ตั้ง HttpOnly ไม่ได้) */
function saveOpen(ids: Iterable<string>) {
  const secure = location.protocol === 'https:' ? '; secure' : ''
  document.cookie =
    `${LIBRARY_OPEN_COOKIE}=${encodeOpen(ids)}; path=/; max-age=31536000; samesite=lax${secure}`
}

/**
 * รายชื่อโปรเจกต์ใน Area หนึ่ง
 *
 * ⚠️ **แบนลงหนึ่งชั้นจากของเดิมโดยตั้งใจ** — เดิมหน้าคลังกาง Area ในหน้าเดียวกัน
 * เพื่อ "เทียบข้าม Area ได้" (archive/ux.html) แต่ใช้จริงแล้วไม่มีใครเทียบ
 * เพราะ Area แต่ละอันเก็บของคนละชนิดกันสิ้นเชิง · เจ้าของขอให้กล่อง Area
 * เป็นทางเข้าจริง ๆ แทน (1 ก.ย. 2026)
 *
 * ที่ยังจำสถานะกางไว้ใน cookie เหมือนเดิม เพราะตอนนี้จำระดับ **โปรเจกต์**
 * ซึ่งเป็นชั้นที่คนกางค้างไว้จริง
 */
export default function ProjectTree({
  areaId,
  label,
  projects,
  initialOpen,
}: {
  areaId: string
  /** "วิชา" สำหรับ Class · "โปรเจกต์" สำหรับที่เหลือ */
  label: string
  projects: TreeProject[]
  /** `null` = ยังไม่เคยบันทึก → ปิดหมด */
  initialOpen: string[] | null
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(initialOpen ?? []))

  // เขียนกลับลง cookie เมื่อสถานะเปลี่ยน — effect ทำหน้าที่ sync กับของนอก React
  useEffect(() => {
    saveOpen(open)
  }, [open])

  const toggle = (id: string) =>
    setOpen((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  if (projects.length === 0) {
    return (
      <>
        <p className="none">ยังไม่มีอะไรใน Area นี้</p>
        <NewProject areaId={areaId} label={label} />
      </>
    )
  }

  return (
    <>
      {projects.map((p) => {
        const isOpen = open.has(p.id)
        return (
          <div key={p.id} className={`pnode${p.archived ? ' pnode--archived' : ''}`}>
            <div className="pnode__head">
              <button
                type="button"
                className={`acc__caret${isOpen ? ' acc__caret--open' : ''}`}
                onClick={() => toggle(p.id)}
                aria-expanded={isOpen}
                aria-label={`กางรายการของ ${p.name}`}
              >
                ›
              </button>
              <Link href={`/project/${p.id}`} className="pnode__name">
                {p.name}
              </Link>
              <span className="pnode__when">{p.archived ? 'เก็บเข้าคลังแล้ว' : p.when}</span>
              {p.attention > 0 && <span className="tag tag--late">{p.attention}</span>}
            </div>

            {isOpen && (
              <div className="pnode__body">
                {p.items.length === 0 ? (
                  <p className="none">ยังไม่มีอะไรใน{label}นี้</p>
                ) : (
                  p.items.map((it) => (
                    <div className={`row${it.done ? ' row--done' : ''}`} key={it.id}>
                      <span className="row__stripe" style={{ background: COLOR[it.kind] }} />
                      <div className="row__body">
                        <div className="row__title">{it.title}</div>
                        {it.meta && <div className="row__meta">{it.meta}</div>}
                      </div>
                    </div>
                  ))
                )}
                <Link href={`/project/${p.id}`} className="back">เปิดหน้าเต็ม ›</Link>
              </div>
            )}
          </div>
        )
      })}
      <NewProject areaId={areaId} label={label} />
    </>
  )
}

/**
 * ปุ่มสร้างอยู่ในตัว Area นั้น ไม่ใช่ข้อความว่าง (ARCHITECTURE.md §9)
 * Area ที่ยังไม่มีอะไรจึงยังมีทางไปต่อ ไม่ใช่ทางตัน
 */
function NewProject({ areaId, label }: { areaId: string; label: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    if (!name.trim()) { setError('ต้องมีชื่อ'); return }
    setBusy(true)
    const res = await createProject(areaId, name)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setName('')
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button type="button" className="newproj" onClick={() => setOpen(true)}>
        + {label}ใหม่
      </button>
    )
  }

  return (
    <div className="newproj__form">
      <input
        className="input"
        autoFocus
        placeholder={`ชื่อ${label}`}
        value={name}
        maxLength={120}
        onChange={(e) => { setName(e.target.value); setError(null) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') { setOpen(false); setName(''); setError(null) }
        }}
      />
      <button className="btn" disabled={busy} onClick={save}>
        {busy ? 'กำลังบันทึก…' : 'สร้าง'}
      </button>
      <button className="btn btn--quiet" onClick={() => { setOpen(false); setName(''); setError(null) }}>
        ยกเลิก
      </button>
      {error && <p className="alert" style={{ flexBasis: '100%' }} role="alert">{error}</p>}
    </div>
  )
}
