import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * ต่ออายุ session ทุก request แล้วกันคนที่ยังไม่ล็อกอินออกจากหน้าอื่น
 *
 * ต้องมีเพราะ RLS ผูกกับ auth.uid() — ถ้าไม่มี session ทุก query
 * จะคืนศูนย์แถวเงียบ ๆ โดยไม่มี error ให้เห็น ซึ่งหาสาเหตุยากมาก
 */
export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // ห้ามใช้ getSession() ตรงนี้ — มันอ่านจาก cookie โดยไม่ยืนยันกับเซิร์ฟเวอร์
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  if (!user && path !== '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // manifest กับ service worker ต้องเข้าถึงได้โดยไม่ต้องล็อกอิน
  // ไม่งั้นเบราว์เซอร์ลงทะเบียน service worker ไม่ได้ และ PWA พังทั้งหมด
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\.(?:svg|png|jpg|jpeg|webp|ico)$).*)',
  ],
}
