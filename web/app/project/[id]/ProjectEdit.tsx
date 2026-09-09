'use client'

/** ปุ่มเปิดแผงแก้ไขโปรเจกต์ · แยกจากแผงเพื่อให้หน้าที่เป็น server component เรียกได้ */

import { useState } from 'react'
import ProjectEditor, { type AreaChoice } from './ProjectEditor'

export default function ProjectEdit({
  projectId,
  name,
  description,
  areaId,
  areas,
}: {
  projectId: string
  name: string
  description: string | null
  areaId: string
  areas: AreaChoice[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="btn btn--quiet" onClick={() => setOpen(true)}>แก้ไข</button>
      {open && (
        <ProjectEditor
          projectId={projectId}
          name={name}
          description={description}
          areaId={areaId}
          areas={areas}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
