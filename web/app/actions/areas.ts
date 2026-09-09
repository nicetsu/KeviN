'use server'

import { revalidatePath } from 'next/cache'
import { AREA_CLASS } from '@/lib/areaColor'
import { createClient, currentUserId } from '@/lib/supabase/server'

export type Result = { ok: true } | { ok: false; error: string }

const NOT_WRITTEN = 'บันทึกไม่สำเร็จ — ไม่พบ Area นั้น หรือ session หมดอายุ · ลองโหลดหน้าใหม่'

function refresh() {
  revalidatePath('/library')
  revalidatePath('/library/[areaId]', 'page')
}

/**
 * คีย์สีที่เลือกได้ — **ผูกกับ `AREA_CLASS` ไม่ใช่รายการที่พิมพ์ซ้ำไว้ตรงนี้**
 *
 * ⚠️ ถ้าแยกสองที่ วันหนึ่งจะเพิ่ม gradient ใน CSS แล้วลืมมาเปิดที่นี่ (หรือกลับกัน
 *    คือรับคีย์ที่ไม่มี gradient แล้วได้การ์ดไม่มีสีโดยไม่มี error) · เอาจาก
 *    ที่เดียวจึงเถียงกันเองไม่ได้ (doc/TRAPS.md)
 */
const COLOR_KEYS = Object.keys(AREA_CLASS)

/** ตรงกับ CHECK `char_length(name) between 1 and 80` ใน DB */
const MAX_NAME = 80

/**
 * ตรงกับ CHECK `area_desc_len` ใน DB (9 ก.ย. 2026)
 *
 * ⚠️ เพดานนี้ไม่ใช่เรื่องหน้าจอ — คำอธิบายถูกส่งเข้าโมเดล**ทุกครั้งที่เรียก tool
 *    `areas`** ช่องที่ไม่มีเพดานคือช่องที่วันหนึ่งมีคนวางเรียงความลงไปแล้วจ่าย
 *    โทเคนทุกคำขอตลอดไป · แก้ค่าที่นี่ต้องแก้ CHECK ใน DB ด้วย ไม่งั้นฝั่งหนึ่ง
 *    จะปฏิเสธเงียบ ๆ ในแบบที่อีกฝั่งไม่รู้
 */
const MAX_DESC = 200

/** เว้นว่าง = `null` ไม่ใช่สตริงว่าง — คีย์ที่ว่างเปล่าอ่านเหมือน "มีแต่ไม่มีเนื้อ" */
function cleanDesc(raw: string): string | null | undefined {
  const desc = raw.trim().replace(/\s+/g, ' ')
  if (desc.length === 0) return null
  if (desc.length > MAX_DESC) return undefined
  return desc
}

function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length === 0 || name.length > MAX_NAME) return null
  return name
}

/** unique(user_id, name) ทำให้ชื่อซ้ำเป็น error ของ Postgres ที่ผู้ใช้อ่านไม่ออก */
function friendly(message: string): string {
  if (message.includes('duplicate key') || message.includes('areas_user_id_name_key')) {
    return 'มี Area ชื่อนี้อยู่แล้ว'
  }
  return message
}

export async function createArea(name: string, color: string, description = ''): Promise<Result> {
  const clean = cleanName(name)
  if (!clean) return { ok: false, error: `ชื่อ Area ต้องยาว 1–${MAX_NAME} ตัว` }
  if (!COLOR_KEYS.includes(color)) return { ok: false, error: 'ไม่รู้จักสีนั้น' }
  const desc = cleanDesc(description)
  if (desc === undefined) return { ok: false, error: `คำอธิบายยาวได้ไม่เกิน ${MAX_DESC} ตัว` }

  const supabase = await createClient()
  const userId = await currentUserId(supabase)   // insert ต้องระบุเจ้าของ
  if (!userId) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  // ต่อท้ายเสมอ — Area ใหม่ไม่ควรแทรกกลางลำดับที่ผู้ใช้คุ้นตาแล้ว
  const { data: last } = await supabase
    .from('areas')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from('areas')
    .insert({
      user_id: userId,
      name: clean,
      color,
      description: desc,
      sort_order: (last?.sort_order ?? -1) + 1,
    })

  if (error) return { ok: false, error: friendly(error.message) }
  refresh()
  return { ok: true }
}

/**
 * เปลี่ยนชื่อและสี
 *
 * เคยมีกับดักว่าการเปลี่ยนชื่อ Area ทำให้ผู้ช่วยมองไม่เห็นทั้ง Area โดยไม่มี error
 * เพราะ `VISIBLE_AREAS` เป็น allowlist ที่ผูกกับ **ชื่อ** · ตัวกรองนั้นถูกถอด
 * ทั้งกลไกเมื่อ 8 ก.ย. 2026 การเปลี่ยนชื่อจึงไม่มีผลข้างเคียงแล้ว (doc/DECISIONS.md)
 */
export async function updateArea(
  areaId: string,
  name: string,
  color: string,
  description = '',
): Promise<Result> {
  const clean = cleanName(name)
  if (!clean) return { ok: false, error: `ชื่อ Area ต้องยาว 1–${MAX_NAME} ตัว` }
  if (!COLOR_KEYS.includes(color)) return { ok: false, error: 'ไม่รู้จักสีนั้น' }
  const desc = cleanDesc(description)
  if (desc === undefined) return { ok: false, error: `คำอธิบายยาวได้ไม่เกิน ${MAX_DESC} ตัว` }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('areas')
    .update({ name: clean, color, description: desc })
    .eq('id', areaId)
    .select('id')

  if (error) return { ok: false, error: friendly(error.message) }
  if (!data?.length) return { ok: false, error: NOT_WRITTEN }
  refresh()
  return { ok: true }
}

/**
 * "ลบ" Area = เก็บเข้าคลัง **ไม่ใช่ `DELETE`** (เจ้าของเคาะ 8 ก.ย. 2026)
 *
 * ⚠️ `projects.area_id` เป็น `on delete cascade` — ลบ Area หนึ่งใบจริง ๆ จะพา
 *    project ทั้งหมดข้างใน แล้วพา items/events/schedules ของแต่ละ project
 *    หายตามไปทั้งกอง · **นี่คือปุ่มที่ทำลายมากที่สุดในแอป** ถ้ามันลบจริง
 *
 * ⚠️ `housekeeping()` **ไม่แตะ `areas`** โดยตั้งใจ (มติ 1 ก.ย. 2026) Area ที่เก็บ
 *    เข้าคลังจึงอยู่ยาว ไม่เข้าสายพานลบ 7 วันเหมือน item กับ event
 *
 * เงื่อนไข: Area ที่ยังมี project ที่ไม่ได้เก็บเข้าคลัง เก็บไม่ได้ — ต้องเคลียร์
 * ข้างในก่อน · ไม่งั้นของทั้งกองจะหายจากสายตาด้วยการกดปุ่มเดียว ซึ่งขัดหลัก
 * UX ข้อ 5 "ไม่มีอะไรหายเงียบ ๆ"
 */
export async function archiveArea(areaId: string): Promise<Result> {
  const supabase = await createClient()

  const { data: live, error: countError } = await supabase
    .from('projects')
    .select('id')
    .eq('area_id', areaId)
    .is('archived_at', null)
    .neq('status', 'archived')
    .limit(1)

  if (countError) return { ok: false, error: countError.message }
  if (live?.length) {
    return { ok: false, error: 'ยังมีของอยู่ข้างใน — เก็บหรือย้ายให้หมดก่อน' }
  }

  const { data, error } = await supabase
    .from('areas')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', areaId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: NOT_WRITTEN }
  refresh()
  return { ok: true }
}
