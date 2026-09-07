'use client'

/**
 * แผงสร้าง/แก้ไข Area — overlay ไม่ใช่ route
 *
 * ตามกฎเดิมของโปรเจกต์: ของที่แวะทำเร็ว ๆ แล้วกลับ ให้เปิดทับ · หน้าที่มีเนื้อหา
 * ของตัวเองถึงจะเป็น route (doc/DECISIONS.md — เหตุผลเดียวกับที่หน้า event เป็น route)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AREA_CLASS } from '@/lib/areaColor'
import { archiveArea, createArea, updateArea } from '@/app/actions/areas'

const COLORS = Object.entries(AREA_CLASS)

export type AreaDraft = { id: string; name: string; color: string | null }

export default function AreaEditor({
  area,
  onClose,
}: {
  /** `null` = สร้างใหม่ · มีค่า = แก้ของเดิม */
  area: AreaDraft | null
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(area?.name ?? '')
  const [color, setColor] = useState(area?.color ?? COLORS[0][0])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** ชั้นกันพลาดแบบเบาที่สุด — เปลี่ยนข้อความบนปุ่มเดิม ไม่มีกล่องโต้ตอบ
   *  (แบบเดียวกับปุ่มล้างประวัติในหน้า KeviN) */
  const [sure, setSure] = useState(false)

  async function save() {
    setBusy(true)
    setError(null)
    const res = area
      ? await updateArea(area.id, name, color)
      : await createArea(name, color)
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    onClose()
    router.refresh()
  }

  async function remove() {
    if (!area) return
    if (!sure) {
      setSure(true)
      return
    }

    setBusy(true)
    setError(null)
    const res = await archiveArea(area.id)
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      setSure(false)
      return
    }
    onClose()
    // Area ที่เพิ่งถูกเก็บไม่มีหน้าให้อยู่ต่อแล้ว — พากลับคลัง ไม่ใช่แค่ refresh
    router.replace('/library')
    router.refresh()
  }

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label={area ? 'แก้ไข Area' : 'เพิ่ม Area'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet__panel">
        <div className="sheet__head">
          <strong>{area ? 'แก้ไข Area' : 'เพิ่ม Area'}</strong>
          <button className="linkbtn" onClick={onClose}>ปิด</button>
        </div>

        <label className="field">
          <span>ชื่อ</span>
          <input
            className="input"
            value={name}
            autoFocus
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
          />
        </label>

        <div className="field">
          <span>สี</span>
          <div className="swatches" role="radiogroup" aria-label="สีประจำ Area">
            {COLORS.map(([key, cls]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={color === key}
                aria-label={key}
                className={`swatch ${cls}`}
                data-on={color === key}
                onClick={() => setColor(key)}
              />
            ))}
          </div>
          <span className="hint">ใช้แทนภาพประกอบบนการ์ด</span>
        </div>

        {error && (
          <p className="alert alert--gap" role="alert">
            {error}
          </p>
        )}

        <div className="actions">
          <button className="btn" onClick={save} disabled={busy || name.trim().length === 0}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          {area && (
            <button className="btn btn--danger" onClick={remove} disabled={busy}>
              {sure ? 'แน่ใจนะ' : 'เก็บเข้าคลัง'}
            </button>
          )}
        </div>

        {area && (
          <span className="hint">
            เก็บเข้าคลังไม่ใช่การลบ · ของข้างในต้องเคลียร์ให้หมดก่อนถึงจะเก็บได้
          </span>
        )}
      </div>
    </div>
  )
}
