/**
 * แกะ markdown ที่ผู้ช่วยเขียนมาให้เป็นโครงสร้างข้อมูล
 *
 * โมเดลใส่ `**ตัวหนา**` กับ `- รายการ` มาเองโดยไม่ต้องสั่ง และห้ามไม่ค่อยอยู่
 * (เจ้าของเจอ `**09:00–12:00:**` โผล่เป็นดาวดิบบนมือถือ 31 ส.ค.)
 * ทางเลือกคือห้ามใน prompt หรือเรนเดอร์ให้ถูก — เจ้าของเลือกเรนเดอร์
 *
 * ไฟล์นี้**ไม่รู้จัก React เลย** ส่วนที่แปลงเป็น element อยู่ใน `markdown.tsx`
 * ที่แยกไว้เพราะตรรกะการแกะคือส่วนที่พังเงียบได้ และต้องมีเทสต์กำกับ
 *
 * ⚠️ **ไม่ใช่ CommonMark ทั้งสเปกโดยตั้งใจ** — รองรับแค่ที่โมเดลใช้จริง
 *    ของที่ไม่รองรับต้องออกมาเป็นข้อความเดิม ไม่ใช่หายไปหรือเพี้ยน
 */

/** ชิ้นส่วนในหนึ่งบรรทัด */
export type Token =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: Token[] }
  | { kind: 'em'; children: Token[] }
  | { kind: 'link'; href: string; label: string }

/** บล็อกเท่าที่โมเดลใช้จริง */
export type Block =
  | { kind: 'p'; lines: Token[][] }
  | { kind: 'h'; level: 2 | 3; tokens: Token[] }
  | { kind: 'list'; ordered: boolean; items: Token[][] }

const HEADING = /^(#{1,6})\s+(.*)$/
/** `- ` · `* ` · `• ` — โมเดลสลับใช้ทั้งสามแบบในคำตอบเดียวกันได้ */
const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBER = /^\s*\d{1,2}[.)]\s+(.*)$/

/**
 * แบ่งข้อความเป็นบล็อก
 *
 * บรรทัดว่างปิดย่อหน้า · บรรทัดที่ขึ้นต้นเหมือนกันติดกันรวมเป็นรายการเดียว
 */
export function parseBlocks(text: string): Block[] {
  const out: Block[] = []

  for (const line of text.split('\n')) {
    const bullet = line.match(BULLET)
    const number = bullet ? null : line.match(NUMBER)
    const heading = bullet || number ? null : line.match(HEADING)
    const last = out[out.length - 1]

    if (bullet || number) {
      const ordered = !bullet
      const item = tokenize((bullet ?? number)![1])
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item)
      else out.push({ kind: 'list', ordered, items: [item] })
    } else if (heading) {
      // สองระดับพอ — ฟองแชตกว้างไม่ถึงจอ ไม่มีที่ให้ไล่ลำดับหกชั้น
      out.push({ kind: 'h', level: heading[1].length <= 2 ? 2 : 3, tokens: tokenize(heading[2]) })
    } else if (line.trim() === '') {
      // ปิดย่อหน้าปัจจุบัน · ย่อหน้าว่างซ้อนกันไม่เกิดขึ้นเพราะเช็ก length ไว้
      if (last?.kind === 'p' && last.lines.length > 0) out.push({ kind: 'p', lines: [] })
    } else {
      const tokens = tokenize(line)
      if (last?.kind === 'p') last.lines.push(tokens)
      else out.push({ kind: 'p', lines: [tokens] })
    }
  }

  return out.filter((b) => b.kind !== 'p' || b.lines.length > 0)
}

/**
 * ชิ้นส่วนในบรรทัดเดียว
 *
 * เรียงตามลำดับความ "กินยาว" — `**` ต้องมาก่อน `*` ไม่งั้นตัวหนาจะกลายเป็น
 * ตัวเอียงที่มีดาวห้อยอยู่ข้างใน · โค้ดมาก่อนทุกอย่างเพราะข้างในต้องไม่ถูกตีความต่อ
 */
const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^)\s]+\))/

export function tokenize(line: string): Token[] {
  const out: Token[] = []

  for (const part of line.split(INLINE)) {
    if (!part) continue

    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      out.push({ kind: 'code', text: part.slice(1, -1) })
    } else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      out.push({ kind: 'strong', children: tokenize(part.slice(2, -2)) })
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      out.push({ kind: 'em', children: tokenize(part.slice(1, -1)) })
    } else if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
      out.push({ kind: 'em', children: tokenize(part.slice(1, -1)) })
    } else if (part.startsWith('[') && part.includes('](')) {
      const at = part.indexOf('](')
      out.push({ kind: 'link', href: part.slice(at + 2, -1), label: part.slice(1, at) })
    } else {
      out.push(...linkify(part))
    }
  }

  return out
}

/** URL เต็ม · อีเมล · หรือเส้นทางภายในที่เขียนมาโดด ๆ ไม่ได้ใส่วงเล็บ markdown */
const BARE =
  /(https?:\/\/[^\s<>"')\]]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?<![\w/])\/[A-Za-z0-9][\w/-]*)/g

/** วรรคตอนท้ายลิงก์ที่คนเขียนติดมา ไม่ใช่ส่วนหนึ่งของ URL */
const TRAILING = /[.,;:!?)\]}]+$/

/**
 * ลิงก์ที่เขียนมาโดด ๆ
 *
 * ที่นี่แค่บอกว่า "ตรงนี้เป็นลิงก์" · การตัดสินว่าเส้นทางภายในมีจริงไหม
 * อยู่ที่ตอนเรนเดอร์ ซึ่งเรียก `isRealRoute` — แยกกันเพราะไฟล์นี้ควรบอกได้ว่า
 * ข้อความมีโครงสร้างอะไรบ้าง โดยไม่ต้องรู้ว่าแอปมีหน้าอะไร
 */
function linkify(text: string): Token[] {
  const out: Token[] = []
  let last = 0

  for (const m of text.matchAll(BARE)) {
    const raw = m[0]
    const at = m.index ?? 0
    const trail = raw.match(TRAILING)?.[0] ?? ''
    const href = trail ? raw.slice(0, -trail.length) : raw
    if (!href) continue

    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) })
    out.push({ kind: 'link', href, label: href })
    if (trail) out.push({ kind: 'text', text: trail })
    last = at + raw.length
  }

  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}
