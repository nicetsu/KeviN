/**
 * โหมดแชต — **คัดลอกวงจรของ `app/api/chat/route.ts` มาทั้งดุ้น**
 *
 * ⚠️ ต้องเหมือนของจริงทุกขั้น ไม่ใช่แค่ "ยิงโมเดลแล้วดูคำตอบ" —
 *    จุดที่พังได้จริงอยู่ที่การวน tool หลายรอบ · การส่ง `parts` กลับทั้งก้อน
 *    (thoughtSignature ของ Gemini 3) · และผลของ `propose_` ที่ส่งกลับเข้าโมเดล
 *    เป็นแค่คำบอกว่าร่างขึ้นจอแล้ว ไม่ใช่ตัวร่าง
 */
import { runTool, toolDeclarations } from '../../lib/ai/tools'
import { systemPrompt } from '../../lib/ai/prompt'
import { generateStream, GeminiError, type Content } from '../../lib/chat/gemini'
import type { Draft } from '../../lib/drafts'
import { imageHistoryLine, type InlineImage } from '../../lib/chat/image'
import { stubDb, TODAY } from './fixtures'
import type { Call, Turn } from './harness'

const MAX_TOOL_ROUNDS = 4

/**
 * ลองใหม่เมื่อ**ยังไม่ได้คำตอบ** — ไม่ใช่ตัวช่วยให้โมเดลตอบถูก
 *
 * 503 คือเซิร์ฟเวอร์เขาแน่น · 429 ที่เกิดจากการยิงรัวคือเพดาน**ต่อนาที**
 * ทั้งคู่ไม่ใช่คำตอบผิด ถ้าไม่ลองใหม่ ชุดวัดจะรายงานว่า "ไม่ผ่าน" ให้เคสที่
 * ยังไม่เคยถูกวัดเลย ซึ่งเป็นตัวเลขที่หลอกคนอ่านหนักกว่าการไม่วัดเสียอีก
 *
 * ⚠️ **เจอจริง 5 ก.ย. 2026** — รันรวดเดียว 17 ข้อได้ 4/17 โดย 13 ข้อล้มด้วย 429
 *    แล้วพอยิงข้อเดียวใหม่ทันทีกลับผ่าน · โควตารายวันยังไม่หมดเลย
 *    (ข้อความ "โควตาของวันนี้หมดแล้ว" ใน `lib/chat/gemini.ts` เหมารวม 429 ทุกแบบ)
 *
 * 429 ถอยนานกว่า 5xx มาก เพราะเพดานต่อนาทีต้องรอให้หน้าต่างเลื่อนไปจริง ๆ
 * ถ้ายังไม่ผ่านหลังถอยครบ ให้ error โผล่ตามเดิม ห้ามกลบ
 */
async function generateOrRetry(opts: Parameters<typeof generateStream>[0]) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await generateStream(opts)
    } catch (e) {
      const status = e instanceof GeminiError ? e.status : undefined
      const busy = status !== undefined && status >= 500
      const capped = status === 429
      if ((!busy && !capped) || attempt >= 3) throw e
      await new Promise((r) => setTimeout(r, (capped ? 20_000 : 2_000) * (attempt + 1)))
    }
  }
}

export async function askChat(
  text: string,
  then?: string,
  /** รูปที่แนบไปกับประโยคแรก · เหมือนของจริงคือ **ไม่เคยเดินทางกลับเข้าเทิร์นถัดไป** */
  image?: InlineImage
): Promise<Turn> {
  const db = stubDb()
  const tools = toolDeclarations()
  const system = systemPrompt('chat', TODAY, 'th')
  const contents: Content[] = [
    {
      role: 'user',
      // รูปมาก่อนข้อความ และ part ที่ว่างเปล่าถูกตัดทิ้ง — ตรงกับ route ของจริงเป๊ะ
      parts: [...(image ? [{ inlineData: image }] : []), ...(text ? [{ text }] : [])],
    },
  ]

  const calls: Call[] = []
  /*
   * ร่างค้าง **ข้ามเทิร์น** เหมือนของจริง — บนจอมันไม่ได้หายไปตอนผู้ใช้พิมพ์ต่อ
   * `propose_update_draft` จึงมีของให้แก้ในเทิร์นที่สอง (app/kevin/TalkRoom.tsx)
   */
  const drafts: Draft[] = []
  let reply = ''

  const says = then ? [text, then] : [text]

  try {
   for (const [nth, say] of says.entries()) {
    if (nth > 0) {
      /*
       * ⚠️ **รูปหายไปจากประวัติก่อนเทิร์นถัดไป** — ของจริงประกอบ `contents` ใหม่
       *    จากข้อความที่เก็บไว้ทุกคำขอ ซึ่งเป็น `[รูป] …` ไม่ใช่ตัวรูป
       *    (app/api/chat/route.ts) · ถ้าปล่อยรูปค้างไว้ตรงนี้ ชุดวัดจะบอกว่า
       *    โมเดล "ยังเห็นรูป" ผ่าน ทั้งที่ของจริงมันมองไม่เห็นแล้ว
       */
      if (image) contents[0] = { role: 'user', parts: [{ text: imageHistoryLine(text) }] }
      // ต่อบทสนทนาเดิม: คำตอบของรอบก่อน แล้วจึงประโยคใหม่ของผู้ใช้
      contents.push({ role: 'model', parts: [{ text: reply }] })
      contents.push({ role: 'user', parts: [{ text: say }] })
      reply = ''
    }

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const out = await generateOrRetry({ system, contents, tools })

      if (out.calls.length === 0 || round === MAX_TOOL_ROUNDS) {
        reply = out.text
        break
      }

      // ส่ง parts ชุดเดิมกลับไปทั้งก้อน ห้ามประกอบใหม่ (doc/TRAPS.md)
      contents.push({ role: 'model', parts: out.parts })

      const responses = await Promise.all(
        out.calls.map(async (call) => {
          const logged: Call = { name: call.name, args: call.args }
          calls.push(logged)
          // ร่างที่ค้างอยู่เดินทางไปกับ tool เหมือนของจริง — `propose_update_draft`
          // แก้ใบเดิมได้ก็ต่อเมื่อรู้ว่าใบเดิมหน้าตายังไง (app/api/chat/route.ts)
          const result = await runTool(call.name, call.args, { db, today: TODAY, openDrafts: drafts })
          if (result.ok && 'draft' in result) {
            const at = drafts.findIndex((d) => d.id === result.draft.id)
            if (at >= 0) drafts[at] = result.draft
            else drafts.push(result.draft)
          }
          logged.outcome = !result.ok
            ? `ปฏิเสธ: ${result.error}`
            : 'draft' in result
              ? `ร่าง “${result.draft.title}”`
              : `${result.rows.length} แถว`

          const response = !result.ok
            ? { error: result.error }
            : 'draft' in result
              ? {
                  ok: true,
                  // ⚠️ ต้องตรงกับ `app/api/chat/route.ts` เป๊ะ — ชุดวัดที่ป้อนคำสั่ง
                  //    คนละชุดกับของจริง คือชุดที่วัดของที่ไม่ได้ใช้งานจริง
                  note: (result.draft.rev ?? 0) > 0
                    ? 'ปรับร่างใบเดิมบนจอให้แล้ว ยังไม่ได้บันทึกอะไรลงระบบ — ตอบว่า "ปรับให้ในการ์ดแล้ว ทานแล้วกดยืนยันได้เลยครับ" ห้ามเติมคำว่าเรียบร้อย ให้แล้ว จัดการให้ หรือบันทึก'
                    : 'ร่างขึ้นบนจอแล้ว ยังไม่ได้บันทึกอะไรลงระบบ — ตอบว่า "ร่างขึ้นบนจอแล้ว ทานแล้วกดยืนยันได้เลยครับ" ห้ามเติมคำว่าเรียบร้อย ให้แล้ว จัดการให้ หรือบันทึก',
                  draft_id: result.draft.id,
                  title: result.draft.title,
                }
              : { rows: result.rows, hidden: result.hidden }

          return { functionResponse: { name: call.name, response } }
        })
      )

      contents.push({ role: 'user', parts: responses })
    }
   }
  } catch (e) {
    return { calls, drafts, reply, error: e instanceof Error ? e.message : String(e) }
  }

  return { calls, drafts, reply }
}
