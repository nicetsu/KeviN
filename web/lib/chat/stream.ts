/**
 * สายเหตุการณ์ของ `/api/chat` — หนึ่งบรรทัดคือหนึ่งเหตุการณ์ (NDJSON)
 *
 * แยกออกมาจากหน้าจอเพราะการต่อชิ้นเป็นบรรทัดคือจุดที่พลาดแล้ว**เงียบ**:
 * ก้อนที่เครือข่ายส่งมาไม่ได้จบตรงบรรทัดพอดี ตัวอักษรตัวสุดท้ายของก้อนหนึ่ง
 * มักเป็นครึ่งบรรทัดที่ต้องรอก้อนถัดไป · ถ้าอ่านทีละก้อนแล้ว `JSON.parse` ตรง ๆ
 * บางประโยคจะหายไปโดยที่ทุกอย่างดูเหมือนทำงานปกติ
 *
 * ⚠️ **`delta` ยังไม่ผ่านด่านตรวจลิงก์** (`lib/chat/links.ts`) — ลิงก์ถูกหั่นข้ามก้อนได้
 *    ตรวจทีละชิ้นจึงไม่มีทางถูก · หน้าจอต้องเอา `reply` ใน `done` ไป**แทน**
 *    ข้อความที่ไหลมาทั้งหมด สิ่งที่ค้างบนจอจึงเป็นฉบับที่ผ่านด่านแล้วเสมอ
 */
import type { Draft } from '../drafts'

export type ChatEvent =
  /** ข้อความที่โมเดลพิมพ์เพิ่ม · ต่อท้ายของเดิม */
  | { t: 'delta'; v: string }
  /** ทิ้งสิ่งที่พิมพ์ไปในรอบนี้ — โมเดลเปลี่ยนใจไปเรียก tool แทน */
  | { t: 'reset' }
  /** ร่างขึ้นแล้ว · มาถึงก่อนคำตอบจบ */
  | { t: 'draft'; v: Draft }
  | { t: 'done'; conversationId: string; reply: string; drafts?: Draft[]; warning?: string }
  | { t: 'error'; error: string; quota?: boolean }

const KINDS = ['delta', 'reset', 'draft', 'done', 'error']

/** บรรทัดที่อ่านไม่ออกหรือไม่รู้จัก **ข้ามไป ไม่ล้มทั้งสาย** */
function parseLine(line: string): ChatEvent | null {
  const s = line.trim()
  if (!s) return null
  try {
    const v: unknown = JSON.parse(s)
    if (!v || typeof v !== 'object') return null
    const t = (v as { t?: unknown }).t
    if (typeof t !== 'string' || !KINDS.includes(t)) return null
    return v as ChatEvent
  } catch {
    return null
  }
}

/**
 * ตัวต่อชิ้นเป็นบรรทัด — ป้อนก้อนดิบเข้าไป ได้เหตุการณ์ที่ครบบรรทัดแล้วออกมา
 *
 * `end()` คายบรรทัดสุดท้ายที่ไม่ได้ปิดท้ายด้วยขึ้นบรรทัดใหม่ · ฝั่งเซิร์ฟเวอร์
 * ปิดท้ายทุกบรรทัดอยู่แล้ว แต่ตัวอ่านไม่ควรพึ่งความประพฤติดีของอีกฝั่ง
 */
export function ndjsonParser() {
  let buffer = ''

  return {
    push(chunk: string): ChatEvent[] {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      return lines.map(parseLine).filter((e): e is ChatEvent => e !== null)
    },
    end(): ChatEvent[] {
      const rest = buffer
      buffer = ''
      const e = parseLine(rest)
      return e ? [e] : []
    },
  }
}
