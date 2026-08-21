import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  bangkokToday,
  thaiDateLabel,
  bangkokTime,
  overdueLabel,
  soonLabel,
  addDays,
  dayAheadLabel,
} from '@/lib/time'
import {
  entryStartMs,
  entryEndMs,
  spanLabel,
  ENTRY_COLOR,
  type CalendarEntry,
} from '@/lib/calendar'
import ItemList, { type Row } from '@/components/ItemList'
import Hero, { type HeroInfo } from '@/components/Hero'

export const dynamic = 'force-dynamic'

type Item = {
  id: string
  project_id: string
  type: 'task' | 'reminder' | 'shortnote'
  title: string
  body: string | null
  due_at: string | null
  remind_at: string | null
  done_at: string | null
  projects: { name: string } | null
}

type Line = Row & { sortAt: number }

/**
 * มองไปข้างหน้ากี่วันเพื่อหา "อันถัดไป"
 *
 * ต้องเผื่อให้ข้ามสัปดาห์ที่ไม่มีเรียนได้ — ตารางเทอมนี้เว้นสัปดาห์สอบกลางภาค
 * กับ Commencement Week ทำให้ช่องว่างยาวสุดราว 10 วัน (ศุกร์ก่อนหยุด ถึงจันทร์
 * ที่กลับมาเรียน) · 14 วันจึงครอบคลุม และยังถูกเมื่อหมดเทอมแล้วคือไม่เจออะไรเลย
 */
const LOOKAHEAD_DAYS = 14

/**
 * เวลาปัจจุบัน ณ ตอนที่ request เข้ามา
 *
 * `await connection()` ประกาศชัดว่าหน้านี้ขึ้นกับ request จริง จึง prerender
 * ตอน build ไม่ได้ · ถ้าเรียก `Date.now()` เปล่า ๆ มันจะถูกต้องอยู่ก็เพราะบังเอิญ
 * มี `force-dynamic` กำกับ — วันไหนมีคนถอดบรรทัดนั้นออกเพราะคิดว่าเป็นตัวถ่วง
 * เวลาจะถูกตรึงไว้ที่ตอน build แล้ว "เลยกำหนด" กับ "อีก 30 นาที" จะคำนวณจากอดีต
 * **ผิดเงียบ ๆ ไม่มี error ให้เห็น**
 *
 * ที่แยกออกมาเป็นฟังก์ชันเพราะการเรียกอะไรที่ให้ค่าไม่คงที่กลางตัว component
 * ผิดกฎ React และ eslint จับ — แม้ที่นี่จะเป็น Server Component ที่ render รอบเดียวจบ
 */
async function requestNow() {
  await connection()
  return Date.now()
}

/** ช่วงเวลาจริงของบล็อกหนึ่งใบ · event ข้ามวันต้องประกอบคืนจากบล็อกที่ถูกหั่น */
type Span = { start: number; end: number; days: number; endKey: string; endClock: string }

export default async function TodayPage() {
  const supabase = await createClient()
  const { start, end, dateKey } = bangkokToday()

  const [entryRes, itemRes] = await Promise.all([
    // คาบเรียน + event รูปเดียวกัน · event ข้ามคืนถูกหั่นเป็นบล็อกรายวันมาแล้ว
    supabase.rpc('calendar_entries', {
      p_from: dateKey,
      p_to: addDays(dateKey, LOOKAHEAD_DAYS),
    }),
    supabase
      .from('items')
      .select('id, project_id, type, title, body, due_at, remind_at, done_at, projects(name)')
      .is('archived_at', null)
      .in('type', ['task', 'reminder'])
      .or(
        `and(due_at.gte.${start.toISOString()},due_at.lt.${end.toISOString()}),` +
          `and(remind_at.gte.${start.toISOString()},remind_at.lt.${end.toISOString()}),` +
          `and(due_at.lt.${start.toISOString()},done_at.is.null)`
      ),
  ])

  const loadError = entryRes.error ?? itemRes.error
  if (loadError) {
    return (
      <main className="wrap">
        <Head dateKey={dateKey} />
        <p className="alert" role="alert">โหลดข้อมูลไม่สำเร็จ · {loadError.message}</p>
      </main>
    )
  }

  const entries = (entryRes.data ?? []) as CalendarEntry[]
  const items = (itemRes.data ?? []) as unknown as Item[]
  const now = await requestNow()

  /*
   * ประกอบ event ข้ามวันคืนจากบล็อกที่ calendar_entries() หั่นไว้
   *
   * ⚠️ ทำได้เฉพาะ event · ห้ามรวมคาบเรียนแบบนี้เด็ดขาด เพราะคาบเรียนใบเดียว
   *    (schedule_id เดียว) โผล่ซ้ำทุกสัปดาห์ ถ้ารวมตาม source_id จะได้ช่วงเวลา
   *    ที่ยาวข้ามเดือน
   *
   * ถ้างานเริ่มก่อนวันนี้ บล็อกของวันก่อนหน้าไม่อยู่ในช่วงที่ query เวลาเริ่ม
   * ที่ประกอบได้จึงเป็น 00:00 ของวันนี้ ไม่ใช่เวลาเริ่มจริง — ด้วยเหตุนี้
   * งานข้ามวันที่กำลังเกิดขึ้นจึงแสดงแค่ "ถึง …" ไม่แสดงเวลาเริ่ม
   */
  const spans = new Map<string, Span>()
  for (const e of entries) {
    if (e.kind !== 'event') continue
    const s = entryStartMs(e)
    const f = entryEndMs(e)
    const prev = spans.get(e.source_id)
    if (!prev) {
      spans.set(e.source_id, { start: s, end: f, days: 1, endKey: e.occurs_on, endClock: e.end_time })
    } else {
      const later = f > prev.end
      spans.set(e.source_id, {
        start: Math.min(prev.start, s),
        end: Math.max(prev.end, f),
        days: prev.days + 1,
        endKey: later ? e.occurs_on : prev.endKey,
        endClock: later ? e.end_time : prev.endClock,
      })
    }
  }

  const spanOf = (e: CalendarEntry): Span =>
    (e.kind === 'event' ? spans.get(e.source_id) : undefined) ?? {
      start: entryStartMs(e),
      end: entryEndMs(e),
      days: 1,
      endKey: e.occurs_on,
      endClock: e.end_time,
    }

  const eventHref = (e: CalendarEntry) =>
    e.kind === 'event' ? `/project/${e.project_id}/event/${e.source_id}` : null

  // ---- รายการ "วันนี้" -------------------------------------------------
  // ตัดบล็อกของวันอื่นทิ้ง — ต่างจาก hero ที่มองข้ามวันได้
  const todayEntries = entries.filter((e) => e.occurs_on === dateKey)

  const bookedLines: Line[] = todayEntries.map((e) => {
    const span = spanOf(e)
    const multi = span.days > 1

    // งานข้ามวัน บล็อกของวันนี้จะเป็น 00:00–24:00 ซึ่งเป็นจริงแต่ไม่ได้บอกอะไร
    // บอกเวลาที่มันจบจริงแทน
    const clock = multi
      ? `ถึง ${[dayAheadLabel(dateKey, span.endKey), span.endClock.slice(0, 5)].filter(Boolean).join(' ')}`
      : spanLabel(e)

    return {
      id: null,
      sortAt: entryStartMs(e),
      color: ENTRY_COLOR[e.kind],
      title: e.title,
      // ในหน้าวันนี้ บรรทัดข้อมูลขึ้นต้นด้วยชื่อ project เสมอ (doc/DESIGN.md)
      // คาบเรียนใช้ชื่อ project เป็นชื่อบล็อกอยู่แล้ว จึงไม่ต้องซ้ำ
      meta: (e.kind === 'event'
        ? [e.project_name, clock, e.location]
        : [clock, e.location, e.label]
      ).filter(Boolean).join(' · '),
      done: false,
      checkable: false,
      tag: null,
      href: eventHref(e),
    }
  })

  // ---- hero ------------------------------------------------------------
  // อันถัดไป = อันแรกที่ยังไม่จบ **ข้ามวันได้**
  //
  // เดิมดูแค่วันนี้ พอคาบสุดท้ายเลิก การ์ดก็หายไปทั้งใบจนถึงเช้าวันรุ่งขึ้น ซึ่งเป็น
  // ช่วงเย็นที่คนอยากรู้พอดีว่าพรุ่งนี้เริ่มกี่โมง (เจ้าของเคาะให้เปลี่ยน 19 ส.ค.)
  //
  // กฎเวลาชนกัน: อันที่เริ่มก่อนชนะ · เริ่มพร้อมกันให้อันที่จบก่อนชนะ
  // ไม่แยกว่าเป็น event หรือคาบเรียน กฎเดียวใช้ได้หมดและเดาผลได้เสมอ
  const timed = entries
    .map((e) => ({ e, start: entryStartMs(e), end: entryEndMs(e) }))
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const at = timed.findIndex((x) => x.end > now)
  const head = at >= 0 ? timed[at] : null

  // บล็อกอื่นของ event ใบเดียวกันไม่นับเป็น "อันถัดไป" — มันคืองานเดิม
  const nextUp = head
    ? timed.slice(at + 1).find((x) => x.end > now && !(x.e.kind === head.e.kind && x.e.source_id === head.e.source_id))
    : undefined

  const hero: HeroInfo | null = head ? buildHero(head.e, nextUp?.e ?? null, head.end) : null

  function buildHero(e: CalendarEntry, next: CalendarEntry | null, headEnd: number): HeroInfo {
    const span = spanOf(e)
    const multi = span.days > 1
    const started = span.start <= now
    const endDay = dayAheadLabel(dateKey, span.endKey)
    const endText = [endDay, span.endClock.slice(0, 5)].filter(Boolean).join(' ')

    return {
      main: {
        kind: e.kind,
        title: e.title,
        sub: (e.kind === 'event'
          ? [e.project_name, e.location, e.label]
          : [e.location, e.label]
        ).filter(Boolean).join(' · '),
        spanText: multi
          ? started
            ? `ถึง ${endText}`
            : `${[dayAheadLabel(dateKey, e.occurs_on), e.start_time.slice(0, 5)].filter(Boolean).join(' ')} – ${endText}`
          : spanLabel(e),
        startsAt: new Date(entryStartMs(e)).toISOString(),
        endsAt: new Date(span.end).toISOString(),
        dayLabel: dayAheadLabel(dateKey, e.occurs_on),
        untilText: multi ? `ถึง ${endText}` : null,
        href: eventHref(e),
      },
      after: next
        ? {
            // ทับกัน = อันถัดไปเริ่มก่อนอันบนจบ คือไปสองที่พร้อมกันไม่ได้
            clash: entryStartMs(next) < headEnd,
            when: [dayAheadLabel(dateKey, next.occurs_on), next.start_time.slice(0, 5)]
              .filter(Boolean).join(' '),
            title: next.title,
            detail: (next.kind === 'event'
              ? [next.project_name, next.location]
              : [next.location, next.label]
            ).filter(Boolean).join(' · '),
            href: eventHref(next),
          }
        : null,
    }
  }

  // ---- งานและการเตือน ---------------------------------------------------
  const overdue: Line[] = []
  const today: Line[] = []

  for (const it of items) {
    const when = it.type === 'reminder' ? it.remind_at : it.due_at
    if (!when) continue

    const done = it.done_at !== null
    const isOverdue = !done && new Date(when).getTime() < start.getTime()

    const project = it.projects?.name ?? '—'
    const late = overdueLabel(when, now)
    const soon = soonLabel(when, now)

    const line: Line = {
      id: it.id,
      sortAt: new Date(when).getTime(),
      color: it.type === 'reminder' || it.due_at ? 'var(--due)' : 'var(--task)',
      title: it.title,
      meta: isOverdue
        ? `${project} · ${late ?? ''}`.trim()
        : `${project} · ${bangkokTime(when)}`,
      done,
      checkable: it.type === 'task',
      tag: isOverdue ? { text: 'เลยกำหนด', kind: 'late' } : !done && soon ? { text: soon, kind: 'soon' } : null,
      panel: {
        id: it.id,
        projectId: it.project_id,
        type: it.type,
        title: it.title,
        body: it.body,
        at: when,
        done,
        projectName: project,
      },
    }

    if (isOverdue) overdue.push(line)
    else today.push(line)
  }

  // เสร็จแล้วร่วงท้ายกลุ่ม · ไม่ซ่อน (doc/DECISIONS.md)
  const byTime = (a: Line, b: Line) => Number(a.done) - Number(b.done) || a.sortAt - b.sortAt
  overdue.sort(byTime)
  const timeline = [...bookedLines, ...today].sort(byTime)

  const nothing = overdue.length === 0 && timeline.length === 0

  return (
    <main className="wrap">
      <Head dateKey={dateKey} />

      {hero && <Hero info={hero} />}

      {nothing && (
        <div className="empty">
          <strong>วันนี้ว่าง</strong>
          ไม่มีคาบเรียน กิจกรรม งาน หรือการเตือนในวันนี้
        </div>
      )}

      {overdue.length > 0 && (
        <>
          <div className="sec">
            <span>เลยกำหนด</span>
            <span>{overdue.length}</span>
          </div>
          <ItemList rows={overdue} />
        </>
      )}

      {timeline.length > 0 && (
        <>
          <div className="sec">
            <span>วันนี้</span>
            <span>{timeline.length}</span>
          </div>
          <ItemList rows={timeline} />
        </>
      )}
    </main>
  )
}

function Head({ dateKey }: { dateKey: string }) {
  // วันที่คือหัวข้อของหน้านี้ · คำว่า "วันนี้" อยู่ในแถบนำทางแล้ว ไม่ต้องซ้ำ
  return (
    <div className="page-head">
      <h1>{thaiDateLabel(dateKey)}</h1>
    </div>
  )
}
