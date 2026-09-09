'use client'

/**
 * แผงแก้ไขโปรเจกต์ — ชื่อ · รหัสวิชา · **และย้ายกลุ่ม** (10 ก.ย. 2026)
 *
 * เป็น overlay ไม่ใช่ route ตามกฎเดิม: ของที่แวะทำเร็ว ๆ แล้วกลับให้เปิดทับ
 * (ทรงเดียวกับ `app/library/AreaEditor.tsx` โดยตั้งใจ — สองแผงนี้ทำเรื่อง
 * เดียวกันคนละชั้น คนที่เคยใช้อันหนึ่งต้องใช้อีกอันเป็นทันที)
 *
 * ⚠️ **ย้ายกลุ่มแล้วงานข้างในตามไปเองทั้งหมด** เพราะทุกอย่างผูกกับ `project_id`
 *    ไม่ใช่ `area_id` · แผงนี้จึงไม่ต้องเตือนอะไรเรื่องข้อมูลหาย เพราะไม่มีอะไรหาย
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProject } from '@/app/actions/items'

export type AreaChoice = { id: string; name: string }

export default function ProjectEditor({
  projectId,
  name: initialName,
  description: initialDesc,
  areaId: initialAreaId,
  areas,
  onClose,
}: {
  projectId: string
  name: string
  description: string | null
  areaId: string
  areas: AreaChoice[]
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [desc, setDesc] = useState(initialDesc ?? '')
  const [areaId, setAreaId] = useState(initialAreaId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const moved = areaId !== initialAreaId

  async function save() {
    setBusy(true)
    setError(null)
    /*
     * ส่งเฉพาะสิ่งที่เปลี่ยนจริง — **ละคีย์ไว้ = ไม่แตะ**
     * ถ้าส่งทุกคีย์เสมอ การกดแก้แค่ชื่อจะเขียนทับรหัสวิชาด้วยค่าที่ฟอร์ม
     * บังเอิญถืออยู่ ซึ่งอ่านไม่ออกเลยว่าเกิดอะไรขึ้นเมื่อมันผิด
     */
    const res = await updateProject(projectId, {
      ...(name !== initialName ? { name } : {}),
      ...(desc !== (initialDesc ?? '') ? { description: desc } : {}),
      ...(moved ? { areaId } : {}),
    })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    onClose()
    router.refresh()
  }

  const dirty = name !== initialName || desc !== (initialDesc ?? '') || moved

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="แก้ไขโปรเจกต์"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet__panel">
        <div className="sheet__head">
          <strong>แก้ไขโปรเจกต์</strong>
          <button className="linkbtn" onClick={onClose}>ปิด</button>
        </div>

        <label className="field">
          <span>ชื่อ</span>
          <input
            className="input"
            value={name}
            autoFocus
            maxLength={120}
            onChange={(e) => { setName(e.target.value); setError(null) }}
          />
        </label>

        <label className="field">
          <span>รหัสวิชา / คำอธิบาย</span>
          <input
            className="input"
            value={desc}
            placeholder="เช่น CPE331"
            onChange={(e) => { setDesc(e.target.value); setError(null) }}
          />
          <span className="hint">เว้นว่างได้ · KeviN ใช้ค้นหาโปรเจกต์นี้ได้ด้วย</span>
        </label>

        <label className="field">
          <span>กลุ่ม</span>
          <select
            className="input"
            value={areaId}
            onChange={(e) => { setAreaId(e.target.value); setError(null) }}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <span className="hint">
            {moved ? 'งาน กิจกรรม และกิจวัตรข้างในย้ายตามไปทั้งหมด' : 'ย้ายไปกลุ่มอื่นได้'}
          </span>
        </label>

        {error && (
          <p className="alert alert--gap" role="alert">{error}</p>
        )}

        <div className="actions">
          <button className="btn" onClick={save} disabled={busy || !dirty || name.trim().length === 0}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
