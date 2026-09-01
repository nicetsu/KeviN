import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_Thai } from 'next/font/google'
import Nav from '@/components/Nav'
import QuickAddMount from '@/components/QuickAddMount'
import CallProvider from '@/components/CallProvider'
import './globals.css'

// ทรงตัวอักษรคือครึ่งหนึ่งของบุคลิกสไตล์นี้ (doc/TRAPS.md) — ต้องโหลดจริง
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const notoThai = Noto_Sans_Thai({
  subsets: ['thai'],
  variable: '--font-noto-thai',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'KeviN',
  description: 'ผู้ช่วยส่วนตัว',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'KeviN' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
}

/*
 * ⚠️ **สามค่านี้ต้องขยับตามพาเลตเสมอ** — `themeColor` ที่นี่ กับ
 *    `theme_color` / `background_color` ใน `public/manifest.json`
 *
 *    เคยค้างที่ `#0A0912` ซึ่งเป็นสีพื้น**ก่อน**อุ่นพาเลตเป็น `#120E22` (1 ก.ย. 2026)
 *    ผลคือแถบระบบของ Android เป็นดำสนิทตัดกับแอปอย่างเห็นได้ชัด
 *    แต่ไม่มีอะไรใน repo ฟ้อง เพราะมันอยู่คนละไฟล์กับ `globals.css`
 *
 * `themeColor` ใช้สีของ**แถบล่าง** (`--surface`) ไม่ใช่สีพื้น เพราะแถบนำทาง
 * ของระบบอยู่ติดกับแถบล่างของแอปโดยตรง · ส่วนบนไม่มีแถบอะไรมาชน
 * และ `#1B1630` กับ `#120E22` ต่างกันน้อยจนแทบไม่เห็นรอยต่อ
 */
export const viewport: Viewport = {
  themeColor: '#1B1630',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th" className={`${inter.variable} ${notoThai.variable}`}>
      <body>
        {/*
          สายเสียงอยู่ระดับนี้ ไม่ใช่ในหน้า KeviN — ถ้าเก็บไว้ในหน้า พอสลับไปดู
          ปฏิทินกลางสาย คอมโพเนนต์จะถูก unmount แล้วสายตายทันที
        */}
        <CallProvider>
          <Nav />
          {children}
          <QuickAddMount />
        </CallProvider>
      </body>
    </html>
  )
}
