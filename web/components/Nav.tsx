'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * มือถือ = แถบล่าง · เดสก์ท็อป = แถบข้างซ้ายค้างไว้ (ARCHITECTURE.md §9)
 */
/**
 * ช่อง `KeviN` อยู่ตรงกลางและเป็น **แคปซูล ไม่ใช่วงกลมยกขึ้น**
 *
 * หน้าวันนี้มีปุ่มเพิ่มเร็วสีม่วงอยู่มุมขวาล่างแล้ว ถ้าทำช่องนี้เป็นวงกลมม่วง
 * ยกขึ้นมาแบบที่แอปส่วนใหญ่ทำ จะได้ม่วงสองก้อนห่างกันไม่ถึงนิ้วที่แย่งกัน
 * เป็นปุ่มหลัก และกฎ "ม่วงคือสิ่งที่กดได้" จะไม่มีความหมายทันที (ARCHITECTURE.md §6)
 *
 * ชื่อเป็น `KeviN` ไม่ใช่ "คุย" เพราะอีกสี่ช่องเป็น*สถานที่* ส่วนช่องนี้เป็น*ใครสักคน*
 *
 * ⚠️ **ช่องนี้ไม่มีไอคอน และไม่มีข้อความ** — ตัวเวิร์ดมาร์กคือทั้งสองอย่างในตัวเดียว
 *    อีกสี่ช่องมีไอคอนเพราะช่วยให้จำตำแหน่งได้โดยไม่ต้องอ่านบนจอ 360px
 *    แต่ช่องนี้แยกตัวด้วยกล่องกับรูปคำอยู่แล้ว การใส่ไอคอนเพิ่มจะทำให้แถบเบี้ยว
 *
 * ⚠️ ไม่มีข้อความจริงในช่องนี้ **`aria-label` จึงเป็นทางเดียวที่คนใช้ screen reader
 *    จะรู้ว่าปุ่มนี้ไปไหน** — ลบเมื่อไหร่ปุ่มจะกลายเป็นปุ่มไร้ชื่อทันที
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
            aria-label={t.talk ? t.label : undefined}
          >
            {t.talk ? (
              /* กล่องอยู่ชั้นในเพื่อให้มันกว้างพอดีคำ ไม่ใช่กว้างเท่าช่อง
                 ถ้าเอาพื้นไปไว้ที่ตัวช่องเลย กล่องจะยืดเต็ม 92px แล้วหนักกว่าที่เคาะไว้ */
              <span className="nav__box"><Wordmark /></span>
            ) : (
              <>
                {Icon && <Icon />}
                <span>{t.label}</span>
              </>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * เวิร์ดมาร์ก — คำว่า KEVIN ในฟอนต์ Unbounded Medium **ที่แกะเป็นเส้นแล้ว**
 *
 * ⚠️ **ห้ามเปลี่ยนเป็นข้อความธรรมดาแล้วสั่ง `font-family: Unbounded`**
 *    แอปนี้มีแค่ Inter + Noto Sans Thai + Geist Mono · การโหลดฟอนต์ทั้งชุด
 *    เพื่อคำเดียวคือ 20 kB ต่อการเปิดแอปครั้งแรก บวกจังหวะที่ตัวอักษรกระโดด
 *    ตอนฟอนต์มาถึง · เส้นข้างล่างนี้หนัก 418 ตัวอักษรและมาพร้อม HTML เลย
 *
 * viewBox กว้าง 509.1 สูง 100 = ความสูงตัวพิมพ์ใหญ่พอดี (cap height 750/1000 upem)
 * ดังนั้น `height` ที่ตั้งใน CSS คือความสูงของตัวอักษรจริง ๆ ไม่มีช่องว่างบนล่างให้เผื่อ
 *
 * ถ้าจะแก้คำหรือเปลี่ยนน้ำหนักฟอนต์ ต้องแกะเส้นใหม่จากไฟล์ฟอนต์ ไม่ใช่แก้ `d` ด้วยมือ
 */
function Wordmark() {
  return (
    <svg className="nav__wordmark" viewBox="0 0 509.1 100" fill="currentColor" aria-hidden="true">
      <path d="M10.3 100.0V0.0H32.8V81.6L26.4 77.1L88.3 0.0H112.4L30.7 100.0ZM58.0 51.1 74.3 36.5 113.9 100.0H88.0Z M206.4 41.3V58.7H134.8V41.3ZM150.0 50.0 143.3 92.4 133.5 81.2H210.5V100.0H120.5L128.3 50.0L120.5 0.0H209.9V18.8H133.5L143.3 7.6Z M283.5 90.0H273.5L314.3 0.0H338.3L290.8 100.0H265.3L218.0 0.0H242.3Z M349.1 0.0H371.7V100.0H349.1Z M484.8 85.1 476.9 86.3V0.0H498.9V100.0H470.3L406.3 13.7L414.0 12.5V100.0H392.1V0.0H421.5Z" />
    </svg>
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
