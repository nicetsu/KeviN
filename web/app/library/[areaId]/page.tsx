import Link from 'next/link'
import { Content } from '@/components/Reveal'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { LIBRARY_OPEN_COOKIE, decodeOpen } from '@/lib/libraryOpen'
import { bangkokToday, bangkokTime, thaiDateLabel } from '@/lib/time'
import { summarize, type Slot } from '@/lib/schedule'
import AreaEdit from './AreaEdit'
import { AREA_CLASS } from '@/lib/areaColor'
import AreaHead from './AreaHead'
import ProjectTree, { type TreeProject, type TreeItem } from './ProjectTree'

export const dynamic = 'force-dynamic'

/** "22 ส.ค. 14:30" */
function stamp(iso: string) {
  const key = new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
  return `${thaiDateLabel(key).split(' ').slice(1).join(' ')} ${bangkokTime(iso)}`
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

/**
 * โปรเจกต์ทั้งหมดใน Area หนึ่ง
 *
 * หน้านี้เกิดจากการกลับมติเดิมที่ว่า "Area แตะเพื่อกางในหน้าเดิม ไม่เปลี่ยนหน้า"
 * (archive/ux.html) — เจ้าของขอให้กล่อง Area เป็นทางเข้าจริง ๆ 1 ก.ย. 2026
 * เพราะการเทียบข้าม Area ที่เป็นเหตุผลเดิมไม่เคยเกิดขึ้นจริง
 *
 * ⚠️ **ไม่มี `loading.tsx` โดยตั้งใจ** — โครงร่างที่คั่นกลางทำให้ชื่อ Area
 *    ที่ควรเดินทางมาจากหน้าคลังไม่มีคู่ให้จับ (doc/TRAPS.md) · query ของหน้านี้
 *    เล็กกว่าหน้าคลังเดิมมากเพราะดึงแค่ Area เดียว จึงเร็วพอที่จะไม่ต้องมีโครงร่าง
 */
export default async function AreaPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params
  const supabase = await createClient()
  const { end } = bangkokToday()

  const jar = await cookies()
  const initialOpen = decodeOpen(jar.get(LIBRARY_OPEN_COOKIE)?.value)

  const [areaRes, projRes, schedRes, itemRes] = await Promise.all([
    supabase.from('areas').select('id, name, color').eq('id', areaId).maybeSingle(),
    supabase
      .from('projects')
      .select('id, name, status, archived_at, sort_order')
      .eq('area_id', areaId)
      .order('sort_order'),
    supabase
      .from('project_schedules')
      .select('project_id, day_of_week, start_time, end_time, location, label, week_offsets'),
    supabase
      .from('items')
      .select('id, project_id, type, title, body, due_at, remind_at, done_at, sort_order')
      .is('archived_at', null),
  ])

  if (areaRes.error) {
    return (
      <main className="wrap">
        <p className="alert" role="alert">โหลดไม่สำเร็จ · {areaRes.error.message}</p>
      </main>
    )
  }
  if (!areaRes.data) notFound()

  const area = areaRes.data as { id: string; name: string; color: string | null }
  const projects = (projRes.data ?? []) as {
    id: string; name: string; status: string; archived_at: string | null; sort_order: number
  }[]
  const slots = (schedRes.data ?? []) as (Slot & { project_id: string })[]
  const items = (itemRes.data ?? []) as Item[]

  const label = area.name === 'Class' ? 'วิชา' : 'โปรเจกต์'
  const cutoff = end.toISOString()
  const isArchived = (p: { archived_at: string | null; status: string }) =>
    p.archived_at !== null || p.status === 'archived'

  /** "ต้องสนใจ" = เลยกำหนด + ครบวันนี้ และยังไม่เสร็จ */
  const needsAttention = (i: Item) => {
    if (i.done_at || i.type === 'shortnote') return false
    const at = i.type === 'reminder' ? i.remind_at : i.due_at
    return at !== null && at < cutoff
  }

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
  const rank = (i: Item) => (i.type === 'shortnote' ? 2 : i.done_at ? 1 : 0)

  const tree: TreeProject[] = projects
    .sort((a, b) => Number(isArchived(a)) - Number(isArchived(b)) || a.sort_order - b.sort_order)
    .map((p) => {
      const own = items.filter((i) => i.project_id === p.id)
      return {
        id: p.id,
        name: p.name,
        archived: isArchived(p),
        when: summarize(slots.filter((s) => s.project_id === p.id)),
        attention: own.filter(needsAttention).length,
        items: own.sort((a, b) => rank(a) - rank(b) || a.sort_order - b.sort_order).map(toItem),
      }
    })

  const openCount = tree.filter((p) => !p.archived).length
  const attention = tree.reduce((n, p) => n + p.attention, 0)

  return (
    <Content>
      <main className="wrap">
        <div className="page-head page-head--row">
          <Link href="/library" className="back" transitionTypes={['nav-back']}>‹ คลัง</Link>
          <AreaEdit area={{ id: area.id, name: area.name, color: area.color }} />
        </div>

        {/*
          หัวของหน้า — กล่องเดียวกับในหน้าคลัง แต่ยืดเต็มความกว้าง
          บินออกมาจากตำแหน่งการ์ดที่ถูกกด ถ้ามีค่าที่จดไว้และยังไม่หมดอายุ
        */}
        <AreaHead
          areaId={area.id}
          colorClass={AREA_CLASS[area.color ?? ''] ?? ''}
          name={area.name}
          count={openCount > 0 ? `${openCount} ${label}` : 'ว่าง'}
          attention={attention}
        />

        <ProjectTree
          areaId={area.id}
          label={label}
          projects={tree}
          initialOpen={initialOpen}
        />
      </main>
    </Content>
  )
}
