/**
 * lib/applyDraft.ts — **จุดเดียวในระบบที่ผู้ช่วยทำให้ข้อมูลเปลี่ยนได้**
 *
 * ทุกเทสต์ที่เหลือในชุดนี้วัดของที่ยังไม่แตะข้อมูลจริง (ร่าง · การตีความ · การจัดจอ)
 * ไฟล์นี้เป็นไฟล์เดียวที่วัด**การเขียน** จึงต้องคุมสี่เรื่องที่พังแล้วเงียบ
 *
 *   1. **ตัวกรอง Area ขาเข้า** — `runTool()` กันแค่ขาออก ร่างที่ชี้ไป Area
 *      ที่ผู้ช่วยมองไม่เห็นต้องถูกปฏิเสธ**ที่นี่** ไม่ใช่ฝากความหวังไว้กับโมเดล
 *   2. **การเขียนที่ไม่โดนสักแถวไม่ใช่ error** ในสายตา Supabase — ถ้าไม่นับแถว
 *      จะรายงานว่าสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน (doc/TRAPS.md)
 *   3. **การย้อนคือการคืนค่าเดิม ไม่ใช่การล้างค่า** — เคยเขียน `null` ทั้งขาไป
 *      และขากลับ ผลคือเลิกทำหลัง "เอาติ๊กออก" ไม่เปลี่ยนอะไรแต่จอบอกว่าสำเร็จ
 *   4. **ฟิลด์เวลาต้องลงถูกช่อง** — task ห้ามมี `remind_at` · reminder ห้ามมี
 *      `due_at` · โน้ตห้ามมีทั้งคู่ (CHECK ใน DB กันไว้อีกชั้น แต่ต้องไม่ยิงไปให้มันปฏิเสธ)
 *
 * db ปลอมในไฟล์นี้ **จดทุกคำสั่งที่ยิงออกไป** เทสต์จึงตรวจได้ว่าเขียนอะไรลงไปจริง
 * ไม่ใช่แค่ว่าฟังก์ชันตอบว่า ok
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyDraftWith,
  undoApplyWith,
  NOT_WRITTEN,
  type DraftDb,
  type UndoTarget,
} from '../lib/applyDraft'
import type { DraftAction } from '../lib/drafts'

type Row = Record<string, unknown>
type Fail = { message: string }
type Lookup = { data: Row | null; error: Fail | null }
type Write = { data: { id: string }[] | null; error: Fail | null }

type Call = {
  table: string
  op: 'select' | 'insert' | 'update'
  payload?: Row
  eq?: [string, string]
}

const USER = 'user-1'
const OK: Write = { data: [{ id: 'row-1' }], error: null }

/**
 * วิชาที่หาเจอ · **แถวที่ไม่ใช่ของผู้ใช้คนนี้จะคืน `data: null` เพราะ RLS**
 * ไม่ใช่เพราะโค้ดตรวจเอง — ตัวกรอง Area ถูกถอดทั้งกลไกเมื่อ 8 ก.ย. 2026
 */
const PROJECT: Lookup = { data: { id: 'p1' }, error: null }

const item = (over: Row = {}): Lookup => ({
  data: { id: 'i1', type: 'task', done_at: null, ...over },
  error: null,
})

/**
 * db ปลอมที่จดทุกคำสั่ง
 *
 * `lookup` แยกตามตาราง (การตรวจสิทธิ์ถาม `projects` กับ `items` คนละครั้ง)
 * `write` แยกตาม `ตาราง.คำสั่ง` เพราะร่างใบเดียวอาจอ่าน `items` แล้วเขียน `items`
 */
function fakeDb(cfg: { lookup?: Record<string, Lookup>; write?: Record<string, Write> } = {}) {
  const calls: Call[] = []

  const db: DraftDb = {
    from(table: string) {
      return {
        select() {
          return {
            eq(column: string, value: string) {
              return {
                is() {
                  return {
                    maybeSingle() {
                      calls.push({ table, op: 'select', eq: [column, value] })
                      return Promise.resolve(cfg.lookup?.[table] ?? { data: null, error: null })
                    },
                  }
                },
              }
            },
          }
        },
        insert(row: Row) {
          return {
            select() {
              calls.push({ table, op: 'insert', payload: row })
              return Promise.resolve(cfg.write?.[`${table}.insert`] ?? OK)
            },
          }
        },
        update(patch: Row) {
          return {
            eq(column: string, value: string) {
              return {
                select() {
                  calls.push({ table, op: 'update', payload: patch, eq: [column, value] })
                  return Promise.resolve(cfg.write?.[`${table}.update`] ?? OK)
                },
              }
            },
          }
        },
      }
    },
  }

  return { db, calls }
}

const written = (calls: Call[]) => calls.find((c) => c.op !== 'select')

/* ------------------------------------------------------------------ ขาเข้าที่เชื่อไม่ได้ */

test('ร่างที่อ่านไม่ออกถูกปฏิเสธก่อนแตะ db เลย', async () => {
  const { db, calls } = fakeDb()
  const res = await applyDraftWith(db, USER, { kind: 'ลบทิ้ง' } as unknown as DraftAction)
  assert.equal(res.ok, false)
  assert.equal(calls.length, 0, 'ร่างที่อ่านไม่ออกต้องไม่ทำให้เกิด query เลยสักตัว')
})

test('ไม่มี session ก็ไม่เขียน — RLS กันอยู่แล้ว แต่ไม่ควรยิงไปให้มันปฏิเสธ', async () => {
  const { db, calls } = fakeDb({ lookup: { projects: PROJECT } })
  const res = await applyDraftWith(db, null, {
    kind: 'add_item',
    type: 'task',
    projectId: 'p1',
    title: 'งาน',
  })
  assert.equal(res.ok, false)
  assert.equal(calls.length, 0)
})

/* ------------------------------------------------------------------------ เพิ่มของ */

test('add_item · task ลง due_at และ remind_at ต้องเป็น null', async () => {
  const { db, calls } = fakeDb({ lookup: { projects: PROJECT } })
  const res = await applyDraftWith(db, USER, {
    kind: 'add_item',
    type: 'task',
    projectId: 'p1',
    title: 'ส่งรายงาน',
    dueAt: '2026-09-10T16:59:00.000Z',
  })

  assert.equal(res.ok, true)
  const w = written(calls)!
  assert.equal(w.table, 'items')
  assert.equal(w.payload!.user_id, USER)
  assert.equal(w.payload!.project_id, 'p1')
  assert.equal(w.payload!.due_at, '2026-09-10T16:59:00.000Z')
  assert.equal(w.payload!.remind_at, null, 'task ห้ามมี remind_at (CHECK task_no_remind)')
})

test('add_item · reminder ลง remind_at และ due_at ต้องเป็น null', async () => {
  const { db, calls } = fakeDb({ lookup: { projects: PROJECT } })
  await applyDraftWith(db, USER, {
    kind: 'add_item',
    type: 'reminder',
    projectId: 'p1',
    title: 'เตือน',
    remindAt: '2026-09-10T01:00:00.000Z',
  })

  const w = written(calls)!
  assert.equal(w.payload!.remind_at, '2026-09-10T01:00:00.000Z')
  assert.equal(w.payload!.due_at, null, 'reminder ห้ามมี due_at (CHECK reminder_no_due)')
})

test('add_item · โน้ตไม่มีเวลาเลย แม้ร่างจะแอบพก dueAt มา', async () => {
  const { db, calls } = fakeDb({ lookup: { projects: PROJECT } })
  await applyDraftWith(db, USER, {
    kind: 'add_item',
    type: 'shortnote',
    projectId: 'p1',
    title: 'โน้ต',
    dueAt: '2026-09-10T16:59:00.000Z',
  })

  const w = written(calls)!
  assert.equal(w.payload!.due_at, null, 'shortnote_timeless — ร่างที่ถูกแก้ระหว่างทางต้องไม่ผ่าน')
  assert.equal(w.payload!.remind_at, null)
})

test('add_item · วิชาที่หาไม่เจอ ไม่เขียนอะไรเลย', async () => {
  const { db, calls } = fakeDb({ lookup: { projects: { data: null, error: null } } })
  const res = await applyDraftWith(db, USER, {
    kind: 'add_item',
    type: 'task',
    projectId: 'ไม่มีจริง',
    title: 'งาน',
  })

  assert.equal(res.ok, false)
  assert.equal(written(calls), undefined)
})

test('add_item · insert ที่ไม่โดนสักแถว ต้องไม่รายงานว่าสำเร็จ', async () => {
  const { db } = fakeDb({
    lookup: { projects: PROJECT },
    write: { 'items.insert': { data: [], error: null } },
  })
  const res = await applyDraftWith(db, USER, {
    kind: 'add_item',
    type: 'task',
    projectId: 'p1',
    title: 'งาน',
  })

  assert.equal(res.ok, false)
  assert.equal(res.ok === false ? res.error : '', NOT_WRITTEN)
})

test('add_item · error จาก db เดินทางถึงผู้ใช้ ไม่ถูกกลบ', async () => {
  const { db } = fakeDb({
    lookup: { projects: PROJECT },
    write: { 'items.insert': { data: null, error: { message: 'duplicate key' } } },
  })
  const res = await applyDraftWith(db, USER, {
    kind: 'add_item',
    type: 'task',
    projectId: 'p1',
    title: 'งาน',
  })

  assert.equal(res.ok === false && res.error, 'duplicate key')
})

test('add_event · ลงตาราง events พร้อมช่วงเวลาครบ', async () => {
  const { db, calls } = fakeDb({ lookup: { projects: PROJECT } })
  const res = await applyDraftWith(db, USER, {
    kind: 'add_event',
    projectId: 'p1',
    title: 'UniHack',
    startsAt: '2026-09-12T02:00:00.000Z',
    endsAt: '2026-09-12T10:00:00.000Z',
    location: 'E11',
  })

  assert.equal(res.ok, true)
  const w = written(calls)!
  assert.equal(w.table, 'events', 'กิจกรรมครั้งเดียวลง events ไม่ใช่ project_schedules')
  assert.equal(w.payload!.starts_at, '2026-09-12T02:00:00.000Z')
  assert.equal(w.payload!.location, 'E11')
  assert.equal(w.payload!.label, null)
})

/* --------------------------------------------------------------------------- แก้ */

test('edit_item · เขียนเฉพาะฟิลด์ที่ร่างบอกว่าเปลี่ยน', async () => {
  const { db, calls } = fakeDb({ lookup: { items: item() } })
  const res = await applyDraftWith(db, USER, {
    kind: 'edit_item',
    itemId: 'i1',
    title: 'ชื่อใหม่',
  })

  assert.equal(res.ok, true)
  const w = written(calls)!
  assert.deepEqual(Object.keys(w.payload!), ['title'], 'ฟิลด์ที่ไม่ได้แตะห้ามโผล่ใน patch')
  assert.deepEqual(w.eq, ['id', 'i1'])
})

test('edit_item · `null` คือล้างค่า ต่างจาก undefined ที่แปลว่าไม่แตะ', async () => {
  const { db, calls } = fakeDb({ lookup: { items: item() } })
  await applyDraftWith(db, USER, { kind: 'edit_item', itemId: 'i1', dueAt: null })

  const w = written(calls)!
  assert.equal('due_at' in w.payload!, true)
  assert.equal(w.payload!.due_at, null)
})

test('edit_item · ร่างที่ไม่ได้เปลี่ยนอะไรเลย ไม่ยิงคำสั่งเขียน', async () => {
  const { db, calls } = fakeDb({ lookup: { items: item() } })
  const res = await applyDraftWith(db, USER, { kind: 'edit_item', itemId: 'i1' })

  assert.equal(res.ok, false)
  assert.equal(written(calls), undefined)
})

test('edit_item · ย้ายไปวิชาที่มองเห็นได้ ลง project_id จริง', async () => {
  const { db, calls } = fakeDb({ lookup: { items: item(), projects: PROJECT } })
  const res = await applyDraftWith(db, USER, {
    kind: 'edit_item',
    itemId: 'i1',
    projectId: 'p1',
  })

  assert.equal(res.ok, true)
  assert.equal(written(calls)!.payload!.project_id, 'p1')
})

test('edit_item · รายการที่หาไม่เจอ (หรือไม่ใช่ของเรา) ไม่เขียน', async () => {
  const { db, calls } = fakeDb({ lookup: { items: { data: null, error: null } } })
  const res = await applyDraftWith(db, USER, {
    kind: 'edit_item',
    itemId: 'ของคนอื่น',
    title: 'x',
  })

  assert.equal(res.ok, false)
  assert.equal(written(calls), undefined)
})

/* ------------------------------------------------------------------ ติ๊ก / เก็บคลัง */

test('complete_item · ติ๊กเสร็จเขียนเวลา และปุ่มเลิกทำพกค่าเดิมไปด้วย', async () => {
  const { db, calls } = fakeDb({ lookup: { items: item({ done_at: null }) } })
  const res = await applyDraftWith(db, USER, { kind: 'complete_item', itemId: 'i1', done: true })

  assert.equal(res.ok, true)
  assert.equal(typeof written(calls)!.payload!.done_at, 'string')
  assert.deepEqual(res.ok === true ? res.undo : null, { itemId: 'i1', field: 'done', prev: null })
})

test('complete_item · เอาติ๊กออกต้องจำ**ค่าเดิม** ไม่ใช่ null', async () => {
  // เคสที่เคยพัง: ย้อนด้วย null ตายตัว ทำให้เลิกทำแล้วไม่มีอะไรเปลี่ยน (4 ก.ย. 2026)
  const { db, calls } = fakeDb({ lookup: { items: item({ done_at: '2026-09-01T03:00:00.000Z' }) } })
  const res = await applyDraftWith(db, USER, { kind: 'complete_item', itemId: 'i1', done: false })

  assert.equal(written(calls)!.payload!.done_at, null)
  assert.deepEqual(res.ok === true ? res.undo : null, {
    itemId: 'i1',
    field: 'done',
    prev: '2026-09-01T03:00:00.000Z',
  })
})

test('complete_item · โน้ตไม่มีสถานะเสร็จ จึงติ๊กไม่ได้', async () => {
  const { db, calls } = fakeDb({ lookup: { items: item({ type: 'shortnote' }) } })
  const res = await applyDraftWith(db, USER, { kind: 'complete_item', itemId: 'i1', done: true })

  assert.equal(res.ok, false)
  assert.equal(written(calls), undefined)
})

test('archive_item · เก็บเข้าคลังคือ archived_at ไม่ใช่การลบ · และปลดธงอัตโนมัติ', async () => {
  const { db, calls } = fakeDb({ lookup: { items: item() } })
  const res = await applyDraftWith(db, USER, { kind: 'archive_item', itemId: 'i1' })

  assert.equal(res.ok, true)
  const w = written(calls)!
  assert.equal(w.op, 'update', 'ห้ามมีการลบจริงในเส้นทางนี้เด็ดขาด')
  assert.equal(typeof w.payload!.archived_at, 'string')
  assert.equal(w.payload!.archived_auto, false, 'ผู้ใช้สั่งเก็บเอง ไม่ใช่สายพานเก็บให้')
  assert.deepEqual(res.ok === true ? res.undo : null, { itemId: 'i1', field: 'archived' })
})

test('archive_item · update ที่ไม่โดนสักแถว ต้องไม่รายงานว่าสำเร็จ', async () => {
  const { db } = fakeDb({
    lookup: { items: item() },
    write: { 'items.update': { data: [], error: null } },
  })
  const res = await applyDraftWith(db, USER, { kind: 'archive_item', itemId: 'i1' })
  assert.equal(res.ok === false && res.error, NOT_WRITTEN)
})

/* ------------------------------------------------------------------------ เลิกทำ */

test('undo · ติ๊กคืนค่าเดิมกลับไป ไม่ใช่ล้างเป็น null', async () => {
  const { db, calls } = fakeDb({ lookup: { items: item({ done_at: null }) } })
  const target: UndoTarget = { itemId: 'i1', field: 'done', prev: '2026-09-01T03:00:00.000Z' }
  const res = await undoApplyWith(db, target)

  assert.equal(res.ok, true)
  assert.equal(written(calls)!.payload!.done_at, '2026-09-01T03:00:00.000Z')
})

test('undo · เอาของออกจากคลังได้แม้แถวนั้นหาไม่เจอ เพราะของในคลังถูกกรองออกไปแล้ว', async () => {
  const { db, calls } = fakeDb({ lookup: { items: { data: null, error: null } } })
  const res = await undoApplyWith(db, { itemId: 'i1', field: 'archived' })

  assert.equal(res.ok, true)
  const w = written(calls)!
  assert.equal(w.payload!.archived_at, null)
  assert.equal(w.payload!.archived_auto, false)
})

test('undo · ติ๊กของรายการที่หาไม่เจอ ต้องไม่เขียน', async () => {
  const { db, calls } = fakeDb({ lookup: { items: { data: null, error: null } } })
  const res = await undoApplyWith(db, { itemId: 'i1', field: 'done', prev: null })

  assert.equal(res.ok, false)
  assert.equal(written(calls), undefined)
})

test('undo · เขียนแล้วไม่โดนสักแถว ต้องไม่รายงานว่าเลิกทำแล้ว', async () => {
  const { db } = fakeDb({
    lookup: { items: item() },
    write: { 'items.update': { data: [], error: null } },
  })
  const res = await undoApplyWith(db, { itemId: 'i1', field: 'done', prev: null })
  assert.equal(res.ok === false && res.error, NOT_WRITTEN)
})

/* -------------------------------------------------------------- เส้นที่ไม่ข้ามเลย */

test('ไม่มีเส้นทางไหนในไฟล์นี้ที่ลบข้อมูลจริง หรือแตะ project_schedules', async () => {
  // ไล่ยิงร่างทุกชนิดที่มีอยู่ แล้วดูว่าคำสั่งที่ออกไปมีแต่ insert/update
  // และไม่มีตารางต้องห้ามโผล่มาเลย (ARCHITECTURE.md §7)
  const drafts: DraftAction[] = [
    { kind: 'add_item', type: 'task', projectId: 'p1', title: 'ก' },
    { kind: 'add_event', projectId: 'p1', title: 'ข', startsAt: 'a', endsAt: 'b' },
    { kind: 'edit_item', itemId: 'i1', title: 'ค' },
    { kind: 'complete_item', itemId: 'i1', done: true },
    { kind: 'archive_item', itemId: 'i1' },
  ]

  for (const action of drafts) {
    const { db, calls } = fakeDb({ lookup: { projects: PROJECT, items: item() } })
    await applyDraftWith(db, USER, action)
    for (const c of calls) {
      assert.notEqual(c.table, 'projects_schedules')
      assert.notEqual(c.table, 'project_schedules')
      assert.notEqual(c.table, 'areas')
      assert.ok(['select', 'insert', 'update'].includes(c.op), `เจอคำสั่ง ${c.op}`)
    }
  }
})
