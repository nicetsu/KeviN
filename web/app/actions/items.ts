'use server'

import { revalidatePath } from 'next/cache'
import { createClient, currentUserId } from '@/lib/supabase/server'

export type Result = { ok: true } | { ok: false; error: string }

/** หน้าที่ได้รับผลกระทบเมื่อ item เปลี่ยน */
function refresh() {
  revalidatePath('/')
  revalidatePath('/library')
  revalidatePath('/calendar')
}

/**
 * ใช้เมื่อ update ไม่โดนสักแถว — ครอบคลุมทั้ง "ไม่ใช่ของเรา" และ "session หมดอายุ"
 * เพราะ RLS ทำให้ทั้งสองกรณีออกมาเหมือนกันคือ 0 แถว
 */
const NOT_WRITTEN = 'บันทึกไม่สำเร็จ — ไม่พบรายการ หรือ session หมดอายุ · ลองโหลดหน้าใหม่'

/*
 * action ที่แค่ update ไม่ต้องถามว่าใครล็อกอินอยู่
 *
 * RLS ปฏิเสธแถวที่ไม่ใช่ของผู้ใช้คนนั้นให้อยู่แล้ว การเรียก getUser() เพิ่มจึงเป็น
 * network call ที่ไม่ได้กันอะไรเพิ่ม · แต่ต้องมี .select() แล้วนับแถวทุกครั้ง
 * ไม่งั้น update ที่ไม่โดนอะไรเลยจะรายงานว่าสำเร็จ (ดู doc/TRAPS.md)
 */

/** ติ๊กเสร็จ / เอาติ๊กออก · shortnote ไม่มีสถานะเสร็จ (CHECK shortnote_timeless) */
export async function toggleDone(itemId: string, done: boolean): Promise<Result> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('items')
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq('id', itemId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: NOT_WRITTEN }
  refresh()
  return { ok: true }
}

/**
 * "ลบ" = เก็บเข้าคลัง ไม่ใช่ DELETE (doc/DECISIONS.md)
 * ของที่เก็บเข้าคลังยังกู้คืนได้ ของที่ลบแล้วหายถาวร
 */
export async function archiveItem(itemId: string): Promise<Result> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('items')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', itemId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: NOT_WRITTEN }
  refresh()
  return { ok: true }
}

/** เลิกทำ — คืนของที่เพิ่งเก็บเข้าคลัง */
export async function restoreItem(itemId: string): Promise<Result> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('items')
    .update({ archived_at: null })
    .eq('id', itemId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: NOT_WRITTEN }
  refresh()
  return { ok: true }
}

export type ItemDraft = {
  project_id: string
  type: 'task' | 'reminder' | 'shortnote'
  title: string
  body?: string | null
  /** ISO string · task ใช้ due_at · reminder ใช้ remind_at */
  at?: string | null
}

/**
 * CHECK constraint ใน DB บังคับความหมายของแต่ละชนิดอยู่แล้ว
 * ที่นี่แค่แปลงให้ตรงรูปก่อนส่ง จะได้ไม่โดนปฏิเสธด้วย error ดิบ ๆ
 */
function shape(d: ItemDraft) {
  const base = {
    project_id: d.project_id,
    type: d.type,
    title: d.title.trim(),
    body: d.body?.trim() || null,
  }
  if (d.type === 'reminder') return { ...base, remind_at: d.at, due_at: null }
  if (d.type === 'task') return { ...base, due_at: d.at || null, remind_at: null }
  return { ...base, due_at: null, remind_at: null, done_at: null }
}

export async function createItem(d: ItemDraft): Promise<Result & { id?: string }> {
  if (!d.title.trim()) return { ok: false, error: 'ต้องมีหัวเรื่อง' }
  if (d.type === 'reminder' && !d.at) return { ok: false, error: 'การเตือนต้องมีเวลา' }

  const supabase = await createClient()
  const userId = await currentUserId(supabase)   // insert ต้องระบุเจ้าของ
  if (!userId) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  const { data, error } = await supabase
    .from('items')
    .insert({ ...shape(d), user_id: userId })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true, id: data.id }
}

export async function updateItem(itemId: string, d: ItemDraft): Promise<Result> {
  if (!d.title.trim()) return { ok: false, error: 'ต้องมีหัวเรื่อง' }
  if (d.type === 'reminder' && !d.at) return { ok: false, error: 'การเตือนต้องมีเวลา' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('items')
    .update(shape(d))
    .eq('id', itemId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: NOT_WRITTEN }
  refresh()
  return { ok: true }
}

/** เก็บ project เข้าคลัง — งานข้างในยังอยู่ครบ */
export async function archiveProject(projectId: string, archived: boolean): Promise<Result> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('projects')
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      status: archived ? 'archived' : 'active',
    })
    .eq('id', projectId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: NOT_WRITTEN }
  refresh()
  revalidatePath(`/project/${projectId}`)
  return { ok: true }
}

/** สร้าง project ใหม่ในกลุ่มที่ระบุ · ใช้จากปุ่มในกล่อง Area ที่ยังว่าง */
export async function createProject(areaId: string, name: string): Promise<Result & { id?: string }> {
  const supabase = await createClient()
  const userId = await currentUserId(supabase)   // insert ต้องระบุเจ้าของ
  if (!userId) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  const clean = name.trim()
  if (!clean) return { ok: false, error: 'ต้องมีชื่อ' }
  if (clean.length > 120) return { ok: false, error: 'ชื่อยาวเกิน 120 ตัวอักษร' }

  // ต่อท้ายเสมอ ไม่แทรกกลาง
  const { data: last } = await supabase
    .from('projects')
    .select('sort_order')
    .eq('area_id', areaId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      area_id: areaId,
      name: clean,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true, id: data.id }
}

/**
 * จัดลำดับใหม่ · `ids` เรียงตามลำดับที่ต้องการแล้ว เขียน sort_order = ตำแหน่ง
 *
 * เรียกได้เฉพาะกับชุดแถวที่ sort_order เป็นตัวตัดสินลำดับจริง
 * (โน้ตทั้งกลุ่ม · งานที่ยังไม่เสร็จและไม่มีวันกำหนด) — ที่อื่นลากแล้วจะเด้งกลับ
 * เพราะ due_at/remind_at มาก่อนใน comparator
 */
export async function reorderItems(ids: string[]): Promise<Result> {
  const supabase = await createClient()

  if (ids.length === 0) return { ok: true }
  if (ids.length > 200) return { ok: false, error: 'รายการยาวเกินไป' }
  if (new Set(ids).size !== ids.length) return { ok: false, error: 'รายการซ้ำ' }

  // RLS กันไม่ให้แตะแถวของคนอื่นอยู่แล้ว ที่นี่จึงไม่ต้องเช็ก user_id ซ้ำ
  //
  // ⚠️ ต้องมี .select() — update ที่ไม่โดนสักแถวจะ "สำเร็จ" เงียบ ๆ ไม่มี error
  //    ตอนทำครั้งแรกพลาดข้อนี้ ลากแล้วดูเหมือนได้ แต่กด F5 ลำดับเด้งกลับหมด
  const results = await Promise.all(
    ids.map((id, i) =>
      supabase.from('items').update({ sort_order: i }).eq('id', id).select('id')
    )
  )

  const failed = results.find((r) => r.error)
  if (failed?.error) return { ok: false, error: failed.error.message }

  const missed = results.filter((r) => (r.data?.length ?? 0) === 0).length
  if (missed > 0) return { ok: false, error: NOT_WRITTEN }

  refresh()
  return { ok: true }
}
