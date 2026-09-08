/**
 * โครงร่วมของชุดวัดความแม่น — ใช้ทั้งฝั่งแชตและฝั่งโทร
 *
 * ⚠️ **นี่ไม่ใช่เทสต์หน่วย** มันยิงโมเดลจริงและกินโควตา จึงตั้งชื่อไม่ลงท้ายด้วย
 *    `.test.ts` เพื่อไม่ให้ `npm test` หยิบไปรัน · รันด้วยมือเมื่อจะวัดเท่านั้น
 *
 * สิ่งที่วัดคือ **โมเดล + prompt + ชั้นเสนอ** รวมกัน ไม่ใช่แค่โค้ด
 * ตรรกะล้วนมีเทสต์ของตัวเองอยู่แล้ว (`test/propose.test.ts` · `test/drafts.test.ts`)
 */
import type { Draft, DraftAction } from '../../lib/drafts'
import type { InlineImage } from '../../lib/chat/image'

export type Call = {
  name: string
  args: Record<string, unknown>
  /** ผลของ call นี้ — ต้องเก็บไว้ ไม่งั้นแยกไม่ออกว่า call ซ้ำได้ร่างซ้ำหรือโดนปฏิเสธ */
  outcome?: string
}

/** ผลของหนึ่งประโยคที่พูดเข้าไป */
export type Turn = {
  calls: Call[]
  drafts: Draft[]
  reply: string
  error?: string
}

export type Case = {
  id: string
  title: string
  say: string
  /**
   * ประโยคที่พูด **ต่อจากคำตอบแรกในบทสนทนาเดียวกัน**
   *
   * มีไว้วัดสิ่งที่วัดด้วยประโยคเดียวไม่ได้เลย — โดยเฉพาะการพูดแก้ร่างใบเดิม
   * (`propose_update_draft`) ซึ่งต้องมีร่างค้างอยู่ก่อนถึงจะมีอะไรให้แก้
   * · `check` ได้รับผลของ**เทิร์นสุดท้าย** โดยที่ `calls` รวมของทั้งสองเทิร์น
   */
  then?: string
  /**
   * รูปที่แนบไปกับประโยคแรก — **โหมดแชตเท่านั้น**
   *
   * เป็นฟังก์ชันไม่ใช่ค่า เพื่อให้รูปถูกสร้างเฉพาะตอนที่เคสนั้นถูกเลือกจริง ๆ
   * · เคสที่มีรูป **ห้ามใส่ใน `VOICE_IDS`** เพราะ Live API รับรูปไม่ได้เลย
   */
  image?: () => Promise<InlineImage>
  want: string
  /** คืนรายการข้อผิด · ว่าง = ผ่าน */
  check: (t: Turn) => string[]
}

// ---- ตัวช่วยตรวจ ---------------------------------------------------------

export const first = (t: Turn): Draft | undefined => t.drafts[0]

export const acted = (t: Turn): DraftAction | undefined => first(t)?.action

export const called = (t: Turn, name: string) => t.calls.some((c) => c.name === name)

export const proposeCalls = (t: Turn) => t.calls.filter((c) => c.name.startsWith('propose_'))

/** ISO → "YYYY-MM-DD HH:mm" เวลาไทย · ใช้เทียบและใช้แสดงผล */
export function th(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/**
 * คำที่แปลว่า "ทำให้แล้ว" — prompt ห้ามไว้ชัดเจน เพราะยังไม่ได้บันทึกอะไรเลย
 * ผู้ใช้ที่เชื่อแล้วเดินจากไปโดยไม่กดยืนยัน คือข้อมูลที่หายโดยไม่มีใครรู้
 */
const CLAIMED_DONE = [
  'บันทึกให้แล้ว', 'บันทึกแล้ว', 'เพิ่มให้แล้ว', 'เพิ่มแล้ว', 'เรียบร้อยแล้ว',
  'ติ๊กให้แล้ว', 'แก้ให้แล้ว', 'เลื่อนให้แล้ว', 'ลบให้แล้ว', 'จัดการให้แล้ว',
  'เก็บให้แล้ว', 'ย้ายให้แล้ว', 'ใส่ให้แล้ว',
]

/**
 * ถอดช่องว่างออกก่อนหาคำ — **จำเป็นเฉพาะฝั่งโทร แต่ต้องใช้ทุกที่ที่หาคำไทย**
 *
 * ⚠️ คำบรรยายที่ Live API ส่งกลับมา **แทรกช่องว่างกลางคำ** ตามจังหวะที่มันพูด
 *    เช่น `ถูกเก็บ เข้าคลัง` · `บันทึก ให้แล้ว ครับ` · ภาษาไทยไม่มีช่องว่าง
 *    ระหว่างคำอยู่แล้ว การหาคำแบบตรงตัวจึงพลาดแบบสุ่มตามจังหวะการพูด
 *
 * ⚠️ **นี่ไม่ใช่เรื่องความสวยของตัวเลข** — ก่อนแก้ข้อนี้ `fakeSuccessWords`
 *    ฝั่งโทร**มองไม่เห็น** ประโยคอย่าง "บันทึก ให้แล้ว ครับ" ซึ่งเป็นคำโกหก
 *    ที่ด่านนี้มีไว้จับโดยเฉพาะ · แปลว่าตัวเลขฝั่งโทรที่ผ่านมาหลวมกว่าฝั่งแชต
 *    โดยไม่มีใครรู้ (เจอ 8 ก.ย. 2026)
 *
 * ปลอดภัยที่จะถอดทิ้ง เพราะการเชื่อมคำที่ถูกหั่นกลับเข้าหากันมีแต่ทำให้
 * **จับได้มากขึ้น** ไม่ใช่ปล่อยผ่านมากขึ้น
 */
export const spoken = (reply: string): string => reply.replace(/\s+/g, '')

export function fakeSuccessWords(reply: string): string[] {
  const flat = spoken(reply)
  return CLAIMED_DONE.filter((w) => flat.includes(spoken(w)))
}

/** เวลาที่ส่งเข้า `propose_` ต้องเป็นเวลาไทยเปล่า ๆ ห้ามเป็น ISO ที่แปลงเองแล้ว */
export function utcLeaks(t: Turn): string[] {
  const bad: string[] = []
  for (const c of proposeCalls(t)) {
    for (const key of ['due', 'remind', 'starts', 'ends']) {
      const v = c.args[key]
      if (typeof v !== 'string' || v === '' || v === '-') continue
      if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(v)) bad.push(`${c.name}.${key} = "${v}"`)
    }
  }
  return bad
}

// ---- รายงาน --------------------------------------------------------------

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const OFF = '\x1b[0m'

export function describeDraft(d: Draft): string {
  const a = d.action
  const bits: string[] = [`${d.heading} · “${d.title}”`]
  if (a.kind === 'add_item') {
    bits.push(`ชนิด=${a.type}`)
    if (a.dueAt) bits.push(`ส่ง=${th(a.dueAt)}`)
    if (a.remindAt) bits.push(`เตือน=${th(a.remindAt)}`)
  }
  if (a.kind === 'edit_item') {
    if (a.title !== undefined) bits.push(`ชื่อใหม่=${a.title}`)
    if (a.dueAt !== undefined) bits.push(`ส่ง=${th(a.dueAt)}`)
    if (a.remindAt !== undefined) bits.push(`เตือน=${th(a.remindAt)}`)
    if (a.projectId !== undefined) bits.push(`ย้ายวิชา`)
  }
  if (a.kind === 'complete_item') bits.push(a.done ? 'ติ๊กเสร็จ' : 'เอาติ๊กออก')
  if (a.kind === 'add_event') bits.push(`${th(a.startsAt)} → ${th(a.endsAt)}`, a.location ?? '')
  const lines = d.lines.map((l) => `${l.label}: ${l.value}`).join(' · ')
  return `${bits.filter(Boolean).join(' · ')}\n        ${DIM}${lines}${OFF}`
}

export type Result = { case: Case; turn: Turn; problems: string[] }

export function report(label: string, results: Result[]) {
  console.log(`\n${'═'.repeat(72)}\n  ${label}\n${'═'.repeat(72)}`)
  for (const r of results) {
    const ok = r.problems.length === 0
    console.log(`\n${ok ? GREEN + '  ผ่าน ' : RED + ' ไม่ผ่าน'}${OFF} [${r.case.id}] ${r.case.title}`)
    console.log(`      ${DIM}พูด :${OFF} ${r.case.say}`)
    console.log(`      ${DIM}ควร :${OFF} ${r.case.want}`)
    if (r.turn.calls.length === 0) console.log(`      ${DIM}tool:${OFF} (ไม่เรียก tool เลย)`)
    for (const c of r.turn.calls) {
      const args = Object.entries(c.args)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 42) : JSON.stringify(v)}`)
        .join(' ')
      console.log(`      ${DIM}tool:${OFF} ${c.name} ${DIM}${args}${OFF} → ${c.outcome ?? '?'}`)
    }
    for (const d of r.turn.drafts) console.log(`      ${DIM}ร่าง :${OFF} ${describeDraft(d)}`)
    if (r.turn.reply) console.log(`      ${DIM}ตอบ :${OFF} ${r.turn.reply.replace(/\n+/g, ' ').slice(0, 220)}`)
    for (const p of r.problems) console.log(`      ${RED}✗ ${p}${OFF}`)
  }
  const pass = results.filter((r) => r.problems.length === 0).length
  console.log(`\n  ${label} — ผ่าน ${pass}/${results.length}`)
  return { pass, total: results.length }
}
