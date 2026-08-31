import { Content } from '@/components/Reveal'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { LIBRARY_OPEN_COOKIE, decodeOpen } from '@/lib/libraryOpen'
import { bangkokToday, bangkokTime, thaiDateLabel } from '@/lib/time'
import { summarize, type Slot } from '@/lib/schedule'
import LibraryTree, { type TreeArea, type TreeItem } from './LibraryTree'

export const dynamic = 'force-dynamic'

// คีย์สีจาก DESIGN.md map ไปเป็นคลาสที่มี gradient ใน globals.css
/**
 * คีย์สีใน `areas.color` → คลาสที่มี gradient ใน globals.css
 *
 * ⚠️ **คีย์ต้องตรงกับชื่อ Area จริง** ของเดิมเป็น `hack`/`fin`/`pers` ค้างมาจาก
 *    ชื่อ Area รุ่นก่อน (Hackathon · Financial · Personal) ซึ่งเปลี่ยนไปแล้ว
 *    ตั้งแต่ 31 ส.ค. 2026 — สีถูกแต่ชื่อโกหก คนอ่านโค้ดเห็น `fin` แล้วนึกว่าการเงิน
 *
 * ⚠️ ถ้าต้องเปลี่ยนคีย์อีกรอบ **ลำดับสำคัญ** — คีย์ที่ถูกใช้เป็นทั้งชื่อเก่าและ
 *    ชื่อใหม่ (คราวนี้คือ `pers`) ต้องถูกปลดออกก่อนเสมอ ไม่งั้นสองแถวจะชนกัน
 *    แล้วโดนเปลี่ยนพร้อมกันทั้งคู่ (กับดักเดียวกับตอนเปลี่ยนชื่อ Area)
 */
const AREA_CLASS: Record<string, string> = {
  class: 'acard--class',
  comp: 'acard--comp',
  pers: 'acard--pers',
  gen: 'acard--gen',
}

type Area = { id: string; name: string; color: string | null; sort_order: number }
type Project = {
  id: string
  area_id: string
  name: string
  status: string
  archived_at: string | null
  sort_order: number
}
type Item = {
  id: string
  project_id: string
  type: 'task' | 'reminder' | 'shortnote'
  title: string
  body: string | null
  due_at: string | null
  remind_at: string | null
  done_at: string | null
  sort_order: number
}

/** "22 ส.ค. 14:30" */
function stamp(iso: string) {
  const key = new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
  return `${thaiDateLabel(key).split(' ').slice(1).join(' ')} ${bangkokTime(iso)}`
}

export default async function LibraryPage() {
  const supabase = await createClient()
  const { end } = bangkokToday()

  // อ่านตรงนี้ เซิร์ฟเวอร์จึงวาดสถานะกาง/หุบถูกตั้งแต่เฟรมแรก ไม่ต้องรอ effect
  const jar = await cookies()
  const initialOpen = decodeOpen(jar.get(LIBRARY_OPEN_COOKIE)?.value)

  const [areaRes, projRes, schedRes, itemRes, archivedRes] = await Promise.all([
    supabase.from('areas').select('id, name, color, sort_order').is('archived_at', null).order('sort_order'),
    supabase.from('projects').select('id, area_id, name, status, archived_at, sort_order').order('sort_order'),
    supabase
      .from('project_schedules')
      .select('project_id, day_of_week, start_time, end_time, location, label, week_offsets'),
    supabase
      .from('items')
      .select('id, project_id, type, title, body, due_at, remind_at, done_at, sort_order')
      .is('archived_at', null),
    // นับของในคลังเพื่อบอกจำนวนที่ทางเข้า · ไม่ดึงเนื้อ เพราะหน้านี้ไม่ได้แสดงมัน
    supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .not('archived_at', 'is', null),
  ])

  const err = areaRes.error ?? projRes.error ?? schedRes.error ?? itemRes.error
  if (err) {
    return (
      <main className="wrap">
        <div className="page-head"><h1>คลัง</h1></div>
        <p className="alert" role="alert">โหลดข้อมูลไม่สำเร็จ · {err.message}</p>
      </main>
    )
  }

  const archivedCount = archivedRes.count ?? 0
  const areas = (areaRes.data ?? []) as Area[]
  const projects = (projRes.data ?? []) as Project[]
  const slots = (schedRes.data ?? []) as (Slot & { project_id: string })[]
  const items = (itemRes.data ?? []) as Item[]

  const isArchived = (p: Project) => p.archived_at !== null || p.status === 'archived'
  const cutoff = end.toISOString()

  /** "ต้องสนใจ" = เลยกำหนด + ครบวันนี้ และยังไม่เสร็จ */
  const needsAttention = (i: Item) => {
    if (i.done_at || i.type === 'shortnote') return false
    const at = i.type === 'reminder' ? i.remind_at : i.due_at
    return at !== null && at < cutoff
  }

  const tree: TreeArea[] = areas.map((area) => {
    const kids = projects
      .filter((p) => p.area_id === area.id)
      .sort(
        (a, b) => Number(isArchived(a)) - Number(isArchived(b)) || a.sort_order - b.sort_order
      )

    const treeProjects = kids.map((p) => {
      const own = items.filter((i) => i.project_id === p.id)

      const toItem = (i: Item): TreeItem => ({
        id: i.id,
        kind: i.type === 'shortnote' ? 'note' : i.type,
        title: i.title,
        meta:
          i.type === 'shortnote'
            ? (i.body ?? '')
            : i.done_at
              ? `เสร็จ ${stamp(i.done_at)}`
              : i.type === 'reminder'
                ? (i.remind_at ? stamp(i.remind_at) : '')
                : i.due_at
                  ? stamp(i.due_at)
                  : 'ยังไม่กำหนดวัน',
        done: i.done_at !== null,
      })

      // งานยังไม่เสร็จก่อน · เสร็จแล้วร่วงท้าย · โน้ตอยู่ล่างสุด
      const rank = (i: Item) =>
        i.type === 'shortnote' ? 2 : i.done_at ? 1 : 0

      return {
        id: p.id,
        name: p.name,
        archived: isArchived(p),
        when: summarize(slots.filter((s) => s.project_id === p.id)),
        attention: own.filter(needsAttention).length,
        items: own
          .sort((a, b) => rank(a) - rank(b) || a.sort_order - b.sort_order)
          .map(toItem),
      }
    })

    return {
      id: area.id,
      name: area.name,
      colorClass: AREA_CLASS[area.color ?? ''] ?? '',
      label: area.name === 'Class' ? 'วิชา' : 'โปรเจกต์',
      openCount: kids.filter((p) => !isArchived(p)).length,
      attention: treeProjects.reduce((n, p) => n + p.attention, 0),
      projects: treeProjects,
    }
  })

  return (
    <Content>
      <main className="wrap">
        <div className="page-head">
          <h1>คลัง</h1>
          <div className="sub">Area › โปรเจกต์ › งาน</div>
        </div>

        <LibraryTree areas={tree} initialOpen={initialOpen} />

        {/*
          ทางเข้าของที่เก็บไว้ อยู่ล่างสุดเพราะเป็นที่ที่แวะนาน ๆ ครั้ง
          แต่ต้องมีอยู่ — ตั้งแต่ 1 ก.ย. 2026 ระบบเก็บของเองทุกคืนแล้วลบถาวรใน 7 วัน
          ถ้าไม่มีทางเข้า ผู้ใช้จะไม่มีวันเห็นของที่กำลังจะหาย
        */}
        <Link href="/library/archive" className="archive-link">
          <span>ของที่เก็บไว้</span>
          <span className="archive-link__n">
            {archivedCount > 0 ? `${archivedCount} ›` : '›'}
          </span>
        </Link>
      </main>
    </Content>
  )
}
