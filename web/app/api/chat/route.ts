/**
 * ประตูแชต — โมเดลคิดฝั่งเซิร์ฟเวอร์ tool ก็รันฝั่งเซิร์ฟเวอร์
 *
 * ต่างจากโหมดโทรตรงนี้จุดเดียว: Live API รัน tool ที่ client จึงต้องเด้งกลับ
 * ไปที่เบราว์เซอร์ก่อน · ที่นี่ไม่ต้องออกไปไหนเลย (ARCHITECTURE.md §6)
 */
import type { NextRequest } from 'next/server'
import { createClient, currentUserId } from '@/lib/supabase/server'
import { readOnlyDb } from '@/lib/ai/supabaseDb'
import { runTool, toolDeclarations } from '@/lib/ai/tools'
import { systemPrompt } from '@/lib/ai/prompt'
import { readLang } from '@/lib/ai/lang'
import { generateStream, GeminiError, type Content } from '@/lib/chat/gemini'
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
import { BadImage, imageHistoryLine, readInlineImage } from '@/lib/chat/image'

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
    image?: unknown
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'อ่านคำขอไม่ได้' }, { status: 400 })
  }

  /*
   * รูปที่แนบมา — **ไม่ถูกเก็บที่ไหนเลย** มีชีวิตแค่คำขอนี้แล้วหายไปพร้อมมัน
   *
   * ⚠️ ด่านตรวจขนาดและชนิดอยู่ที่นี่ ไม่ใช่ที่หน้าจอ · การย่อขนาดฝั่งเบราว์เซอร์
   *    เป็นเรื่องของความเร็ว ไม่ใช่เรื่องของการกัน — endpoint นี้ถูกยิงตรงได้
   *    เหมือนทุก endpoint (doc/TRAPS.md · "ด่านที่อยู่ในหน้าเว็บอย่างเดียว")
   */
  let image
  try {
    image = readInlineImage(body.image)
  } catch (e) {
    const why = e instanceof BadImage ? e.message : 'รูปที่แนบมาอ่านไม่ออก'
    return Response.json({ ok: false, error: why }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  // แนบรูปมาเฉย ๆ โดยไม่พิมพ์อะไรคือการใช้งานปกติ — ถ่ายกระดานแล้วส่ง
  if (!text && !image) {
    return Response.json({ ok: false, error: 'ยังไม่ได้พิมพ์อะไร' }, { status: 400 })
  }
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

  /*
   * ⚠️ **ประวัติเป็นข้อความล้วนเสมอ** — รูปของเทิร์นก่อน ๆ ไม่เคยเดินทางกลับเข้ามา
   *    มันลงประวัติเป็น `[รูป]` ซึ่งบอกโมเดลว่า *เคยมีรูป และตอนนี้มองไม่เห็นแล้ว*
   *    (กติกาข้อ 12 ใน `lib/ai/prompt.ts` สั่งไม่ให้มันอ้างว่ายังเห็นอยู่)
   *
   *    นี่คือสิ่งที่ทำให้ "ไม่เก็บรูป" เป็นจริงตลอดสาย ไม่ใช่แค่ตอนไม่ลง DB —
   *    ถ้าประวัติพารูปกลับเข้าไปทุกรอบ มันจะถูกส่งไป Google ซ้ำทุกครั้งที่พิมพ์ต่อ
   *
   * รูปมาก่อนข้อความในเทิร์นเดียวกัน · เป็นลำดับที่เอกสารของ Gemini แนะนำสำหรับ
   * คำถามที่มีรูปใบเดียว — คำถามที่มาหลังรูปอ่านเป็นคำสั่งต่อสิ่งที่เพิ่งเห็น
   */
  const contents: Content[] = [
    ...history.slice(-HISTORY_LIMIT).map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      parts: [{ text: m.content }],
    })),
    {
      role: 'user' as const,
      // part ที่ว่างเปล่าทำให้ Gemini ตอบ 400 · แนบรูปแล้วไม่พิมพ์อะไรจึงมีชิ้นเดียว
      parts: [...(image ? [{ inlineData: image }] : []), ...(text ? [{ text }] : [])],
    },
  ]

  const db = await readOnlyDb()
  const tools = toolDeclarations()

  /*
   * ร่างที่ยังค้างบนจอตอนนี้ — `propose_update_draft` ต้องใช้เพื่อแก้ **ใบเดิม**
   * ร่างไม่ได้ลง DB เซิร์ฟเวอร์จึงไม่มีทางรู้ถ้าเบราว์เซอร์ไม่ส่งมาเอง (ARCHITECTURE.md §7)
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

  /*
   * ตอบเป็น **สาย NDJSON** ไม่ใช่ก้อนเดียวตอนจบ — หนึ่งบรรทัดคือหนึ่งเหตุการณ์
   *
   *   {"t":"delta","v":"…"}  ข้อความที่โมเดลพิมพ์เพิ่ม
   *   {"t":"reset"}          ทิ้งสิ่งที่พิมพ์ไปในรอบนี้ (โมเดลเปลี่ยนใจไปเรียก tool)
   *   {"t":"draft","v":{…}}  ร่างขึ้นแล้ว · ส่งทันทีที่เสนอ ไม่รอจบคำตอบ
   *   {"t":"done", …}        คำตอบสุดท้ายที่ผ่านด่านตรวจลิงก์แล้ว
   *   {"t":"error", …}       ล้มกลางทาง
   *
   * ⚠️ **`delta` ยังไม่ผ่าน `sanitizeLinks`** — ลิงก์ถูกหั่นข้ามก้อนได้ ตรวจทีละ
   *    ก้อนจึงไม่มีทางถูก · หน้าจอต้อง **เอาข้อความใน `done` ไปแทนของที่ไหลมา**
   *    ทั้งหมด สิ่งที่ค้างอยู่บนจอจึงเป็นฉบับที่ผ่านด่านแล้วเสมอ (lib/chat/links.ts)
   */
  const enc = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: Record<string, unknown>) => {
        if (closed) return
        controller.enqueue(enc.encode(`${JSON.stringify(event)}
`))
      }

      let reply = ''
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          /*
           * ข้อความที่ไหลออกไปแล้ว**ในรอบนี้** · ถ้ารอบนี้จบด้วยการเรียก tool
           * สิ่งที่ไหลไปไม่ใช่คำตอบ ต้องสั่งให้จอทิ้ง · โมเดลมักไม่พิมพ์อะไรก่อน
           * เรียก tool แต่ "มักไม่" ไม่ใช่ "ไม่เคย" และสิ่งที่ค้างบนจอผิด ๆ แพงกว่า
           */
          let streamed = 0
          const out = await generateStream({
            system,
            contents,
            tools,
            signal: request.signal,
            onText: (delta) => {
              streamed += delta.length
              send({ t: 'delta', v: delta })
            },
          })

          if (out.calls.length === 0 || round === MAX_TOOL_ROUNDS) {
            reply = out.text
            break
          }

          if (streamed > 0) send({ t: 'reset' })

          // ส่ง parts ชุดเดิมกลับไปทั้งก้อน **ห้ามประกอบใหม่จาก out.calls**
          // Gemini 3 แนบ thoughtSignature มากับ functionCall และบังคับให้ส่งกลับครบ
          // ถ้าหล่นไปจะได้ 400 ในรอบถัดไป โดยรอบแรกดูเหมือนทำงานปกติทุกอย่าง
          contents.push({ role: 'model', parts: out.parts })

          const responses = await Promise.all(
            out.calls.map(async (call) => {
              const result = await runTool(call.name, call.args, { db, today, openDrafts })
              if (result.ok && 'draft' in result) {
                drafts.push(result.draft)
                // การ์ดขึ้นทันทีที่เสนอ ไม่ต้องรอโมเดลพิมพ์คำตอบจบ
                send({ t: 'draft', v: result.draft })
              }

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
                      /*
                       * ⚠️ **สองทางต้องกดดันเท่ากัน** — เดิมทางแก้ร่างห้ามคำว่า
                       *    "เรียบร้อย" ไว้ ส่วนทางเสนอของใหม่ไม่ได้ห้ามเลย
                       *    ผลคือฝั่งเสนอใหม่ตอบว่า "ร่างขึ้นบนจอให้เรียบร้อยแล้ว"
                       *    (วัดเจอ 8 ก.ย. 2026) · ตรงนี้จึงยื่น**ประโยคที่ให้ใช้**
                       *    ไปด้วยทั้งสองทาง ไม่ใช่บอกแต่ว่าห้ามอะไร
                       */
                      note: openDrafts.some((d) => d.id === result.draft.id)
                        ? 'ปรับร่างใบเดิมบนจอให้แล้ว ยังไม่ได้บันทึกอะไรลงระบบ — ตอบว่า "ปรับให้ในการ์ดแล้ว ทานแล้วกดยืนยันได้เลยครับ" ห้ามเติมคำว่าเรียบร้อย ให้แล้ว จัดการให้ หรือบันทึก'
                        : 'ร่างขึ้นบนจอแล้ว ยังไม่ได้บันทึกอะไรลงระบบ — ตอบว่า "ร่างขึ้นบนจอแล้ว ทานแล้วกดยืนยันได้เลยครับ" ห้ามเติมคำว่าเรียบร้อย ให้แล้ว จัดการให้ หรือบันทึก',
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
        /*
          `quota` แปลว่า "หมดแล้วสำหรับวันนี้" ไม่ใช่ "429" — สองอย่างนี้เคยถูก
          เหมารวม แล้วผู้ใช้ที่แค่พิมพ์เร็วไปถูกบอกว่าโควตาหมดทั้งวัน
          (lib/chat/quota.ts)
        */
        const quota = e instanceof GeminiError && e.limit?.kind === 'day'
        send({ t: 'error', error: e instanceof Error ? e.message : 'ตอบไม่สำเร็จ', quota })
        closed = true
        controller.close()
        return
      }

      if (!reply) reply = 'ผมยังตอบคำถามนี้ไม่ได้ครับ ลองถามใหม่อีกแบบได้ไหม'

      // ตัดลิงก์ที่ไม่ใช่เส้นทางจริงของแอปทิ้งก่อนส่งออก
      // prompt ห้ามได้แค่สิ่งที่โมเดลตั้งใจ · ด่านนี้กันได้ทุกกรณี (lib/chat/links.ts)
      const cleaned = sanitizeLinks(reply)
      if (cleaned.removed > 0) {
        console.warn(`[chat] ตัดลิงก์ปลอมทิ้ง ${cleaned.removed} จุด`)
      }
      reply = cleaned.text

      let warning: string | undefined
      try {
        await saveMessages(userId, conversationId, 'chat', [
          // รูปลงประวัติเป็นป้าย ไม่ใช่ตัวรูป — บังคับที่นี่ด้วย ไม่ใช่เชื่อฝั่งจอ
          // (กติกาเดียวกับ `redactVoiceTurns` ของโหมดโทร)
          { role: 'user', content: image ? imageHistoryLine(text) : text },
          { role: 'assistant', content: reply },
        ])
      } catch (e) {
        // คำตอบถูกต้องแล้ว แค่บันทึกไม่ติด — ส่งคำตอบไปให้ผู้ใช้พร้อมบอกว่าไม่ได้บันทึก
        // ดีกว่าทิ้งคำตอบทั้งอันเพราะเขียนประวัติไม่สำเร็จ
        warning = `ตอบได้แต่บันทึกประวัติไม่สำเร็จ · ${e instanceof Error ? e.message : ''}`
      }

      send({ t: 'done', conversationId, reply, drafts, warning })
      closed = true
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      // กัน proxy ที่ชอบกักไว้จนครบก้อน ซึ่งทำให้การไหลทีละคำหายไปเงียบ ๆ
      'x-accel-buffering': 'no',
    },
  })
}
