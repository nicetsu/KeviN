/**
 * lib/ai/tools.ts — ชั้น tool อ่านอย่างเดียว
 *
 * ข้อที่ต้องจริงเสมอ ไม่ว่าจะเรียกจากโหมดไหน — **ดึงข้อมูลไม่สำเร็จต้องเป็น error
 * ห้ามกลายเป็นรายการว่าง** เพราะโมเดลจะสรุปว่า "ไม่มีอะไร" อย่างมั่นใจ
 *
 * เคยมีข้อที่สองคือ "ข้อมูลของ Area ที่ไม่อนุญาตต้องไม่โผล่" · ตัวกรอง Area
 * ถูกถอดทั้งกลไกเมื่อ 8 ก.ย. 2026 ตอนเปิดให้ใช้หลายคน (doc/DECISIONS.md)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { isToolName, parseCalendar, runTool, toolDeclarations, TOOL_NAMES } from '../lib/ai/tools'
import { PROPOSE_NAMES } from '../lib/ai/propose'
import type { ReadOnlyDb } from '../lib/ai/db'

const TODAY = '2026-08-30'

/** db ปลอม — คืนแถวที่เตรียมไว้ ไม่สนใจ query · ใช้เทสต์ตรรกะรอบ ๆ การ query */
const fakeDb = (rows: unknown[]): ReadOnlyDb => ({
  rpc: async <T>() => rows as T[],
  rows: async <T>() => rows as T[],
})

const failingDb = (message: string): ReadOnlyDb => ({
  rpc: async () => { throw new Error(message) },
  rows: async () => { throw new Error(message) },
})

const ctx = (db: ReadOnlyDb) => ({ db, today: TODAY })

const entry = (over: Record<string, unknown> = {}) => ({
  kind: 'class', source_id: 's1', project_id: 'p1', project_name: 'แคลคูลัส 1',
  area_name: 'Class', title: 'แคลคูลัส 1', occurs_on: TODAY,
  start_time: '09:00:00', end_time: '12:00:00', location: 'LH-201',
  label: null, skipped: false, trimmed: false, ...over,
})

const item = (over: Record<string, unknown> = {}) => ({
  id: 'i1', type: 'task', title: 'ส่งรายงาน', body: null,
  due_at: '2026-08-31T03:00:00Z', remind_at: null, done_at: null,
  projects: { name: 'แคลคูลัส 1', areas: { name: 'Class' } }, ...over,
})

// ---- ทะเบียน ----

test('isToolName รับเฉพาะชื่อในทะเบียน', () => {
  assert.equal(isToolName('calendar'), true)
  assert.equal(isToolName('items'), true)
  assert.equal(isToolName('drop_table'), false)
  assert.equal(isToolName(''), false)
})

test('ทะเบียนไม่มี tool ที่เขียนข้อมูลเลย', () => {
  // ด่านสุดท้ายที่จับได้ถ้ามีคนเผลอเติม tool เขียนเข้ามาในอนาคต
  const writeish = /add|create|update|delete|set|write|archive|remove|skip|trim/i
  for (const name of TOOL_NAMES) assert.equal(writeish.test(name), false, `${name} ฟังดูเหมือนเขียนข้อมูล`)
})

test('toolDeclarations ครบทั้งฝั่งอ่านและฝั่งเสนอ และมี schema', () => {
  const decls = toolDeclarations()
  const names = decls.map((d) => d.name)

  for (const n of TOOL_NAMES) assert.ok(names.includes(n), `หาย ${n}`)
  // ฝั่งเสนอหายไปเมื่อไหร่ ผู้ช่วยจะแก้ข้อมูลไม่ได้เลยโดยไม่มี error ให้เห็น
  for (const n of PROPOSE_NAMES) assert.ok(names.includes(n), `หาย ${n}`)
  assert.equal(decls.length, TOOL_NAMES.length + PROPOSE_NAMES.length)

  for (const d of decls) {
    assert.ok(d.description.length > 10)
    assert.equal(d.parameters.type, 'object')
  }
})

test('ทุก tool ฝั่งเสนอบอกในคำอธิบายว่ายังไม่บันทึก', () => {
  // โมเดลอ่านคำอธิบายนี้เพื่อตัดสินใจว่าจะพูดกับผู้ใช้ยังไง — ถ้าไม่บอกว่ายังไม่บันทึก
  // มันจะตอบว่า "บันทึกให้แล้วครับ" ทั้งที่ยังไม่มีอะไรถูกเขียนลงฐานข้อมูล
  for (const d of toolDeclarations()) {
    if (!d.name.startsWith('propose_')) continue
    assert.ok(/ยังไม่บันทึก/.test(d.description), `${d.name} ไม่ได้บอกว่ายังไม่บันทึก`)
  }
})

test('เรียก tool ที่ไม่มีในทะเบียนได้ error ไม่ใช่ throw', () => {
  return runTool('anything', {}, ctx(fakeDb([]))).then((r) => {
    assert.equal(r.ok, false)
  })
})

// ---- parseCalendar ----

test('parseCalendar เว้นว่างทั้งคู่ = วันนี้วันเดียว', () => {
  assert.deepEqual(parseCalendar({}, TODAY), { from: TODAY, to: TODAY })
})

test('parseCalendar ใส่ from อย่างเดียว = วันนั้นวันเดียว', () => {
  assert.deepEqual(parseCalendar({ from: '2026-09-01' }, TODAY), { from: '2026-09-01', to: '2026-09-01' })
})

test('parseCalendar ปฏิเสธรูปแบบวันที่ผิด', () => {
  assert.throws(() => parseCalendar({ from: '30/8/2026' }, TODAY))
})

test('parseCalendar ปฏิเสธช่วงที่กลับหัว', () => {
  assert.throws(() => parseCalendar({ from: '2026-09-10', to: '2026-09-01' }, TODAY))
})

test('parseCalendar ปฏิเสธช่วงที่ยาวเกินเพดาน', () => {
  // กันโมเดลขอทั้งปีแล้วลากข้อมูลทั้งเทอมกลับมากินโควตาโทเคน
  assert.throws(() => parseCalendar({ from: '2026-01-01', to: '2026-12-31' }, TODAY))
})

// ---- ตัวกรอง Area ----

// ---- ความล้มเหลวต้องดังพอให้ได้ยิน ----

test('db ล่มต้องได้ error ไม่ใช่รายการว่าง', async () => {
  // ถ้าคืน rows ว่าง โมเดลจะพูดอย่างมั่นใจว่า "พรุ่งนี้ไม่ติดอะไรเลย"
  // ทั้งที่แค่ query ไม่ผ่าน — ผิดหลัก "ไม่มีอะไรหายเงียบ ๆ" ตรง ๆ
  const r = await runTool('calendar', {}, ctx(failingDb('connection reset')))
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /ดึงข้อมูลไม่สำเร็จ/)
  assert.match(r.error, /connection reset/)
})

test('อินพุตผิดได้ error ที่บอกว่าผิดตรงไหน', async () => {
  const r = await runTool('calendar', { from: 'พรุ่งนี้' }, ctx(fakeDb([])))
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /YYYY-MM-DD/)
})

// ---- รูปที่ส่งให้โมเดล ----

test('calendar · ส่งสถานะไม่ไปและเวลาถูกตัดไปด้วย', async () => {
  // ถ้าไม่ส่ง โมเดลจะบอกให้ไปคาบที่เจ้าของบอกไปแล้วว่าจะไม่ไป
  const db = fakeDb([entry({ skipped: true }), entry({ source_id: 's2', trimmed: true })])
  const r = await runTool('calendar', {}, ctx(db))
  assert.equal(r.ok, true)
  if (!r.ok || !('rows' in r)) return
  assert.equal((r.rows[0] as { ไม่ไป?: boolean }).ไม่ไป, true)
  assert.equal((r.rows[1] as { เวลาถูกตัด?: boolean }).เวลาถูกตัด, true)
})

test('calendar · ให้ลิงก์เฉพาะกิจกรรม เพราะคาบเรียนไม่มีหน้าของตัวเอง', async () => {
  const db = fakeDb([
    entry({ kind: 'class' }),
    entry({ kind: 'event', source_id: 'ev1' }),
  ])
  const r = await runTool('calendar', {}, ctx(db))
  assert.equal(r.ok, true)
  if (!r.ok || !('rows' in r)) return
  assert.equal((r.rows[0] as { ลิงก์?: string }).ลิงก์, undefined)
  assert.equal((r.rows[1] as { ลิงก์?: string }).ลิงก์, '/project/p1/event/ev1')
})

test('items scope=overdue คัดเฉพาะที่เลยเที่ยงคืนวันนี้ตามเวลาไทย', async () => {
  const db = fakeDb([
    item({ id: 'late', title: 'เลยแล้ว', due_at: '2026-08-28T10:00:00Z' }),
    item({ id: 'soon', title: 'ยังไม่ถึง', due_at: '2026-08-31T10:00:00Z' }),
    item({ id: 'edge', title: 'เมื่อคืนสี่ทุ่ม', due_at: '2026-08-29T15:00:00Z' }),
  ])
  const r = await runTool('items', { scope: 'overdue' }, ctx(db))
  assert.equal(r.ok, true)
  if (!r.ok || !('rows' in r)) return
  assert.deepEqual(r.rows.map((x) => (x as { ชื่อ: string }).ชื่อ), ['เลยแล้ว', 'เมื่อคืนสี่ทุ่ม'])
})

test('items scope ที่ไม่รู้จักได้ error ไม่ใช่เงียบ ๆ ใช้ค่าตั้งต้น', async () => {
  const r = await runTool('items', { scope: 'everything' }, ctx(fakeDb([])))
  assert.equal(r.ok, false)
})

test('event · เรียงกำหนดการตามวันแล้วตามเวลา', async () => {
  const db = fakeDb([{
    id: 'e1', title: 'UniHack', body: null,
    starts_at: '2026-09-05T02:00:00Z', ends_at: '2026-09-06T10:00:00Z',
    location: 'ห้องประชุม', projects: { name: 'UniHack 2026', areas: { name: 'Competition' } },
    event_agenda: [
      { id: 'a3', day_offset: 1, start_time: '09:00:00', end_time: null, title: 'Pitching' },
      { id: 'a1', day_offset: 0, start_time: '09:30:00', end_time: '09:50:00', title: 'Registration' },
      { id: 'a2', day_offset: 0, start_time: '10:00:00', end_time: null, title: 'Briefing' },
    ],
  }])
  const r = await runTool('event', { event_id: '11111111-2222-3333-4444-555555555555' }, ctx(db))
  assert.equal(r.ok, true)
  if (!r.ok || !('rows' in r)) return
  const agenda = (r.rows[0] as { กำหนดการ: { ชื่อ: string }[] }).กำหนดการ
  assert.deepEqual(agenda.map((a) => a.ชื่อ), ['Registration', 'Briefing', 'Pitching'])
})

test('event · ปฏิเสธ id ที่ไม่ใช่รูป uuid', async () => {
  const r = await runTool('event', { event_id: '1; drop table items' }, ctx(fakeDb([])))
  assert.equal(r.ok, false)
})

// ---- hidden · บอกว่ามีของที่มองไม่เห็น ไม่ใช่หายเงียบ ๆ ----

test('hidden เป็น 0 เมื่อไม่มีอะไรถูกกรอง', async () => {
  const r = await runTool('calendar', {}, ctx(fakeDb([entry()])))
  assert.equal(r.ok, true)
  if (!r.ok || !('rows' in r)) return
  assert.equal(r.hidden, 0)
})

// ---- ลิงก์ต้องมาจาก tool เท่านั้น ----

test('items · ทุกแถวมีลิงก์ และเป็น path ภายในเสมอ', async () => {
  // ตอนทดสอบจริงเจอว่าถ้าไม่ให้ลิงก์มา โมเดลจะแต่ง URL ขึ้นเอง
  // (ตอบ https://tasks.google.com/ ซึ่งไม่ใช่ของระบบนี้เลย)
  const r = await runTool('items', {}, ctx(fakeDb([item(), item({ id: 'i2' })])))
  assert.equal(r.ok, true)
  if (!r.ok || !('rows' in r)) return
  for (const row of r.rows) {
    const link = (row as { ลิงก์?: string }).ลิงก์
    assert.ok(link, 'ทุกแถวต้องมีลิงก์')
    assert.ok(link!.startsWith('/'), `ลิงก์ต้องเป็น path ภายใน ไม่ใช่ ${link}`)
  }
})

test('ไม่มี tool ไหนคืนลิงก์ที่ออกไปนอกระบบ', async () => {
  const dbs = [
    ['calendar', fakeDb([entry({ kind: 'event' })])],
    ['items', fakeDb([item()])],
    ['projects', fakeDb([{ id: 'p1', name: 'แคล', description: null, status: 'active', areas: { name: 'เรียน' } }])],
    ['areas', fakeDb([{ id: 'a1', name: 'เรียน', description: 'วิชาที่ลงทะเบียนเทอมนี้' }])],
  ] as const
  for (const [name, db] of dbs) {
    const r = await runTool(name, {}, ctx(db))
    assert.equal(r.ok, true, name)
    if (!r.ok || !('rows' in r)) continue
    const text = JSON.stringify(r.rows)
    assert.equal(/https?:\/\//.test(text), false, `${name} คืนลิงก์ภายนอกมา`)
  }
})

// ---- areas · กลุ่มพร้อมคำอธิบาย (9 ก.ย. 2026) ----

test('areas · คืนคำอธิบายและลิงก์ของกลุ่ม', async () => {
  const r = await runTool(
    'areas',
    {},
    ctx(fakeDb([{ id: 'a1', name: 'ฝึกงาน', description: 'งานที่บริษัท' }])),
  )
  assert.equal(r.ok, true)
  if (!r.ok || !('rows' in r)) return
  assert.deepEqual(r.rows, [
    { id: 'a1', ชื่อ: 'ฝึกงาน', คำอธิบาย: 'งานที่บริษัท', ลิงก์: '/library/a1' },
  ])
})

test('areas · คำอธิบายที่ว่างต้องเป็น undefined ไม่ใช่สตริงว่าง', async () => {
  // แบบเดียวกับ `รหัสวิชา` ของ projects — คีย์ที่มีค่าว่างอ่านเหมือน "มีแต่ไม่มีเนื้อ"
  // ส่วน undefined หายไปจาก JSON ทั้งคีย์ ซึ่งตรงกับความจริงว่ายังไม่ได้กรอก
  const r = await runTool('areas', {}, ctx(fakeDb([{ id: 'a1', name: 'ฝึกงาน', description: null }])))
  assert.equal(r.ok, true)
  if (!r.ok || !('rows' in r)) return
  // สิ่งที่ตัดสินคือ **สิ่งที่เดินทางไปถึงโมเดล** ซึ่งคือ JSON — คีย์ที่ค่าเป็น
  // undefined หายไปทั้งคีย์ตอน stringify ส่วนสตริงว่างจะเหลืออยู่และอ่านเหมือน
  // "มีคำอธิบาย แต่ว่างเปล่า" ซึ่งไม่จริง
  assert.equal(JSON.stringify(r.rows).includes('คำอธิบาย'), false)
})

test('areas · ดึงเฉพาะที่ยังไม่เก็บเข้าคลัง และเรียงตาม sort_order', async () => {
  // Area ที่ยังไม่มีโปรเจกต์สักใบต้องติดมาด้วย — เป็นเหตุผลทั้งหมดที่ tool นี้แยกจาก projects
  let seen: unknown = null
  const db = {
    rows: async <T,>(q: unknown) => {
      seen = q
      return [] as T[]
    },
    rpc: async <T,>() => [] as T[],
  }
  await runTool('areas', {}, ctx(db as never))
  assert.deepEqual(seen, {
    table: 'areas',
    columns: 'id, name, description',
    filters: [{ col: 'archived_at', op: 'is', value: null }],
    order: { col: 'sort_order', ascending: true },
    limit: 30,
  })
})
