/**
 * รูปเดียวที่ปฏิทินและ hero กิน — คาบเรียนกับ event ปนกันได้โดยไม่ต้องแยกทาง
 *
 * มาจาก `calendar_entries(from, to)` ใน DB ซึ่งรวมสองแหล่งให้แล้ว
 * **ห้ามคำนวณเองว่าคาบไหนตกวันไหน** และห้ามไปดึง `events` มาปนเองฝั่งเว็บ —
 * ถ้าทำ ตรรกะการหั่น event ข้ามคืนจะต้องมีสองชุดที่ต้องดูแลให้ตรงกัน
 */
export type EntryKind = 'class' | 'event'

export type CalendarEntry = {
  kind: EntryKind
  source_id: string
  project_id: string
  project_name: string
  area_name: string
  /** คาบเรียนใช้ชื่อ project · event ใช้ชื่อของตัวเอง */
  title: string
  /** YYYY-MM-DD ตามวันไทย */
  occurs_on: string
  start_time: string
  /** เป็น "24:00:00" ได้ เมื่อบล็อกวิ่งชนเที่ยงคืนของ event ข้ามวัน */
  end_time: string
  location: string | null
  label: string | null
}

/**
 * คีย์ที่ไม่ชนกัน
 *
 * ใช้ `source_id` อย่างเดียวไม่พอสองชั้น — คาบเรียนใบเดียวโผล่หลายวัน
 * และ event ข้ามคืนใบเดียวก็ถูกหั่นเป็นหลายบล็อกที่ใช้ id เดียวกัน
 * ส่วน kind กันกรณี schedule กับ event บังเอิญได้ uuid ชนกัน (ทางทฤษฎี)
 */
export function entryKey(e: CalendarEntry) {
  return `${e.kind}-${e.source_id}-${e.occurs_on}`
}

/**
 * คาบเรียนกับกิจกรรมใช้คนละสี (เจ้าของเคาะ 21 ส.ค. หลังเห็นของจริง)
 *
 * รอบแรกเคาะให้ใช้สีเดียวกันแล้วนิยาม `--sched` ใหม่เป็น "ช่วงเวลาที่ถูกจองไว้"
 * เพราะกลัวว่าสีที่ห้าจะแยกไม่ออกบนบล็อกเล็ก · แต่พอขึ้นจอจริงปัญหากลับตรงข้าม
 * คือมองไม่ออกเลยว่าบล็อกไหนเป็นคาบเรียน บล็อกไหนเป็นกิจกรรม ทั้งที่มันคนละเรื่องกัน
 *
 * `--event` อยู่ที่ 45° ห่างจากม่วงแบรนด์ 152° ผ่านกฎระยะห่างสีใน doc/DESIGN.md
 */
export const ENTRY_COLOR: Record<EntryKind, string> = {
  class: 'var(--sched)',
  event: 'var(--event)',
}

/** "09:00–12:30" · ตัดวินาทีทิ้ง และแปลง 24:00 ให้อ่านรู้เรื่อง */
export function spanLabel(e: Pick<CalendarEntry, 'start_time' | 'end_time'>) {
  return `${e.start_time.slice(0, 5)}–${clip(e.end_time)}`
}

/** "24:00:00" คือเที่ยงคืนของวันถัดไป ไม่ใช่เวลาที่มีอยู่จริงบนนาฬิกา */
function clip(t: string) {
  return t.startsWith('24') ? '24:00' : t.slice(0, 5)
}

/** จุดเวลาจริงของบล็อก (ms) · ใช้เทียบกับ "ตอนนี้" ได้ตรง ๆ */
export function entryStartMs(e: CalendarEntry) {
  return new Date(`${e.occurs_on}T${e.start_time}+07:00`).getTime()
}

/**
 * เวลาจบเป็น ms
 *
 * `24:00:00` ประกอบเป็น Date ตรง ๆ ไม่ได้ (`Invalid Date`) ต้องแปลงเป็น
 * เที่ยงคืนของวันถัดไปเอง — บล็อกที่วิ่งชนเที่ยงคืนของ event ข้ามวันเจอเคสนี้ทุกใบ
 */
export function entryEndMs(e: CalendarEntry) {
  if (e.end_time.startsWith('24')) {
    return new Date(`${e.occurs_on}T00:00:00+07:00`).getTime() + 24 * 3600 * 1000
  }
  return new Date(`${e.occurs_on}T${e.end_time}+07:00`).getTime()
}
