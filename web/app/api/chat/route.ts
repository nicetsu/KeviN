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
import { readLang } from '@/lib/ai/lang'
import { generate, GeminiError, type Content } from '@/lib/chat/gemini'
import { sanitizeLinks } from '@/lib/chat/links'
import {
  HISTORY_LIMIT,
  logToolCall,
  saveMessages,
  startConversation,
  type StoredMessage,
} from '@/lib/chat/store'
import { bangkokToday } from '@/lib/time'
import { readOpenDrafts, type Draft } from '@/lib/drafts'

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

  let body: {
    text?: unknown
    conversationId?: unknown
    history?: unknown
    lang?: unknown
    drafts?: unknown
  }
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

  /*
   * ร่างที่ยังค้างบนจอตอนนี้ — `propose_update_draft` ต้องใช้เพื่อแก้ **ใบเดิม**
   * ร่างไม่ได้ลง DB เซิร์ฟเวอร์จึงไม่มีทางรู้ถ้าเบราว์เซอร์ไม่ส่งมาเอง (doc/WRITE.md §8)
   */
  const openDrafts = readOpenDrafts(body.drafts)

  /*
   * ร่างที่ผู้ช่วยเสนอในรอบนี้ — ส่งกลับไปให้หน้าจอวาดเป็นการ์ด
   *
   * ⚠️ **ไม่ได้บันทึกลงประวัติ** ร่างมีอายุแค่หน้าจอนี้ · ถ้าเก็บลงบทสนทนา
   *    ผู้ใช้จะเลื่อนขึ้นไปเจอการ์ดเก่าที่กดยืนยันได้ทั้งที่บริบทหมดอายุไปแล้ว
   */
  const drafts: Draft[] = []
  // ภาษาที่ผู้ใช้ตั้งไว้ · ค่าที่ไม่รู้จักถูกปัดกลับเป็นค่าตั้งต้น ไม่ใช่ส่งดิบเข้า prompt
  const system = systemPrompt('chat', today, readLang(body.lang))

  let reply = ''
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const out = await generate({ system, contents, tools, signal: request.signal })

      if (out.calls.length === 0 || round === MAX_TOOL_ROUNDS) {
        reply = out.text
        break
      }

      // ส่ง parts ชุดเดิมกลับไปทั้งก้อน **ห้ามประกอบใหม่จาก out.calls**
      // Gemini 3 แนบ thoughtSignature มากับ functionCall และบังคับให้ส่งกลับครบ
      // ถ้าหล่นไปจะได้ 400 ในรอบถัดไป โดยรอบแรกดูเหมือนทำงานปกติทุกอย่าง
      contents.push({ role: 'model', parts: out.parts })

      const responses = await Promise.all(
        out.calls.map(async (call) => {
          const result = await runTool(call.name, call.args, { db, today, openDrafts })
          const proposed = result.ok && 'draft' in result
          if (proposed) drafts.push(result.draft)

          void logToolCall(userId, conversationId, {
            name: call.name,
            input: call.args,
            ok: result.ok,
            rowsOut: result.ok && 'rows' in result ? result.rows.length : 0,
            rowsHidden: result.ok && 'rows' in result ? result.hidden : 0,
            error: result.ok ? undefined : result.error,
          })
          // ส่ง error กลับเป็นผลของ tool ไม่ใช่ล้มทั้งคำขอ — โมเดลจะได้บอกผู้ใช้
          // ว่าดึงข้อมูลไม่ได้ ซึ่งดีกว่าหน้าจอขึ้น error ลอย ๆ โดยไม่รู้ว่าถามอะไรไป
          /*
           * ผลของ `propose_*` ที่ส่งกลับเข้าโมเดล **ไม่ใช่ตัวร่างทั้งก้อน**
           *
           * ส่งแค่ว่าร่างขึ้นแล้วและชื่ออะไร · ถ้าส่งทั้งก้อนกลับไป โมเดลจะเอา
           * รายละเอียดไปพูดซ้ำทั้งหมดทั้งที่ผู้ใช้อ่านจากการ์ดอยู่แล้ว
           * และมันอาจหลงคิดว่าบันทึกเสร็จแล้วเพราะเห็นข้อมูลครบ
           */
          const response = !result.ok
            ? { error: result.error }
            : 'draft' in result
              ? {
                  ok: true,
                  note: openDrafts.some((d) => d.id === result.draft.id)
                    ? 'ปรับร่างใบเดิมบนจอให้แล้ว ยังไม่ได้บันทึก — บอกสั้น ๆ ว่าปรับในการ์ดให้แล้ว ให้เขาทานแล้วกดยืนยัน'
                    : 'ร่างขึ้นบนจอแล้ว ยังไม่ได้บันทึก — บอกผู้ใช้สั้น ๆ ให้ทานแล้วกดยืนยัน',
                  // id เดินทางกลับเข้าโมเดล เพื่อให้อ้างถึงร่างใบนี้ตอนพูดแก้ต่อได้
                  draft_id: result.draft.id,
                  title: result.draft.title,
                }
              : { rows: result.rows, hidden: result.hidden }

          return { functionResponse: { name: call.name, response } }
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

  // ตัดลิงก์ที่ไม่ใช่เส้นทางจริงของแอปทิ้งก่อนส่งออก
  // prompt ห้ามได้แค่สิ่งที่โมเดลตั้งใจ · ด่านนี้กันได้ทุกกรณี (lib/chat/links.ts)
  const cleaned = sanitizeLinks(reply)
  if (cleaned.removed > 0) {
    console.warn(`[chat] ตัดลิงก์ปลอมทิ้ง ${cleaned.removed} จุด`)
  }
  reply = cleaned.text

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
      drafts,
      warning: `ตอบได้แต่บันทึกประวัติไม่สำเร็จ · ${e instanceof Error ? e.message : ''}`,
    })
  }

  return Response.json({ ok: true, conversationId, reply, drafts })
}
