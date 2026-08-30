'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * มือถือ = แถบล่าง · เดสก์ท็อป = แถบข้างซ้ายค้างไว้ (doc/DESIGN.md)
 *
 * ปฏิทินอยู่เฟส 3 · ตั้งค่าอยู่เฟส 5 — แสดงเป็นปุ่มจางกดไม่ได้
 * ดีกว่าลิงก์ที่พาไปหน้า 404
 */
/**
 * ช่อง `KeviN` อยู่ตรงกลางและเป็น **แคปซูล ไม่ใช่วงกลมยกขึ้น**
 *
 * หน้าวันนี้มีปุ่มเพิ่มเร็วสีม่วงอยู่มุมขวาล่างแล้ว ถ้าทำช่องนี้เป็นวงกลมม่วง
 * ยกขึ้นมาแบบที่แอปส่วนใหญ่ทำ จะได้ม่วงสองก้อนห่างกันไม่ถึงนิ้วที่แย่งกัน
 * เป็นปุ่มหลัก และกฎ "ม่วงคือสิ่งที่กดได้" จะไม่มีความหมายทันที (doc/CHAT.md §8)
 *
 * ชื่อเป็น `KeviN` ไม่ใช่ "คุย" เพราะอีกสี่ช่องเป็น*สถานที่* ส่วนช่องนี้เป็น*ใครสักคน*
 */
const TABS = [
  { href: '/', label: 'วันนี้', ready: true, talk: false },
  { href: '/calendar', label: 'ปฏิทิน', ready: true, talk: false },
  { href: '/kevin', label: 'KeviN', ready: true, talk: true },
  { href: '/library', label: 'คลัง', ready: true, talk: false },
  { href: '/settings', label: 'ตั้งค่า', ready: true, talk: false },
]

export default function Nav() {
  const path = usePathname()
  if (path === '/login') return null

  return (
    <nav className="nav" aria-label="เมนูหลัก">
      {TABS.map((t) => {
        const active =
          t.href === '/' ? path === '/' : path.startsWith(t.href)

        if (!t.ready) {
          return (
            <span key={t.href} className="nav__item nav__item--off" aria-disabled="true">
              {t.label}
            </span>
          )
        }
        const cls = [
          'nav__item',
          t.talk ? 'nav__item--talk' : '',
          active ? (t.talk ? 'nav__item--talkOn' : 'nav__item--on') : '',
        ].filter(Boolean).join(' ')

        return (
          <Link
            key={t.href}
            href={t.href}
            className={cls}
            aria-current={active ? 'page' : undefined}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
