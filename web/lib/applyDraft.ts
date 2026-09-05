/**
 * ตรรกะของ **จุดเดียวในระบบที่ผู้ช่วยทำให้ข้อมูลเปลี่ยนได้**
 *
 * ตัวไฟล์นี้ไม่ใช่ server action และไม่รู้จัก `next/cache` เลย — มันรับ client
 * ของ Supabase เข้ามาเป็นพารามิเตอร์ · `app/actions/propose.ts` เป็นเปลือกบาง ๆ
 * ที่ประกอบ client จริง เรียกฟังก์ชันในนี้ แล้วค่อย `revalidatePath`
 *
 * ⚠️ **ที่ต้องแยกออกมาเพราะเทสต์** — ของเดิมอยู่ในไฟล์ `'use server'` ที่ผูกกับ
 *    `cookies()` และ `revalidatePath()` จึงเรียกจากชุดเทสต์ไม่ได้เลย ผลคือ
 *    ทางเดียวที่เขียนข้อมูลได้จริงเป็นทางเดียวที่ไม่มีเทสต์คุม (ARCHITECTURE.md §11)
 *
 * ⚠️ **ไม่เชื่ออะไรเลยที่ส่งมาจากหน้าจอ** ร่างเดินทางผ่านเบราว์เซอร์ ใครแก้ก็ได้
 *    ทุกอย่างถูกตรวจใหม่ที่นี่: ชนิดถูกไหม · id มีอยู่จริงไหม · อยู่ใน Area
 *    ที่ผู้ช่วยมองเห็นไหม · เป็นของผู้ใช้คนนี้ไหม
 *
 * ⚠️ **ไม่มีทางลบถาวรอยู่ในไฟล์นี้** ตั้งใจ — ที่ทำได้มากสุดคือเก็บเข้าคลัง
 *    ซึ่งสายพาน `housekeeping()` จะลบให้เองเมื่อครบ 7 วัน และกู้คืนได้ก่อนหน้านั้น
 */

/* นำเข้าแบบ relative ไม่ใช่ `@/` — ชุดเทสต์คอมไพล์เป็น CommonJS แล้วรันด้วย node
   ตรง ๆ ซึ่งไม่รู้จัก path alias ของ bundler (ทุกไฟล์ที่เทสต์เอื้อมถึงเป็นแบบนี้) */
import { areaIsVisible } from './ai/visibility'
import { isDraftKind, type DraftAction } from './drafts'

/* ------------------------------------------------------------------ ช่องต่อ DB */

type Fail = { message: string }
type Res<T> = PromiseLike<{ data: T; error: Fail | null }>

/** แถวที่อ่านกลับมาตอนตรวจสิทธิ์ · รูปหลวมเพราะ join ของ Supabase คืนได้ทั้ง object และ array */
type Row = Record<string, unknown>

/**
 * ผิวของ Supabase client **เท่าที่ไฟล์นี้ใช้จริง** — ไม่มากกว่านี้แม้แต่เมธอดเดียว
 *
 * ที่ประกาศเองแทนการอ้าง type ของ Supabase ตรง ๆ เพราะเทสต์ต้องสร้างตัวปลอมมาสวมได้
 * และเพราะการเขียนรายการนี้ออกมาทำให้เห็นด้วยตาว่า **ไม่มี `.delete()` อยู่ในนั้น**
 */
export type DraftDb = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        is(column: string, value: null): { maybeSingle(): Res<Row | null> }
      }
    }
    insert(row: Row): { select(columns: string): Res<{ id: string }[] | null> }
    update(patch: Row): {
      eq(column: string, value: string): { select(columns: string): Res<{ id: string }[] | null> }
    }
  }
}

/* --------------------------------------------------------------------- ผลลัพธ์ */

/**
 * สิ่งที่ต้องรู้เพื่อย้อนการเขียนที่เพิ่งทำไป
 *
 * ⚠️ **การติ๊กต้องพก `prev` มาด้วย** — "เอาติ๊กออก" เขียน `done_at = null`
 *    ถ้าการย้อนเขียน `null` เหมือนกันอีกที ผลคือไม่มีอะไรเปลี่ยนแต่จอบอกว่าเลิกทำแล้ว
 *    (เจอ 4 ก.ย. 2026) · ส่วนการเก็บเข้าคลังย้อนเป็น `null` ได้เสมอ เพราะเก็บได้
 *    เฉพาะของที่ `archived_at is null` อยู่ก่อนแล้ว
 */
export type UndoTarget =
  | { itemId: string; field: 'done'; prev: string | null }
  | { itemId: string; field: 'archived' }

export type ApplyResult =
  | { ok: true; message: string; undo?: UndoTarget }
  | { ok: false; error: string }

/** ใช้เมื่อเขียนแล้วไม่โดนสักแถว — RLS ทำให้ "ไม่ใช่ของเรา" กับ "หมด session" เหมือนกัน */
export const NOT_WRITTEN =
  'บันทึกไม่สำเร็จ — ไม่พบรายการ หรือ session หมดอายุ · ลองโหลดหน้าใหม่'

/* ----------------------------------------------------------------- ตัวช่วยตรวจ */

/** Supabase คืน relation เป็น object หรือ array แล้วแต่รูป join — รับทั้งสองแบบ */
function one(v: unknown): Row | undefined {
  if (Array.isArray(v)) return v[0] as Row | undefined
  return (v ?? undefined) as Row | undefined
}

function areaNameOf(row: Row, path: 'areas' | 'projects.areas'): string | undefined {
  const holder = path === 'areas' ? row : one(row.projects)
  const area = one(holder?.areas)
  const name = area?.name
  return typeof name === 'string' ? name : undefined
}

/**
 * ตรวจว่าวิชานี้เป็นของผู้ใช้ **และอยู่ใน Area ที่ผู้ช่วยมองเห็น**
 *
 * ⚠️ ข้อหลังสำคัญกว่าที่คิด — ตัวกรอง Area ใน `runTool()` กันแค่ข้อมูล**ขาออก**
 *    ขาเข้าเป็นคนละทาง · ถ้าไม่ตรงนี้ ร่างที่ชี้ไปวิชาในกลุ่มที่ซ่อนไว้จะเขียนผ่านได้
 */
async function assertProjectAllowed(db: DraftDb, projectId: string): Promise<string | null> {
  const { data, error } = await db
    .from('projects')
    .select('id, areas(name)')
    .eq('id', projectId)
    .is('archived_at', null)
    .maybeSingle()

  if (error) return error.message
  if (!data) return 'ไม่พบวิชานั้น'
  if (!areaIsVisible(areaNameOf(data, 'areas'))) return 'วิชานั้นอยู่นอกขอบเขตที่ผู้ช่วยแตะได้'
  return null
}

/**
 * ตรวจ item แบบเดียวกัน แล้วคืนชนิดกับ **ค่าเดิมของ `done_at`** มาด้วย
 *
 * ค่าเดิมต้องอ่านตรงนี้เพราะเป็นจังหวะเดียวที่ยังอ่านทันก่อนเขียนทับ —
 * ปุ่มเลิกทำต้องเอาไปคืนค่า ไม่ใช่เขียน `null` ทับซ้ำ (ดู `UndoTarget`)
 */
async function assertItemAllowed(
  db: DraftDb,
  itemId: string
): Promise<{ ok: false; error: string } | { ok: true; type: string; doneAt: string | null }> {
  const { data, error } = await db
    .from('items')
    .select('id, type, done_at, projects(areas(name))')
    .eq('id', itemId)
    .is('archived_at', null)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'ไม่พบรายการนั้น' }
  if (!areaIsVisible(areaNameOf(data, 'projects.areas')))
    return { ok: false, error: 'รายการนั้นอยู่นอกขอบเขตที่ผู้ช่วยแตะได้' }

  const doneAt = data.done_at
  return {
    ok: true,
    type: String(data.type),
    doneAt: typeof doneAt === 'string' ? doneAt : null,
  }
}

/* ------------------------------------------------------------------- ลงมือเขียน */

/**
 * ลงมือทำตามร่างหนึ่งใบ
 *
 * ⚠️ ทุกคำสั่งเขียนต้องมี `.select()` แล้วนับแถว — เขียนที่ไม่โดนอะไรเลยไม่ใช่ error
 *    ในสายตา Supabase ถ้าไม่นับ จะรายงานว่าสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน (doc/TRAPS.md)
 */
export async function applyDraftWith(
  db: DraftDb,
  userId: string | null,
  action: DraftAction
): Promise<ApplyResult> {
  if (!action || typeof action !== 'object' || !isDraftKind((action as { kind?: unknown }).kind)) {
    return { ok: false, error: 'ร่างนี้อ่านไม่ออก · ลองสั่งใหม่อีกครั้ง' }
  }
  if (!userId) return { ok: false, error: 'session หมดอายุ · ลองโหลดหน้าใหม่' }

  switch (action.kind) {
    // ------------------------------------------------------------------ เพิ่ม
    case 'add_item': {
      const blocked = await assertProjectAllowed(db, action.projectId)
      if (blocked) return { ok: false, error: blocked }

      const { data, error } = await db
        .from('items')
        .insert({
          user_id: userId,
          project_id: action.projectId,
          type: action.type,
          title: action.title,
          body: action.body ?? null,
          // CHECK ใน DB บังคับว่า task ห้ามมี remind และ reminder ห้ามมี due
          // ชั้นเสนอกันไว้แล้ว ตรงนี้กันซ้ำเผื่อร่างถูกแก้ระหว่างทาง
          due_at: action.type === 'task' ? (action.dueAt ?? null) : null,
          remind_at: action.type === 'reminder' ? (action.remindAt ?? null) : null,
        })
        .select('id')

      if (error) return { ok: false, error: error.message }
      if (!data?.length) return { ok: false, error: NOT_WRITTEN }
      return { ok: true, message: `เพิ่ม “${action.title}” แล้ว` }
    }

    case 'add_event': {
      const blocked = await assertProjectAllowed(db, action.projectId)
      if (blocked) return { ok: false, error: blocked }

      const { data, error } = await db
        .from('events')
        .insert({
          user_id: userId,
          project_id: action.projectId,
          title: action.title,
          body: action.body ?? null,
          starts_at: action.startsAt,
          ends_at: action.endsAt,
          location: action.location ?? null,
          label: action.label ?? null,
        })
        .select('id')

      if (error) return { ok: false, error: error.message }
      if (!data?.length) return { ok: false, error: NOT_WRITTEN }
      return { ok: true, message: `เพิ่มกิจกรรม “${action.title}” แล้ว` }
    }

    // ------------------------------------------------------------------- แก้
    case 'edit_item': {
      const check = await assertItemAllowed(db, action.itemId)
      if (!check.ok) return { ok: false, error: check.error }

      /* ใส่เฉพาะฟิลด์ที่ร่างบอกว่าจะเปลี่ยนจริง — `null` คือล้างค่า ซึ่งต่างจากไม่แตะ */
      const patch: Row = {}
      if (action.title !== undefined) patch.title = action.title
      if (action.body !== undefined) patch.body = action.body
      if (action.dueAt !== undefined) patch.due_at = action.dueAt
      if (action.remindAt !== undefined) patch.remind_at = action.remindAt

      if (action.projectId !== undefined) {
        const blocked = await assertProjectAllowed(db, action.projectId)
        if (blocked) return { ok: false, error: blocked }
        patch.project_id = action.projectId
      }

      if (Object.keys(patch).length === 0) {
        return { ok: false, error: 'ร่างนี้ไม่ได้เปลี่ยนอะไรเลย' }
      }

      const { data, error } = await db
        .from('items')
        .update(patch)
        .eq('id', action.itemId)
        .select('id')

      if (error) return { ok: false, error: error.message }
      if (!data?.length) return { ok: false, error: NOT_WRITTEN }
      return { ok: true, message: 'แก้ให้แล้ว' }
    }

    // -------------------------------------------------------- ติ๊ก / เก็บเข้าคลัง
    case 'complete_item': {
      const check = await assertItemAllowed(db, action.itemId)
      if (!check.ok) return { ok: false, error: check.error }
      if (check.type === 'shortnote') return { ok: false, error: 'โน้ตไม่มีสถานะเสร็จ' }

      const { data, error } = await db
        .from('items')
        .update({ done_at: action.done ? new Date().toISOString() : null })
        .eq('id', action.itemId)
        .select('id')

      if (error) return { ok: false, error: error.message }
      if (!data?.length) return { ok: false, error: NOT_WRITTEN }
      return {
        ok: true,
        message: action.done ? 'ติ๊กว่าเสร็จแล้ว' : 'เอาติ๊กออกแล้ว',
        // ค่าเดิมเดินทางไปกับปุ่มเลิกทำ — ไม่งั้นการย้อน "เอาติ๊กออก" จะเขียน null ซ้ำ
        undo: { itemId: action.itemId, field: 'done', prev: check.doneAt },
      }
    }

    case 'archive_item': {
      const check = await assertItemAllowed(db, action.itemId)
      if (!check.ok) return { ok: false, error: check.error }

      const { data, error } = await db
        .from('items')
        // ผู้ใช้เป็นคนสั่งเก็บ ไม่ใช่ระบบเก็บให้ — ปลดธงอัตโนมัติเผื่อเคยถูกเก็บมาก่อน
        .update({ archived_at: new Date().toISOString(), archived_auto: false })
        .eq('id', action.itemId)
        .select('id')

      if (error) return { ok: false, error: error.message }
      if (!data?.length) return { ok: false, error: NOT_WRITTEN }
      return {
        ok: true,
        message: 'เก็บเข้าคลังแล้ว · กู้คืนได้ 7 วัน',
        undo: { itemId: action.itemId, field: 'archived' },
      }
    }
  }
}

/**
 * เลิกทำสิ่งที่เพิ่งยืนยันไป — ใช้กับแถบเลิกทำที่ขึ้นหลังเขียนสำเร็จ
 *
 * รองรับแค่สองอย่างที่ย้อนได้ตรง ๆ · การเพิ่มของใหม่ไม่มีปุ่มเลิกทำ
 * เพราะการย้อนมันคือการลบ ซึ่งเป็นสิ่งที่ทั้งระบบนี้ตั้งใจไม่ให้ผู้ช่วยทำ
 *
 * ⚠️ **การย้อนคือการคืนค่าเดิม ไม่ใช่การล้างค่า** — `target.prev` มาจากตอนที่
 *    `applyDraftWith` อ่านไว้ก่อนเขียนทับ · ถ้าย้อนด้วย `null` ตายตัว การเลิกทำหลัง
 *    "เอาติ๊กออก" จะไม่เปลี่ยนอะไรเลยแต่รายงานว่าสำเร็จ
 */
export async function undoApplyWith(db: DraftDb, target: UndoTarget): Promise<ApplyResult> {
  const check = await assertItemAllowed(db, target.itemId)
  // ของที่เพิ่งเก็บเข้าคลังจะหาไม่เจอด้วยเงื่อนไข archived_at is null — ข้ามการตรวจนั้น
  if (!check.ok && target.field === 'done') return { ok: false, error: check.error }

  const patch: Row =
    target.field === 'done'
      ? { done_at: target.prev }
      : { archived_at: null, archived_auto: false }

  const { data, error } = await db.from('items').update(patch).eq('id', target.itemId).select('id')
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: NOT_WRITTEN }
  return { ok: true, message: 'เลิกทำแล้ว' }
}
