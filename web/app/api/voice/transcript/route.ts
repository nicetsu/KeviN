/**
 * บันทึกบทสนทนาจากสายลงประวัติเดียวกับโหมดแชต
 *
 * นี่คือสิ่งที่ทำให้ **วางสายแล้วเปิดแชตพิมพ์ต่อได้โดยมันจำว่าเมื่อกี้คุยอะไร**
 * เกือบไม่ต้องเขียนอะไรเพิ่มเลยเพราะสองโหมดใช้ตารางเดียวกันอยู่แล้ว (doc/CHAT.md §9)
 *
 * โมเดลไม่ได้เป็นคนเรียกอันนี้ — เบราว์เซอร์เรียกหลังวางสาย ด้วย transcript
 * ที่ Live API ส่งมาให้ · ชั้น tool ยังเขียนอะไรไม่ได้เหมือนเดิม
 */
import type { NextRequest } from 'next/server'
import { createClient, currentUserId } from '@/lib/supabase/server'
import { sanitizeLinks } from '@/lib/chat/links'
import { saveMessages, startConversation } from '@/lib/chat/store'
import { redactVoiceTurns } from '@/lib/voice/transcript'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** สายหนึ่งเส้นยาวสุด 15 นาที ยังไงก็ไม่ถึงเท่านี้ · กันคำขอที่ผิดรูป */
const MAX_TURNS = 200

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const userId = await currentUserId(supabase)
  if (!userId) {
    return Response.json({ ok: false, error: 'ยังไม่ได้ล็อกอิน' }, { status: 401 })
  }

  let body: { conversationId?: unknown; turns?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'อ่านคำขอไม่ได้' }, { status: 400 })
  }

  const raw = Array.isArray(body.turns) ? body.turns : []
  const spoken = raw
    .slice(0, MAX_TURNS)
    .filter((t): t is { role: 'user' | 'assistant'; content: string } =>
      !!t && typeof t === 'object' &&
      ((t as { role?: unknown }).role === 'user' || (t as { role?: unknown }).role === 'assistant') &&
      typeof (t as { content?: unknown }).content === 'string' &&
      (t as { content: string }).content.trim().length > 0
    )
    .map((t) => ({
      role: t.role,
      // ผ่านด่านลิงก์เหมือนฝั่งแชต — โมเดลพูดลิงก์ปลอมออกมาได้เหมือนกัน
      content: sanitizeLinks(t.content.trim()).text.slice(0, 20000),
    }))

  // ⚠️ **บังคับที่นี่อีกชั้น ไม่ใช่เชื่อว่าเบราว์เซอร์ส่งมาถูกแล้ว**
  // สิ่งที่ผู้ใช้พูดต้องไม่ไหลลง DB ไม่ว่าฝั่งจอจะถูกแก้ไปยังไงในอนาคต
  const turns = redactVoiceTurns(spoken)

  if (turns.length === 0) return Response.json({ ok: true, conversationId: null, saved: 0 })

  try {
    let conversationId = typeof body.conversationId === 'string' ? body.conversationId : ''
    if (!conversationId) conversationId = await startConversation(userId, 'voice')
    await saveMessages(userId, conversationId, 'voice', turns)
    return Response.json({ ok: true, conversationId, saved: turns.length })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' },
      { status: 500 }
    )
  }
}
