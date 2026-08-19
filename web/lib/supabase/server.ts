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
