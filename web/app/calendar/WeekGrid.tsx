import { hourOf, bangkokNow } from '@/lib/time'
import { dayAbbr } from '@/lib/schedule'
import { layoutDay } from '@/lib/layout'
import { entryKey, spanLabel, type CalendarEntry } from '@/lib/calendar'
import NowLine from './NowLine'

const SLOT = 0.5 // คอลัมน์ละ 30 นาที — ตารางจริงมีคาบจบ 17:30 และ 19:30

/**
 * วัน = แกนตั้ง · เวลา = แกนนอน (ARCHITECTURE.md §9 · doc/TRAPS.md)
 *
 * แกนเวลาคำนวณจากข้อมูลจริง เร็วสุด −1 ชม. ถึงช้าสุด +1 ชม.
 * ห้าม fix 00:00–24:00 ให้ต้องเลื่อนหา
 *
 * รับทั้งคาบเรียนและ event ในรูปเดียวกันจาก `calendar_entries()` — เข้าตัวจัดบล็อก
 * ชนกันตัวเดียวกัน แต่**คนละสี** เพราะบนแกนเดียวกันต้องแยกออกด้วยตาว่าอันไหนเป็นอะไร
 */
export default function WeekGrid({
  entries,
  days,
}: {
  entries: CalendarEntry[]
  days: string[] // 7 วัน เริ่มวันจันทร์
}) {
  const now = bangkokNow()

  if (entries.length === 0) {
    // สัปดาห์ที่ไม่มีอะไร ยังวาดตารางเปล่าไว้ —
    // เพราะตารางเปล่าคือคำตอบว่า "ว่างทั้งสัปดาห์" (ARCHITECTURE.md §9)
    return <EmptyWeek days={days} today={now.dateKey} />
  }

  const starts = entries.map((e) => hourOf(e.start_time))
  const ends = entries.map((e) => hourOf(e.end_time)) // "24:00:00" -> 24

  // ยังเผื่อหัวท้ายชั่วโมงละหนึ่งเหมือนเดิม แต่ต้องหนีบไว้ในกรอบวันจริง —
  // event ข้ามคืนถูกหั่นให้เริ่ม 00:00 และจบ 24:00 ซึ่งถ้าเผื่อต่อจะได้แกน
  // −1 ถึง 25 แล้วหัวคอลัมน์จะขึ้นเลขติดลบ
  const from = Math.max(0, Math.floor(Math.min(...starts) - 1))
  const to = Math.min(24, Math.ceil(Math.max(...ends) + 1))
  const cols = Math.round((to - from) / SLOT)

  const colOf = (h: number) => Math.round((h - from) / SLOT) + 2 // +1 ชื่อวัน, +1 ฐาน 1

  // จัดกลุ่มบล็อกที่เวลาซ้อนกันในวันเดียวกัน แล้วแบ่ง "ความสูง" ของแถวนั้น
  // ไม่ใช่แบ่งความกว้าง — เพราะแกนนอนคือเวลา (doc/TRAPS.md)
  // ตรรกะอยู่ใน lib/layout.ts และมีเทสต์ครอบเคสชนต่อเนื่องไว้แล้ว
  const laid = days.flatMap((day, dow) =>
    layoutDay(
      entries.filter((e) => e.occurs_on === day),
      (e) => ({ start: hourOf(e.start_time), end: hourOf(e.end_time) })
    ).map((p) => ({ entry: p.item, dow, lane: p.lane, of: p.of }))
  )

  return (
    <div className="wk-scroll">
      <div
        className="wk"
        style={{ gridTemplateColumns: `3.1rem repeat(${cols}, minmax(23px, 1fr))` }}
      >
        <div className="wk__day" style={{ gridRow: 1, gridColumn: 1 }} />
        {Array.from({ length: to - from }, (_, i) => {
          const h = from + i
          return (
            <div
              key={h}
              className={`wk__hd${Math.floor(now.hour) === h ? ' wk__hd--now' : ''}`}
              style={{ gridRow: 1, gridColumn: `${colOf(h)} / span 2` }}
            >
              {String(h).padStart(2, '0')}
            </div>
          )
        })}

        {days.map((day, dow) => (
          <div
            key={day}
            className={`wk__day${day === now.dateKey ? ' wk__day--today' : ''}`}
            style={{ gridRow: dow + 2, gridColumn: 1 }}
          >
            {dayAbbr(dow)}
            <span style={{ opacity: 0.6 }}>{Number(day.slice(8))}</span>
          </div>
        ))}

        {days.map((day, dow) =>
          Array.from({ length: cols }, (_, c) => (
            <div key={`${day}-${c}`} className="wk__cell" style={{ gridRow: dow + 2, gridColumn: c + 2 }} />
          ))
        )}

        {laid.map(({ entry, dow, lane, of }) => {
          const s = hourOf(entry.start_time)
          const e = hourOf(entry.end_time)
          const span = Math.max(1, Math.round((e - s) / SLOT))
          const h = 40 / of
          return (
            <div
              key={entryKey(entry)}
              className={[
                'wk__blk',
                entry.kind === 'event' ? 'wk__blk--event' : '',
                entry.skipped ? 'wk__blk--skip' : '',
                entry.trimmed ? 'wk__blk--trim' : '',
              ].filter(Boolean).join(' ')}
              style={{
                gridRow: dow + 2,
                gridColumn: `${colOf(s)} / span ${span}`,
                height: `${h}px`,
                marginTop: `${h * lane}px`,
              }}
              title={[
                `${entry.title} ${spanLabel(entry)}`,
                entry.kind === 'event' ? entry.project_name : null,
                entry.location,
                entry.skipped ? 'ตั้งใจไม่ไป' : entry.trimmed ? 'เวลาถูกตัด' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <b>{entry.title}</b>
              {of === 1 && entry.location && <span>{entry.location}</span>}
            </div>
          )
        })}

        {/* เส้นตอนนี้เลื่อนเองทุกครึ่งนาที — คำนวณฝั่งเบราว์เซอร์ (NowLine.tsx) */}
        <NowLine from={from} to={to} slot={SLOT} rows={7} />
      </div>
    </div>
  )
}

function EmptyWeek({ days, today }: { days: string[]; today: string }) {
  return (
    <div className="wk-scroll">
      <div className="wk" style={{ gridTemplateColumns: '3.1rem repeat(12, minmax(23px, 1fr))' }}>
        {days.map((day, dow) => (
          <div
            key={day}
            className={`wk__day${day === today ? ' wk__day--today' : ''}`}
            style={{ gridRow: dow + 1, gridColumn: 1 }}
          >
            {dayAbbr(dow)}
            <span style={{ opacity: 0.6 }}>{Number(day.slice(8))}</span>
          </div>
        ))}
        {days.map((day, dow) =>
          Array.from({ length: 12 }, (_, c) => (
            <div key={`${day}-${c}`} className="wk__cell" style={{ gridRow: dow + 1, gridColumn: c + 2 }} />
          ))
        )}
      </div>
    </div>
  )
}
