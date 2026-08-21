'use server'

import { revalidatePath } from 'next/cache'
import { createClient, currentUserId } from '@/lib/supabase/server'

export type Result = { ok: true } | { ok: false; error: string }

/**
 * ใช้เมื่อ update ไม่โดนสักแถว — ครอบคลุมทั้ง "ไม่ใช่ของเรา" และ "session หมดอายุ"
 * เพราะ RLS ทำให้ทั้งสองกรณีออกมาเหมือนกันคือ 0 แถว
 */
const NOT_WRITTEN = 'บันทึกไม่สำเร็จ — ไม่พบรายการ หรือ session หมดอายุ · ลองโหลดหน้าใหม่'

function refresh(projectId: string, eventId?: string) {
  revalidatePath('/')
  revalidatePath('/calendar')
  revalidatePath('/library')
  revalidatePath(`/project/${projectId}`)
  if (eventId) revalidatePath(`/project/${projectId}/event/${eventId}`)
}

/**
 * ไทยไม่มี DST จึงเป็น UTC+7 คงที่ · เขียน offset ตรง ๆ ได้โดยไม่ต้องพึ่ง tz database
 * (เหตุผลเดียวกับ web/lib/time.ts)
 */
function toUtc(dateKey: string, clock: string) {
  return new Date(`${dateKey}T${clock}:00+07:00`).toISOString()
}

export type EventDraft = {
  title: string
  body: string | null
  /** YYYY-MM-DD ตามวันไทย */
  startDate: string
  /** HH:MM */
  startTime: string
  endDate: string
  endTime: string
  location: string | null
  label: string | null
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^\d{2}:\d{2}$/

/**
 * ตรวจให้ครบก่อนส่ง จะได้ไม่โดน DB ปฏิเสธด้วย error ดิบ ๆ ที่ผู้ใช้อ่านไม่รู้เรื่อง
 * ⚠️ ไม่ได้แทนที่ CHECK ใน DB — ที่นั่นคือด่านจริง เพราะ Claude เขียนผ่าน MCP ได้ด้วย
 */
function validate(d: EventDraft): string | null {
  if (!d.title.trim()) return 'ต้องมีชื่อกิจกรรม'
  if (d.title.trim().length > 200) return 'ชื่อยาวเกิน 200 ตัวอักษร'
  if (!DATE.test(d.startDate) || !DATE.test(d.endDate)) return 'วันที่ไม่ถูกรูปแบบ'
  if (!CLOCK.test(d.startTime) || !CLOCK.test(d.endTime)) return 'เวลาไม่ถูกรูปแบบ'

  const starts = toUtc(d.startDate, d.startTime)
  const ends = toUtc(d.endDate, d.endTime)
  if (ends <= starts) return 'เวลาจบต้องหลังเวลาเริ่ม'

  const days = (Date.parse(ends) - Date.parse(starts)) / 86_400_000
  if (days > 30) return 'กิจกรรมยาวเกิน 30 วัน · ถ้าตั้งใจจริงให้แยกเป็นหลายกิจกรรม'
  return null
}

function shape(d: EventDraft) {
  return {
    title: d.title.trim(),
    body: d.body?.trim() || null,
    starts_at: toUtc(d.startDate, d.startTime),
    ends_at: toUtc(d.endDate, d.endTime),
    location: d.location?.trim() || null,
    label: d.label?.trim() || null,
  }
}

export async function createEvent(
  projectId: string,
  d: EventDraft
): Promise<Result & { id?: string }> {
  const bad = validate(d)
  if (bad) return { ok: false, error: bad }

  const supabase = await createClient()
  const userId = await currentUserId(supabase)   // insert ต้องระบุเจ้าของ
  if (!userId) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  const { data, error } = await supabase
    .from('events')
    .insert({ ...shape(d), project_id: projectId, user_id: userId })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  refresh(projectId, data.id)
  return { ok: true, id: data.id }
}

export async function updateEvent(
  projectId: string,
  eventId: string,
  d: EventDraft
): Promise<Result> {
  const bad = validate(d)
  if (bad) return { ok: false, error: bad }

  const supabase = await createClient()

  // RLS ปฏิเสธแถวที่ไม่ใช่ของผู้ใช้คนนั้นให้อยู่แล้ว จึงไม่ต้องถามว่าใครล็อกอินอยู่
  // แต่ต้องมี .select() แล้วนับแถวทุกครั้ง ไม่งั้น update ที่ไม่โดนอะไรเลย
  // จะรายงานว่าสำเร็จ (doc/TRAPS.md)
  const { data, error } = await supabase
    .from('events')
    .update(shape(d))
    .eq('id', eventId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: NOT_WRITTEN }
  refresh(projectId, eventId)
  return { ok: true }
}

/** "ลบ" = เก็บเข้าคลัง ไม่ใช่ DELETE · งานที่ผูกไว้ยังอยู่ครบ */
export async function archiveEvent(
  projectId: string,
  eventId: string,
  archived: boolean
): Promise<Result> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('events')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', eventId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: NOT_WRITTEN }
  refresh(projectId, eventId)
  return { ok: true }
}

export type AgendaInput = {
  day_offset: number
  /** HH:MM */
  start_time: string
  /** null = ยาวถึงเวลาเริ่มของบรรทัดถัดไป */
  end_time: string | null
  title: string
}

/**
 * เขียนกำหนดการทับทั้งชุด
 *
 * ใช้แบบเดียวกับ `saveSchedules` — กำหนดการคือ "เนื้อหาชุดหนึ่ง" ที่แก้ทั้งแผง
 * ไม่ใช่รายการที่เพิ่มลบทีละบรรทัดจากหลายที่ · การเขียนทับทั้งชุดทำให้ไม่ต้อง
 * ตามรอยว่าบรรทัดไหนถูกลบ ถูกแก้ หรือถูกเพิ่ม
 */
export async function saveAgenda(
  projectId: string,
  eventId: string,
  lines: AgendaInput[]
): Promise<Result> {
  const supabase = await createClient()
  const userId = await currentUserId(supabase)   // insert ต้องระบุเจ้าของ
  if (!userId) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  if (lines.length > 200) return { ok: false, error: 'กำหนดการยาวเกินไป' }

  for (const l of lines) {
    if (!l.title.trim()) return { ok: false, error: 'ทุกบรรทัดต้องมีชื่อ' }
    if (!CLOCK.test(l.start_time)) return { ok: false, error: 'เวลาเริ่มไม่ถูกรูปแบบ' }
    if (l.end_time && !CLOCK.test(l.end_time)) return { ok: false, error: 'เวลาจบไม่ถูกรูปแบบ' }
    if (l.end_time && l.end_time <= l.start_time)
      return { ok: false, error: `"${l.title.trim()}" เวลาจบต้องหลังเวลาเริ่ม` }
    if (!Number.isInteger(l.day_offset) || l.day_offset < 0)
      return { ok: false, error: 'วันของกำหนดการไม่ถูกต้อง' }
  }

  // ⚠️ ยืนยันก่อนว่า event นี้เป็นของเราจริง — ถ้าไม่เช็ก การ delete จะไม่โดนอะไร
  //    (RLS กันไว้) แต่ insert ที่ตามมาจะใส่ user_id ของเราเข้าไปในกำหนดการของ
  //    event คนอื่นไม่ได้อยู่ดี · เช็กตรงนี้เพื่อให้ได้ข้อความที่อ่านรู้เรื่องแทน error ดิบ
  const { data: own } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (!own) return { ok: false, error: NOT_WRITTEN }

  const { error: delErr } = await supabase
    .from('event_agenda')
    .delete()
    .eq('event_id', eventId)
  if (delErr) return { ok: false, error: delErr.message }

  if (lines.length > 0) {
    const { error: insErr } = await supabase.from('event_agenda').insert(
      lines.map((l) => ({
        user_id: userId,
        event_id: eventId,
        day_offset: l.day_offset,
        start_time: l.start_time,
        end_time: l.end_time || null,
        title: l.title.trim(),
      }))
    )
    if (insErr) return { ok: false, error: insErr.message }
  }

  refresh(projectId, eventId)
  return { ok: true }
}

/**
 * ผูก/ปลดงานกับกิจกรรม
 *
 * FK สองคอลัมน์ใน DB บังคับอยู่แล้วว่างานกับ event ต้องอยู่ project เดียวกัน
 * ถ้าพยายามผูกข้าม project จะได้ error จาก DB ไม่ใช่ข้อมูลเพี้ยน
 */
export async function setItemEvent(
  projectId: string,
  itemId: string,
  eventId: string | null
): Promise<Result> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('items')
    .update({ event_id: eventId })
    .eq('id', itemId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: NOT_WRITTEN }
  refresh(projectId, eventId ?? undefined)
  return { ok: true }
}
