/**
 * ตีความบรรทัดเดียวเป็น item · ล้วน ไม่มี side effect จึงเทสต์ได้
 *
 * หน้าเพิ่มเร็ว (S8) ตีความให้ก่อน แล้วโชว์ให้แก้ ไม่บันทึกทันที
 * เดาผิดได้ แต่ต้องเดาแล้วให้เห็นว่าเดาอะไร
 *
 * กฎการเดาชนิด ตรงกับ doc/CLAUDE-PROJECT-PROMPT.md:
 *   มีเวลาเจาะจง            -> reminder
 *   มีวันแต่ไม่มีเวลา        -> task + due_at
 *   ไม่มีทั้งคู่              -> task ไม่กำหนดวัน
 */

export type ParseInput = {
  text: string
  /** วันนี้ตามเวลาไทย YYYY-MM-DD */
  today: string
  projects: { id: string; name: string; aliases?: string[] }[]
}

export type Parsed = {
  title: string
  type: 'task' | 'reminder'
  projectId: string | null
  /** YYYY-MM-DD */
  date: string | null
  /** HH:MM */
  time: string | null
  /** ส่วนของข้อความที่ถูกตีความไปแล้ว ไว้โชว์ว่าเข้าใจอะไร */
  matched: { project?: string; date?: string; time?: string }
}

const DOW_WORDS: Record<string, number> = {
  จันทร์: 0, อังคาร: 1, พุธ: 2, พฤหัสบดี: 3, พฤหัส: 3, ศุกร์: 4, เสาร์: 5, อาทิตย์: 6,
}

const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

const dowOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // 0 = จันทร์
}

const pad = (n: number) => String(n).padStart(2, '0')

/** สร้างคำเรียกสั้นจากชื่อวิชา เช่น "คณิตศาสตร์วิศวกรรม II" -> คำที่ยาวพอจะใช้ค้น */
function tokensOf(name: string): string[] {
  return name
    .split(/[\s·()/,-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
}

export function parseQuickAdd({ text, today, projects }: ParseInput): Parsed {
  let rest = ` ${text.trim()} `
  const matched: Parsed['matched'] = {}

  const eat = (re: RegExp): RegExpMatchArray | null => {
    const m = rest.match(re)
    if (m) rest = rest.replace(m[0], ' ')
    return m
  }

  // ---- เวลา ----
  let time: string | null = null
  const hhmm = eat(/(?<!\d)(\d{1,2})[:.](\d{2})(?!\d)/)
  if (hhmm) {
    const h = Math.min(23, Number(hhmm[1]))
    const mi = Math.min(59, Number(hhmm[2]))
    time = `${pad(h)}:${pad(mi)}`
    matched.time = hhmm[0].trim()
  } else {
    const naive = eat(/(?<!\d)(\d{1,2})\s*โมง(เช้า|เย็น)?/)
    if (naive) {
      let h = Number(naive[1])
      if (naive[2] === 'เย็น' && h < 12) h += 12
      time = `${pad(Math.min(23, h))}:00`
      matched.time = naive[0].trim()
    }
  }

  // ---- วันที่ ----
  let date: string | null = null

  const rel = eat(/(มะรืนนี้|มะรืน|พรุ่งนี้|วันนี้)/)
  if (rel) {
    const w = rel[1]
    date = addDays(today, w === 'วันนี้' ? 0 : w === 'พรุ่งนี้' ? 1 : 2)
    matched.date = w
  }

  if (!date) {
    const dow = eat(/(?:วัน)?(จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)(?:\s*หน้า)?/)
    if (dow) {
      const want = DOW_WORDS[dow[1]]
      const cur = dowOf(today)
      let delta = (want - cur + 7) % 7
      // ชี้ไปครั้งถัดไปเสมอ · "พุธ" ตอนวันพุธ = พุธหน้า
      // ส่วนคำว่า "หน้า" ไม่ต้องบวกซ้ำ เพราะ delta ชี้ไปสัปดาห์ถัดไปอยู่แล้ว
      if (delta === 0) delta = 7
      date = addDays(today, delta)
      matched.date = dow[0].trim()
    }
  }

  if (!date) {
    // "22/8" หรือ "22 ส.ค."
    const TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
    const slash = eat(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/)
    if (slash) {
      const [, d, m] = slash
      const y = Number(today.slice(0, 4))
      date = `${y}-${pad(Number(m))}-${pad(Number(d))}`
      matched.date = slash[0].trim()
    } else {
      const thm = eat(new RegExp(`(?<!\\d)(\\d{1,2})\\s*(${TH.map((x) => x.replace(/\./g, '\\.')).join('|')})`))
      if (thm) {
        const mi = TH.indexOf(thm[2]) + 1
        date = `${today.slice(0, 4)}-${pad(mi)}-${pad(Number(thm[1]))}`
        matched.date = thm[0].trim()
      }
    }
  }

  // ---- วิชา ----
  let projectId: string | null = null
  const lower = rest.toLowerCase()
  let best: { id: string; token: string } | null = null

  for (const p of projects) {
    const candidates = [...(p.aliases ?? []), ...tokensOf(p.name)]
    for (const c of candidates) {
      if (!c) continue
      if (lower.includes(c.toLowerCase()) && (!best || c.length > best.token.length)) {
        best = { id: p.id, token: c }
      }
    }
  }
  if (best) {
    projectId = best.id
    matched.project = best.token
    const i = rest.toLowerCase().indexOf(best.token.toLowerCase())
    rest = rest.slice(0, i) + ' ' + rest.slice(i + best.token.length)
  }

  const title = rest.replace(/\s+/g, ' ').trim()

  return {
    title,
    // มีเวลาเจาะจง = ต้องเตือน · มีแค่วัน = งานที่มีกำหนดส่ง
    type: time ? 'reminder' : 'task',
    projectId,
    date,
    time,
    matched,
  }
}
