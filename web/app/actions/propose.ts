'use server'

import { revalidatePath } from 'next/cache'
import { createClient, currentUserId } from '@/lib/supabase/server'
import {
  applyDraftWith,
  undoApplyWith,
  type ApplyResult,
  type DraftDb,
  type UndoTarget,
} from '@/lib/applyDraft'
import type { DraftAction } from '@/lib/drafts'

/**
 * จุดเดียวในระบบที่ผู้ช่วยทำให้ข้อมูลเปลี่ยนได้ — และมันอยู่**หลังปุ่มที่ผู้ใช้กด**
 *
 * ไฟล์นี้ตั้งใจให้บาง: ประกอบ client · ถามว่าใครล็อกอินอยู่ · เรียกตรรกะใน
 * `lib/applyDraft.ts` · แล้วบอก Next ให้ล้างแคชถ้าเขียนสำเร็จ
 *
 * ตรรกะทั้งหมด (การตรวจสิทธิ์ · ตัวกรอง Area ขาเข้า · การนับแถวที่เขียนได้)
 * อยู่ที่ `lib/applyDraft.ts` เพราะไฟล์ `'use server'` ผูกกับ `cookies()` และ
 * `revalidatePath()` จึงเรียกจากชุดเทสต์ไม่ได้ · ดู `test/applyDraft.test.ts`
 */

export type { ApplyResult, UndoTarget }

function refresh() {
  revalidatePath('/')
  revalidatePath('/library')
  revalidatePath('/calendar')
  revalidatePath('/project/[id]', 'page')
  revalidatePath('/project/[id]/event/[eventId]', 'page')
}

/**
 * client ตัวจริงมีผิวกว้างกว่า `DraftDb` มาก (รวม `.delete()` ที่เราไม่ยอมให้ใช้)
 * generic ของมันจึงไม่ยอมสวมลงช่องแคบ ๆ ตรง ๆ · แคบให้เหลือเท่าที่ใช้ตรงนี้ที่เดียว
 * ซึ่งเป็นจุดที่ผู้อ่านโค้ดเห็นได้ว่ามีการแคบเกิดขึ้น
 */
function port(supabase: Awaited<ReturnType<typeof createClient>>): DraftDb {
  return supabase as unknown as DraftDb
}

export async function applyDraft(action: DraftAction): Promise<ApplyResult> {
  const supabase = await createClient()
  const userId = await currentUserId(supabase)
  const result = await applyDraftWith(port(supabase), userId, action)
  if (result.ok) refresh()
  return result
}

export async function undoApply(target: UndoTarget): Promise<ApplyResult> {
  const supabase = await createClient()
  const result = await undoApplyWith(port(supabase), target)
  if (result.ok) refresh()
  return result
}
