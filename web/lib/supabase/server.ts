import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Supabase client ฝั่งเซิร์ฟเวอร์ · anon key + RLS เหมือนกัน ไม่ยกสิทธิ์ */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // เรียกจาก Server Component — middleware ต่ออายุ session ให้อยู่แล้ว
          }
        },
      },
    }
  )
}

/**
 * id ของผู้ใช้ปัจจุบัน — ตรวจ JWT ในเครื่องด้วยกุญแจสาธารณะ **ไม่ยิงเน็ต**
 *
 * ห้ามเปลี่ยนกลับไปใช้ `getUser()` ที่นี่ — `getUser()` เป็น network call ไป
 * Supabase ทุกครั้ง และ `proxy.ts` ยืนยันตัวตนกับเซิร์ฟเวอร์ให้แล้วทุก request
 * อยู่แล้ว การเรียกซ้ำใน action จึงเป็นการจ่ายค่า round trip ฟรี ๆ รอบที่สอง
 *
 * (โปรเจกต์นี้ใช้ signing key แบบ ES256 · `getClaims()` จึงตรวจลายเซ็นในเครื่อง
 *  ได้เลย — ถ้าวันหนึ่งย้ายไปใช้ secret แบบ HS256 มันจะกลับไปยิงเน็ตเอง
 *  ยังถูกต้องอยู่ แค่ช้าลง)
 */
export async function currentUserId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  return typeof sub === 'string' ? sub : null
}
