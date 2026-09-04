'use server'

import { revalidatePath } from 'next/cache'
import { createClient, currentUserId } from '@/lib/supabase/server'
import { areaIsVisible } from '@/lib/ai/visibility'
import { isDraftKind, type DraftAction } from '@/lib/drafts'

/**
 * จุดเดียวในระบบที่ผู้ช่วยทำให้ข้อมูลเปลี่ยนได้ — และมันอยู่**หลังปุ่มที่ผู้ใช้กด**
 *
 * ชั้น tool คืนได้แค่ร่าง (`lib/ai/propose.ts`) · ไฟล์นี้คือที่ที่ร่างกลายเป็นของจริง
 * ตอนผู้ใช้กดยืนยันบนการ์ด (doc/WRITE.md)
 *
 * ⚠️ **ไม่เชื่ออะไรเลยที่ส่งมาจากหน้าจอ** ร่างเดินทางผ่านเบราว์เซอร์ ใครแก้ก็ได้
 *    ทุกอย่างถูกตรวจใหม่ที่นี่: ชนิดถูกไหม · id มีอยู่จริงไหม · อยู่ใน Area
 *    ที่ผู้ช่วยมองเห็นไหม · เป็นของผู้ใช้คนนี้ไหม
 *
 * ⚠️ **ไม่มีทางลบถาวรอยู่ในไฟล์นี้** ตั้งใจ — ที่ทำได้มากสุดคือเก็บเข้าคลัง
 *    ซึ่งสายพาน `housekeeping()` จะลบให้เองเมื่อครบ 7 วัน และกู้คืนได้ก่อนหน้านั้น
 */

export type ApplyResult =
  | { ok: true; message: string; undo?: { itemId: string; field: 'done' | 'archived' } }
  | { ok: false; error: string }

/** ใช้เมื่อเขียนแล้วไม่โดนสักแถว — RLS ทำให้ "ไม่ใช่ของเรา" กับ "หมด session" เหมือนกัน */
const NOT_WRITTEN = 'บันทึกไม่สำเร็จ — ไม่พบรายการ หรือ session หมดอายุ · ลองโหลดหน้าใหม่'

function refresh() {
  revalidatePath('/')
  revalidatePath('/library')
  revalidatePath('/calendar')
  revalidatePath('/project/[id]', 'page')
  revalidatePath('/project/[id]/event/[eventId]', 'page')
}

/**
 * ตรวจว่าวิชานี้เป็นของผู้ใช้ **และอยู่ใน Area ที่ผู้ช่วยมองเห็น**
 *
 * ⚠️ ข้อหลังสำคัญกว่าที่คิด — ตัวกรอง Area ใน `runTool()` กันแค่ข้อมูล**ขาออก**
 *    ขาเข้าเป็นคนละทาง · ถ้าไม่ตรงนี้ ร่างที่ชี้ไปวิชาในกลุ่มที่ซ่อนไว้จะเขียนผ่านได้
 */
async function assertProjectAllowed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, areas(name)')
    .eq('id', projectId)
    .is('archived_at', null)
    .maybeSingle()

  if (error) return error.message
  if (!data) return 'ไม่พบวิชานั้น'

  // Supabase คืน relation เป็น object หรือ array แล้วแต่รูป join — รับทั้งสองแบบ
  const areas = data.areas as { name?: string } | { name?: string }[] | null
  const areaName = Array.isArray(areas) ? areas[0]?.name : areas?.name
  if (!areaIsVisible(areaName)) return 'วิชานั้นอยู่นอกขอบเขตที่ผู้ช่วยแตะได้'
  return null
}

/** ตรวจ item แบบเดียวกัน แล้วคืนวิชาที่มันสังกัดมาด้วยเผื่อใช้ต่อ */
async function assertItemAllowed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string
): Promise<{ ok: false; error: string } | { ok: true; type: string }> {
  const { data, error } = await supabase
    .from('items')
    .select('id, type, projects(areas(name))')
    .eq('id', itemId)
    .is('archived_at', null)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'ไม่พบรายการนั้น' }

  const projects = data.projects as { areas?: unknown } | { areas?: unknown }[] | null
  const p = Array.isArray(projects) ? projects[0] : projects
  const areas = p?.areas as { name?: string } | { name?: string }[] | null | undefined
  const areaName = Array.isArray(areas) ? areas[0]?.name : areas?.name
  if (!areaIsVisible(areaName)) return { ok: false, error: 'รายการนั้นอยู่นอกขอบเขตที่ผู้ช่วยแตะได้' }
  return { ok: true, type: String(data.type) }
}

/**
 * ลงมือทำตามร่างหนึ่งใบ
 *
 * ⚠️ ทุกคำสั่งเขียนต้องมี `.select()` แล้วนับแถว — เขียนที่ไม่โดนอะไรเลยไม่ใช่ error
 *    ในสายตา Supabase ถ้าไม่นับ จะรายงานว่าสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน (doc/TRAPS.md)
 */
export async function applyDraft(action: DraftAction): Promise<ApplyResult> {
  if (!action || typeof action !== 'object' || !isDraftKind((action as { kind?: unknown }).kind)) {
    return { ok: false, error: 'ร่างนี้อ่านไม่ออก · ลองสั่งใหม่อีกครั้ง' }
  }

  const supabase = await createClient()
  const userId = await currentUserId(supabase)
  if (!userId) return { ok: false, error: 'session หมดอายุ · ลองโหลดหน้าใหม่' }

  switch (action.kind) {
    // ------------------------------------------------------------------ เพิ่ม
    case 'add_item': {
      const blocked = await assertProjectAllowed(supabase, action.projectId)
      if (blocked) return { ok: false, error: blocked }

      const { data, error } = await supabase
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
      refresh()
      return { ok: true, message: `เพิ่ม “${action.title}” แล้ว` }
    }

    case 'add_event': {
      const blocked = await assertProjectAllowed(supabase, action.projectId)
      if (blocked) return { ok: false, error: blocked }

      const { data, error } = await supabase
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
      refresh()
      return { ok: true, message: `เพิ่มกิจกรรม “${action.title}” แล้ว` }
    }

    // ------------------------------------------------------------------- แก้
    case 'edit_item': {
      const check = await assertItemAllowed(supabase, action.itemId)
      if (!check.ok) return { ok: false, error: check.error }

      /* ใส่เฉพาะฟิลด์ที่ร่างบอกว่าจะเปลี่ยนจริง — `null` คือล้างค่า ซึ่งต่างจากไม่แตะ */
      const patch: Record<string, unknown> = {}
      if (action.title !== undefined) patch.title = action.title
      if (action.body !== undefined) patch.body = action.body
      if (action.dueAt !== undefined) patch.due_at = action.dueAt
      if (action.remindAt !== undefined) patch.remind_at = action.remindAt

      if (action.projectId !== undefined) {
        const blocked = await assertProjectAllowed(supabase, action.projectId)
        if (blocked) return { ok: false, error: blocked }
        patch.project_id = action.projectId
      }

      if (Object.keys(patch).length === 0) {
        return { ok: false, error: 'ร่างนี้ไม่ได้เปลี่ยนอะไรเลย' }
      }

      const { data, error } = await supabase
        .from('items')
        .update(patch)
        .eq('id', action.itemId)
        .select('id')

      if (error) return { ok: false, error: error.message }
      if (!data?.length) return { ok: false, error: NOT_WRITTEN }
      refresh()
      return { ok: true, message: 'แก้ให้แล้ว' }
    }

    // -------------------------------------------------------- ติ๊ก / เก็บเข้าคลัง
    case 'complete_item': {
      const check = await assertItemAllowed(supabase, action.itemId)
      if (!check.ok) return { ok: false, error: check.error }
      if (check.type === 'shortnote') return { ok: false, error: 'โน้ตไม่มีสถานะเสร็จ' }

      const { data, error } = await supabase
        .from('items')
        .update({ done_at: action.done ? new Date().toISOString() : null })
        .eq('id', action.itemId)
        .select('id')

      if (error) return { ok: false, error: error.message }
      if (!data?.length) return { ok: false, error: NOT_WRITTEN }
      refresh()
      return {
        ok: true,
        message: action.done ? 'ติ๊กว่าเสร็จแล้ว' : 'เอาติ๊กออกแล้ว',
        undo: { itemId: action.itemId, field: 'done' },
      }
    }

    case 'archive_item': {
      const check = await assertItemAllowed(supabase, action.itemId)
      if (!check.ok) return { ok: false, error: check.error }

      const { data, error } = await supabase
        .from('items')
        // ผู้ใช้เป็นคนสั่งเก็บ ไม่ใช่ระบบเก็บให้ — ปลดธงอัตโนมัติเผื่อเคยถูกเก็บมาก่อน
        .update({ archived_at: new Date().toISOString(), archived_auto: false })
        .eq('id', action.itemId)
        .select('id')

      if (error) return { ok: false, error: error.message }
      if (!data?.length) return { ok: false, error: NOT_WRITTEN }
      refresh()
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
 */
export async function undoApply(itemId: string, field: 'done' | 'archived'): Promise<ApplyResult> {
  const supabase = await createClient()
  const check = await assertItemAllowed(supabase, itemId)
  // ของที่เพิ่งเก็บเข้าคลังจะหาไม่เจอด้วยเงื่อนไข archived_at is null — ข้ามการตรวจนั้น
  if (!check.ok && field === 'done') return { ok: false, error: check.error }

  const patch = field === 'done'
    ? { done_at: null }
    : { archived_at: null, archived_auto: false }

  const { data, error } = await supabase.from('items').update(patch).eq('id', itemId).select('id')
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: NOT_WRITTEN }
  refresh()
  return { ok: true, message: 'เลิกทำแล้ว' }
}
