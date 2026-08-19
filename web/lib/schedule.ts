/** ย่อช่วงเวลาประจำให้อ่านได้ในบรรทัดเดียว เช่น "จ. 09:00 · พฤ. 13:00" */
const DAY_ABBR = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.']

export type Slot = {
  day_of_week: number
  start_time: string
  end_time: string
  location: string | null
  label: string | null
  week_offsets: number[] | null
}

export function dayAbbr(dow: number) {
  return DAY_ABBR[dow] ?? '?'
}

/** บรรทัดย่อสำหรับหน้าคลัง — เห็นว่าวิชานี้เรียนวันไหนโดยไม่ต้องเข้าไป */
export function summarize(slots: Slot[]) {
  return slots
    .slice()
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
    .map((s) => `${dayAbbr(s.day_of_week)} ${s.start_time.slice(0, 5)}`)
    .join(' · ')
}

/** บรรทัดเต็มสำหรับหน้า project — "จ. 09:00–11:00 · E11-S603 · 17 สัปดาห์" */
export function describe(s: Slot) {
  const weeks = s.week_offsets?.length
  return [
    `${dayAbbr(s.day_of_week)} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`,
    s.location,
    s.label,
    weeks ? `${weeks} สัปดาห์` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
