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
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

type Item = {
  id: string
  user_id: string
  title: string
  body: string | null
  remind_at: string
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

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
    return Response.json({ ok: false, stage: 'claim', error: error.message }, { status: 500 })
  }

  const items = (due ?? []) as Item[]
  if (items.length === 0) {
    return Response.json({ ok: true, claimed: 0, sent: 0 })
  }

  const userIds = [...new Set(items.map((i) => i.user_id))]
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)
    .eq('enabled', true)

  let sent = 0
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
        if (status === 404 || status === 410) dead.push(s.endpoint)
      }
    }
  }

  if (dead.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', dead)
  }

  return Response.json({ ok: true, claimed: items.length, sent, pruned: dead.length })
})
