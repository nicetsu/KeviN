'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { restoreItem } from '@/app/actions/items'
import { archiveEvent } from '@/app/actions/events'

export type ArchivedRow = {
  key: string
  id: string
  kind: 'item' | 'event'
  /** event ต้องรู้ project เพื่อ revalidate หน้าที่ถูกต้อง */
  projectId: string | null
  color: string
  title: string
  archivedAt: string
  auto: boolean
  project: string
}

type Shown = ArchivedRow & { meta: string; left: string; urgent: boolean }
type Group = { key: string; label: string; rows: Shown[] }

/**
 * รายการของที่เก็บไว้ · กดคืนได้ทุกแถว
 *
 * ⚠️ **แถวที่กดคืนแล้วหายทันทีโดยไม่รอเซิร์ฟเวอร์** — ถ้ารอ ผู้ใช้จะกดซ้ำ
 *    เพราะไม่มีอะไรตอบสนอง · ถ้าเขียนไม่สำเร็จค่อยเอากลับมาพร้อมข้อความบอก
 */
export default function ArchiveList({ groups }: { groups: Group[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  function restore(r: Shown) {
    setGone((p) => new Set(p).add(r.key))
    startTransition(async () => {
      const res =
        r.kind === 'event' && r.projectId
          ? await archiveEvent(r.projectId, r.id, false)
          : await restoreItem(r.id)

      if (!res.ok) {
        setGone((p) => { const n = new Set(p); n.delete(r.key); return n })
        setError(res.error ?? 'คืนไม่สำเร็จ')
        return
      }
      router.refresh()
    })
  }

  return (
    <>
      {error && <p className="alert alert--gap" role="alert">{error}</p>}

      {groups.map((g) => {
        const rows = g.rows.filter((r) => !gone.has(r.key))
        if (rows.length === 0) return null
        return (
          <div key={g.key}>
            <div className="sec">
              <span>{g.label}</span>
              <span>{rows.length}</span>
            </div>
            {rows.map((r) => (
              <div className={`row${r.urgent ? ' row--urgent' : ''}`} key={r.key}>
                <span className="row__stripe" style={{ background: r.color }} />
                <div className="row__body">
                  <div className="row__title">{r.title}</div>
                  <div className="row__meta">{r.meta}</div>
                </div>
                <span className={`tag ${r.urgent ? 'tag--late' : 'tag--gone'}`}>{r.left}</span>
                <button
                  type="button"
                  className="tagbtn"
                  onClick={() => restore(r)}
                  aria-label={`คืน ${r.title} ออกจากคลัง`}
                >
                  คืน
                </button>
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
