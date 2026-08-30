/**
 * ประตูแชต — โมเดลคิดฝั่งเซิร์ฟเวอร์ tool ก็รันฝั่งเซิร์ฟเวอร์
 *
 * ต่างจากโหมดโทรตรงนี้จุดเดียว: Live API รัน tool ที่ client จึงต้องเด้งกลับ
 * ไปที่เบราว์เซอร์ก่อน · ที่นี่ไม่ต้องออกไปไหนเลย (doc/CHAT.md §3)
 */
import type { NextRequest } from 'next/server'
import { createClient, currentUserId } from '@/lib/supabase/server'
import { readOnlyDb } from '@/lib/ai/supabaseDb'
import { runTool, toolDeclarations } from '@/lib/ai/tools'
import { systemPrompt } from '@/lib/ai/prompt'
import { generate, GeminiError, type Content } from '@/lib/chat/gemini'
import {
  HISTORY_LIMIT,
  logToolCall,
  saveMessages,
  startConversation,
  type StoredMessage,
} from '@/lib/chat/store'
import { bangkokToday } from '@/lib/time'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * กี่รอบที่ยอมให้โมเดลเรียก tool ก่อนบังคับให้ตอบ
 *
 * คำถามที่ตอบได้จริงใช้ 1–2 รอบ · ถ้าเกินนี้แปลว่ามันวนหาอะไรที่ไม่มี
 * ปล่อยต่อไปก็แค่กินโควตาแล้วจบด้วยคำตอบเดิม
 */
const MAX_TOOL_ROUNDS = 4

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const userId = await currentUserId(supabase)
  if (!userId) {
    return Response.json({ ok: false, error: 'ยังไม่ได้ล็อกอิน' }, { status: 401 })
  }

  let body: { text?: unknown; conversationId?: unknown; history?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'อ่านคำขอไม่ได้' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return Response.json({ ok: false, error: 'ยังไม่ได้พิมพ์อะไร' }, { status: 400 })
  if (text.length > 2000) {
    return Response.json({ ok: false, error: 'ข้อความยาวเกินไป' }, { status: 400 })
  }

  const history = Array.isArray(body.history) ? (body.history as StoredMessage[]) : []
  const today = bangkokToday().dateKey

  // เปิดบทสนทนาใหม่ถ้ายังไม่มี · ทำก่อนเรียกโมเดลเพราะสมุดบันทึก tool ต้องใช้ id
  let conversationId = typeof body.conversationId === 'string' ? body.conversationId : ''
  try {
    if (!conversationId) conversationId = await startConversation(userId, 'chat')
  } catch (e) {
    return Response.json(
      { ok: false, error: `เปิดบทสนทนาไม่ได้ · ${e instanceof Error ? e.message : ''}` },
      { status: 500 }
    )
  }

  const contents: Content[] = [
    ...history.slice(-HISTORY_LIMIT).map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      parts: [{ text: m.content }],
    })),
    { role: 'user' as const, parts: [{ text }] },
  ]

  const db = await readOnlyDb()
  const tools = toolDeclarations()
  const system = systemPrompt('chat', today)

  let reply = ''
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const out = await generate({ system, contents, tools, signal: request.signal })

      if (out.calls.length === 0 || round === MAX_TOOL_ROUNDS) {
        reply = out.text
        break
      }

      contents.push({ role: 'model', parts: out.calls.map((c) => ({ functionCall: c })) })

      const responses = await Promise.all(
        out.calls.map(async (call) => {
          const result = await runTool(call.name, call.args, { db, today })
          void logToolCall(userId, conversationId, {
            name: call.name,
            input: call.args,
            ok: result.ok,
            rowsOut: result.ok ? result.rows.length : 0,
            rowsHidden: result.ok ? result.hidden : 0,
            error: result.ok ? undefined : result.error,
          })
          // ส่ง error กลับเป็นผลของ tool ไม่ใช่ล้มทั้งคำขอ — โมเดลจะได้บอกผู้ใช้
          // ว่าดึงข้อมูลไม่ได้ ซึ่งดีกว่าหน้าจอขึ้น error ลอย ๆ โดยไม่รู้ว่าถามอะไรไป
          return {
            functionResponse: {
              name: call.name,
              response: result.ok
                ? { rows: result.rows, hidden: result.hidden }
                : { error: result.error },
            },
          }
        })
      )

      contents.push({ role: 'user', parts: responses })
    }
  } catch (e) {
    const quota = e instanceof GeminiError && e.status === 429
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'ตอบไม่สำเร็จ', quota },
      { status: quota ? 429 : 502 }
    )
  }

  if (!reply) reply = 'ผมยังตอบคำถามนี้ไม่ได้ครับ ลองถามใหม่อีกแบบได้ไหม'

  try {
    await saveMessages(userId, conversationId, 'chat', [
      { role: 'user', content: text },
      { role: 'assistant', content: reply },
    ])
  } catch (e) {
    // คำตอบถูกต้องแล้ว แค่บันทึกไม่ติด — ส่งคำตอบไปให้ผู้ใช้พร้อมบอกว่าไม่ได้บันทึก
    // ดีกว่าทิ้งคำตอบทั้งอันเพราะเขียนประวัติไม่สำเร็จ
    return Response.json({
      ok: true,
      conversationId,
      reply,
      warning: `ตอบได้แต่บันทึกประวัติไม่สำเร็จ · ${e instanceof Error ? e.message : ''}`,
    })
  }

  return Response.json({ ok: true, conversationId, reply })
}
