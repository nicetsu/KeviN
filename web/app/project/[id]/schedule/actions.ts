'use server'

import { revalidatePath } from 'next/cache'
import { createClient, currentUserId } from '@/lib/supabase/server'
import { snapToMonday } from '@/lib/weeks'

export type SlotInput = {
  day_of_week: number
  start_time: string
  end_time: string
  location: string | null
  label: string | null
  week_offsets: number[]
}

export async function saveSchedules(
  projectId: string,
  startDate: string,
  slots: SlotInput[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()

  const userId = await currentUserId(supabase)   // insert ต้องระบุเจ้าของ
  if (!userId) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  // ปัดเป็นวันจันทร์ก่อนส่ง — DB มี CHECK sched_start_is_mon กันอีกชั้น
  const monday = snapToMonday(startDate)

  for (const s of slots) {
    if (s.end_time <= s.start_time) return { ok: false, error: 'เวลาเลิกต้องหลังเวลาเริ่ม' }
    if (s.week_offsets.length === 0) return { ok: false, error: 'ต้องเลือกอย่างน้อย 1 สัปดาห์' }
    if (s.week_offsets.some((o) => !Number.isInteger(o) || o < 0))
      return { ok: false, error: 'สัปดาห์ต้องเป็นจำนวนเต็มไม่ติดลบ' }
  }

  // ช่วงเวลาประจำเป็น "รูปแบบ" ไม่ใช่รายการคาบที่ถูกสร้างไว้ล่วงหน้า
  // การแก้จึงเป็นการเขียนรูปแบบใหม่ทับทั้งชุดของ project นี้
  const { error: delErr } = await supabase
    .from('project_schedules')
    .delete()
    .eq('project_id', projectId)
  if (delErr) return { ok: false, error: delErr.message }

  if (slots.length > 0) {
    const { error: insErr } = await supabase.from('project_schedules').insert(
      slots.map((s) => ({
        user_id: userId,
        project_id: projectId,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        location: s.location?.trim() || null,
        label: s.label?.trim() || null,
        start_date: monday,
        week_offsets: s.week_offsets,
      }))
    )
    if (insErr) return { ok: false, error: insErr.message }
  }

  revalidatePath(`/project/${projectId}`)
  revalidatePath('/calendar')
  revalidatePath('/library')
  revalidatePath('/')
  return { ok: true }
}
