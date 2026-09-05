/**
 * lib/ai/propose.ts — ชั้นเสนอ
 *
 * สามอย่างที่ต้องจริงเสมอ
 *   1. **ไม่มีร่างใบไหนแตะข้อมูล** — ทุกตัวคืนร่าง ไม่ได้เขียน
 *   2. ร่างที่ชี้ไป Area นอกสายตา **ต้องถูกปฏิเสธตั้งแต่ขาเข้า**
 *      (ตัวกรองใน `runTool` กันแค่ขาออก ซึ่งเป็นคนละทาง)
 *   3. เวลาที่โมเดลส่งมาเป็นเวลาไทย **ต้องไม่เหลื่อมไป 7 ชั่วโมง**
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { runPropose, thaiToIso, thaiLabel, proposeDeclarations, PROPOSE_NAMES } from '../lib/ai/propose'
import type { ReadOnlyDb } from '../lib/ai/db'

const TODAY = '2026-09-02'

/** db ปลอมที่แยกคำตอบตามตาราง — ชั้นเสนอถาม projects กับ items คนละครั้ง */
const db = (by: { projects?: unknown[]; items?: unknown[] }): ReadOnlyDb => ({
  rpc: async <T>() => [] as T[],
  rows: async <T>(q: { table: string }) =>
    ((q.table === 'projects' ? by.projects : by.items) ?? []) as T[],
})

const ctx = (d: ReadOnlyDb) => ({ db: d, today: TODAY })

const PROJECTS = [
  { id: 'p1', name: 'สถาปัตยกรรมเครือข่าย', areas: { name: 'Class' } },
  { id: 'p2', name: 'ปฏิบัติการเครือข่าย', areas: { name: 'Class' } },
  { id: 'p9', name: 'ค่าหอ', areas: { name: 'Money' } }, // Area นอกสายตา
]

const ITEM = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'task',
  title: 'ส่งรายงาน',
  due_at: '2026-09-04T16:59:00.000Z', // ศ. 4 ก.ย. 23:59 เวลาไทย
  remind_at: null,
  done_at: null,
  project_id: 'p1',
  projects: { name: 'สถาปัตยกรรมเครือข่าย', areas: { name: 'Class' } },
}

// ---- เวลา ----

test('เวลาไทยแปลงเป็น ISO โดยไม่เหลื่อม', () => {
  // 23:59 ของวันที่ 4 ตามเวลาไทย = 16:59Z ของวันเดียวกัน
  assert.equal(thaiToIso('2026-09-04 23:59'), '2026-09-04T16:59:00.000Z')
  // ไม่ใส่เวลา = เที่ยงคืนต้นวันตามเวลาไทย ซึ่งเป็นวันก่อนหน้าใน UTC
  assert.equal(thaiToIso('2026-09-04'), '2026-09-03T17:00:00.000Z')
})

test('เวลาที่รูปแบบผิดถูกปฏิเสธ ไม่ใช่เดาให้', () => {
  for (const bad of ['4 ก.ย.', '2026/09/04', '2026-09-04T23:59:00Z', 'พรุ่งนี้']) {
    assert.throws(() => thaiToIso(bad), /ต้องเป็น/, bad)
  }
})

test('ป้ายเวลาอ่านออกเป็นภาษาคน ไม่ใช่ ISO', () => {
  assert.equal(thaiLabel('2026-09-04T16:59:00.000Z'), 'ศ. 4 ก.ย. 23:59')
})

// ---- ทะเบียน ----

test('ชื่อ tool ฝั่งเสนอขึ้นต้นด้วย propose_ ทุกตัว', () => {
  // ฝั่งเรียกใช้แยกสองฝั่งด้วยคำนำหน้านี้ · ตั้งชื่อหลุดเมื่อไหร่ ร่างจะถูกส่งเข้า
  // ทางเดียวกับผลอ่าน แล้วการ์ดจะไม่ขึ้นโดยไม่มี error ให้เห็น
  for (const n of PROPOSE_NAMES) assert.ok(n.startsWith('propose_'), n)
})

test('เรียกชื่อที่ไม่มีได้ error ไม่ใช่ throw', async () => {
  const r = await runPropose('propose_drop_everything', {}, ctx(db({})))
  assert.equal(r.ok, false)
})

// ---- เพิ่มรายการ ----

test('เพิ่มงาน — ได้ร่างที่มีวิชาและกำหนดส่งให้ทาน', async () => {
  const r = await runPropose(
    'propose_add_item',
    { type: 'task', project: 'สถาปัตยกรรมเครือข่าย', title: 'ส่งรายงาน Network', due: '2026-09-04 23:59' },
    ctx(db({ projects: PROJECTS }))
  )
  assert.equal(r.ok, true)
  if (!r.ok) return

  assert.equal(r.draft.action.kind, 'add_item')
  assert.equal(r.draft.title, 'ส่งรายงาน Network')
  // ต้องเห็น**ชื่อวิชา** ไม่ใช่ id — ผู้ใช้ทานจากการ์ดว่าลงถูกวิชาไหม
  assert.ok(r.draft.lines.some((l) => l.value === 'สถาปัตยกรรมเครือข่าย'))
  // และต้องเห็นเวลาแบบอ่านออก
  assert.ok(r.draft.lines.some((l) => l.value === 'ศ. 4 ก.ย. 23:59'))
})

test('ชื่อวิชาที่ตรงหลายอันต้องถาม ไม่ใช่เดาเอาอันแรก', async () => {
  const r = await runPropose(
    'propose_add_item',
    { type: 'task', project: 'เครือข่าย', title: 'อะไรสักอย่าง' },
    ctx(db({ projects: PROJECTS }))
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /หลายวิชา/)
})

test('วิชาใน Area นอกสายตาเหมือนไม่มีอยู่', async () => {
  const r = await runPropose(
    'propose_add_item',
    { type: 'task', project: 'ค่าหอ', title: 'จ่ายค่าหอ' },
    ctx(db({ projects: PROJECTS }))
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /หาวิชา/)
})

test('ข้อบังคับของชนิดรายการถูกปฏิเสธเป็นภาษาคน ไม่ใช่รอ CHECK ใน DB', async () => {
  const d = ctx(db({ projects: PROJECTS }))

  const note = await runPropose(
    'propose_add_item',
    { type: 'shortnote', project: 'สถาปัตยกรรมเครือข่าย', title: 'โน้ต', due: '2026-09-04' },
    d
  )
  assert.equal(note.ok, false)

  const task = await runPropose(
    'propose_add_item',
    { type: 'task', project: 'สถาปัตยกรรมเครือข่าย', title: 'งาน', remind: '2026-09-04 08:00' },
    d
  )
  assert.equal(task.ok, false)

  const noTime = await runPropose(
    'propose_add_item',
    { type: 'reminder', project: 'สถาปัตยกรรมเครือข่าย', title: 'เตือน' },
    d
  )
  assert.equal(noTime.ok, false)
})

// ---- แก้รายการ ----

test('แก้เวลา — ร่างต้องบอกค่าเดิมคู่กับค่าใหม่', async () => {
  const r = await runPropose(
    'propose_edit_item',
    { item_id: ITEM.id, due: '2026-09-05 23:59' },
    ctx(db({ items: [ITEM] }))
  )
  assert.equal(r.ok, true)
  if (!r.ok) return

  const line = r.draft.lines.find((l) => l.label === 'กำหนดส่ง')
  assert.ok(line)
  assert.equal(line!.value, 'ส. 5 ก.ย. 23:59')
  // ไม่มีค่าเดิมให้เทียบ = ทานไม่ได้ว่าเปลี่ยนอะไร ซึ่งเป็นหัวใจของการยืนยัน
  assert.equal(line!.was, 'ศ. 4 ก.ย. 23:59')
})

test('เครื่องหมายลบคือการล้างค่า ต่างจากการไม่แตะ', async () => {
  const r = await runPropose(
    'propose_edit_item',
    { item_id: ITEM.id, due: '-' },
    ctx(db({ items: [ITEM] }))
  )
  assert.equal(r.ok, true)
  if (!r.ok || r.draft.action.kind !== 'edit_item') return
  assert.equal(r.draft.action.dueAt, null)
})

test('แก้โดยไม่บอกว่าจะแก้อะไรถูกปฏิเสธ', async () => {
  const r = await runPropose('propose_edit_item', { item_id: ITEM.id }, ctx(db({ items: [ITEM] })))
  assert.equal(r.ok, false)
})

test('รายการใน Area นอกสายตาเหมือนไม่มีอยู่', async () => {
  const hidden = { ...ITEM, projects: { name: 'ค่าหอ', areas: { name: 'Money' } } }
  const r = await runPropose(
    'propose_edit_item',
    { item_id: ITEM.id, title: 'เปลี่ยนชื่อ' },
    ctx(db({ items: [hidden] }))
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /ไม่เจอ/)
})

test('id ที่ไม่ใช่รูป uuid ถูกปฏิเสธก่อนถึง DB', async () => {
  const r = await runPropose('propose_edit_item', { item_id: 'ส่งรายงาน' }, ctx(db({ items: [ITEM] })))
  assert.equal(r.ok, false)
})

// ---- ติ๊กเสร็จ / เก็บเข้าคลัง ----

test('ติ๊กซ้ำสิ่งที่ติ๊กไปแล้วถูกปฏิเสธ ไม่ใช่เขียนทับเงียบ ๆ', async () => {
  const done = { ...ITEM, done_at: '2026-09-01T10:00:00Z' }
  const r = await runPropose(
    'propose_complete_item',
    { item_id: ITEM.id, done: true },
    ctx(db({ items: [done] }))
  )
  assert.equal(r.ok, false)
})

/**
 * ⚠️ เคสนี้มาจากการวัดกับโมเดลจริง 4 ก.ย. 2026 — โมเดลส่ง `done` มาเป็น
 *    **สตริง** `"true"` แล้วโดนปฏิเสธทุกครั้ง · ฝั่งแชตยิงซ้ำจนหลุดรอด
 *    ฝั่งเสียงยอมแพ้แล้วบอกผู้ใช้ว่า "เกิดข้อผิดพลาดบนหน้าจอ" ทั้งที่ไม่มีการ์ดขึ้นเลย
 */
test('done ที่มาเป็นสตริงต้องอ่านออก — โมเดลส่งบูลีนเป็นสตริงเป็นประจำ', async () => {
  const doneItem = { ...ITEM, done_at: '2026-09-01T10:00:00Z' }
  for (const [raw, want] of [['true', true], ['false', false]] as const) {
    const rows = want ? [ITEM] : [doneItem]
    const r = await runPropose(
      'propose_complete_item',
      { item_id: ITEM.id, done: raw },
      ctx(db({ items: rows }))
    )
    assert.equal(r.ok, true, `done: "${raw}" ต้องผ่าน`)
    if (!r.ok || r.draft.action.kind !== 'complete_item') return
    assert.equal(r.draft.action.done, want)
  }
})

test('done ที่ไม่ใช่ true/false ยังถูกปฏิเสธเหมือนเดิม', async () => {
  const r = await runPropose(
    'propose_complete_item',
    { item_id: ITEM.id, done: 'บางที' },
    ctx(db({ items: [ITEM] }))
  )
  assert.equal(r.ok, false)
})

test('ชนิดที่ประกาศใน schema ต้องตรงกับที่ตัวอ่านรับจริง', async () => {
  // ประกาศ string ไว้ทั้งที่ `bool()` รับแต่บูลีน = คำสั่งที่ถูกต้องถูกปฏิเสธเงียบ ๆ
  const decl = proposeDeclarations().find((d) => d.name === 'propose_complete_item')
  assert.equal(decl?.parameters.properties.done.type, 'boolean')
})

test('โน้ตไม่มีสถานะเสร็จ', async () => {
  const note = { ...ITEM, type: 'shortnote', due_at: null }
  const r = await runPropose(
    'propose_complete_item',
    { item_id: ITEM.id },
    ctx(db({ items: [note] }))
  )
  assert.equal(r.ok, false)
})

test('เก็บเข้าคลังบอกบนการ์ดว่ากู้คืนได้ ไม่ใช่ลบถาวร', async () => {
  const r = await runPropose('propose_archive_item', { item_id: ITEM.id }, ctx(db({ items: [ITEM] })))
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.draft.action.kind, 'archive_item')
  assert.ok(r.draft.lines.some((l) => /กู้คืน/.test(l.label + l.value)))
})

// ---- กิจกรรม ----

test('เพิ่มกิจกรรมที่ไม่บอกเวลาจบได้ความยาวสองชั่วโมง', async () => {
  const r = await runPropose(
    'propose_add_event',
    { project: 'สถาปัตยกรรมเครือข่าย', title: 'สัมมนา', starts: '2026-09-10 09:00' },
    ctx(db({ projects: PROJECTS }))
  )
  assert.equal(r.ok, true)
  if (!r.ok || r.draft.action.kind !== 'add_event') return
  const span =
    new Date(r.draft.action.endsAt).getTime() - new Date(r.draft.action.startsAt).getTime()
  assert.equal(span, 2 * 3600 * 1000)
})

test('กิจกรรมที่จบก่อนเริ่มถูกปฏิเสธ', async () => {
  const r = await runPropose(
    'propose_add_event',
    { project: 'สถาปัตยกรรมเครือข่าย', title: 'ย้อนเวลา', starts: '2026-09-10 09:00', ends: '2026-09-10 08:00' },
    ctx(db({ projects: PROJECTS }))
  )
  assert.equal(r.ok, false)
})

// ---- ร่าง ----

test('ร่างแต่ละใบมี id ไม่ซ้ำกัน', async () => {
  const d = ctx(db({ projects: PROJECTS }))
  const ids = new Set<string>()
  for (let i = 0; i < 5; i++) {
    const r = await runPropose(
      'propose_add_item',
      { type: 'task', project: 'สถาปัตยกรรมเครือข่าย', title: `งาน ${i}` },
      d
    )
    if (r.ok) ids.add(r.draft.id)
  }
  assert.equal(ids.size, 5)
})

test('db ล่มต้องได้ error ไม่ใช่ร่างที่ว่างเปล่า', async () => {
  const broken: ReadOnlyDb = {
    rpc: async () => { throw new Error('เน็ตหลุด') },
    rows: async () => { throw new Error('เน็ตหลุด') },
  }
  const r = await runPropose(
    'propose_add_item',
    { type: 'task', project: 'สถาปัตยกรรมเครือข่าย', title: 'งาน' },
    ctx(broken)
  )
  assert.equal(r.ok, false)
})
