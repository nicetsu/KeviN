import { addDays } from '@/lib/time'
import type { Occ } from './WeekGrid'

const DOW = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

/** โหมดเดือน · มือถือ 2 รายการต่อวัน · เดสก์ท็อป 3–4 (doc/DESIGN.md) */
export default function MonthGrid({
  monthKey,
  occurrences,
  today,
}: {
  monthKey: string // YYYY-MM-01
  occurrences: Occ[]
  today: string
}) {
  const [y, m] = monthKey.split('-').map(Number)
  const first = `${monthKey.slice(0, 8)}01`
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const gridStart = addDays(first, -firstDow)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  // ตัดสัปดาห์ท้ายที่ไม่มีวันของเดือนนี้เลยออก
  const weeks: string[][] = []
  for (let i = 0; i < 42; i += 7) weeks.push(cells.slice(i, i + 7))
  const kept = weeks.filter((w) => w.some((d) => d.slice(0, 7) === monthKey.slice(0, 7)))

  const byDay = new Map<string, Occ[]>()
  for (const o of occurrences) {
    const list = byDay.get(o.occurs_on) ?? []
    list.push(o)
    byDay.set(o.occurs_on, list)
  }

  return (
    <div className="mo">
      {DOW.map((d) => (
        <div key={d} className="mo__hd">{d}</div>
      ))}
      {kept.flat().map((day) => {
        const inMonth = day.slice(0, 7) === monthKey.slice(0, 7)
        const evs = (byDay.get(day) ?? []).sort((a, b) => a.start_time.localeCompare(b.start_time))
        return (
          <div
            key={day}
            className={`mo__day${inMonth ? '' : ' mo__day--out'}${day === today ? ' mo__day--today' : ''}`}
          >
            <div className="mo__n">{Number(day.slice(8))}</div>
            {evs.slice(0, 3).map((e, i) => (
              <div
                key={e.schedule_id + day}
                className={`mo__ev${i === 2 ? ' mo__ev--d' : ''}`}
                title={e.project_name}
              >
                {e.start_time.slice(0, 5)} {e.project_name}
              </div>
            ))}
            {evs.length > 2 && <div className="mo__more mo__more--m">+{evs.length - 2}</div>}
            {evs.length > 3 && <div className="mo__more mo__more--d">+{evs.length - 3}</div>}
          </div>
        )
      })}
    </div>
  )
}
