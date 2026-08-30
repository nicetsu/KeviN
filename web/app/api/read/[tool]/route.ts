/**
 * ประตูอ่านข้อมูลของผู้ช่วย — ใช้ร่วมกันทั้งโหมดแชตและโหมดโทร
 *
 * โหมดโทรเรียกเข้ามาจาก**ฝั่งเบราว์เซอร์** เพราะ Live API รัน tool ที่ client
 * แล้วส่งผลกลับเข้าสายเอง · ที่ไม่ให้เบราว์เซอร์ถาม Supabase ตรง ๆ ทั้งที่ทำได้
 * ก็เพราะตัวกรอง Area อยู่ใน `runTool()` ฝั่งเซิร์ฟเวอร์ — ลัดเมื่อไหร่คือข้ามตัวกรอง
 * (doc/CHAT.md §3)
 */
import type { NextRequest } from 'next/server'
import { createClient, currentUserId } from '@/lib/supabase/server'
import { readOnlyDb } from '@/lib/ai/supabaseDb'
import { isToolName, runTool } from '@/lib/ai/tools'
import { bangkokToday } from '@/lib/time'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool } = await params

  // ชั้นที่ 2 · รับเฉพาะชื่อที่อยู่ในทะเบียน
  if (!isToolName(tool)) {
    return Response.json({ ok: false, error: `ไม่รู้จัก tool ชื่อ ${tool}` }, { status: 404 })
  }

  // `proxy.ts` กันคนที่ยังไม่ล็อกอินไว้แล้วทุก request · ตรวจซ้ำที่นี่เพื่อให้
  // route ยังปลอดภัยอยู่ถ้าวันหนึ่งมีคนแก้ matcher และเพื่อตอบเป็น JSON ไม่ใช่ redirect
  const supabase = await createClient()
  if (!(await currentUserId(supabase))) {
    return Response.json({ ok: false, error: 'ยังไม่ได้ล็อกอิน' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    const raw: unknown = await request.json()
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      body = raw as Record<string, unknown>
    }
  } catch {
    // ไม่มี body ก็เรียกได้ · tool ส่วนใหญ่มีค่าตั้งต้นให้อยู่แล้ว
  }

  const result = await runTool(tool, body, {
    db: await readOnlyDb(),
    today: bangkokToday().dateKey,
  })

  // ดึงข้อมูลไม่สำเร็จต้องเป็น error จริง ๆ ห้ามคืนรายการว่างให้โมเดลไปสรุปว่า
  // "ไม่มีอะไร" — คำโกหกที่แพงที่สุดที่แอปนี้พูดได้ (doc/CHAT.md §10)
  return Response.json(result, { status: result.ok ? 200 : 422 })
}
