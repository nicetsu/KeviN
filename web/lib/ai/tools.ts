/**
 * ชั้น tool — นิยามครั้งเดียว ใช้ร่วมกันทั้งโหมดแชตและโหมดโทร
 *
 * **ชั้นที่ 1 ของสามชั้นที่กันการเขียน** (ARCHITECTURE.md §6) — ไม่มี tool ตัวไหน
 * ที่เขียนข้อมูลอยู่ในชุดนี้เลย โมเดลจึงเรียกไม่ได้ ไม่ใช่เพราะ prompt ขอไว้ดี ๆ
 *
 * โหมดโทรเรียก tool จากฝั่งเบราว์เซอร์ (Live API รัน tool ที่ client)
 * โหมดแชตเรียกจากฝั่งเซิร์ฟเวอร์ · แต่ทั้งคู่ลงมาที่ `runTool()` ตัวเดียวกัน
 * ซึ่งเป็นที่เดียวที่ตรวจอินพุตและแปลงรูปก่อนส่งออกไปหาโมเดล
 */
import type { ReadOnlyDb } from './db'
import { ToolFetchError } from './db'
import { isProposeName, proposeDeclarations, runPropose } from './propose'
import type { Draft } from '../drafts'

export type ToolCtx = {
  db: ReadOnlyDb
  /** วันนี้ตามเวลาไทย YYYY-MM-DD — ส่งเข้ามา ไม่ให้ tool อ่านนาฬิกาเอง จะได้เทสต์ได้ */
  today: string
  /**
   * ร่างที่ค้างอยู่บนจอตอนนี้ · ใช้เฉพาะ `propose_update_draft`
   *
   * ร่างไม่ได้ลง DB เซิร์ฟเวอร์จึงไม่รู้ว่าจออะไรค้างอยู่ถ้าเบราว์เซอร์ไม่ส่งมา
   * · ฝั่งอ่านไม่แตะค่านี้เลย (`ProposeCtx` ใน `propose.ts` อธิบายไว้ว่าทำไมเชื่อไม่ได้)
   */
  openDrafts?: readonly Draft[]
}

/** JSON Schema แบบแคบ ๆ พอสำหรับส่งให้โมเดล ทั้ง Gemini และเจ้าอื่น */
type JsonSchema = {
  type: 'object'
  properties: Record<string, { type: string; description: string; enum?: readonly string[] }>
  required: readonly string[]
}

type ToolDef<I, R> = {
  description: string
  parameters: JsonSchema
  parse: (raw: Record<string, unknown>) => I
  fetch: (input: I, ctx: ToolCtx) => Promise<R[]>
  shape: (row: R) => unknown
}

// --------------------------------------------------------------------------
// ตัวช่วยตรวจอินพุต — เขียนเองเพราะโปรเจกต์นี้ไม่มี zod และไม่อยากเพิ่ม dependency
// --------------------------------------------------------------------------

class BadInput extends Error {}

const dateKey = (raw: Record<string, unknown>, key: string, fallback?: string): string => {
  const v = raw[key]
  if (v === undefined || v === null || v === '') {
    if (fallback !== undefined) return fallback
    throw new BadInput(`ต้องมี ${key}`)
  }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new BadInput(`${key} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD`)
  }
  return v
}

const oneOf = <T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T
): T => {
  const v = raw[key]
  if (v === undefined || v === null || v === '') return fallback
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    throw new BadInput(`${key} ต้องเป็นหนึ่งใน ${allowed.join(' · ')}`)
  }
  return v as T
}

const uuid = (raw: Record<string, unknown>, key: string): string => {
  const v = raw[key]
  if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v)) {
    throw new BadInput(`${key} ต้องเป็น id`)
  }
  return v
}

/** บวกวัน — ซ้ำกับ lib/time.ts โดยตั้งใจ เพื่อให้ไฟล์นี้ไม่ผูกกับฝั่ง UI */
const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

/** กันโมเดลขอช่วงยาวเป็นปีแล้วลากข้อมูลทั้งเทอมกลับมากินโควตาโทเคน */
const MAX_SPAN_DAYS = 60

// --------------------------------------------------------------------------
// รูปแถวที่ได้จาก DB
// --------------------------------------------------------------------------

type EntryRow = {
  kind: 'class' | 'event'
  source_id: string
  project_id: string
  project_name: string
  area_name: string
  title: string
  occurs_on: string
  start_time: string
  end_time: string
  location: string | null
  label: string | null
  skipped: boolean
  trimmed: boolean
}

type ItemRow = {
  id: string
  project_id: string
  type: 'task' | 'reminder' | 'shortnote'
  title: string
  body: string | null
  due_at: string | null
  remind_at: string | null
  done_at: string | null
  projects: { name: string; areas: { name: string } | null } | null
}

type ProjectRow = {
  id: string
  name: string
  description: string | null
  status: string
  areas: { name: string } | null
}

type AgendaRow = {
  id: string
  day_offset: number
  start_time: string
  end_time: string | null
  title: string
}

type EventRow = {
  id: string
  title: string
  body: string | null
  starts_at: string
  ends_at: string
  location: string | null
  projects: { name: string; areas: { name: string } | null } | null
  event_agenda: AgendaRow[]
}

const clock = (t: string) => (t.startsWith('24') ? '24:00' : t.slice(0, 5))

// --------------------------------------------------------------------------
// ชุด tool
// --------------------------------------------------------------------------

const calendar: ToolDef<{ from: string; to: string }, EntryRow> = {
  description:
    'ดูว่าช่วงวันที่ที่ระบุติดอะไรบ้าง — รวมคาบเรียนและกิจกรรมไว้ให้แล้ว ' +
    'และเอาการตัดทอนเวลามาคิดแล้ว · ใช้ตัวนี้เป็นค่าตั้งต้นสำหรับคำถามแนว "พรุ่งนี้ติดอะไร"',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'วันเริ่ม YYYY-MM-DD · เว้นว่างได้ = วันนี้' },
      to: { type: 'string', description: 'วันจบ YYYY-MM-DD · เว้นว่างได้ = เท่ากับ from' },
    },
    required: [],
  },
  parse: () => ({ from: '', to: '' }), // ถูกแทนที่ด้านล่าง — ต้องรู้ today ก่อน
  fetch: async (input, ctx) => {
    const rows = await ctx.db.rpc<EntryRow>('calendar_entries', {
      p_from: input.from,
      p_to: input.to,
    })
    return rows
  },
  shape: (row) => ({
    ชนิด: row.kind === 'class' ? 'คาบเรียน' : 'กิจกรรม',
    ชื่อ: row.title,
    วิชา: row.project_name,
    วันที่: row.occurs_on,
    เวลา: `${clock(row.start_time)}–${clock(row.end_time)}`,
    ที่: row.location,
    หมายเหตุ: row.label,
    // สองอันนี้ต้องส่งไปด้วยเสมอ ไม่งั้นโมเดลจะบอกให้ไปคาบที่เจ้าของบอกไปแล้วว่าจะไม่ไป
    ไม่ไป: row.skipped || undefined,
    เวลาถูกตัด: row.trimmed || undefined,
    ลิงก์: row.kind === 'event' ? `/project/${row.project_id}/event/${row.source_id}` : undefined,
  }),
}

const items: ToolDef<{ scope: 'overdue' | 'open' | 'done' | 'notes' }, ItemRow> = {
  description:
    'งาน การเตือน และโน้ตที่มีอยู่ · overdue = เลยกำหนดแล้วยังไม่เสร็จ · ' +
    'open = ยังไม่เสร็จทั้งหมด · done = ที่เสร็จแล้ว · notes = โน้ตประจำวิชา',
  parameters: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        description: 'ขอบเขตที่ต้องการ',
        enum: ['overdue', 'open', 'done', 'notes'],
      },
    },
    required: [],
  },
  parse: (raw) => ({ scope: oneOf(raw, 'scope', ['overdue', 'open', 'done', 'notes'] as const, 'open') }),
  fetch: async (input, ctx) => {
    const columns = 'id, project_id, type, title, body, due_at, remind_at, done_at, projects(name, areas(name))'
    const base = { table: 'items', columns, limit: 80 }

    if (input.scope === 'notes') {
      return ctx.db.rows<ItemRow>({
        ...base,
        filters: [
          { col: 'archived_at', op: 'is', value: null },
          { col: 'type', op: 'eq', value: 'shortnote' },
        ],
        order: { col: 'sort_order', ascending: true },
      })
    }

    const filters = [
      { col: 'archived_at', op: 'is' as const, value: null },
      { col: 'type', op: 'in' as const, value: ['task', 'reminder'] as const },
    ]

    if (input.scope === 'done') {
      return ctx.db.rows<ItemRow>({
        ...base,
        filters: [...filters, { col: 'done_at', op: 'gt', value: '1970-01-01' }],
        order: { col: 'done_at', ascending: false },
        limit: 30,
      })
    }

    const rows = await ctx.db.rows<ItemRow>({
      ...base,
      filters: [...filters, { col: 'done_at', op: 'is', value: null }],
      order: { col: 'due_at', ascending: true },
    })

    if (input.scope !== 'overdue') return rows

    // เลยกำหนด = ถึงเวลาแล้วแต่ยังไม่เสร็จ · เทียบที่เที่ยงคืนของวันนี้ตามเวลาไทย
    const cutoff = new Date(`${ctx.today}T00:00:00+07:00`).getTime()
    return rows.filter((r) => {
      const when = r.type === 'reminder' ? r.remind_at : r.due_at
      return when !== null && new Date(when).getTime() < cutoff
    })
  },
  shape: (row) => ({
    /*
     * ⚠️ **ต้องมี `id`** — ชั้นเสนอ (`propose_*`) อ้างถึงรายการด้วย id เท่านั้น
     *    ไม่ให้เดาจากชื่อ เพราะงานชื่อ "การบ้าน" มีได้หลายวิชาพร้อมกัน
     *    ถ้าเอาออก ผู้ช่วยจะแก้ของที่มีอยู่ไม่ได้เลย เหลือแค่เพิ่มของใหม่
     */
    id: row.id,
    ชนิด: row.type === 'task' ? 'งาน' : row.type === 'reminder' ? 'เตือน' : 'โน้ต',
    ชื่อ: row.title,
    วิชา: row.projects?.name,
    รายละเอียด: row.body ?? undefined,
    กำหนดส่ง: row.due_at ?? undefined,
    เวลาเตือน: row.remind_at ?? undefined,
    เสร็จแล้ว: row.done_at ? true : undefined,
    // ต้องมีเสมอ — ไม่มีหน้าเฉพาะของ item เดี่ยว ๆ จึงพาไปหน้าวิชาที่มันอยู่
    // ถ้าไม่ให้ลิงก์มา โมเดลจะแต่ง URL ขึ้นเองเวลาต้องปฏิเสธ (เจอจริงตอนทดสอบ)
    ลิงก์: `/project/${row.project_id}`,
  }),
}

const projects: ToolDef<Record<string, never>, ProjectRow> = {
  description: 'รายชื่อวิชาและโปรเจกต์ที่มีอยู่ · ใช้ตอนผู้ใช้เรียกชื่อย่อแล้วต้องเดาว่าหมายถึงอันไหน',
  parameters: { type: 'object', properties: {}, required: [] },
  parse: () => ({}),
  fetch: (_input, ctx) =>
    ctx.db.rows<ProjectRow>({
      table: 'projects',
      columns: 'id, name, description, status, areas(name)',
      filters: [{ col: 'archived_at', op: 'is', value: null }],
      order: { col: 'sort_order', ascending: true },
      limit: 60,
    }),
  shape: (row) => ({
    id: row.id,
    ชื่อ: row.name,
    รหัสวิชา: row.description ?? undefined,
    กลุ่ม: row.areas?.name,
    ลิงก์: `/project/${row.id}`,
  }),
}

const event: ToolDef<{ event_id: string }, EventRow> = {
  description: 'กำหนดการข้างในกิจกรรมหนึ่งงาน · ใช้เมื่อผู้ใช้ถามรายละเอียดของงานที่เห็นในปฏิทิน',
  parameters: {
    type: 'object',
    properties: { event_id: { type: 'string', description: 'id ของกิจกรรม' } },
    required: ['event_id'],
  },
  parse: (raw) => ({ event_id: uuid(raw, 'event_id') }),
  fetch: (input, ctx) =>
    ctx.db.rows<EventRow>({
      table: 'events',
      columns:
        'id, title, body, starts_at, ends_at, location, projects(name, areas(name)), ' +
        'event_agenda(id, day_offset, start_time, end_time, title)',
      filters: [
        { col: 'id', op: 'eq', value: input.event_id },
        { col: 'archived_at', op: 'is', value: null },
      ],
      limit: 1,
    }),
  shape: (row) => ({
    ชื่อ: row.title,
    วิชา: row.projects?.name,
    เริ่ม: row.starts_at,
    จบ: row.ends_at,
    ที่: row.location ?? undefined,
    รายละเอียด: row.body ?? undefined,
    กำหนดการ: [...row.event_agenda]
      .sort((a, b) => a.day_offset - b.day_offset || a.start_time.localeCompare(b.start_time))
      .map((a) => ({
        วันที่: a.day_offset,
        เวลา: a.end_time ? `${clock(a.start_time)}–${clock(a.end_time)}` : clock(a.start_time),
        ชื่อ: a.title,
      })),
  }),
}

// --------------------------------------------------------------------------
// ทะเบียน
// --------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const REGISTRY = { calendar, items, projects, event } as unknown as Record<string, ToolDef<any, any>>
/* eslint-enable @typescript-eslint/no-explicit-any */

export type ToolName = 'calendar' | 'items' | 'projects' | 'event'

export const TOOL_NAMES: readonly ToolName[] = ['calendar', 'items', 'projects', 'event']

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name)
}

/**
 * รูปที่ส่งให้โมเดลตอนประกาศ tool · ใช้ได้ทั้ง Gemini และเจ้าอื่น
 *
 * รวม `propose_*` เข้ามาด้วย — ตัวพวกนั้น**ยังไม่เขียนอะไร** มันคืนร่างกลับมา
 * ให้เว็บวาดเป็นการ์ด แล้วผู้ใช้กดยืนยันถึงจะเขียนจริง (ARCHITECTURE.md §7)
 */
export function toolDeclarations() {
  return [
    ...TOOL_NAMES.map((name) => ({
      name,
      description: REGISTRY[name].description,
      parameters: REGISTRY[name].parameters,
    })),
    ...proposeDeclarations(),
  ]
}

/** ชื่อที่ผู้ช่วยเรียกได้ทั้งหมด — ทั้งฝั่งอ่านและฝั่งเสนอ */
export function isCallableTool(name: string): boolean {
  return isToolName(name) || isProposeName(name)
}

/**
 * ผลของการเรียก tool หนึ่งครั้ง
 *
 * `rows` มาจากฝั่งอ่าน · `draft` มาจากฝั่งเสนอ — ไม่มีทางมาพร้อมกัน
 * ฝั่งที่เรียกต้องเช็ค `'draft' in result` ก่อนใช้ ไม่ใช่เดาจากชื่อ tool
 */
export type ToolResult =
  | { ok: true; rows: unknown[]; hidden: number }
  | { ok: true; draft: Draft }
  | { ok: false; error: string }

/**
 * เรียก tool หนึ่งตัว — **ประตูเดียวที่ข้อมูลออกไปหาโมเดล**
 *
 * ลำดับตายตัว: ตรวจชื่อ → ตรวจอินพุต → ดึงข้อมูล → **กรอง Area** → แปลงรูป
 * ตัวกรองอยู่ในนี้ ไม่ได้อยู่ในแต่ละ tool จึงข้ามไม่ได้แม้เผลอ
 */
export async function runTool(
  name: string,
  rawInput: Record<string, unknown>,
  ctx: ToolCtx
): Promise<ToolResult> {
  /*
   * ชั้นเสนอเข้ามาทางเดียวกัน — ผลที่ได้เป็น `draft` ไม่ใช่ `rows`
   * ที่ให้ผ่านประตูเดียวกันเพราะทั้งสองโหมด (แชต/โทร) เรียกฟังก์ชันนี้อยู่แล้ว
   * แยกประตูเมื่อไหร่ จะมีที่ให้ลืมตรวจเพิ่มอีกที่หนึ่งทันที
   */
  if (isProposeName(name)) {
    const out = await runPropose(name, rawInput, {
      db: ctx.db,
      today: ctx.today,
      openDrafts: ctx.openDrafts,
    })
    return out.ok ? { ok: true, draft: out.draft } : out
  }

  if (!isToolName(name)) return { ok: false, error: `ไม่มี tool ชื่อ ${name}` }
  const tool = REGISTRY[name]

  let input: unknown
  try {
    input = name === 'calendar' ? parseCalendar(rawInput, ctx.today) : tool.parse(rawInput)
  } catch (e) {
    return { ok: false, error: e instanceof BadInput ? e.message : 'อินพุตไม่ถูกต้อง' }
  }

  try {
    const raw = await tool.fetch(input, ctx)

    // `hidden` เคยเป็นจำนวนแถวที่ตัวกรอง Area ตัดออก · ตัวกรองถูกถอดทั้งกลไก
    // เมื่อ 8 ก.ย. 2026 (doc/DECISIONS.md) มันจึงเป็น 0 เสมอตั้งแต่นั้น
    //
    // ที่ยังคงฟิลด์ไว้เพราะกติกาข้อ 4 ใน `lib/ai/prompt.ts` ยังอ้างถึงมันอยู่
    // และ **การแตะ prompt ต้องรันชุดวัดกับโมเดลจริงก่อนและหลัง** ซึ่งกินโควตา
    // · ปล่อยไว้ไม่มีผลเสีย เพราะเงื่อนไข hidden > 0 ไม่มีทางเป็นจริงอีกแล้ว
    return { ok: true, rows: raw.map(tool.shape), hidden: 0 }
  } catch (e) {
    // ต้องบอกว่าดึงข้อมูลไม่ได้ ห้ามคืนรายการว่างแล้วให้โมเดลไปสรุปว่า "ไม่มีอะไร"
    const why = e instanceof ToolFetchError || e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'
    return { ok: false, error: `ดึงข้อมูลไม่สำเร็จ · ${why}` }
  }
}

/** แยกออกมาเพราะต้องรู้ `today` ถึงจะเติมค่าที่เว้นว่างได้ */
export function parseCalendar(raw: Record<string, unknown>, today: string) {
  const from = dateKey(raw, 'from', today)
  const to = dateKey(raw, 'to', from)
  if (to < from) throw new BadInput('to ต้องไม่อยู่ก่อน from')
  if (to > addDays(from, MAX_SPAN_DAYS)) {
    throw new BadInput(`ขอได้ครั้งละไม่เกิน ${MAX_SPAN_DAYS} วัน`)
  }
  return { from, to }
}
