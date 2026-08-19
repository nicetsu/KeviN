import { createBrowserClient } from '@supabase/ssr'

/** Supabase client ฝั่งเบราว์เซอร์ · ใช้ anon key คู่กับ RLS เท่านั้น */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
