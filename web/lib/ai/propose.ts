/**
 * ชั้นเสนอ — tool ที่คืน "ร่างการกระทำ" ไม่ใช่ tool ที่ทำ
 *
 * **นี่คือส่วนที่ทำให้ผู้ช่วยแก้ข้อมูลได้โดยที่ชั้น tool ยังเขียนไม่ได้**
 * ทุกตัวในไฟล์นี้อ่าน DB ได้อย่างเดียว (ผ่าน `ReadOnlyDb` ตัวเดิม) แล้วคืน `Draft`
 * กลับไปให้เว็บวาดเป็นการ์ด · การเขียนจริงเกิดที่ `app/actions/propose.ts`
 * ตอนผู้ใช้กดยืนยัน ซึ่งอยู่คนละชั้นและตรวจทุกอย่างใหม่หมด
 *
 * ⚠️ **ห้ามให้ไฟล์นี้เขียนอะไรได้เด็ดขาด** — `test/guard.test.ts` อ่านซอร์ส
 *    ของทุกไฟล์ใน `lib/ai/` แล้วพังถ้าเจอทางเขียน · ถ้าวันไหนต้องแก้เทสต์นั้น
 *    เพื่อให้ผ่าน แปลว่าเดินผิดทางแล้ว (doc/WRITE.md §2)
 *
 * ⚠️ **ไม่มีร่างสำหรับลบ** — ลบวิชาไม่ได้ (cascade ทำให้งานหายทั้งกอง)
 *    ลบถาวรไม่ได้ · แตะ `project_schedules` ไม่ได้ (โครงที่ทุกอย่างอ้างอิง)
 *    ที่ทำได้มากสุดคือ **เก็บเข้าคลัง** ซึ่งกู้คืนได้ 7 วัน
 */
import type { Draft, DraftAction, DraftLine } from '../drafts'
import type { ReadOnlyDb } from './db'
import { areaIsVisible } from './visibility'
import { ToolFetchError } from './db'

export type ProposeCtx = {
  db: ReadOnlyDb
  /** วันนี้ตามเวลาไทย YYYY-MM-DD — ส่งเข้ามา ไม่ให้อ่านนาฬิกาเอง จะได้เทสต์ได้ */
  today: string
  /**
   * ร่างที่ยังค้างอยู่บนจอตอนนี้ — **เดินทางมาจากเบราว์เซอร์**
   *
   * ร่างไม่ได้ลง DB (doc/WRITE.md §8) เซิร์ฟเวอร์จึงไม่มีทางรู้ว่าจออะไรค้างอยู่
   * ถ้าไม่ส่งมาให้ · `propose_update_draft` เป็นตัวเดียวที่ใช้ค่านี้
   *
   * ⚠️ **เชื่อไม่ได้** ทั้งก้อนมาจากฝั่งจอ ใครแก้ก็ได้ · ตัวแก้ร่างจึงไม่ก๊อป
   *    ค่าจากที่นี่ไปใช้ตรง ๆ แต่ **เอาไปเรียก `build` ของ tool ตัวเดิมใหม่ทั้งใบ**
   *    การตรวจทุกข้อรวมถึงตัวกรอง Area จึงเกิดซ้ำเหมือนร่างใบแรกทุกประการ
   */
  openDrafts?: readonly Draft[]
}

export class BadProposal extends Error {}

// --------------------------------------------------------------------------
// เวลา
// --------------------------------------------------------------------------

const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/**
 * รับ `YYYY-MM-DD` หรือ `YYYY-MM-DD HH:mm` **ตามเวลาไทย** แล้วคืน ISO
 *
 * ⚠️ ให้โมเดลส่งเวลาไทยมาตรง ๆ ไม่ใช่ ISO — มันคำนวณ timezone ผิดบ่อยกว่าที่คิด
 *    และผิดแบบเงียบ ๆ (ได้เวลาที่ดูสมเหตุผลแต่เหลื่อม 7 ชั่วโมง)
 *    การแปลงเกิดที่นี่ที่เดียว จะได้ผิดหรือถูกพร้อมกันทั้งระบบ
 */
export function thaiToIso(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(raw.trim())
  if (!m) throw new BadProposal(`เวลา "${raw}" ต้องเป็น YYYY-MM-DD หรือ YYYY-MM-DD HH:mm`)
  const [, y, mo, d, hh, mm] = m
  const iso = `${y}-${mo}-${d}T${hh ?? '00'}:${mm ?? '00'}:00+07:00`
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) throw new BadProposal(`เวลา "${raw}" ไม่มีอยู่จริง`)
  return t.toISOString()
}

/**
 * ทางกลับของ `thaiToIso` — ISO → `YYYY-MM-DD HH:mm` **เวลาไทย**
 *
 * มีไว้ให้ `propose_update_draft` ประกอบอินพุตของร่างใบเดิมกลับขึ้นมาได้
 * แล้วส่งเข้า `build` ตัวเดิมใหม่ทั้งใบ · ถ้าตัวแก้ร่างเขียนตรรกะการประกอบ
 * ร่างเองอีกชุด มันจะเพี้ยนจากตัวจริงทันทีที่ใครแก้ตัวใดตัวหนึ่ง
 */
export function thaiInput(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 7 * 3600 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` +
    ` ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
  )
}

/** "พฤ. 4 ก.ย. 23:59" — รูปที่ผู้ใช้ทานได้ ไม่ใช่ ISO ที่อ่านไม่ออก */
export function thaiLabel(iso: string, withTime = true): string {
  const t = new Date(new Date(iso).getTime() + 7 * 3600 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${TH_DAYS[t.getUTCDay()]} ${t.getUTCDate()} ${TH_MONTHS[t.getUTCMonth()]}`
  return withTime ? `${date} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` : date
}

// --------------------------------------------------------------------------
// ตัวช่วยอ่านอินพุตจากโมเดล
// --------------------------------------------------------------------------

const text = (raw: Record<string, unknown>, key: string, max: number, required = true): string => {
  const v = raw[key]
  if (typeof v !== 'string' || v.trim() === '') {
    if (required) throw new BadProposal(`ต้องมี ${key}`)
    return ''
  }
  const s = v.trim()
  if (s.length > max) throw new BadProposal(`${key} ยาวเกิน ${max} ตัวอักษร`)
  return s
}

const uuid = (raw: Record<string, unknown>, key: string): string => {
  const v = raw[key]
  if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v)) {
    throw new BadProposal(`${key} ต้องเป็น id ที่ได้จาก tool อื่นก่อน`)
  }
  return v
}

/**
 * ⚠️ **ต้องรับสตริง `"true"`/`"false"` ด้วย** — โมเดลส่งบูลีนมาเป็นสตริงเป็นประจำ
 *    ไม่ว่า schema จะประกาศชนิดอะไรไว้ก็ตาม
 *
 *    เคยรับเฉพาะบูลีนแท้ แล้วคู่กับ schema ที่ประกาศ `type: 'string'` ผลคือ
 *    **ค่าที่ถูกต้องถูกปฏิเสธทุกครั้ง** · ฝั่งแชตรอดมาได้เพราะยิงซ้ำจนบังเอิญ
 *    ส่งบูลีนแท้ (กิน 2–3 รอบจากเพดาน 4) · **ฝั่งเสียงยอมแพ้แล้วบอกผู้ใช้ว่า
 *    "เกิดข้อผิดพลาดบนหน้าจอ" ทั้งที่ไม่มีการ์ดขึ้นเลย** (เจอ 4 ก.ย. 2026)
 */
const bool = (raw: Record<string, unknown>, key: string, fallback: boolean): boolean => {
  const v = raw[key]
  if (v === undefined || v === null || v === '') return fallback
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  throw new BadProposal(`${key} ต้องเป็น true หรือ false`)
}

// --------------------------------------------------------------------------
// หาของที่โมเดลอ้างถึง
// --------------------------------------------------------------------------

type ProjectRow = { id: string; name: string; areas: { name: string } | null }
type ItemRow = {
  id: string
  type: 'task' | 'reminder' | 'shortnote'
  title: string
  due_at: string | null
  remind_at: string | null
  done_at: string | null
  project_id: string
  projects: { name: string; areas: { name: string } | null } | null
}

/**
 * หาวิชาจากชื่อที่พูดมา — โมเดลได้ยิน "เน็ตเวิร์ก" แต่ในฐานข้อมูลชื่อยาวกว่านั้น
 *
 * ⚠️ **ต้องกรอง Area ที่นี่ด้วย** ไม่ใช่เชื่อว่าโมเดลจะไม่เสนอวิชาที่มันมองไม่เห็น
 *    ตัวกรองใน `runTool()` กันแค่ขาออก · ขานี้เป็นขาเข้าซึ่งเป็นคนละทาง
 */
async function findProject(ctx: ProposeCtx, ref: string): Promise<ProjectRow> {
  const rows = await ctx.db.rows<ProjectRow>({
    table: 'projects',
    columns: 'id, name, areas(name)',
    filters: [{ col: 'archived_at', op: 'is', value: null }],
    order: { col: 'sort_order', ascending: true },
    limit: 60,
  })

  const visible = rows.filter((r) => areaIsVisible(r.areas?.name))
  if (visible.length === 0) throw new BadProposal('ยังไม่มีวิชาให้เลือกเลย')

  const needle = ref.trim().toLowerCase()
  const exact = visible.find((r) => r.id === ref || r.name.toLowerCase() === needle)
  if (exact) return exact

  const partial = visible.filter((r) => r.name.toLowerCase().includes(needle))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) {
    throw new BadProposal(`"${ref}" ตรงกับหลายวิชา — ${partial.map((r) => r.name).join(' · ')}`)
  }
  throw new BadProposal(`หาวิชาชื่อ "${ref}" ไม่เจอ`)
}

/** หา item จาก id ที่โมเดลได้มาจาก tool `items` — ไม่ให้เดาจากชื่อ เพราะชื่อซ้ำกันได้ */
async function findItem(ctx: ProposeCtx, id: string): Promise<ItemRow> {
  const rows = await ctx.db.rows<ItemRow>({
    table: 'items',
    columns: 'id, type, title, due_at, remind_at, done_at, project_id, projects(name, areas(name))',
    filters: [{ col: 'id', op: 'eq', value: id }],
    limit: 1,
  })
  const row = rows[0]
  if (!row) throw new BadProposal('หารายการนั้นไม่เจอ')
  if (!areaIsVisible(row.projects?.areas?.name)) throw new BadProposal('หารายการนั้นไม่เจอ')
  return row
}

// --------------------------------------------------------------------------
// นิยาม tool
// --------------------------------------------------------------------------

type ProposeDef = {
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string; enum?: readonly string[] }>
    required: readonly string[]
  }
  build: (raw: Record<string, unknown>, ctx: ProposeCtx) => Promise<Draft>
}

const KIND_WORD = { task: 'งาน', reminder: 'การเตือน', shortnote: 'โน้ต' } as const

const addItem: ProposeDef = {
  description:
    'เสนอเพิ่มงาน การเตือน หรือโน้ตเข้าวิชาหนึ่ง · **ยังไม่บันทึก** ผู้ใช้ต้องกดยืนยันบนจอก่อน ' +
    'ตอบสั้น ๆ ว่าร่างขึ้นให้แล้ว ให้เขาทานแล้วกดยืนยัน · task ใส่ due ได้ · reminder ใส่ remind ได้ · โน้ตไม่มีเวลา',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', description: 'ชนิด', enum: ['task', 'reminder', 'shortnote'] },
      project: { type: 'string', description: 'ชื่อวิชา หรือ id ที่ได้จาก tool projects' },
      title: { type: 'string', description: 'ชื่อสั้น ๆ ของสิ่งที่จะเพิ่ม' },
      body: { type: 'string', description: 'รายละเอียดเพิ่มเติม ถ้ามี' },
      due: { type: 'string', description: 'กำหนดส่งเวลาไทย YYYY-MM-DD หรือ YYYY-MM-DD HH:mm · ใช้กับ task เท่านั้น' },
      remind: { type: 'string', description: 'เวลาเตือนแบบเดียวกัน · ใช้กับ reminder เท่านั้น' },
    },
    required: ['type', 'project', 'title'],
  },
  build: async (raw, ctx) => {
    const type = raw.type
    if (type !== 'task' && type !== 'reminder' && type !== 'shortnote') {
      throw new BadProposal('type ต้องเป็น task · reminder · shortnote')
    }
    const project = await findProject(ctx, text(raw, 'project', 120))
    const title = text(raw, 'title', 200)
    const body = text(raw, 'body', 2000, false) || undefined

    // CHECK ใน DB บังคับอยู่แล้ว แต่ปฏิเสธตั้งแต่ตรงนี้ดีกว่า ผู้ใช้จะได้เห็นเหตุผล
    // เป็นภาษาคน ไม่ใช่ข้อความ constraint ที่เด้งมาตอนกดยืนยัน
    if (type === 'shortnote' && (raw.due || raw.remind)) {
      throw new BadProposal('โน้ตไม่มีเวลา · ถ้าต้องการเวลาให้ใช้ task หรือ reminder')
    }
    if (type === 'task' && raw.remind) throw new BadProposal('งานไม่ใช้เวลาเตือน · สร้าง reminder แยกแทน')
    if (type === 'reminder' && raw.due) throw new BadProposal('การเตือนไม่มีกำหนดส่ง ใช้เวลาเตือนแทน')
    if (type === 'reminder' && !raw.remind) throw new BadProposal('การเตือนต้องมีเวลาเตือน')

    const dueAt = raw.due ? thaiToIso(String(raw.due)) : undefined
    const remindAt = raw.remind ? thaiToIso(String(raw.remind)) : undefined

    const lines: DraftLine[] = [{ label: 'วิชา', value: project.name }]
    if (dueAt) lines.push({ label: 'กำหนดส่ง', value: thaiLabel(dueAt), tone: 'due' })
    if (remindAt) lines.push({ label: 'เตือน', value: thaiLabel(remindAt), tone: 'due' })
    if (body) lines.push({ label: 'รายละเอียด', value: body })

    return {
      id: draftId(),
      heading: `เพิ่ม${KIND_WORD[type]}`,
      title,
      lines,
      action: { kind: 'add_item', type, projectId: project.id, title, body, dueAt, remindAt },
    }
  },
}

const editItem: ProposeDef = {
  description:
    'เสนอแก้รายการที่มีอยู่ — เปลี่ยนชื่อ เลื่อนเวลา หรือย้ายวิชา · **ยังไม่บันทึก** ต้องกดยืนยันก่อน ' +
    'ต้องรู้ id ของรายการก่อน ให้เรียก tool items มาดูก่อนเสมอ',
  parameters: {
    type: 'object',
    properties: {
      item_id: { type: 'string', description: 'id ของรายการที่ได้จาก tool items' },
      title: { type: 'string', description: 'ชื่อใหม่ ถ้าจะเปลี่ยน' },
      body: { type: 'string', description: 'รายละเอียดใหม่ ถ้าจะเปลี่ยน' },
      due: { type: 'string', description: 'กำหนดส่งใหม่เวลาไทย · ใส่ "-" เพื่อล้างทิ้ง' },
      remind: { type: 'string', description: 'เวลาเตือนใหม่ · ใส่ "-" เพื่อล้างทิ้ง' },
      project: { type: 'string', description: 'ชื่อวิชาใหม่ ถ้าจะย้าย' },
    },
    required: ['item_id'],
  },
  build: async (raw, ctx) => {
    const item = await findItem(ctx, uuid(raw, 'item_id'))
    const lines: DraftLine[] = []

    const title = text(raw, 'title', 200, false) || undefined
    if (title) lines.push({ label: 'ชื่อ', value: title, was: item.title })

    const body = text(raw, 'body', 2000, false) || undefined
    if (body) lines.push({ label: 'รายละเอียด', value: body })

    /** `-` = ล้างค่าทิ้ง · ต้องแยกจาก "ไม่แตะ" ให้ชัด ไม่งั้นค่าเดิมจะหายโดยไม่ตั้งใจ */
    const timeField = (key: string) => {
      const v = raw[key]
      if (v === undefined || v === null || v === '') return undefined
      if (String(v).trim() === '-') return null
      return thaiToIso(String(v))
    }

    const dueAt = item.type === 'task' ? timeField('due') : undefined
    const remindAt = item.type === 'reminder' ? timeField('remind') : undefined

    if (dueAt !== undefined) {
      lines.push({
        label: 'กำหนดส่ง',
        value: dueAt === null ? 'ไม่มีกำหนด' : thaiLabel(dueAt),
        was: item.due_at ? thaiLabel(item.due_at) : 'ไม่มีกำหนด',
        tone: 'due',
      })
    }
    if (remindAt !== undefined) {
      lines.push({
        label: 'เตือน',
        value: remindAt === null ? 'ไม่เตือน' : thaiLabel(remindAt),
        was: item.remind_at ? thaiLabel(item.remind_at) : 'ไม่เตือน',
        tone: 'due',
      })
    }

    let projectId: string | undefined
    const ref = text(raw, 'project', 120, false)
    if (ref) {
      const project = await findProject(ctx, ref)
      if (project.id !== item.project_id) {
        projectId = project.id
        lines.push({ label: 'วิชา', value: project.name, was: item.projects?.name ?? '—' })
      }
    }

    if (lines.length === 0) throw new BadProposal('ยังไม่ได้บอกว่าจะแก้อะไร')

    return {
      id: draftId(),
      heading: 'แก้รายการ',
      title: title ?? item.title,
      lines,
      action: { kind: 'edit_item', itemId: item.id, title, body, dueAt, remindAt, projectId },
    }
  },
}

const completeItem: ProposeDef = {
  description:
    'เสนอติ๊กว่าเสร็จแล้ว หรือเอาติ๊กออก · **ยังไม่บันทึก** ต้องกดยืนยันก่อน · โน้ตไม่มีสถานะเสร็จ',
  parameters: {
    type: 'object',
    properties: {
      item_id: { type: 'string', description: 'id ของรายการที่ได้จาก tool items' },
      // ชนิดต้องตรงกับที่ `bool()` รับ — ประกาศ string ไว้ทั้งที่ตัวอ่านรับแต่บูลีน
      // คือคำสั่งที่ถูกต้องถูกปฏิเสธทุกครั้งโดยไม่มีอะไรฟ้อง (เจอ 4 ก.ย. 2026)
      done: { type: 'boolean', description: 'true = ติ๊กเสร็จ · false = เอาติ๊กออก · เว้นว่าง = ติ๊กเสร็จ' },
    },
    required: ['item_id'],
  },
  build: async (raw, ctx) => {
    const item = await findItem(ctx, uuid(raw, 'item_id'))
    if (item.type === 'shortnote') throw new BadProposal('โน้ตไม่มีสถานะเสร็จ')
    const done = bool(raw, 'done', true)
    if (done === Boolean(item.done_at)) {
      throw new BadProposal(done ? 'รายการนี้ติ๊กเสร็จอยู่แล้ว' : 'รายการนี้ยังไม่ได้ติ๊กอยู่แล้ว')
    }
    return {
      id: draftId(),
      heading: done ? 'ติ๊กว่าเสร็จแล้ว' : 'เอาติ๊กออก',
      title: item.title,
      lines: [{ label: 'วิชา', value: item.projects?.name ?? '—' }],
      action: { kind: 'complete_item', itemId: item.id, done },
    }
  },
}

const archiveItem: ProposeDef = {
  description:
    'เสนอเก็บรายการเข้าคลัง — ไม่ใช่การลบถาวร ของในคลังกู้คืนได้ 7 วัน · **ยังไม่บันทึก** ต้องกดยืนยันก่อน',
  parameters: {
    type: 'object',
    properties: { item_id: { type: 'string', description: 'id ของรายการที่ได้จาก tool items' } },
    required: ['item_id'],
  },
  build: async (raw, ctx) => {
    const item = await findItem(ctx, uuid(raw, 'item_id'))
    return {
      id: draftId(),
      heading: 'เก็บเข้าคลัง',
      title: item.title,
      lines: [
        { label: 'วิชา', value: item.projects?.name ?? '—' },
        { label: 'กู้คืนได้ถึง', value: 'ครบ 7 วันหลังเก็บ' },
      ],
      action: { kind: 'archive_item', itemId: item.id },
    }
  },
}

const addEvent: ProposeDef = {
  description:
    'เสนอเพิ่มกิจกรรมที่เกิดครั้งเดียว เช่นแข่งขัน สัมมนา นัดประชุม · **ยังไม่บันทึก** ต้องกดยืนยันก่อน ' +
    'ห้ามใช้กับคาบเรียนที่ซ้ำทุกสัปดาห์ — อันนั้นต้องไปตั้งในหน้าวิชาเอง',
  parameters: {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'ชื่อวิชาหรือโปรเจกต์ที่กิจกรรมนี้สังกัด' },
      title: { type: 'string', description: 'ชื่อกิจกรรม' },
      starts: { type: 'string', description: 'เริ่มเมื่อไหร่ เวลาไทย YYYY-MM-DD HH:mm' },
      ends: { type: 'string', description: 'จบเมื่อไหร่ เวลาไทย · เว้นได้ จะถือว่ายาว 2 ชั่วโมง' },
      location: { type: 'string', description: 'สถานที่ ถ้ามี' },
      label: { type: 'string', description: 'ป้ายสั้น ๆ เช่น onsite ออนไลน์ รอบชิง' },
      body: { type: 'string', description: 'รายละเอียดเพิ่มเติม ถ้ามี' },
    },
    required: ['project', 'title', 'starts'],
  },
  build: async (raw, ctx) => {
    const project = await findProject(ctx, text(raw, 'project', 120))
    const title = text(raw, 'title', 200)
    const startsAt = thaiToIso(text(raw, 'starts', 32))

    // เว้นเวลาจบไว้ = ยาวสองชั่วโมง · ตรงกับค่าที่ตัวแก้กิจกรรมบนเว็บเติมให้
    const endsAt = raw.ends
      ? thaiToIso(String(raw.ends))
      : new Date(new Date(startsAt).getTime() + 2 * 3600 * 1000).toISOString()

    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      throw new BadProposal('เวลาจบต้องอยู่หลังเวลาเริ่ม')
    }
    // CHECK `event_span_sane` ใน DB กันไว้ที่ 30 วัน — บอกเป็นภาษาคนตั้งแต่ตรงนี้
    if (new Date(endsAt).getTime() - new Date(startsAt).getTime() > 30 * 86400_000) {
      throw new BadProposal('กิจกรรมยาวเกิน 30 วัน · น่าจะเป็นคนละงานกัน')
    }

    const location = text(raw, 'location', 200, false) || undefined
    const label = text(raw, 'label', 60, false) || undefined
    const body = text(raw, 'body', 2000, false) || undefined

    const lines: DraftLine[] = [
      { label: 'สังกัด', value: project.name },
      { label: 'เริ่ม', value: thaiLabel(startsAt), tone: 'due' },
      { label: 'จบ', value: thaiLabel(endsAt) },
    ]
    if (location) lines.push({ label: 'ที่ไหน', value: location })
    if (label) lines.push({ label: 'ป้าย', value: label })
    if (body) lines.push({ label: 'รายละเอียด', value: body })

    return {
      id: draftId(),
      heading: 'เพิ่มกิจกรรม',
      title,
      lines,
      action: { kind: 'add_event', projectId: project.id, title, body, startsAt, endsAt, location, label },
    }
  },
}

// --------------------------------------------------------------------------
// แก้ร่างใบเดิม
// --------------------------------------------------------------------------

/**
 * tool ที่สร้างร่างแต่ละชนิด — ใช้ย้อนกลับไปเรียก `build` ตัวเดิม
 *
 * ⚠️ ตัวแก้ร่าง **ไม่ประกอบร่างเอง** มันแปลงร่างใบเดิมกลับเป็นอินพุต ทับด้วย
 *    สิ่งที่ผู้ใช้พูดแก้ แล้วเรียก `build` ตัวเดิมใหม่ทั้งใบ · การตรวจทุกข้อ
 *    (ตัวกรอง Area · CHECK ของ DB · เส้นแบ่ง task/reminder/โน้ต) จึงเกิดซ้ำครบ
 *    ถ้าเขียนตรรกะประกอบร่างขึ้นมาอีกชุด มันจะเพี้ยนจากตัวจริงในวันที่ใครแก้ข้างเดียว
 */
const TOOL_OF_KIND: Record<DraftAction['kind'], string> = {
  add_item: 'propose_add_item',
  edit_item: 'propose_edit_item',
  complete_item: 'propose_complete_item',
  archive_item: 'propose_archive_item',
  add_event: 'propose_add_event',
}

/** ฟิลด์ที่ร่างแต่ละชนิดแก้ได้จริง — ฟิลด์ที่ไม่มีที่ลง ต้องปฏิเสธ ไม่ใช่รับแล้วทิ้ง */
const UPDATABLE: Record<DraftAction['kind'], readonly string[]> = {
  add_item: ['type', 'project', 'title', 'body', 'due', 'remind'],
  edit_item: ['title', 'body', 'due', 'remind', 'project'],
  complete_item: ['done'],
  archive_item: [],
  add_event: ['project', 'title', 'body', 'starts', 'ends', 'location', 'label'],
}

const UPDATE_FIELDS = [
  'type', 'project', 'title', 'body', 'due', 'remind', 'starts', 'ends', 'location', 'label', 'done',
] as const

/** ร่างใบเดิม → อินพุตชุดที่ทำให้เกิดร่างนั้น (ทางกลับของ `build`) */
function rawOf(a: DraftAction): Record<string, unknown> {
  switch (a.kind) {
    case 'add_item':
      return {
        type: a.type,
        project: a.projectId,
        title: a.title,
        body: a.body,
        due: a.dueAt ? thaiInput(a.dueAt) : undefined,
        remind: a.remindAt ? thaiInput(a.remindAt) : undefined,
      }
    case 'edit_item':
      return {
        item_id: a.itemId,
        title: a.title,
        body: a.body,
        // `-` คือคำสั่งล้างค่า ซึ่งต่างจาก undefined ที่แปลว่าไม่แตะ — ต้องรักษาไว้
        due: a.dueAt === null ? '-' : a.dueAt ? thaiInput(a.dueAt) : undefined,
        remind: a.remindAt === null ? '-' : a.remindAt ? thaiInput(a.remindAt) : undefined,
        project: a.projectId,
      }
    case 'complete_item':
      return { item_id: a.itemId, done: a.done }
    case 'archive_item':
      return { item_id: a.itemId }
    case 'add_event':
      return {
        project: a.projectId,
        title: a.title,
        body: a.body,
        starts: thaiInput(a.startsAt),
        ends: thaiInput(a.endsAt),
        location: a.location,
        label: a.label,
      }
  }
}

/** ตัดคีย์ที่เป็น undefined ทิ้ง — ตัวอ่านอินพุตแยก "ไม่มี" กับ "ว่าง" คนละความหมาย */
function prune(raw: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined))
}

const updateDraft: ProposeDef = {
  description:
    'แก้ร่างที่ค้างอยู่บนจอ **ใบเดิม** เมื่อผู้ใช้บอกให้เปลี่ยนอะไรบางอย่าง ' +
    'เช่น "เปลี่ยนเป็นวันศุกร์" "ลง Network แทน" "เอาเป็นบ่ายสอง" ' +
    'ส่งมาเฉพาะสิ่งที่เปลี่ยน ที่เหลือระบบเก็บของเดิมให้เอง · **ยังไม่บันทึก** ต้องกดยืนยันก่อน ' +
    'ใช้ตัวนี้แทนการเสนอใหม่ทั้งใบ ไม่งั้นผู้ใช้จะได้การ์ดสองใบสำหรับเรื่องเดียว',
  parameters: {
    type: 'object',
    properties: {
      draft_id: {
        type: 'string',
        description: 'id ของร่างที่จะแก้ · เว้นไว้ = ใบล่าสุดบนจอ ซึ่งถูกเกือบทุกครั้ง',
      },
      type: { type: 'string', description: 'ชนิดใหม่', enum: ['task', 'reminder', 'shortnote'] },
      project: { type: 'string', description: 'ชื่อวิชาใหม่ ถ้าย้าย' },
      title: { type: 'string', description: 'ชื่อใหม่' },
      body: { type: 'string', description: 'รายละเอียดใหม่' },
      due: { type: 'string', description: 'กำหนดส่งใหม่ เวลาไทย YYYY-MM-DD หรือ YYYY-MM-DD HH:mm' },
      remind: { type: 'string', description: 'เวลาเตือนใหม่ รูปเดียวกัน' },
      starts: { type: 'string', description: 'เวลาเริ่มใหม่ของกิจกรรม · เวลาจบเลื่อนตามให้ ยาวเท่าเดิม' },
      ends: { type: 'string', description: 'เวลาจบใหม่ของกิจกรรม' },
      location: { type: 'string', description: 'สถานที่ใหม่' },
      label: { type: 'string', description: 'ป้ายใหม่' },
      done: { type: 'boolean', description: 'true = ติ๊กเสร็จ · false = เอาติ๊กออก' },
    },
    required: [],
  },
  build: async (raw, ctx) => {
    const open = ctx.openDrafts ?? []
    if (open.length === 0) {
      throw new BadProposal('ตอนนี้ไม่มีร่างค้างบนจอ · ถ้าจะเพิ่มของใหม่ให้เสนอเป็นร่างใบใหม่')
    }

    const wanted = text(raw, 'draft_id', 40, false)
    // เว้น id ไว้ = ใบล่าสุด · เสียงอ่าน id ออกมาไม่ได้อยู่แล้ว ค่าตั้งต้นจึงต้องถูก
    const base = wanted ? open.find((d) => d.id === wanted) : open[open.length - 1]
    if (!base) throw new BadProposal('หาร่างใบนั้นไม่เจอบนจอ · อาจถูกกดทิ้งไปแล้ว')

    const kind = base.action.kind
    const allowed = UPDATABLE[kind]

    const changes: Record<string, unknown> = {}
    for (const key of UPDATE_FIELDS) {
      const v = raw[key]
      if (v === undefined || v === null || v === '') continue
      if (!allowed.includes(key)) {
        throw new BadProposal(
          allowed.length === 0
            ? `ร่าง "${base.heading}" ไม่มีอะไรให้แก้ · ถ้าผิดใบให้ผู้ใช้กดทิ้งแล้วบอกใหม่`
            : `ร่าง "${base.heading}" แก้ ${key} ไม่ได้ · แก้ได้แค่ ${allowed.join(' · ')}`
        )
      }
      changes[key] = v
    }
    if (Object.keys(changes).length === 0) throw new BadProposal('ยังไม่ได้บอกว่าจะแก้อะไรในร่างนี้')

    const merged = prune(rawOf(base.action))

    /*
     * เปลี่ยนชนิดแล้ว **เวลาของชนิดเดิมต้องไม่ตามมา** — task มี due · reminder
     * มี remind · โน้ตไม่มีทั้งคู่ · ถ้าปล่อยให้ตามมา `build` จะปฏิเสธด้วยเหตุผล
     * ที่ผู้ใช้ไม่ได้ก่อ ("งานไม่ใช้เวลาเตือน") ทั้งที่เขาแค่บอกว่าเปลี่ยนชนิด
     */
    if (kind === 'add_item' && changes.type && changes.type !== base.action.type) {
      delete merged.due
      delete merged.remind
    }

    /*
     * เลื่อนเวลาเริ่มของกิจกรรมโดยไม่บอกเวลาจบ = **เลื่อนทั้งงาน ยาวเท่าเดิม**
     * ถ้าปล่อยเวลาจบไว้ที่เดิม การเลื่อนไปหลังเวลาจบจะกลายเป็นร่างที่ผิดเสมอ
     */
    if (kind === 'add_event' && changes.starts && !changes.ends) {
      const a = base.action as Extract<DraftAction, { kind: 'add_event' }>
      const span = new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()
      merged.ends = thaiInput(new Date(new Date(thaiToIso(String(changes.starts))).getTime() + span).toISOString())
    }

    const def = REGISTRY[TOOL_OF_KIND[kind]]
    const next = await def.build({ ...merged, ...changes }, ctx)

    // **ใบเดิม ไม่ใช่ใบใหม่** — id เดิมทำให้การ์ดบนจอถูกแทนที่ ไม่ใช่มีเพิ่มอีกใบ
    // `rev` ทำให้การ์ดตัวนั้น mount ใหม่ ค่าที่มันถือไว้ใน state จึงไม่ค้างของรอบก่อน
    return { ...next, id: base.id, rev: (base.rev ?? 0) + 1 }
  },
}

// --------------------------------------------------------------------------
// ทะเบียน
// --------------------------------------------------------------------------

const REGISTRY: Record<string, ProposeDef> = {
  propose_add_item: addItem,
  propose_edit_item: editItem,
  propose_complete_item: completeItem,
  propose_archive_item: archiveItem,
  propose_add_event: addEvent,
  propose_update_draft: updateDraft,
}

export const PROPOSE_NAMES = Object.keys(REGISTRY) as readonly string[]

export function isProposeName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTRY, name)
}

export function proposeDeclarations() {
  return PROPOSE_NAMES.map((name) => ({
    name,
    description: REGISTRY[name].description,
    parameters: REGISTRY[name].parameters,
  }))
}

/**
 * สร้างร่างหนึ่งใบ — **ไม่แตะข้อมูลเลย** อ่านอย่างเดียวเพื่อหาชื่อวิชากับรายการ
 *
 * คืน `ok: false` แทนการโยน error เพื่อให้ส่งกลับเข้าสายเป็นผลของ tool ได้
 * โมเดลจะได้บอกผู้ใช้ว่าทำไมเสนอไม่ได้ ดีกว่าเงียบไปเฉย ๆ
 */
export async function runPropose(
  name: string,
  raw: Record<string, unknown>,
  ctx: ProposeCtx
): Promise<{ ok: true; draft: Draft } | { ok: false; error: string }> {
  const def = REGISTRY[name]
  if (!def) return { ok: false, error: `ไม่มี tool ชื่อ ${name}` }
  try {
    return { ok: true, draft: await def.build(raw, ctx) }
  } catch (e) {
    if (e instanceof BadProposal) return { ok: false, error: e.message }
    const why = e instanceof ToolFetchError || e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'
    return { ok: false, error: `เสนอไม่สำเร็จ · ${why}` }
  }
}

/**
 * id ของร่าง — สั้นพอให้พูดอ้างถึงได้ และไม่ต้องเดาว่าจะชนกันไหมเพราะอยู่ในหน้าเดียว
 * `crypto.randomUUID` ใช้ได้ทั้งฝั่ง node และเบราว์เซอร์ที่รองรับ PWA นี้
 */
function draftId(): string {
  return `d_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}
