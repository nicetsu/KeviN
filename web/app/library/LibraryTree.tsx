'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

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

export type TreeArea = {
  id: string
  name: string
  colorClass: string
  label: string
  openCount: number
  attention: number
  projects: TreeProject[]
}

const COLOR: Record<TreeItem['kind'], string> = {
  task: 'var(--task)',
  reminder: 'var(--due)',
  note: 'var(--note)',
}

const STORE = 'kevin.library.open'

/**
 * หน้าคลัง (S4)
 *
 * ux.html: "Area แตะเพื่อกางรายการ project ข้างใต้ ในหน้าเดิม ไม่เปลี่ยนหน้า
 * — ทำให้เทียบข้าม Area ได้" · การ์ดด้านบนทำหน้าที่เป็นสารบัญ กดแล้วกาง
 * พร้อมเลื่อนไปหา
 */
export default function LibraryTree({ areas }: { areas: TreeArea[] }) {
  const [openAreas, setOpenAreas] = useState<Set<string>>(new Set())
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  const refs = useRef<Record<string, HTMLElement | null>>({})

  // จำไว้ว่ากางอะไรค้างไว้ · เปิดกลับมาครั้งหน้าจะอยู่ที่เดิม
  useEffect(() => {
    let restored: string[] | null = null
    try {
      const raw = localStorage.getItem(STORE)
      if (raw) restored = JSON.parse(raw)
    } catch {
      restored = null
    }
    if (restored && restored.length) setOpenAreas(new Set(restored))
    else {
      // ครั้งแรก: เปิด Class ไว้เพราะใช้บ่อยสุด
      const first = areas.find((a) => a.name === 'Class') ?? areas[0]
      if (first) setOpenAreas(new Set([first.id]))
    }
    setReady(true)
  }, [areas])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(STORE, JSON.stringify([...openAreas]))
    } catch {
      // โหมดส่วนตัวบางเบราว์เซอร์เขียนไม่ได้ · ไม่ใช่เรื่องคอขาดบาดตาย
    }
  }, [openAreas, ready])

  const toggleArea = (id: string) =>
    setOpenAreas((p) => {
      const n = new Set(p)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const toggleProject = (id: string) =>
    setOpenProjects((p) => {
      const n = new Set(p)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  /** กดการ์ด = กางแล้วเลื่อนไปหา ไม่ใช่แค่เลื่อนเฉย ๆ */
  function jump(id: string) {
    setOpenAreas((p) => new Set(p).add(id))
    requestAnimationFrame(() => {
      refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <>
      <div className="areas">
        {areas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => jump(a.id)}
            className={`acard ${a.colorClass}`}
            aria-label={`ไปที่ ${a.name}`}
          >
            <span className="acard__nm">{a.name}</span>
            <span className="acard__ct">
              {a.openCount > 0 ? `${a.openCount} ${a.label}` : 'ว่าง'}
            </span>
            {a.attention > 0 && <span className="acard__badge">{a.attention}</span>}
          </button>
        ))}
      </div>

      {areas.map((a) => {
        if (a.projects.length === 0) return null
        const open = openAreas.has(a.id)
        return (
          <section
            key={a.id}
            ref={(el) => { refs.current[a.id] = el }}
            className="acc"
          >
            <button
              type="button"
              className="acc__head"
              onClick={() => toggleArea(a.id)}
              aria-expanded={open}
            >
              <span className={`acc__caret${open ? ' acc__caret--open' : ''}`} aria-hidden="true">›</span>
              <span className="acc__name">{a.name}</span>
              <span className="acc__count">{a.projects.length}</span>
            </button>

            {open && (
              <div className="acc__body">
                {a.projects.map((p) => {
                  const pOpen = openProjects.has(p.id)
                  return (
                    <div key={p.id} className={`pnode${p.archived ? ' pnode--archived' : ''}`}>
                      <div className="pnode__head">
                        <button
                          type="button"
                          className={`acc__caret${pOpen ? ' acc__caret--open' : ''}`}
                          onClick={() => toggleProject(p.id)}
                          aria-expanded={pOpen}
                          aria-label={`กางรายการของ ${p.name}`}
                        >
                          ›
                        </button>
                        <Link href={`/project/${p.id}`} className="pnode__name">
                          {p.name}
                        </Link>
                        <span className="pnode__when">
                          {p.archived ? 'เก็บเข้าคลังแล้ว' : p.when}
                        </span>
                        {p.attention > 0 && <span className="tag tag--late">{p.attention}</span>}
                      </div>

                      {pOpen && (
                        <div className="pnode__body">
                          {p.items.length === 0 ? (
                            <p className="none">ยังไม่มีอะไรในวิชานี้</p>
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
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
