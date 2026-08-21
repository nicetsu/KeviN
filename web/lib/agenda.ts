import { addDays } from './time'

/**
 * กำหนดการภายใน event — เป็นรายการที่อ่าน ไม่ใช่วัตถุบนปฏิทิน
 *
 * เวลาจึงเป็น `time` เปล่า และ `day_offset` นับจากวันแรกของ event
 * (ไม่ใช่ `date` เพราะถ้าเลื่อนวันจัดงาน กำหนดการต้องเลื่อนตาม ไม่ค้างวันเดิม)
 */
export type AgendaRow = {
  id: string
  day_offset: number
  start_time: string
  end_time: string | null
  title: string
}

export type AgendaLine = AgendaRow & {
  /** เวลาจบที่ใช้แสดงจริง หลังเติมค่าที่เว้นว่างแล้ว · null = ยังไม่รู้ */
  endsAt: string | null
}

/**
 * เติมเวลาจบให้บรรทัดที่เว้นว่าง
 *
 * `end_time` ไม่บังคับโดยตั้งใจ — กำหนดการส่วนใหญ่ต่อกันสนิท (จบ 09:50
 * แล้วเริ่ม 09:50 พอดี) เวลาจบจึงเป็นข้อมูลซ้ำ · แต่บางงานมีช่องว่างจริง
 * เช่นพักเที่ยงที่ผู้จัดไม่ได้เขียนไว้ ซึ่งถ้าไม่มีที่เก็บเวลาจบ จะต้องแอบใส่
 * บรรทัด "พัก" ปลอมเข้าไปในข้อมูล
 *
 * ลำดับการเติม: เวลาจบที่กรอกไว้เอง → เวลาเริ่มของบรรทัดถัดไป**ในวันเดียวกัน**
 * → เวลาจบของ event (เฉพาะบรรทัดสุดท้ายจริง ๆ)
 *
 * ที่ไม่ข้ามวันไปหยิบเวลาเริ่มของบรรทัดแรกวันถัดไป เพราะนั่นจะแปลว่ากิจกรรม
 * วิ่งข้ามคืนไปด้วย ซึ่งแทบไม่เคยเป็นความจริง — ปล่อยเป็น null แล้วแสดง
 * แค่เวลาเริ่มตรงไปตรงมากว่าเดา
 */
export function resolveAgenda(rows: AgendaRow[], eventEndClock: string | null): AgendaLine[] {
  const sorted = rows
    .slice()
    .sort((a, b) => a.day_offset - b.day_offset || a.start_time.localeCompare(b.start_time))

  return sorted.map((row, i) => {
    if (row.end_time) return { ...row, endsAt: row.end_time }

    const next = sorted[i + 1]
    if (next && next.day_offset === row.day_offset) return { ...row, endsAt: next.start_time }
    if (i === sorted.length - 1) return { ...row, endsAt: eventEndClock }
    return { ...row, endsAt: null }
  })
}

/** วันที่จริงของ day_offset · `startKey` คือวันแรกของ event ตามวันไทย */
export function agendaDayKey(startKey: string, dayOffset: number) {
  return dayOffset === 0 ? startKey : addDays(startKey, dayOffset)
}

/** "09:30 – 09:50" หรือ "09:30" ถ้าไม่รู้เวลาจบ */
export function agendaClock(line: AgendaLine) {
  const from = line.start_time.slice(0, 5)
  return line.endsAt ? `${from} – ${line.endsAt.slice(0, 5)}` : from
}
