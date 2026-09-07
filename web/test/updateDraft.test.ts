/**
 * `propose_update_draft` — พูดแก้ร่าง **ใบเดิม**
 *
 * ก่อนหน้านี้พูดแก้ไม่ได้เลย ต้องกดปุ่ม "แก้" บนการ์ดเอา หรือพูดใหม่ทั้งใบ
 * ซึ่งได้ร่างใบที่สองแทนที่จะแก้ใบเดิม — ขัดกับเหตุผลทั้งหมดของโหมดเสียง
 * ที่มีไว้ใช้ตอนมือไม่ว่าง (ARCHITECTURE.md §7)
 *
 * ตัวแก้ร่าง **ไม่ประกอบร่างเอง** มันแปลงร่างใบเดิมกลับเป็นอินพุต ทับด้วยสิ่งที่
 * ผู้ใช้พูดแก้ แล้วเรียก `build` ของ tool ตัวเดิมใหม่ทั้งใบ · เทสต์ชุดนี้จึงคุมสองเรื่อง
 *
 *   1. **ผลลัพธ์ยังเป็นใบเดิม** — `id` เท่าเดิม · `rev` เดินหน้า (การ์ดบนจอทับที่เดิม)
 *   2. **การตรวจทุกข้อเกิดซ้ำครบ** — ตัวกรอง Area · ชื่อวิชากำกวม · เส้นแบ่ง
 *      task/reminder/โน้ต · ทั้งหมดต้องทำงานเหมือนร่างใบแรกทุกประการ
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { runPropose } from '../lib/ai/propose'
import type { ReadOnlyDb } from '../lib/ai/db'
import type { Draft } from '../lib/drafts'

const TODAY = '2026-09-02'

const db = (by: { projects?: unknown[]; items?: unknown[] }): ReadOnlyDb => ({
  rpc: async <T>() => [] as T[],
  rows: async <T>(q: { table: string }) =>
    ((q.table === 'projects' ? by.projects : by.items) ?? []) as T[],
})

const PROJECTS = [
  { id: 'p1', name: 'สถาปัตยกรรมเครือข่าย', areas: { name: 'Class' } },
  { id: 'p2', name: 'ปฏิบัติการเครือข่าย', areas: { name: 'Class' } },
  { id: 'p9', name: 'ค่าหอ', areas: { name: 'Personal' } }, // คนละ Area กับที่เหลือ
]

const ITEM = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'task',
  title: 'ส่งรายงาน',
  due_at: '2026-09-04T16:59:00.000Z',
  remind_at: null,
  done_at: null,
  project_id: 'p1',
  projects: { name: 'สถาปัตยกรรมเครือข่าย', areas: { name: 'Class' } },
}

const ALL = db({ projects: PROJECTS })

/** เสนอร่างใบแรกแบบปกติ — จุดตั้งต้นของทุกเคสในไฟล์นี้ */
async function draftOf(
  name: string,
  raw: Record<string, unknown>,
  d: ReadOnlyDb = ALL
): Promise<Draft> {
  const out = await runPropose(name, raw, { db: d, today: TODAY })
  // ไม่ใช้ assert.equal ตรงนี้ — `asserts` ของมันทำให้ TS มองว่าอีกกิ่งเป็น never
  if (!out.ok) throw new Error(`เสนอร่างตั้งต้นไม่สำเร็จ · ${out.error}`)
  return out.draft
}

const update = (raw: Record<string, unknown>, openDrafts: Draft[], d: ReadOnlyDb = ALL) =>
  runPropose('propose_update_draft', raw, { db: d, today: TODAY, openDrafts })

type ProposeOut = Awaited<ReturnType<typeof runPropose>>
const errorOf = (out: ProposeOut) => (out.ok ? '' : out.error)

const TASK = { type: 'task', project: 'สถาปัตยกรรม', title: 'ส่งรายงาน' }

// ---- ใบเดิม ไม่ใช่ใบใหม่ ----

test('แก้ร่างแล้วได้ใบเดิม — id เท่าเดิม และ rev เดินหน้า', async () => {
  const base = await draftOf('propose_add_item', { ...TASK, due: '2026-09-04 23:59' })
  const out = await update({ due: '2026-09-05 23:59' }, [base])

  assert.equal(out.ok, true, errorOf(out))
  if (!out.ok) return
  assert.equal(out.draft.id, base.id, 'ใบที่สองสำหรับเรื่องเดียวคือการ์ดที่กดยืนยันผิดใบได้')
  assert.equal(out.draft.rev, 1)
  assert.equal(out.draft.title, 'ส่งรายงาน', 'สิ่งที่ไม่ได้บอกให้แก้ต้องอยู่เหมือนเดิม')
  assert.equal(
    (out.draft.action as { dueAt?: string }).dueAt,
    '2026-09-05T16:59:00.000Z',
    'เวลาใหม่ต้องแปลงจากเวลาไทยเหมือนตอนเสนอครั้งแรก ไม่เหลื่อม 7 ชั่วโมง'
  )
})

test('แก้ซ้ำอีกรอบ rev เดินต่อ ไม่ใช่กลับไปหนึ่ง', async () => {
  const base = await draftOf('propose_add_item', TASK)
  const once = await update({ title: 'ส่งรายงานกลุ่ม' }, [base])
  assert.equal(once.ok, true, errorOf(once))
  if (!once.ok) return

  const twice = await update({ title: 'ส่งรายงานเดี่ยว' }, [once.draft])
  assert.equal(twice.ok && twice.draft.rev, 2, 'การ์ดจะไม่ mount ใหม่ถ้า rev ซ้ำค่าเดิม')
})

test('ไม่ใส่ draft_id = แก้ใบล่าสุด · เสียงอ่าน id ออกมาไม่ได้อยู่แล้ว', async () => {
  const first = await draftOf('propose_add_item', { ...TASK, title: 'อันแรก' })
  const second = await draftOf('propose_add_item', {
    type: 'task', project: 'ปฏิบัติการ', title: 'อันหลัง',
  })

  const out = await update({ title: 'แก้แล้ว' }, [first, second])
  assert.equal(out.ok && out.draft.id, second.id)
})

test('ใส่ draft_id ชี้ใบเก่าได้ ถ้าผู้ใช้ระบุ', async () => {
  const first = await draftOf('propose_add_item', { ...TASK, title: 'อันแรก' })
  const second = await draftOf('propose_add_item', {
    type: 'task', project: 'ปฏิบัติการ', title: 'อันหลัง',
  })

  const out = await update({ draft_id: first.id, title: 'แก้ใบแรก' }, [first, second])
  assert.equal(out.ok && out.draft.id, first.id)
  assert.equal(out.ok && out.draft.title, 'แก้ใบแรก')
})

// ---- ปฏิเสธให้ชัด ไม่ใช่เงียบ ----

test('ไม่มีร่างค้างเลย ต้องบอกให้เสนอใหม่', async () => {
  const out = await update({ title: 'x' }, [])
  assert.equal(out.ok, false)
  assert.match(errorOf(out), /ไม่มีร่างค้าง/)
})

test('ชี้ id ที่ไม่มีบนจอแล้ว ต้องไม่ไปแก้ใบอื่นแทน', async () => {
  const base = await draftOf('propose_add_item', TASK)
  const out = await update({ draft_id: 'd_ไม่มีจริง', title: 'x' }, [base])
  assert.equal(out.ok, false)
  assert.match(errorOf(out), /หาร่างใบนั้นไม่เจอ/)
})

test('เรียกมาโดยไม่บอกว่าจะแก้อะไร ต้องเป็น error ไม่ใช่ร่างที่เหมือนเดิม', async () => {
  const base = await draftOf('propose_add_item', TASK)
  const out = await update({}, [base])
  assert.equal(out.ok, false)
})

test('ฟิลด์ที่ร่างใบนั้นไม่มีที่ให้ลง ต้องถูกปฏิเสธ ไม่ใช่รับแล้วทิ้งเงียบ ๆ', async () => {
  // ร่าง "เพิ่มงาน" ไม่มีเวลาเริ่มแบบกิจกรรม · เคยมีบั๊กทรงเดียวกันที่ช่องแก้
  // ขึ้นมาแล้วค่าหายตอนกดยืนยัน (doc/TRAPS.md · 4 ก.ย. 2026)
  const base = await draftOf('propose_add_item', TASK)
  const out = await update({ starts: '2026-09-06 09:00' }, [base])
  assert.equal(out.ok, false)
  assert.match(errorOf(out), /แก้ starts ไม่ได้/)
})

test('ร่างเก็บเข้าคลังไม่มีอะไรให้แก้ · ต้องบอกให้กดทิ้งแทน', async () => {
  const d = db({ projects: PROJECTS, items: [ITEM] })
  const base = await draftOf('propose_archive_item', { item_id: ITEM.id }, d)
  const out = await update({ title: 'x' }, [base], d)
  assert.equal(out.ok, false)
  assert.match(errorOf(out), /ไม่มีอะไรให้แก้/)
})

// ---- การตรวจต้องเกิดซ้ำครบ ----

test('ย้ายวิชาในร่างผ่าน findProject ใหม่ — ชื่อกำกวมยังถูกปฏิเสธ', async () => {
  const base = await draftOf('propose_add_item', TASK)
  const out = await update({ project: 'เครือข่าย' }, [base])
  assert.equal(out.ok, false)
  assert.match(errorOf(out), /ตรงกับหลายวิชา/)
})

test('ย้ายไปวิชาที่ชี้ได้อันเดียว ทำได้และลง id ใหม่จริง', async () => {
  const base = await draftOf('propose_add_item', TASK)
  const out = await update({ project: 'ปฏิบัติการ' }, [base])
  assert.equal(out.ok, true, errorOf(out))
  assert.equal(out.ok && (out.draft.action as { projectId?: string }).projectId, 'p2')
})

// ---- ชนิดกับเวลา ----

test('เปลี่ยนชนิดแล้วเวลาของชนิดเดิมต้องไม่ตามมา', async () => {
  // ถ้า due ตามมา `build` จะปฏิเสธด้วยเหตุผลที่ผู้ใช้ไม่ได้ก่อ
  // ("การเตือนไม่มีกำหนดส่ง") ทั้งที่เขาแค่บอกว่าเปลี่ยนชนิด
  const base = await draftOf('propose_add_item', { ...TASK, due: '2026-09-04 23:59' })
  const out = await update({ type: 'reminder', remind: '2026-09-04 08:00' }, [base])

  assert.equal(out.ok, true, errorOf(out))
  if (!out.ok) return
  const a = out.draft.action as { type?: string; dueAt?: string; remindAt?: string }
  assert.equal(a.type, 'reminder')
  assert.equal(a.dueAt, undefined, 'กำหนดส่งของ task เดิมต้องไม่ติดมากับการเตือน')
  assert.equal(a.remindAt, '2026-09-04T01:00:00.000Z')
})

test('เปลี่ยนเป็นโน้ตแล้วเวลาหายไปทั้งคู่ (CHECK shortnote_timeless)', async () => {
  const base = await draftOf('propose_add_item', {
    ...TASK, title: 'จดไว้', due: '2026-09-04 23:59',
  })
  const out = await update({ type: 'shortnote' }, [base])

  assert.equal(out.ok, true, errorOf(out))
  const a = out.ok ? (out.draft.action as { dueAt?: string; remindAt?: string }) : {}
  assert.equal(a.dueAt, undefined)
  assert.equal(a.remindAt, undefined)
})

test('เลื่อนเวลาเริ่มของกิจกรรม เวลาจบเลื่อนตาม ยาวเท่าเดิม', async () => {
  const base = await draftOf('propose_add_event', {
    project: 'สถาปัตยกรรม',
    title: 'แข่งรอบคัด',
    starts: '2026-09-10 09:00',
    ends: '2026-09-10 17:00',
  })

  const out = await update({ starts: '2026-09-11 13:00' }, [base])
  assert.equal(out.ok, true, errorOf(out))
  if (!out.ok) return

  const a = out.draft.action as { startsAt: string; endsAt: string }
  assert.equal(a.startsAt, '2026-09-11T06:00:00.000Z')
  // ถ้าเวลาจบค้างที่เดิม การเลื่อนไปหลังเวลาจบจะกลายเป็นร่างที่ผิดเสมอ
  assert.equal(new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime(), 8 * 3600_000)
})

test('บอกเวลาจบมาเองด้วย ระบบต้องไม่เลื่อนให้ทับ', async () => {
  const base = await draftOf('propose_add_event', {
    project: 'สถาปัตยกรรม', title: 'แข่ง', starts: '2026-09-10 09:00', ends: '2026-09-10 17:00',
  })
  const out = await update({ starts: '2026-09-10 10:00', ends: '2026-09-10 12:00' }, [base])

  assert.equal(out.ok, true, errorOf(out))
  assert.equal(
    out.ok ? (out.draft.action as { endsAt: string }).endsAt : '',
    '2026-09-10T05:00:00.000Z'
  )
})

test('แก้ร่าง "เอาติ๊กออก" เป็น "ติ๊กเสร็จ" ยังเจอด่านเดิมของ build', async () => {
  const d = db({ projects: PROJECTS, items: [{ ...ITEM, done_at: '2026-09-01T03:00:00.000Z' }] })
  const base = await draftOf('propose_complete_item', { item_id: ITEM.id, done: false }, d)
  const out = await update({ done: true }, [base], d)

  // ของชิ้นนี้ติ๊กอยู่แล้ว การขอติ๊กซ้ำจึงต้องถูกปฏิเสธด้วยเหตุผลเดิม
  assert.equal(out.ok, false)
  assert.match(errorOf(out), /ติ๊กเสร็จอยู่แล้ว/)
})

test('การแก้ร่างยังไม่แตะข้อมูลเลย — เรียกได้แค่ตัวอ่าน', async () => {
  const calls: string[] = []
  const spy: ReadOnlyDb = {
    rpc: async <T>() => {
      calls.push('rpc')
      return [] as T[]
    },
    rows: async <T>(q: { table: string }) => {
      calls.push(`rows:${q.table}`)
      return (q.table === 'projects' ? PROJECTS : []) as T[]
    },
  }

  const base = await draftOf('propose_add_item', TASK, spy)
  calls.length = 0
  await update({ title: 'ชื่อใหม่' }, [base], spy)

  assert.ok(calls.length > 0, 'ต้องมีการอ่านจริงเกิดขึ้น ไม่งั้นเทสต์นี้ผ่านฟรี')
  assert.ok(calls.every((c) => c === 'rpc' || c.startsWith('rows:')), calls.join(' · '))
})
