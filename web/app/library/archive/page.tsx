import { Content } from '@/components/Reveal'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { bangkokTime, thaiDateLabel } from '@/lib/time'
import { KEEP_DAYS, groupByLeft, msLeft, leftLabel, isUrgent, byWhom } from '@/lib/archive'
import ArchiveList, { type ArchivedRow } from './ArchiveList'

export const dynamic = 'force-dynamic'

/** "22 ส.ค. 14:30" */
function stamp(iso: string) {
  const key = new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
  return `${thaiDateLabel(key).split(' ').slice(1).join(' ')} ${bangkokTime(iso)}`
}

type ItemRow = {
  id: string
  type: 'task' | 'reminder' | 'shortnote'
  title: string
  archived_at: string
  archived_auto: boolean
  projects: { name: string } | null
}

type EventRow = {
  id: string
  project_id: string
  title: string
  archived_at: string
  archived_auto: boolean
  projects: { name: string } | null
}

const STRIPE: Record<string, string> = {
  task: 'var(--task)',
  reminder: 'var(--due)',
  shortnote: 'var(--note)',
  event: 'var(--event)',
}

/**
 * ของที่เก็บเข้าคลังแล้วรอถูกลบถาวร
 *
 * หน้านี้ปิดช่องว่างที่เปิดไว้ตอนทำระบบเก็บกวาด — ตั้งแต่ 1 ก.ย. 2026 ระบบเก็บของ
 * อัตโนมัติทุกคืนและลบถาวรเมื่อครบ 7 วัน แต่ไม่มีหน้าไหนมองเห็นช่วงเจ็ดวันนั้นเลย
 * ของถูกลบโดยผู้ใช้ไม่มีโอกาสเห็น ซึ่งขัดหลัก UX ข้อ 5 ตรง ๆ
 *
 * ⚠️ **ไม่มีปุ่มลบทันทีโดยตั้งใจ** — มีสายพานลบอยู่แล้ว การเพิ่มปุ่มลบซ้ำ
 *    คือการเชิญให้พลาดในหน้าที่ทุกแถวกู้คืนไม่ได้ถ้าพลาด
 */
export default async function ArchivePage() {
  const supabase = await createClient()

  const [itemRes, eventRes] = await Promise.all([
    supabase
      .from('items')
      .select('id, type, title, archived_at, archived_auto, projects(name)')
      .not('archived_at', 'is', null),
    supabase
      .from('events')
      .select('id, project_id, title, archived_at, archived_auto, projects(name)')
      .not('archived_at', 'is', null),
  ])

  const err = itemRes.error ?? eventRes.error
  if (err) {
    return (
      <main className="wrap">
        <Head />
        <p className="alert" role="alert">โหลดไม่สำเร็จ · {err.message}</p>
      </main>
    )
  }

  const items = (itemRes.data ?? []) as unknown as ItemRow[]
  const events = (eventRes.data ?? []) as unknown as EventRow[]

  // item กับ event รวมเป็นรายการเดียว — ผู้ใช้ไม่ได้คิดแยกว่าอะไรอยู่ตารางไหน
  const rows: ArchivedRow[] = [
    ...items.map((i) => ({
      key: `i:${i.id}`,
      id: i.id,
      kind: 'item' as const,
      projectId: null,
      color: STRIPE[i.type] ?? 'var(--note)',
      title: i.title,
      archivedAt: i.archived_at,
      auto: i.archived_auto,
      project: i.projects?.name ?? '',
    })),
    ...events.map((e) => ({
      key: `e:${e.id}`,
      id: e.id,
      kind: 'event' as const,
      projectId: e.project_id,
      color: STRIPE.event,
      title: e.title,
      archivedAt: e.archived_at,
      auto: e.archived_auto,
      project: e.projects?.name ?? '',
    })),
  ]

  // `new Date()` ไม่ใช่ `Date.now()` — กฎ react-hooks จับตัวหลังว่าเป็น impure
  // ในการ render · หน้านี้เป็น Server Component ที่รันครั้งเดียวต่อ request
  // จึงไม่มีปัญหาเรื่องความไม่คงที่จริง แต่เขียนให้ผ่านกฎดีกว่าปิดกฎ
  const now = new Date().getTime()
  const groups = groupByLeft(rows, now).map((g) => ({
    key: g.key,
    label: g.label,
    rows: g.rows.map((i) => {
      const r = rows[i]
      const ms = msLeft(r, now)
      return {
        ...r,
        meta: `เก็บเมื่อ ${stamp(r.archivedAt)} · ${byWhom(r.auto)}${r.project ? ` · ${r.project}` : ''}`,
        left: leftLabel(ms),
        urgent: isUrgent(ms),
      }
    }),
  }))

  return (
    <Content>
      <main className="wrap">
        <Head />
        {rows.length === 0 ? (
          <div className="empty">
            <strong>ไม่มีอะไรอยู่ในคลัง</strong>
            ของที่เก็บไว้จะมารออยู่ที่นี่ {KEEP_DAYS} วันก่อนถูกลบถาวร
          </div>
        ) : (
          <ArchiveList groups={groups} />
        )}
      </main>
    </Content>
  )
}

function Head() {
  return (
    <div className="page-head">
      <Link href="/library" className="back">‹ คลัง</Link>
      <h1>ของที่เก็บไว้</h1>
      <div className="sub">ลบถาวรอัตโนมัติเมื่อครบ {KEEP_DAYS} วัน · กดคืนได้ทุกแถว</div>
    </div>
  )
}
