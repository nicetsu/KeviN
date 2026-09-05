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
import { generate, GeminiError, type Content } from '../../lib/chat/gemini'
import type { Draft } from '../../lib/drafts'
import { stubDb, TODAY } from './fixtures'
import type { Call, Turn } from './harness'

const MAX_TOOL_ROUNDS = 4

/**
 * ลองใหม่เมื่อฝั่ง Google ล่ม (5xx) — **ไม่ใช่ตัวช่วยให้โมเดลตอบถูก**
 *
 * 503 คือเซิร์ฟเวอร์เขาแน่น ไม่ใช่คำตอบผิด · ถ้าไม่ลองใหม่ ชุดวัดจะรายงานว่า
 * "ไม่ผ่าน" ให้เคสที่ยังไม่เคยถูกวัดเลย ซึ่งเป็นตัวเลขที่หลอกคนอ่าน
 * ข้อผิดพลาดอื่น (400 · 429 โควตาหมด) ต้องโผล่ขึ้นมาตามเดิม ห้ามกลบ
 */
async function generateOrRetry(opts: Parameters<typeof generate>[0]) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await generate(opts)
    } catch (e) {
      const busy = e instanceof GeminiError && e.status !== undefined && e.status >= 500
      if (!busy || attempt >= 3) throw e
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
    }
  }
}

export async function askChat(text: string, then?: string): Promise<Turn> {
  const db = stubDb()
  const tools = toolDeclarations()
  const system = systemPrompt('chat', TODAY, 'th')
  const contents: Content[] = [{ role: 'user', parts: [{ text }] }]

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
                  note: (result.draft.rev ?? 0) > 0
                    ? 'ปรับร่างใบเดิมบนจอให้แล้ว ยังไม่ได้บันทึก — บอกสั้น ๆ ว่าปรับในการ์ดให้แล้ว ให้เขาทานแล้วกดยืนยัน'
                    : 'ร่างขึ้นบนจอแล้ว ยังไม่ได้บันทึก — บอกผู้ใช้สั้น ๆ ให้ทานแล้วกดยืนยัน',
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
