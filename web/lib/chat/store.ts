/**
 * อ่าน/เขียนบทสนทนา
 *
 * ⚠️ อยู่นอก `lib/ai/**` โดยตั้งใจ — ไฟล์นี้**เขียนข้อมูล** ซึ่งชั้น tool ทำไม่ได้
 * และไม่ควรทำได้ · ที่เขียนได้เพราะคนเขียนคือ**เซิร์ฟเวอร์ของแอป** ไม่ใช่โมเดล
 * โมเดลไม่มีทางสั่งให้ฟังก์ชันพวกนี้ทำงานได้เลย มันเรียกได้แค่ tool ในทะเบียน
 */
import { createClient } from '@/lib/supabase/server'
import { VOICE_PLACEHOLDER } from '@/lib/voice/transcript'

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

/**
 * หัวเรื่องหนึ่งบรรทัดของบทสนทนาหนึ่งอัน · ใช้ในหน้าประวัติย้อนหลัง
 *
 * ⚠️ **ไม่มีร่างอยู่ในนี้** และจะไม่มีวันมี — ร่างมีอายุแค่หน้าจอตอนนั้น
 *    ถ้าประวัติย้อนหลังมีการ์ดที่กดยืนยันได้ ผู้ใช้จะกดยืนยันของที่บริบท
 *    หมดอายุไปนานแล้ว (ARCHITECTURE.md §7) · หน้าประวัติจึง**อ่านอย่างเดียว**
 */
export type ConversationSummary = {
  id: string
  startedVia: Channel
  startedAt: string
  endedAt: string | null
  /** ข้อความแรกของผู้ใช้ · ว่างได้ถ้าบทสนทนานั้นเริ่มด้วยเสียงล้วน */
  preview: string
  count: number
}

/** กี่บทสนทนาที่หน้าประวัติดึงมาแสดง · เลื่อนดูได้ทั้งหมดในหน้าเดียว */
export const HISTORY_PAGE = 60

/**
 * รายการบทสนทนาย้อนหลัง — ใหม่สุดขึ้นก่อน
 *
 * ดึงข้อความของทุกบทสนทนาในคำขอเดียวแล้วจัดกลุ่มฝั่งเรา · ถ้ายิงทีละบทสนทนา
 * จะกลายเป็น N+1 query ที่วิ่งข้ามเน็ตทีละรอบ ซึ่งเป็นสิ่งเดียวที่ทำให้หน้านี้ช้าได้
 */
export async function conversationList(limit = HISTORY_PAGE): Promise<ConversationSummary[]> {
  const supabase = await createClient()

  const { data: convos, error } = await supabase
    .from('conversations')
    .select('id, started_via, started_at, ended_at')
    .is('archived_at', null)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  const rows = (convos ?? []) as {
    id: string
    started_via: Channel
    started_at: string
    ended_at: string | null
  }[]
  if (rows.length === 0) return []

  const { data: msgs, error: msgError } = await supabase
    .from('messages')
    .select('conversation_id, role, content, created_at')
    .in('conversation_id', rows.map((r) => r.id))
    .order('created_at', { ascending: true })

  if (msgError) throw new Error(msgError.message)

  const byConvo = new Map<string, { count: number; preview: string }>()
  for (const m of (msgs ?? []) as { conversation_id: string; role: Role; content: string }[]) {
    const at = byConvo.get(m.conversation_id) ?? { count: 0, preview: '' }
    at.count += 1
    // ข้อความแรกของผู้ใช้ที่ **ไม่ใช่ที่ว่างแทนเสียง** คือสิ่งที่บอกได้ว่าคุยเรื่องอะไร
    if (!at.preview && m.role === 'user' && m.content !== VOICE_PLACEHOLDER) {
      at.preview = m.content
    }
    byConvo.set(m.conversation_id, at)
  }

  return rows.map((r) => ({
    id: r.id,
    startedVia: r.started_via,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    preview: byConvo.get(r.id)?.preview ?? '',
    count: byConvo.get(r.id)?.count ?? 0,
  }))
}

/**
 * บทสนทนาหนึ่งอันพร้อมข้อความทั้งหมด · `null` = ไม่มีหรือไม่ใช่ของผู้ใช้คนนี้
 *
 * RLS ทำให้สองกรณีนั้นเหมือนกันจากมุมของโค้ด ซึ่งถูกแล้ว — หน้าที่แสดงผล
 * ไม่ควรแยกออกว่า id นั้นมีอยู่จริงแต่เป็นของคนอื่น
 *
 * **ไม่มีเพดานจำนวนข้อความ** ต่างจาก `latestConversation()` ที่ตัดที่ `HISTORY_LIMIT`
 * เพราะเพดานตรงนั้นมีไว้ประหยัดโทเคนที่ส่งเข้าโมเดล ไม่ใช่เพื่อจำกัดสิ่งที่คนอ่านได้
 */
export async function conversationById(
  id: string
): Promise<{ id: string; startedVia: Channel; startedAt: string; messages: StoredMessage[] } | null> {
  const supabase = await createClient()

  const { data: convo, error } = await supabase
    .from('conversations')
    .select('id, started_via, started_at')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!convo) return null

  const { data: rows, error: msgError } = await supabase
    .from('messages')
    .select('id, role, content, via, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  if (msgError) throw new Error(msgError.message)

  return {
    id: convo.id as string,
    startedVia: convo.started_via as Channel,
    startedAt: convo.started_at as string,
    messages: (rows ?? []) as StoredMessage[],
  }
}
