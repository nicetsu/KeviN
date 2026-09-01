'use server'

import { revalidatePath } from 'next/cache'
import { createClient, currentUserId } from '@/lib/supabase/server'

export type Result = { ok: true; removed: number } | { ok: false; error: string }

/**
 * ล้างประวัติการคุยทั้งหมด — **ลบจริง ไม่ใช่เก็บเข้าคลัง**
 *
 * ⚠️ ต่างจากทุกอย่างที่เหลือในแอปโดยตั้งใจ (เจ้าของเคาะ 1 ก.ย. 2026)
 *    ของอื่นเก็บเข้า `archived_at` แล้วรอสายพานลบทีหลัง แต่บทสนทนาไม่มีคุณค่า
 *    ให้ย้อนดู และเป็นข้อมูลที่ผู้ใช้มีสิทธิ์ลบทิ้งได้ทันทีที่ต้องการ
 *
 * ⚠️ **ลบ `conversations` อย่างเดียวพอ** — `messages` กับ `tool_calls` อ้างถึงมัน
 *    ด้วย `on delete cascade` จึงหายตามทั้งกอง (doc/SCHEMA.sql)
 *    ถ้าวันไหนเพิ่มตารางที่อ้าง `conversations` ต้องเช็คว่ามี cascade ด้วย
 *
 * ⚠️ ต้องมี `.select()` แล้วนับแถวเสมอ — `delete` ที่ไม่โดนอะไรเลยไม่ใช่ error
 *    RLS ทำให้ "ไม่ใช่ของเรา" กับ "ไม่มีอะไรให้ลบ" ออกมาเหมือนกัน (doc/TRAPS.md)
 */
export async function clearChatHistory(): Promise<Result> {
  const supabase = await createClient()
  const userId = await currentUserId(supabase)
  if (!userId) return { ok: false, error: 'session หมดอายุ · ลองโหลดหน้าใหม่' }

  const { data, error } = await supabase
    .from('conversations')
    .delete()
    .eq('user_id', userId)
    .select('id')

  if (error) return { ok: false, error: error.message }

  revalidatePath('/kevin')
  return { ok: true, removed: data?.length ?? 0 }
}
