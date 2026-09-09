// KeviN · send-reminders
//
// pg_cron เรียกทุกนาที → อ้างสิทธิ์ reminder ที่ถึงเวลา → ยิง Web Push
//
// ⚠️ ห้ามเขียนตรรกะ "เลือกแถวแล้วค่อยอัปเดต" เองที่นี่เด็ดขาด (doc/TRAPS.md)
//    ต้องเรียก claim_due_reminders() ซึ่งเขียน notified_at ในคำสั่งเดียวกับที่เลือกแถว
//    ไม่งั้น cron รอบที่ทับกันจะส่ง push ซ้ำ

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// ⚠️ ไม่มี SERVICE_ROLE ที่นี่โดยตั้งใจ — ทุก query วิ่งด้วย token ของผู้เรียก (ดูด่านข้างล่าง)
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com'

/*
 * ด่านของ endpoint นี้ (9 ก.ย. 2026)
 *
 * ⚠️ ก่อนหน้านี้ฟังก์ชัน **ไม่อ่าน request เลย** (`Deno.serve(async () => …)`)
 *    token ที่ pg_cron ดึงจาก Vault มาแนบทุกนาทีจึงเป็นของประดับ ใครยิงก็ได้
 *
 * **ด่านคือ Postgres ไม่ใช่การเทียบสตริงในโค้ดนี้** — client ถูกสร้างด้วย
 * **token ของผู้เรียก** แล้ว `claim_due_reminders()` ถูก revoke จาก anon และ
 * authenticated ไว้แล้ว (เหลือแค่ service_role) · ใครยิงมาโดยไม่ถือคีย์
 * service_role จึงได้ `42501 permission denied` จาก DB เอง ไม่ใช่จากด่านที่เราเขียน
 * ตรงกับหลักข้อแรกของโปรเจกต์: กติกาบังคับที่ระดับฐานข้อมูล
 *
 * ⚠️ **ห้ามเทียบกับ `SUPABASE_SERVICE_ROLE_KEY` ใน env** — ลองมาแล้วและ**พัง**
 *    (9 ก.ย. 2026) · cron ส่ง service_role key **รุ่นเก่าที่เป็น JWT** (219 ตัว)
 *    ส่วน env ของฟังก์ชันเป็นคีย์ **รุ่นใหม่** (`sb_secret_…` 41 ตัว) สองค่านี้
 *    ไม่มีทางตรงกัน ผลคือ cron ได้ 401 ทุกนาทีแล้ว**การเตือนหยุดส่งเงียบ ๆ**
 *    ทั้งคู่ใช้ได้กับ Supabase เท่ากัน จึงเทียบสตริงกันตรง ๆ ไม่ได้
 *
 * ⚠️ **ห้ามแก้เป็น `verify_jwt: true`** — นั่นคือการตรวจ JWT ของผู้ใช้ ซึ่งเป็น
 *    token คนละแบบกับที่ cron ส่งมา · เปิดแล้วการเตือนจะหยุดส่งเงียบ ๆ เหมือนกัน
 */

/**
 * "ยิงมาโดยไม่มีสิทธิ์" ในสายตาของ Supabase มีมากกว่าหนึ่งหน้าตา
 *
 *   · คีย์ถูกแต่ role ไม่พอ (เช่น anon key) → `42501 permission denied`
 *   · คีย์ผิดรูป/ไม่ใช่ของโปรเจกต์นี้      → `Invalid API key`
 *
 * ทั้งคู่คือ 401 สำหรับผู้เรียก · **แยกออกจาก 500 ให้ขาด** ไม่งั้นการยิงมั่ว
 * จะถูกนับเป็น "ฟังก์ชันพัง" แล้วกลบเหตุพังจริงที่ควรได้รับความสนใจ
 */
function isAuthFailure(err: { code?: string; message?: string }): boolean {
  const m = (err.message ?? '').toLowerCase()
  return (
    err.code === '42501' ||
    err.code === 'PGRST301' ||
    m.includes('permission denied') ||
    m.includes('invalid api key') ||
    m.includes('jwt')
  )
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

type Item = {
  id: string
  user_id: string
  title: string
  body: string | null
  remind_at: string
}

Deno.serve(async (req) => {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  // ⚠️ **ใช้ token ของผู้เรียก ไม่ใช่ SERVICE_ROLE ของตัวเอง** — นี่คือทั้งหมด
  //    ของด่าน ถ้าเปลี่ยนกลับไปใช้ SERVICE_ROLE ที่นี่ endpoint จะเปิดให้ใครก็ได้
  //    อีกครั้งทันที **โดยที่ทุกอย่างยังทำงานถูกต้องบนจอ**
  const supabase = createClient(SUPABASE_URL, token)

  // อ้างสิทธิ์แบบ atomic — แถวที่ได้มาแล้วจะไม่ถูกหยิบซ้ำโดยรอบถัดไป
  //
  // ⚠️ **ห้ามเอาด่าน "ยังไม่มีเครื่องสมัครรับ" กลับมาไว้ที่นี่** — เคยมีอยู่ตรงนี้
  //    และมันนับเครื่อง **รวมทุกคน** ซึ่งถูกตอนมีผู้ใช้คนเดียว แต่พอมีคนที่สอง
  //    มันกลายเป็นตัวทำลายข้อมูล: B ลงเครื่องไว้แต่ A ไม่ได้ลง ด่านผ่าน แล้ว
  //    reminder ของ A ถูกเซ็ต notified_at ทิ้งทั้งที่ไม่มีที่ส่ง หายถาวรโดยไม่มี error
  //
  //    ตอนนี้เงื่อนไขย้ายไปอยู่ใน claim_due_reminders() แล้ว ซึ่งกรองราย user
  //    **ในคำสั่ง UPDATE เดียวกับที่เลือกแถว** · เอามากรองที่นี่ไม่ได้เลย
  //    เพราะนั่นเท่ากับ select แล้วค่อย update ซึ่งทำให้ cron รอบที่ทับกันส่งซ้ำ
  const { data: due, error } = await supabase.rpc('claim_due_reminders')
  if (error) {
    // ไม่บอกว่าผิดตรงไหน — ข้อความที่ละเอียดกว่านี้ช่วยคนเดาเท่านั้น
    if (isAuthFailure(error)) {
      return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    return Response.json({ ok: false, stage: 'claim', error: error.message }, { status: 500 })
  }

  const items = (due ?? []) as Item[]
  if (items.length === 0) {
    return Response.json({ ok: true, claimed: 0, sent: 0 })
  }

  const userIds = [...new Set(items.map((i) => i.user_id))]
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)
    .eq('enabled', true)

  let sent = 0
  /*
   * เก็บเป็น **id ของแถว** ไม่ใช่ endpoint (9 ก.ย. 2026)
   *
   * ⚠️ unique ของตารางนี้เป็น `(user_id, endpoint)` ตั้งแต่ 8 ก.ย. เพราะสองบัญชี
   *    เปิดจากมือถือเครื่องเดียวกันได้ · การลบด้วย `endpoint` เปล่า ๆ จึงลบแถว
   *    ของ **อีกบัญชีที่ยังใช้งานอยู่** ไปด้วย แล้วเขาจะไม่ได้รับการเตือนอีกเลย
   *    โดยไม่มี error และไม่มีอะไรบนจอบอก — ตระกูลเดียวกับบั๊กข้ามคนที่เหลือ
   */
  const dead: string[] = []

  for (const item of items) {
    const targets = (subs ?? []).filter((s) => s.user_id === item.user_id)

    for (const s of targets) {
      const payload = JSON.stringify({
        title: item.title,
        body: item.body ?? '',
        tag: `kevin-${item.id}`,
        url: '/',
      })

      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        )
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        // 404/410 = เครื่องนั้นถอนการติดตามไปแล้ว เก็บกวาดทิ้ง
        if (status === 404 || status === 410) dead.push(s.id)
      }
    }
  }

  if (dead.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', dead)
  }

  return Response.json({ ok: true, claimed: items.length, sent, pruned: dead.length })
})
