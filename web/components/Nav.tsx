'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * มือถือ = แถบล่าง · เดสก์ท็อป = แถบข้างซ้ายค้างไว้ (doc/DESIGN.md)
 */
/**
 * ช่อง `KeviN` อยู่ตรงกลางและเป็น **แคปซูล ไม่ใช่วงกลมยกขึ้น**
 *
 * หน้าวันนี้มีปุ่มเพิ่มเร็วสีม่วงอยู่มุมขวาล่างแล้ว ถ้าทำช่องนี้เป็นวงกลมม่วง
 * ยกขึ้นมาแบบที่แอปส่วนใหญ่ทำ จะได้ม่วงสองก้อนห่างกันไม่ถึงนิ้วที่แย่งกัน
 * เป็นปุ่มหลัก และกฎ "ม่วงคือสิ่งที่กดได้" จะไม่มีความหมายทันที (doc/CHAT.md §8)
 *
 * ชื่อเป็น `KeviN` ไม่ใช่ "คุย" เพราะอีกสี่ช่องเป็น*สถานที่* ส่วนช่องนี้เป็น*ใครสักคน*
 *
 * ⚠️ **ช่อง KeviN ไม่มีไอคอน** — อีกสี่ช่องมี เพราะไอคอนช่วยให้จำตำแหน่งได้
 *    โดยไม่ต้องอ่านบนจอ 360px ที่ตัวอักษรเล็กมาก · แต่ช่องนี้เป็นแคปซูลที่
 *    เปลี่ยนรูปอยู่แล้ว การใส่ไอคอนเข้าไปอีกจะทำให้มันสูงกว่าช่องอื่นจนแถบเบี้ยว
 */
const TABS = [
  { href: '/', label: 'วันนี้', talk: false, icon: HomeIcon },
  { href: '/calendar', label: 'ปฏิทิน', talk: false, icon: CalendarIcon },
  { href: '/kevin', label: 'KeviN', talk: true, icon: null },
  { href: '/library', label: 'คลัง', talk: false, icon: BoxIcon },
  { href: '/settings', label: 'ตั้งค่า', talk: false, icon: GearIcon },
]

export default function Nav() {
  const path = usePathname()
  if (path === '/login') return null

  return (
    <nav className="nav" aria-label="เมนูหลัก">
      {TABS.map((t) => {
        const active = t.href === '/' ? path === '/' : path.startsWith(t.href)
        const Icon = t.icon
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
            {Icon && <Icon />}
            <span>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/*
 * ไอคอนเขียนเป็น SVG ตรง ๆ ไม่ลงไลบรารี — ห้าอันรวมกันยังไม่ถึง 1 kB
 * และการลง icon set ทั้งชุดเพื่อใช้ห้าอันคือการจ่ายให้ของที่ไม่ได้ใช้
 *
 * ⚠️ ทุกอันใช้ `currentColor` เพื่อให้เปลี่ยนสีตามสถานะ active ได้เอง
 *    ห้ามใส่สีตายตัว ไม่งั้นช่องที่เลือกอยู่จะไม่เป็นสีม่วง
 */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, 'aria-hidden': true } as const

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...P} strokeLinejoin="round">
      <path d="M4 11l8-6 8 6v8H4z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" strokeLinecap="round" />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" {...P} strokeLinejoin="round">
      <path d="M4 7l8-3 8 3v10l-8 3-8-3z" />
      <path d="M4 7l8 3 8-3M12 10v10" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" {...P} strokeLinecap="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4" />
    </svg>
  )
}
