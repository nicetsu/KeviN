'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type Result = { ok: true } | { ok: false; error: string }

/** หน้าที่ได้รับผลกระทบเมื่อ item เปลี่ยน */
function refresh() {
  revalidatePath('/')
  revalidatePath('/library')
  revalidatePath('/calendar')
}

async function client() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return { supabase, user: data.user }
}

/** ติ๊กเสร็จ / เอาติ๊กออก · shortnote ไม่มีสถานะเสร็จ (CHECK shortnote_timeless) */
export async function toggleDone(itemId: string, done: boolean): Promise<Result> {
  const { supabase, user } = await client()
  if (!user) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('items')
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq('id', itemId)

  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

/**
 * "ลบ" = เก็บเข้าคลัง ไม่ใช่ DELETE (doc/DECISIONS.md)
 * ของที่เก็บเข้าคลังยังกู้คืนได้ ของที่ลบแล้วหายถาวร
 */
export async function archiveItem(itemId: string): Promise<Result> {
  const { supabase, user } = await client()
  if (!user) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('items')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

/** เลิกทำ — คืนของที่เพิ่งเก็บเข้าคลัง */
export async function restoreItem(itemId: string): Promise<Result> {
  const { supabase, user } = await client()
  if (!user) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase.from('items').update({ archived_at: null }).eq('id', itemId)
  if (error) return { ok: false, error: error.message }
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
  const { supabase, user } = await client()
  if (!user) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  if (!d.title.trim()) return { ok: false, error: 'ต้องมีหัวเรื่อง' }
  if (d.type === 'reminder' && !d.at) return { ok: false, error: 'การเตือนต้องมีเวลา' }

  const { data, error } = await supabase
    .from('items')
    .insert({ ...shape(d), user_id: user.id })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true, id: data.id }
}

export async function updateItem(itemId: string, d: ItemDraft): Promise<Result> {
  const { supabase, user } = await client()
  if (!user) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  if (!d.title.trim()) return { ok: false, error: 'ต้องมีหัวเรื่อง' }
  if (d.type === 'reminder' && !d.at) return { ok: false, error: 'การเตือนต้องมีเวลา' }

  const { error } = await supabase.from('items').update(shape(d)).eq('id', itemId)
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

/** เก็บ project เข้าคลัง — งานข้างในยังอยู่ครบ */
export async function archiveProject(projectId: string, archived: boolean): Promise<Result> {
  const { supabase, user } = await client()
  if (!user) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('projects')
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      status: archived ? 'archived' : 'active',
    })
    .eq('id', projectId)

  if (error) return { ok: false, error: error.message }
  refresh()
  revalidatePath(`/project/${projectId}`)
  return { ok: true }
}
