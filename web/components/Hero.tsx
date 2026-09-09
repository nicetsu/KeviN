'use client'

import { useSyncExternalStore } from 'react'
import Odometer from './Odometer'
import Link from 'next/link'

export type HeroEntry = {
  kind: 'class' | 'event'
  /** คาบเรียนใช้ชื่อวิชา · event ใช้ชื่อของตัวเอง */
  title: string
  /** บรรทัดล่างสุด — วิชา/สถานที่/ชนิด รวมมาแล้ว */
  sub: string
  /** บรรทัดเวลา "09:30 – 12:30" หรือ "เสาร์ 08:00 – อาทิตย์ 17:00" */
  spanText: string
  startsAt: string
  endsAt: string
  /** null = อยู่ในวันนี้ · ไม่ null = คนละวัน เช่น "พรุ่งนี้" */
  dayLabel: string | null
  /** "ถึงพรุ่งนี้ 17:00" — เฉพาะงานที่ยาวข้ามวัน ไม่งั้นเป็น null */
  untilText: string | null
  href: string | null
}

export type HeroInfo = {
  main: HeroEntry
  /**
   * อันถัดไปที่จะเริ่ม · `clash` = เริ่มก่อนอันบนจบ คือไปสองที่พร้อมกันไม่ได้
   *
   * ช่องนี้มีช่องเดียวและมีสองความหมาย เพราะมันคือสิ่งเดียวกัน — สิ่งที่จะเริ่มถัดไป
   * ต่างแค่ว่ามันเบียดเข้ามาในเวลาของอันบนหรือไม่
   */
  after: { clash: boolean; when: string; title: string; detail: string; href: string | null } | null
}

const TICK_MS = 30_000

/**
 * เวลาปัจจุบันฝั่งเบราว์เซอร์ · null ตอน render บนเซิร์ฟเวอร์
 *
 * ใช้ `useSyncExternalStore` ไม่ใช่ `useEffect` + `setState` เพราะนาฬิกาคือ
 * "แหล่งข้อมูลภายนอก" ที่ React ควรสมัครรับ ไม่ใช่สถานะที่เราไปตั้งเองใน effect
 * (โค้ดเดิมทำแบบหลัง แล้ว eslint จับว่าเป็น cascading render มาตลอด)
 *
 * ⚠️ getSnapshot ต้องคืนค่าเดิมเป๊ะ ๆ ระหว่างสองจังหวะติ๊ก ไม่งั้น React
 *    จะ re-render ไม่รู้จบ · จึงปัดลงเป็นช่วงละ 30 วินาที ซึ่งละเอียดพอสำหรับ
 *    การนับถอยหลังเป็นนาทีอยู่แล้ว
 */
function useNow(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const t = setInterval(onChange, TICK_MS)
      return () => clearInterval(t)
    },
    () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
    () => null
  )
}

/**
 * hero บนหน้าวันนี้ · ตอบหลักการ UX ข้อ 1 —
 * เปิดมาต้องรู้ทันทีว่าตอนนี้ต้องทำอะไร โดยไม่ต้องกวาดตาหาเอง
 *
 * ชื่ออยู่บรรทัดใหญ่ เวลาลงมาอยู่บรรทัดรอง (เจ้าของเคาะ 21 ส.ค.) — ทำให้ทุกสถานะ
 * ใช้โครงเดียวกันหมด รวมถึงงานข้ามวันที่ไม่มี "เวลาเริ่มของวันนี้" ที่มีความหมาย
 *
 * นับถอยหลังฝั่งเบราว์เซอร์ เพราะถ้าเรนเดอร์ฝั่งเซิร์ฟเวอร์อย่างเดียว
 * ตัวเลขจะค้างอยู่ที่ตอนโหลดหน้า แล้วโกหกทันทีที่ผ่านไปหนึ่งนาที
 */
export default function Hero({ info }: { info: HeroInfo }) {
  const { main, after } = info
  const now = useNow()

  const start = new Date(main.startsAt).getTime()
  const end = new Date(main.endsAt).getTime()
  const isEvent = main.kind === 'event'

  const NEXT = isEvent ? 'ถัดไป' : 'กิจวัตรถัดไป'
  const NOW = isEvent ? 'กำลังเกิดขึ้น' : 'กำลังเรียนอยู่'

  let kicker: React.ReactNode = NEXT
  let live = false

  if (main.dayLabel) {
    // คนละวันแล้ว — นับถอยหลังเป็นชั่วโมงไม่ช่วยอะไร บอกชื่อวันตรง ๆ ชัดกว่า
    kicker = `${NEXT} · ${main.dayLabel}`
  } else if (now !== null) {
    if (now >= start && now < end) {
      live = true
      // งานข้ามวันที่เหลืออีกเป็นสิบชั่วโมง นับเป็นนาทีแล้วอ่านไม่รู้เรื่อง
      kicker = main.untilText ? (
        `${NOW} · ${main.untilText}`
      ) : (
        <>{NOW} · เหลืออีก <Gap ms={end - now} /></>
      )
    } else if (now < start) {
      kicker = <>{NEXT} · อีก <Gap ms={start - now} /></>
    }
  }

  return (
    <div className={`hero${live ? ' hero--live' : ''}`}>
      <div className={`hero__kick${live ? ' hero__kick--live' : ''}`}>{kicker}</div>

      {main.href ? (
        <Link href={main.href} className="hero__name hero__name--tap">{main.title}</Link>
      ) : (
        <div className="hero__name">{main.title}</div>
      )}

      <div className="hero__time">{main.spanText}</div>
      {main.sub && <div className="hero__sub">{main.sub}</div>}

      {/*
        แถบความคืบหน้า — ขึ้นเฉพาะตอนกำลังเกิดขึ้นจริง
        ตอนอยู่ในคาบ สิ่งที่อยากรู้คือ "เหลืออีกเท่าไหร่" ซึ่งตัวเลขบอกแล้ว
        แต่แถบทำให้รู้ได้จากการชำเลืองโดยไม่ต้องอ่าน · เดินเองทุกนาที
        เพราะ useNow() เดินอยู่แล้ว ไม่ได้เพิ่มต้นทุนอะไร
      */}
      {live && now !== null && end > start && (
        <div
          className="hero__bar"
          role="progressbar"
          aria-label="ความคืบหน้าของกิจวัตรนี้"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(((now - start) / (end - start)) * 100)}
        >
          <span style={{ width: `${Math.min(100, ((now - start) / (end - start)) * 100)}%` }} />
        </div>
      )}

      {after && <AfterLine {...after} />}
    </div>
  )
}

function AfterLine({
  clash, when, title, detail, href,
}: NonNullable<HeroInfo['after']>) {
  const body = (
    <>
      <span className="hero__afterTop">
        {clash ? 'ทับกับ' : 'ถัดไป'} {when} · {title}
      </span>
      {detail && <span className="hero__afterSub">{detail}</span>}
    </>
  )

  return (
    <div className={`hero__after${clash ? ' hero__after--clash' : ''}`}>
      <span className="hero__afterBar" />
      {href ? <Link href={href} className="hero__afterBody">{body}</Link>
            : <span className="hero__afterBody">{body}</span>}
    </div>
  )
}

/** "1 ชม. 53 นาที" · "40 นาที" */
/**
 * ช่วงเวลาที่เหลือ · ตัวเลขไหลทีละหลักแทนที่จะกระพริบ
 *
 * ตัวเลขนี้เปลี่ยนทุกนาทีขณะที่ผู้ใช้จ้องการ์ดอยู่ — เป็นตัวเลขเดียวในแอป
 * ที่เปลี่ยนเองต่อหน้า จึงคุ้มที่จะให้มันเดินแทนที่จะกระตุก
 */
function Gap({ ms }: { ms: number }) {
  const mins = Math.round(ms / 60000)
  if (mins < 60) return <><Odometer value={mins} label={`${mins} นาที`} /> นาที</>
  return (
    <>
      <Odometer value={Math.floor(mins / 60)} label={`${Math.floor(mins / 60)} ชั่วโมง`} /> ชม.{' '}
      <Odometer value={mins % 60} label={`${mins % 60} นาที`} /> นาที
    </>
  )
}
