/**
 * อ่าน/เขียนบทสนทนา
 *
 * ⚠️ อยู่นอก `lib/ai/**` โดยตั้งใจ — ไฟล์นี้**เขียนข้อมูล** ซึ่งชั้น tool ทำไม่ได้
 * และไม่ควรทำได้ · ที่เขียนได้เพราะคนเขียนคือ**เซิร์ฟเวอร์ของแอป** ไม่ใช่โมเดล
 * โมเดลไม่มีทางสั่งให้ฟังก์ชันพวกนี้ทำงานได้เลย มันเรียกได้แค่ tool ในทะเบียน
 */
import { createClient } from '@/lib/supabase/server'

export type Channel = 'chat' | 'voice'
export type Role = 'user' | 'assistant'

export type StoredMessage = {
  id: string
  role: Role
  content: string
  via: Channel
  created_at: string
}

/** กี่ข้อความย้อนหลังที่ส่งกลับเข้าโมเดล · ยาวกว่านี้เปลืองโทเคนโดยไม่ช่วยอะไร */
export const HISTORY_LIMIT = 30

/** บทสนทนาล่าสุดที่ยังไม่ปิด · null = ยังไม่เคยคุยเลย */
export async function latestConversation(): Promise<{ id: string; messages: StoredMessage[] } | null> {
  const supabase = await createClient()

  const { data: convo, error } = await supabase
    .from('conversations')
    .select('id')
    .is('archived_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!convo) return null

  const { data: rows, error: msgError } = await supabase
    .from('messages')
    .select('id, role, content, via, created_at')
    .eq('conversation_id', convo.id)
    .order('created_at', { ascending: true })
    .limit(HISTORY_LIMIT)

  if (msgError) throw new Error(msgError.message)
  return { id: convo.id, messages: (rows ?? []) as StoredMessage[] }
}

export async function startConversation(userId: string, via: Channel): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, started_via: via })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return data.id as string
}

/**
 * บันทึกข้อความ
 *
 * ใส่ `.select('id')` แล้วเช็กว่าได้แถวกลับมาจริง ตามกฎของโปรเจกต์ —
 * insert/update ที่ไม่โดนสักแถวถือว่าสำเร็จในสายตา PostgREST (doc/TRAPS.md)
 */
export async function saveMessages(
  userId: string,
  conversationId: string,
  via: Channel,
  entries: readonly { role: Role; content: string }[]
): Promise<void> {
  if (entries.length === 0) return
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('messages')
    .insert(entries.map((e) => ({
      user_id: userId,
      conversation_id: conversationId,
      role: e.role,
      content: e.content,
      via,
    })))
    .select('id')

  if (error) throw new Error(error.message)
  if ((data ?? []).length !== entries.length) {
    throw new Error('บันทึกข้อความไม่ครบ')
  }
}

/**
 * บันทึกว่าผู้ช่วยไปอ่านอะไรมา
 *
 * ล้มเหลวแล้ว**ไม่ throw** — สมุดบันทึกพังไม่ควรทำให้คำตอบที่ถูกต้องหายไป
 * แต่ต้องโผล่ใน log ของเซิร์ฟเวอร์ ไม่ใช่เงียบสนิท
 */
export async function logToolCall(
  userId: string,
  conversationId: string,
  entry: { name: string; input: unknown; ok: boolean; rowsOut?: number; rowsHidden?: number; error?: string }
): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('tool_calls').insert({
      user_id: userId,
      conversation_id: conversationId,
      name: entry.name,
      input: entry.input ?? {},
      ok: entry.ok,
      rows_out: entry.rowsOut ?? 0,
      rows_hidden: entry.rowsHidden ?? 0,
      error: entry.ok ? null : (entry.error ?? 'ไม่ทราบสาเหตุ'),
    })
    if (error) console.error('[tool_calls] บันทึกไม่สำเร็จ:', error.message)
  } catch (e) {
    console.error('[tool_calls] บันทึกไม่สำเร็จ:', e)
  }
}
