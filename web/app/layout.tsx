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

export const viewport: Viewport = {
  themeColor: '#0A0912',
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
