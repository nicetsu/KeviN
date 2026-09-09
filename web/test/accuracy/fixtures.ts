/**
 * ข้อมูลปลอมที่ "เหมือนของจริงพอจะหลอกได้" — ใช้วัดความแม่นของผู้ช่วย
 *
 * ⚠️ **ไม่ต่อ Supabase จริงโดยตั้งใจ** ชุดนี้ยิงโมเดลจริง (กินโควตา) แต่ข้อมูล
 *    ต้องนิ่งพอที่จะตัดสินถูก/ผิดได้ · ข้อมูลจริงเปลี่ยนทุกวัน ผลจะเทียบข้ามวันไม่ได้
 *
 * ⚠️ ชื่อวิชาสองอันแรก **ตั้งใจให้คล้ายกัน** — "เครือข่าย" ตรงกับทั้งคู่
 *    เพื่อวัดว่าผู้ช่วยถามก่อนหรือเดาเอาเอง ซึ่งเป็นจุดที่ ASR ไทยพลาดบ่อยที่สุด
 */
import type { Filter, ReadOnlyDb, ReadableRpc, Query } from '../../lib/ai/db'

/** วันนี้ของชุดทดสอบ — **ศุกร์** 4 ก.ย. 2026 · ตรึงไว้ให้คำว่า "พฤหัสหน้า" มีคำตอบเดียว */
export const TODAY = '2026-09-04'

export const P = {
  arch: 'a1111111-1111-4111-8111-111111111111',
  lab: 'a2222222-2222-4222-8222-222222222222',
  calc: 'a3333333-3333-4333-8333-333333333333',
  se: 'a4444444-4444-4444-8444-444444444444',
  hack: 'a5555555-5555-4555-8555-555555555555',
  life: 'a6666666-6666-4666-8666-666666666666',
  /** โปรเจกต์ตั้งต้นที่ทุกบัญชีได้ตอนสมัคร (migration 20260908210000) */
  gen: 'a7777777-7777-4777-8777-777777777777',
  /** อยู่ใน Area ที่ **ผู้ใช้ตั้งชื่อเอง** — ชื่อโปรเจกต์ไม่มีคำว่า "ฝึกงาน" เลย */
  intern: 'a8888888-8888-4888-8888-888888888888',
  /*
   * สองใบนี้อยู่ **กลุ่มเดียวกัน** โดยตั้งใจ — ปิดหนี้ "กลุ่มเดียวมีหลายโปรเจกต์
   * ต้องถามว่าอันไหน" ที่ค้างมาตั้งแต่ 8 ก.ย. 2026 (doc/HISTORY.md)
   *
   * ⚠️ **ต้องเป็นกลุ่มคนละใบกับของเคส 20** ไม่งั้นเคส 20 จะกลายเป็นเคสกำกวม
   *    แล้วสองเคสจะพังพร้อมกันโดยที่อ่านไม่ออกว่าอันไหนเป็นเหตุ
   */
  band: 'a9999999-9999-4999-8999-999999999999',
  photo: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
} as const

export const I = {
  report3: 'b1111111-1111-4111-8111-111111111111',
  lab2: 'b2222222-2222-4222-8222-222222222222',
  leave: 'b3333333-3333-4333-8333-333333333333',
  readCh5: 'b4444444-4444-4444-8444-444444444444',
  slides: 'b5555555-5555-4555-8555-555555555555',
} as const

type Row = Record<string, unknown>

const PROJECTS: Row[] = [
  { id: P.arch, name: 'สถาปัตยกรรมและการออกแบบเครือข่าย', description: 'CPE331', status: 'active', sort_order: 1, archived_at: null, areas: { name: 'Class' } },
  { id: P.lab, name: 'ปฏิบัติการเครือข่ายคอมพิวเตอร์', description: 'CPE332', status: 'active', sort_order: 2, archived_at: null, areas: { name: 'Class' } },
  { id: P.calc, name: 'แคลคูลัส 2', description: 'MTH102', status: 'active', sort_order: 3, archived_at: null, areas: { name: 'Class' } },
  { id: P.se, name: 'วิศวกรรมซอฟต์แวร์', description: 'CPE341', status: 'active', sort_order: 4, archived_at: null, areas: { name: 'Class' } },
  { id: P.hack, name: 'UniHack 2026', description: null, status: 'active', sort_order: 5, archived_at: null, areas: { name: 'Competition' } },
  { id: P.life, name: 'เรื่องส่วนตัว', description: null, status: 'active', sort_order: 6, archived_at: null, areas: { name: 'Personal' } },
  /*
   * โปรเจกต์ตั้งต้นที่ `handle_new_user()` seed ให้ทุกบัญชี (8 ก.ย. 2026)
   * — ชุดวัดต้องเหมือนบัญชีจริง ไม่งั้นเราวัดของที่ไม่มีใครใช้
   */
  { id: P.gen, name: 'ทั่วไป', description: null, status: 'active', sort_order: 0, archived_at: null, areas: { name: 'General' } },
  /*
   * ⚠️ **Area ชื่อไทยที่ผู้ใช้ตั้งเอง** — ของจริงตั้งแต่ 8 ก.ย. 2026 ผู้ใช้แก้ชื่อ
   *    Area ได้ · สี่ชื่อที่ seed มาเป็นภาษาอังกฤษ (Class/Competition/…) ซึ่ง
   *    **ไม่ใช่คำที่คนไทยพูด** · Area ที่ช่วยตัดสินได้จริงคือ Area ที่เจ้าของ
   *    ตั้งชื่อเองด้วยคำที่ตัวเองใช้ — ชุดวัดจึงต้องมีของแบบนั้นอยู่ด้วยหนึ่งใบ
   *
   *    ชื่อโปรเจกต์ **จงใจไม่มีคำว่า "ฝึกงาน"** เพื่อให้ทางเดียวที่หาเจอคือดูที่ `กลุ่ม`
   */
  { id: P.intern, name: 'บริษัท ABC', description: null, status: 'active', sort_order: 7, archived_at: null, areas: { name: 'ฝึกงาน' } },
  { id: P.band, name: 'วงดนตรีสากล', description: null, status: 'active', sort_order: 8, archived_at: null, areas: { name: 'ชมรม' } },
  { id: P.photo, name: 'ถ่ายภาพ', description: null, status: 'active', sort_order: 9, archived_at: null, areas: { name: 'ชมรม' } },
]

/**
 * กลุ่มพร้อมคำอธิบาย — ของจริงตั้งแต่ 9 ก.ย. 2026
 *
 * สี่ใบแรกคือค่าที่ `handle_new_user()` seed ให้ทุกบัญชี **คัดลอกมาตรง ๆ**
 * ถ้าแก้ข้อความใน migration ต้องแก้ที่นี่ด้วย ไม่งั้นชุดวัดจะวัดของที่ไม่มีใครใช้
 *
 * อีกสองใบเป็นกลุ่มที่**ผู้ใช้ตั้งชื่อและเขียนคำอธิบายเอง** ซึ่งเป็นเคสที่
 * คำอธิบายมีค่าที่สุด — ชื่อกลุ่มที่ seed มาเป็นภาษาอังกฤษ ไม่ใช่คำที่คนไทยพูด
 */
const AREAS: Row[] = [
  { id: 'c1', name: 'Class', description: 'วิชาที่ลงทะเบียนเรียนเทอมนี้ · การบ้าน รายงาน สอบ คาบเรียน', sort_order: 0, archived_at: null },
  { id: 'c2', name: 'Competition', description: 'การแข่งขัน แฮกกาธอน ประกวด และงานที่สมัครเข้าร่วมเอง', sort_order: 1, archived_at: null },
  { id: 'c3', name: 'Personal', description: 'เรื่องส่วนตัว สุขภาพ การเงิน นัดหมาย', sort_order: 2, archived_at: null },
  { id: 'c4', name: 'General', description: 'ของที่ยังไม่รู้ว่าจะจัดไว้ตรงไหน', sort_order: 3, archived_at: null },
  { id: 'c5', name: 'ฝึกงาน', description: 'งานที่บริษัทที่ไปฝึกงาน รายงานและเอกสารของสหกิจ', sort_order: 4, archived_at: null },
  { id: 'c6', name: 'ชมรม', description: 'กิจกรรมชมรมที่เข้าอยู่', sort_order: 5, archived_at: null },
]

const ITEMS: Row[] = [
  {
    id: I.report3, project_id: P.arch, type: 'task', title: 'ส่งรายงานบทที่ 3', body: null,
    due_at: '2026-09-04T16:59:00.000Z', remind_at: null, done_at: null, sort_order: 1, archived_at: null,
    projects: { name: 'สถาปัตยกรรมและการออกแบบเครือข่าย', areas: { name: 'Class' } },
  },
  {
    id: I.lab2, project_id: P.lab, type: 'task', title: 'ทำแลป 2', body: null,
    due_at: null, remind_at: null, done_at: null, sort_order: 2, archived_at: null,
    projects: { name: 'ปฏิบัติการเครือข่ายคอมพิวเตอร์', areas: { name: 'Class' } },
  },
  {
    id: I.leave, project_id: P.life, type: 'reminder', title: 'ส่งใบลา', body: null,
    due_at: null, remind_at: '2026-09-07T02:00:00.000Z', done_at: null, sort_order: 3, archived_at: null,
    projects: { name: 'เรื่องส่วนตัว', areas: { name: 'Personal' } },
  },
  {
    id: I.readCh5, project_id: P.calc, type: 'shortnote', title: 'อาจารย์บอกให้อ่านบทที่ 5 ก่อนสอบ', body: null,
    due_at: null, remind_at: null, done_at: null, sort_order: 4, archived_at: null,
    projects: { name: 'แคลคูลัส 2', areas: { name: 'Class' } },
  },
  {
    id: I.slides, project_id: P.se, type: 'task', title: 'เตรียมสไลด์พรีเซนต์', body: null,
    due_at: '2026-09-03T09:00:00.000Z', remind_at: null, done_at: '2026-09-03T04:00:00.000Z',
    sort_order: 5, archived_at: null,
    projects: { name: 'วิศวกรรมซอฟต์แวร์', areas: { name: 'Class' } },
  },
]

/** ผลของ `calendar_entries()` — คาบเรียนจริงสองวิชา บวกกิจกรรมหนึ่งงาน */
const ENTRIES: Row[] = [
  { kind: 'class', source_id: 's1', project_id: P.arch, project_name: 'สถาปัตยกรรมและการออกแบบเครือข่าย', area_name: 'Class', title: 'สถาปัตยกรรมและการออกแบบเครือข่าย', occurs_on: '2026-09-07', start_time: '09:00:00', end_time: '12:00:00', location: 'E11-S604', label: null, skipped: false, trimmed: false },
  { kind: 'class', source_id: 's2', project_id: P.lab, project_name: 'ปฏิบัติการเครือข่ายคอมพิวเตอร์', area_name: 'Class', title: 'ปฏิบัติการเครือข่ายคอมพิวเตอร์', occurs_on: '2026-09-08', start_time: '13:00:00', end_time: '16:00:00', location: 'E11-Lab2', label: null, skipped: false, trimmed: false },
  { kind: 'class', source_id: 's3', project_id: P.calc, project_name: 'แคลคูลัส 2', area_name: 'Class', title: 'แคลคูลัส 2', occurs_on: '2026-09-10', start_time: '08:00:00', end_time: '10:00:00', location: 'E10-201', label: null, skipped: false, trimmed: false },
  { kind: 'event', source_id: 'e1', project_id: P.hack, project_name: 'UniHack 2026', area_name: 'Competition', title: 'ปฐมนิเทศผู้เข้าแข่งขัน', occurs_on: '2026-09-09', start_time: '18:00:00', end_time: '20:00:00', location: 'ออนไลน์', label: 'ออนไลน์', skipped: false, trimmed: false },
]

const SOURCE: Record<string, Row[]> = { projects: PROJECTS, items: ITEMS, events: [], areas: AREAS }

function keep(row: Row, f: Filter): boolean {
  const v = row[f.col]
  switch (f.op) {
    case 'is': return v === null || v === undefined
    case 'eq': return v === f.value
    case 'in': return (f.value as readonly (string | number)[]).includes(v as string)
    case 'gt': return v !== null && v !== undefined && String(v) > String(f.value)
    case 'gte': return v !== null && v !== undefined && String(v) >= String(f.value)
    case 'lt': return v !== null && v !== undefined && String(v) < String(f.value)
    case 'lte': return v !== null && v !== undefined && String(v) <= String(f.value)
  }
}

/** DB ปลอมที่ยังเคารพ filter จริง ๆ — ไม่งั้น `items` scope จะคืนทุกแถวเหมือนกันหมด */
export function stubDb(): ReadOnlyDb {
  return {
    async rpc<T>(fn: ReadableRpc, args: Record<string, unknown>): Promise<T[]> {
      if (fn !== 'calendar_entries') return [] as T[]
      const from = String(args.p_from ?? '')
      const to = String(args.p_to ?? '')
      return ENTRIES.filter((e) => String(e.occurs_on) >= from && String(e.occurs_on) <= to) as T[]
    },
    async rows<T>(q: Query): Promise<T[]> {
      const src = SOURCE[q.table] ?? []
      const out = src.filter((r) => (q.filters ?? []).every((f) => keep(r, f)))
      return out.slice(0, q.limit) as T[]
    },
  }
}
