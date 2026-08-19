/**
 * ตรรกะการซ้ำของช่วงเวลาประจำ · ล้วน ไม่มี side effect จึงเทสต์ได้
 *
 * สองโหมดกรอกลงเป็น week_offsets ชุดเดียวกัน (doc/DECISIONS.md)
 *   โหมด ก "ซ้ำอีก N สัปดาห์"  -> [0..N-1]
 *   โหมด ข "เลือกสัปดาห์เอง"   -> ติ๊กเอง
 */

/** ปัดวันที่ลงไปหาวันจันทร์ของสัปดาห์นั้น — CHECK sched_start_is_mon บังคับไว้ */
export function snapToMonday(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7))
  return dt.toISOString().slice(0, 10)
}

export function isMonday(dateKey: string): boolean {
  return snapToMonday(dateKey) === dateKey
}

/** โหมด ก -> week_offsets */
export function rangeOffsets(weeks: number): number[] {
  const n = Math.max(1, Math.floor(weeks) || 0)
  return Array.from({ length: n }, (_, i) => i)
}

/** คลี่ออกเป็นวันที่จริง — ต้องตรงกับ schedule_occurrences() ใน DB เป๊ะ */
export function expand(startMonday: string, dayOfWeek: number, offsets: number[]): string[] {
  const [y, m, d] = startMonday.split('-').map(Number)
  return offsets
    .filter((o) => Number.isInteger(o) && o >= 0)
    .sort((a, b) => a - b)
    .map((o) => {
      const dt = new Date(Date.UTC(y, m - 1, d))
      dt.setUTCDate(dt.getUTCDate() + o * 7 + dayOfWeek)
      return dt.toISOString().slice(0, 10)
    })
}

/** ช่วงเวลาสองช่วงในวันเดียวกันชนกันไหม */
export function clashes(
  a: { day_of_week: number; start_time: string; end_time: string },
  b: { day_of_week: number; start_time: string; end_time: string }
): boolean {
  if (a.day_of_week !== b.day_of_week) return false
  return a.start_time < b.end_time && b.start_time < a.end_time
}

/** สัปดาห์ที่ทั้งสองช่วงมีคาบตรงกัน — ชนกันจริงต่อเมื่อสัปดาห์ทับกันด้วย */
export function sharedWeeks(aStart: string, aOff: number[], bStart: string, bOff: number[]): boolean {
  const toDate = (s: string, o: number) => {
    const [y, m, d] = s.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    dt.setUTCDate(dt.getUTCDate() + o * 7)
    return dt.toISOString().slice(0, 10)
  }
  const setA = new Set(aOff.map((o) => toDate(aStart, o)))
  return bOff.some((o) => setA.has(toDate(bStart, o)))
}
