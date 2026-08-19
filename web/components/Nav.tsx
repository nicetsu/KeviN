'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * มือถือ = แถบล่าง · เดสก์ท็อป = แถบข้างซ้ายค้างไว้ (doc/DESIGN.md)
 *
 * ปฏิทินอยู่เฟส 3 · ตั้งค่าอยู่เฟส 5 — แสดงเป็นปุ่มจางกดไม่ได้
 * ดีกว่าลิงก์ที่พาไปหน้า 404
 */
const TABS = [
  { href: '/', label: 'วันนี้', ready: true },
  { href: '/calendar', label: 'ปฏิทิน', ready: true },
  { href: '/library', label: 'คลัง', ready: true },
  { href: '/settings', label: 'ตั้งค่า', ready: true },
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
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`nav__item${active ? ' nav__item--on' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
