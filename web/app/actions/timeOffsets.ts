'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { EntryKind } from '@/lib/calendar'

export type Result = { ok: true } | { ok: false; error: string }

/**
 * คืนค่าการตัดทอนของวันนั้น — ลบแถวใน `time_offsets` ทิ้ง
 *
 * เว็บทำได้แค่ "คืนค่า" อย่างเดียวโดยตั้งใจ · การ **ตั้ง** ค่าตัดทอนเป็นงานของ Claude
 * เพราะมันต้องถามกลับว่าจะแบ่งเวลาตรงไหน ซึ่งเป็นบทสนทนา ไม่ใช่ฟอร์ม
 * (doc/DECISIONS.md หัวข้อ "เวลาทับกัน")
 *
 * แต่การคืนค่าต้องมีบนเว็บ เพราะหลัก UX ข้อ 5 บอกว่าไม่มีอะไรหายเงียบ ๆ —
 * ถ้าเห็นบนจอว่าคาบถูกตัด ต้องกดคืนได้จากที่เดียวกันโดยไม่ต้องเปิดแชต
 */
export async function clearTimeOffset(
  kind: EntryKind,
  sourceId: string,
  occursOn: string
): Promise<Result> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occursOn)) {
    return { ok: false, error: 'วันที่ไม่ถูกรูปแบบ' }
  }

  const supabase = await createClient()

  // RLS กันไม่ให้แตะแถวของคนอื่นอยู่แล้ว · แต่ต้อง .select() แล้วนับแถวทุกครั้ง
  // ไม่งั้นคำสั่งที่ไม่โดนอะไรเลยจะรายงานว่าสำเร็จ (doc/TRAPS.md)
  const { data, error } = await supabase
    .from('time_offsets')
    .delete()
    .eq(kind === 'class' ? 'schedule_id' : 'event_id', sourceId)
    .eq('occurs_on', occursOn)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) {
    return { ok: false, error: 'ไม่พบการตัดทอนของวันนี้ · อาจถูกคืนค่าไปแล้ว ลองโหลดหน้าใหม่' }
  }

  revalidatePath('/')
  revalidatePath('/calendar')
  return { ok: true }
}
