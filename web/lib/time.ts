/**
 * เวลาไทยทั้งหมดอยู่ในไฟล์นี้ที่เดียว
 *
 * DB เก็บ timestamptz (UTC) แล้วแปลงเป็น Asia/Bangkok ตอนแสดงผลเสมอ (doc/TRAPS.md)
 * ไทยไม่มี DST จึงเป็น UTC+7 คงที่ ไม่ต้องพึ่ง tz database
 */
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000

/** ขอบเขตของ "วันนี้" ตามเวลาไทย คืนค่าเป็นจุดเวลา UTC ที่ใช้ query ได้ตรง ๆ */
export function bangkokToday() {
  const nowShifted = new Date(Date.now() + BKK_OFFSET_MS)
  const y = nowShifted.getUTCFullYear()
  const m = nowShifted.getUTCMonth()
  const d = nowShifted.getUTCDate()

  const start = new Date(Date.UTC(y, m, d) - BKK_OFFSET_MS)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const pad = (n: number) => String(n).padStart(2, '0')

  return {
    start,
    end,
    /** YYYY-MM-DD ตามวันไทย · ใช้ส่งให้ schedule_occurrences */
    dateKey: `${y}-${pad(m + 1)}-${pad(d)}`,
  }
}

const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const TH_DAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์']

/** "อังคาร 18 ส.ค." */
export function thaiDateLabel(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${TH_DAYS[dow]} ${d} ${TH_MONTHS[m - 1]}`
}

/** "09:00" ตามเวลาไทย */
export function bangkokTime(iso: string) {
  const t = new Date(new Date(iso).getTime() + BKK_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
}

/** "HH:MM" ของ time เปล่าจาก project_schedules ("09:00:00") */
export function clockLabel(t: string) {
  return t.slice(0, 5)
}

/** "เลย 2 วัน" · "อีก 40 นาที" — ใช้กับป้ายขวาที่โผล่เฉพาะตอนผิดปกติ */
export function overdueLabel(due: string, now = Date.now()) {
  const diffMs = now - new Date(due).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 0) return null
  if (mins < 60) return `เลย ${mins} นาที`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `เลย ${hours} ชม.`
  return `เลย ${Math.floor(hours / 24)} วัน`
}

/** โผล่เมื่อเหลือน้อยกว่าหนึ่งชั่วโมง */
export function soonLabel(at: string, now = Date.now()) {
  const mins = Math.floor((new Date(at).getTime() - now) / 60000)
  if (mins < 0 || mins >= 60) return null
  return `อีก ${mins} นาที`
}

/** วันจันทร์ของสัปดาห์ที่ dateKey อยู่ (YYYY-MM-DD) */
export function mondayOf(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = (dt.getUTCDay() + 6) % 7 // 0 = จันทร์
  dt.setUTCDate(dt.getUTCDate() - dow)
  return dt.toISOString().slice(0, 10)
}

/** บวกวันแบบปลอดภัยกับ YYYY-MM-DD */
export function addDays(dateKey: string, n: number) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

export function addMonths(dateKey: string, n: number) {
  const [y, m] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  return dt.toISOString().slice(0, 10)
}

/** "ส.ค. 2026" */
const TH_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
export function thaiMonthLabel(dateKey: string) {
  const [y, m] = dateKey.split('-').map(Number)
  return `${TH_MONTHS_FULL[m - 1]} ${y + 543}`
}

/** "17–23 ส.ค." */
export function thaiRangeLabel(fromKey: string, toKey: string) {
  const TH_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  const [, m1, d1] = fromKey.split('-').map(Number)
  const [, m2, d2] = toKey.split('-').map(Number)
  return m1 === m2
    ? `${d1}–${d2} ${TH_SHORT[m1 - 1]}`
    : `${d1} ${TH_SHORT[m1 - 1]} – ${d2} ${TH_SHORT[m2 - 1]}`
}

/** "09:00:00" -> จำนวนชั่วโมงแบบทศนิยม */
export function hourOf(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h + m / 60
}

/** เวลาไทยตอนนี้เป็นชั่วโมงทศนิยม + วันในสัปดาห์ (0=จันทร์) */
export function bangkokNow() {
  const t = new Date(Date.now() + 7 * 3600 * 1000)
  return {
    hour: t.getUTCHours() + t.getUTCMinutes() / 60,
    dow: (t.getUTCDay() + 6) % 7,
    dateKey: t.toISOString().slice(0, 10),
  }
}
