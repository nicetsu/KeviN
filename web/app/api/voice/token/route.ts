/**
 * แจก ephemeral token ให้เบราว์เซอร์ต่อ Live API ตรง
 *
 * ทำไมต้องให้เบราว์เซอร์ต่อตรงแทนที่จะแบกเสียงผ่านเซิร์ฟเวอร์เรา —
 * Vercel เป็น serverless ถือ WebSocket ยาว ๆ ไม่ได้ · แต่ API key ก็ลงเบราว์เซอร์ไม่ได้
 * ephemeral token แก้ทั้งสองข้อพร้อมกัน (doc/CHAT.md §3)
 *
 * ⚠️ **config ถูกล็อกตายไปกับ token ตอนสร้าง** (`liveConnectConstraints`)
 *    คนที่ขโมย token ไปจึงสั่ง prompt อื่นหรือเปลี่ยนชุด tool ไม่ได้
 *    ทำได้แค่คุยกับ KeviN ที่อ่านข้อมูลอย่างเดียว ในหน้าต่างเวลาสั้น ๆ
 */
import { createClient, currentUserId } from '@/lib/supabase/server'
import { toolDeclarations } from '@/lib/ai/tools'
import { systemPrompt } from '@/lib/ai/prompt'
import { readLangs } from '@/lib/ai/lang'
import { bangkokToday } from '@/lib/time'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** แยกรุ่นจากฝั่งแชตเพื่อให้ **โควตาแยกกัน** — เสียงหมดแล้วแชตยังใช้ได้ */
const VOICE_MODEL = process.env.GEMINI_VOICE_MODEL ?? 'gemini-3.1-flash-live-preview'

/**
 * เสียงของ KeviN — เจ้าของเลือก `Fenrir` (ตื่นเต้น มีชีวิตชีวา) 31 ส.ค. 2026
 *
 * เลือกจาก 30 เสียงของ Gemini TTS · ที่ไม่เอา `Kore` ซึ่งเอกสารยกเป็นตัวอย่าง
 * เพราะมันเป็นแนว "หนักแน่น" ซึ่งออกทางการ ไม่ใช่โทนเพื่อนที่เจ้าของขอไว้
 *
 * ⚠️ ถ้าเปลี่ยนเสียงแล้วอยากรู้ว่าใช้ได้จริงไหม **ต้องลองเปิดสายจริง**
 *    เอกสารบอกว่า Live API รองรับเสียงเดียวกับ TTS ทั้งหมด แต่มีหมายเหตุกำกับว่า
 *    ชุดเสียงอาจต่างกัน · ถ้าชื่อผิด setup จะไม่ผ่านตั้งแต่ต้นสาย
 */
const VOICE_NAME = process.env.GEMINI_VOICE_NAME ?? 'Fenrir'

/** ค่าเริ่มต้นของ Google: เปิดสายได้ภายใน 1 นาที · คุยต่อได้ 30 นาที */
const START_WINDOW_MS = 60_000
const LIFETIME_MS = 30 * 60_000

export async function POST(request: Request) {
  const supabase = await createClient()
  const userId = await currentUserId(supabase)
  if (!userId) {
    return Response.json({ ok: false, error: 'ยังไม่ได้ล็อกอิน' }, { status: 401 })
  }

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    return Response.json({ ok: false, error: 'ยังไม่ได้ตั้ง GEMINI_API_KEY ฝั่งเซิร์ฟเวอร์' }, { status: 500 })
  }

  // ภาษาถูกล็อกไปกับ token ด้วย · เปลี่ยนภาษาระหว่างสายไม่ได้ ต้องวางแล้วโทรใหม่
  // ซึ่งถูกแล้ว เพราะ setup ของ Live API แก้กลางสายไม่ได้อยู่แล้ว
  let langs
  try {
    langs = readLangs(((await request.json()) as { langs?: unknown }).langs)
  } catch {
    langs = readLangs(undefined)
  }

  const now = Date.now()
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + LIFETIME_MS).toISOString(),
      newSessionExpireTime: new Date(now + START_WINDOW_MS).toISOString(),
      // ⚠️ ชื่อฟิลด์คือ `bidiGenerateContentSetup` และรูปข้างในเป็นแบบเดียวกับ
      //    setup message ของ WebSocket เป๊ะ ๆ — ไม่ได้ห่อด้วย `config` อีกชั้น
      //    (เอกสารหน้าแนะนำใช้คำว่า liveConnectConstraints ซึ่ง v1beta ไม่รู้จัก
      //     ตอบ 400 Unknown name · ชื่อที่ถูกอยู่ในหน้า API reference)
      bidiGenerateContentSetup: {
        model: `models/${VOICE_MODEL}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } } },
        },
        systemInstruction: { parts: [{ text: systemPrompt('voice', bangkokToday().dateKey, langs) }] },
        tools: [{ functionDeclarations: toolDeclarations() }],
        // ได้ transcript ทั้งสองฝั่งมาฟรี — เอาไปขึ้นคำบรรยายและเก็บลงประวัติ
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // ขอ handle ไว้ต่อสายเมื่อครบ 15 นาที หรือเน็ตหลุดกลางทาง
        sessionResumption: {},
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const quota = res.status === 429
    return Response.json(
      {
        ok: false,
        quota,
        error: quota ? 'โควตาเสียงของวันนี้หมดแล้ว' : `ขอ token ไม่สำเร็จ (${res.status}) ${body.slice(0, 200)}`,
      },
      { status: quota ? 429 : 502 }
    )
  }

  const json = (await res.json()) as { name?: string }
  if (!json.name) {
    return Response.json({ ok: false, error: 'ไม่ได้ token กลับมา' }, { status: 502 })
  }

  return Response.json({
    ok: true,
    token: json.name,
    model: VOICE_MODEL,
    // เบราว์เซอร์ใช้ตัดสินว่าต้องขอใบใหม่ก่อนต่อสายรอบถัดไปไหม
    expiresAt: new Date(now + LIFETIME_MS).toISOString(),
  })
}
