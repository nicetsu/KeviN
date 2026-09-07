import Link from 'next/link'
import AreaAdd from './AreaAdd'
import AreaCard from './AreaCard'
import { Content } from '@/components/Reveal'
import { createClient } from '@/lib/supabase/server'
import { bangkokToday, bangkokTime, thaiDateLabel } from '@/lib/time'
import { AREA_CLASS } from '@/lib/areaColor'

export const dynamic = 'force-dynamic'

type Area = { id: string; name: string; color: string | null; sort_order: number }
type Project = { id: string; area_id: string; status: string; archived_at: string | null }
type Item = {
  project_id: string
  type: 'task' | 'reminder' | 'shortnote'
  due_at: string | null
  remind_at: string | null
  done_at: string | null
}

/** "22 ส.ค. 14:30" */
function stamp(iso: string) {
  const key = new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
  return `${thaiDateLabel(key).split(' ').slice(1).join(' ')} ${bangkokTime(iso)}`
}

/**
 * หน้าคลัง — **สารบัญอย่างเดียว**
 *
 * เดิมหน้านี้กาง Area ในหน้าเดียวกันเพื่อ "เทียบข้าม Area ได้" (archive/ux.html)
 * แต่ใช้จริงแล้วไม่มีใครเทียบ เพราะแต่ละ Area เก็บของคนละชนิดกันสิ้นเชิง
 * และหน้าก็ยาวขึ้นเรื่อย ๆ ตามจำนวนวิชา · เจ้าของขอให้กล่องเป็นทางเข้าจริง ๆ
 * แทนที่จะเป็นปุ่มเลื่อนลง (1 ก.ย. 2026)
 *
 * ตอนนี้เหลือสามอย่าง — กล่อง Area · กิจกรรมที่จะถึง · ทางเข้าของที่เก็บไว้
 * ทั้งหมดพอดีหนึ่งจอบนมือถือโดยไม่ต้องเลื่อน
 */
export default async function LibraryPage() {
  const supabase = await createClient()
  const { end } = bangkokToday()

  const [areaRes, projRes, itemRes, archivedRes, eventRes] = await Promise.all([
    supabase.from('areas').select('id, name, color, sort_order').is('archived_at', null).order('sort_order'),
    supabase.from('projects').select('id, area_id, status, archived_at'),
    supabase
      .from('items')
      .select('project_id, type, due_at, remind_at, done_at')
      .is('archived_at', null),
    // นับของในคลังเพื่อบอกจำนวนที่ทางเข้า · ไม่ดึงเนื้อ เพราะหน้านี้ไม่ได้แสดงมัน
    supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .not('archived_at', 'is', null),
    /*
      กิจกรรมที่ยังไม่ผ่าน — มันคือ "ต้องไปที่ไหนตอนไหน" ซึ่งเลื่อนไม่ได้
      ต้องเห็นก่อนงานที่จัดเวลาเองได้ เหมือนที่หน้าวิชาทำอยู่แล้ว
    */
    supabase
      .from('events')
      .select('id, project_id, title, starts_at, ends_at, location, projects(name)')
      .is('archived_at', null)
      .gte('ends_at', new Date().toISOString())
      .order('starts_at')
      .limit(5),
  ])

  const err = areaRes.error ?? projRes.error ?? itemRes.error ?? eventRes.error
  if (err) {
    return (
      <main className="wrap">
      <div className="page-head"><h1>คลัง</h1></div>
      <p className="alert" role="alert">โหลดข้อมูลไม่สำเร็จ · {err.message}</p>
    </main>
    )
  }

  const areas = (areaRes.data ?? []) as Area[]
  const projects = (projRes.data ?? []) as Project[]
  const items = (itemRes.data ?? []) as Item[]
  const archivedCount = archivedRes.count ?? 0
  const upcoming = (eventRes.data ?? []) as unknown as {
    id: string
    project_id: string
    title: string
    starts_at: string
    location: string | null
    projects: { name: string } | null
  }[]

  const cutoff = end.toISOString()
  const isArchived = (p: Project) => p.archived_at !== null || p.status === 'archived'

  /** "ต้องสนใจ" = เลยกำหนด + ครบวันนี้ และยังไม่เสร็จ */
  const needsAttention = (i: Item) => {
    if (i.done_at || i.type === 'shortnote') return false
    const at = i.type === 'reminder' ? i.remind_at : i.due_at
    return at !== null && at < cutoff
  }

  const cards = areas.map((area) => {
    const own = projects.filter((p) => p.area_id === area.id)
    const ids = new Set(own.map((p) => p.id))
    return {
    id: area.id,
    name: area.name,
    colorClass: AREA_CLASS[area.color ?? ''] ?? '',
    label: area.name === 'Class' ? 'วิชา' : 'โปรเจกต์',
    openCount: own.filter((p) => !isArchived(p)).length,
    attention: items.filter((i) => ids.has(i.project_id) && needsAttention(i)).length,
    }
  })

  return (
    <Content>
      <main className="wrap">
        <div className="page-head page-head--row">
          <div>
            <h1>คลัง</h1>
            <div className="sub">แตะเพื่อเปิด Area</div>
          </div>
          <AreaAdd />
        </div>

        <div className="areas">
          {cards.map((a) => (
            /*
              การ์ดจดตำแหน่งตัวเองตอนถูกกด แล้วหัวของหน้าถัดไปบินออกมาจากตรงนั้น
              (lib/cardFlight.ts) — ทำเองแทน View Transition เพราะ Next.js
              ทำ transition สองรอบ ฝั่งเก่าหายก่อนฝั่งใหม่มาเสมอ จับคู่ไม่ได้
            */
            <AreaCard
              key={a.id}
              id={a.id}
              name={a.name}
              colorClass={a.colorClass}
              count={a.openCount > 0 ? `${a.openCount} ${a.label}` : 'ว่าง'}
              attention={a.attention}
            />
          ))}
        </div>

        {upcoming.length > 0 && (
          <>
            <div className="sec">
              <span>กิจกรรมที่จะถึง</span>
              <span>{upcoming.length}</span>
            </div>
            {upcoming.map((e) => (
              <Link key={e.id} href={`/project/${e.project_id}/event/${e.id}`} className="row row--link">
                <span className="row__stripe" style={{ background: 'var(--event)' }} />
                <div className="row__body">
                  <div className="row__title">{e.title}</div>
                  <div className="row__meta">
                    {stamp(e.starts_at)}
                    {e.projects?.name ? ` · ${e.projects.name}` : ''}
                    {e.location ? ` · ${e.location}` : ''}
                  </div>
                </div>
                <span className="row__go" aria-hidden="true">›</span>
              </Link>
            ))}
          </>
        )}

        {/*
          ทางเข้าของที่เก็บไว้ อยู่ล่างสุดเพราะเป็นที่ที่แวะนาน ๆ ครั้ง
          แต่ต้องมีอยู่ — ระบบเก็บของเองทุกคืนแล้วลบถาวรใน 7 วัน
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
