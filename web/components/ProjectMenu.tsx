'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { archiveProject } from '@/app/actions/items'

/** เก็บ project เข้าคลัง / เอากลับมา · งานข้างในไม่หายไปไหน */
export default function ProjectMenu({
  projectId,
  archived,
}: {
  projectId: string
  archived: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (!archived && !window.confirm('เก็บวิชานี้เข้าคลัง? งานข้างในยังอยู่ครบ และเอากลับมาได้')) return
    setBusy(true)
    const res = await archiveProject(projectId, !archived)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    router.refresh()
  }

  return (
    <>
      <button className="btn btn--quiet" disabled={busy} onClick={run}>
        {busy ? 'กำลังบันทึก…' : archived ? 'เอากลับจากคลัง' : 'เก็บเข้าคลัง'}
      </button>
      {error && <p className="alert alert--gap" role="alert">{error}</p>}
    </>
  )
}
