'use server'

import { createClient, currentUserId } from '@/lib/supabase/server'

export type Result = { ok: true } | { ok: false; error: string }

/** เก็บ subscription ของเครื่องนี้ · หนึ่งแถวต่อหนึ่งเครื่องที่กดอนุญาต */
export async function saveSubscription(sub: {
  endpoint: string
  p256dh: string
  auth: string
  deviceLabel: string
}): Promise<Result> {
  const supabase = await createClient()
  const userId = await currentUserId(supabase)   // upsert ต้องระบุเจ้าของ
  if (!userId) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  // endpoint เป็น unique — เครื่องเดิมกดซ้ำให้ทับของเดิม ไม่สร้างแถวใหม่
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      device_label: sub.deviceLabel,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function removeSubscription(endpoint: string): Promise<Result> {
  const supabase = await createClient()

  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * ส่งการแจ้งเตือนทดสอบ โดยตั้ง reminder ให้ถึงเวลาทันที
 * แล้วปล่อยให้ cron + Edge Function ตัวจริงเป็นคนส่ง
 *
 * ทำแบบนี้เพื่อให้ปุ่มทดสอบพิสูจน์ "ทั้งเส้นทาง" ไม่ใช่แค่ว่าเบราว์เซอร์แสดงกล่องได้
 */
export async function sendTestReminder(): Promise<Result> {
  const supabase = await createClient()
  const userId = await currentUserId(supabase)   // insert reminder ต้องระบุเจ้าของ
  if (!userId) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .is('archived_at', null)
    .limit(1)
    .maybeSingle()

  if (!project) return { ok: false, error: 'ยังไม่มีโปรเจกต์ให้ผูกการเตือนทดสอบ' }

  const { error } = await supabase.from('items').insert({
    user_id: userId,
    project_id: project.id,
    type: 'reminder',
    title: 'ทดสอบการแจ้งเตือนจาก KeviN',
    body: 'ถ้าเห็นข้อความนี้บนมือถือ แปลว่าเส้นทางแจ้งเตือนทำงานครบวงแล้ว',
    remind_at: new Date(Date.now() - 1000).toISOString(),
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
