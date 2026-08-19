import { hourOf, bangkokNow } from '@/lib/time'
import { dayAbbr } from '@/lib/schedule'
import { layoutDay } from '@/lib/layout'

export type Occ = {
  schedule_id: string
  project_name: string
  occurs_on: string
  start_time: string
  end_time: string
  location: string | null
}

const SLOT = 0.5 // คอลัมน์ละ 30 นาที — ตารางจริงมีคาบจบ 17:30 และ 19:30

/**
 * วัน = แกนตั้ง · เวลา = แกนนอน (doc/DESIGN.md · doc/TRAPS.md)
 *
 * แกนเวลาคำนวณจากข้อมูลจริง เร็วสุด −1 ชม. ถึงช้าสุด +1 ชม.
 * ห้าม fix 00:00–24:00 ให้ต้องเลื่อนหา
 */
export default function WeekGrid({
  occurrences,
  days,
}: {
  occurrences: Occ[]
  days: string[] // 7 วัน เริ่มวันจันทร์
}) {
  const now = bangkokNow()

  if (occurrences.length === 0) {
    // สัปดาห์ที่ไม่มีอะไร ยังวาดตารางเปล่าไว้ —
    // เพราะตารางเปล่าคือคำตอบว่า "ว่างทั้งสัปดาห์" (doc/DESIGN.md)
    return <EmptyWeek days={days} today={now.dateKey} />
  }

  const starts = occurrences.map((o) => hourOf(o.start_time))
  const ends = occurrences.map((o) => hourOf(o.end_time))
  const from = Math.floor(Math.min(...starts) - 1)
  const to = Math.ceil(Math.max(...ends) + 1)
  const cols = Math.round((to - from) / SLOT)

  const colOf = (h: number) => Math.round((h - from) / SLOT) + 2 // +1 ชื่อวัน, +1 ฐาน 1

  // จัดกลุ่มบล็อกที่เวลาซ้อนกันในวันเดียวกัน แล้วแบ่ง "ความสูง" ของแถวนั้น
  // ไม่ใช่แบ่งความกว้าง — เพราะแกนนอนคือเวลา (doc/TRAPS.md)
  // ตรรกะอยู่ใน lib/layout.ts และมีเทสต์ครอบเคสชนต่อเนื่องไว้แล้ว
  const laid = days.flatMap((day, dow) =>
    layoutDay(
      occurrences.filter((o) => o.occurs_on === day),
      (o) => ({ start: hourOf(o.start_time), end: hourOf(o.end_time) })
    ).map((p) => ({ occ: p.item, dow, lane: p.lane, of: p.of }))
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

        {laid.map(({ occ, dow, lane, of }) => {
          const s = hourOf(occ.start_time)
          const e = hourOf(occ.end_time)
          const span = Math.max(1, Math.round((e - s) / SLOT))
          const h = 40 / of
          return (
            <div
              key={`${occ.schedule_id}-${occ.occurs_on}`}
              className="wk__blk"
              style={{
                gridRow: dow + 2,
                gridColumn: `${colOf(s)} / span ${span}`,
                height: `${h}px`,
                marginTop: `${h * lane}px`,
              }}
              title={`${occ.project_name} ${occ.start_time.slice(0, 5)}–${occ.end_time.slice(0, 5)}${occ.location ? ' · ' + occ.location : ''}`}
            >
              <b>{occ.project_name}</b>
              {of === 1 && occ.location && <span>{occ.location}</span>}
            </div>
          )
        })}

        {now.hour >= from && now.hour <= to && (
          <div
            className="wk__now"
            style={{ gridRow: `2 / span 7`, gridColumn: colOf(now.hour) }}
            aria-label="เวลาปัจจุบัน"
          />
        )}
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
