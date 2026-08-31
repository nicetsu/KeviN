'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * ให้แถวที่ย้ายตำแหน่ง **เดินทาง** ไปแทนที่จะกระโดด
 *
 * เทคนิค FLIP — จำตำแหน่งเดิมไว้ (First) วาดใหม่ให้เสร็จ (Last) แล้วเอา
 * ผลต่างมาเป็นจุดเริ่มของ animation (Invert + Play) เบราว์เซอร์จึงเคลื่อน
 * ด้วย `transform` อย่างเดียว ซึ่งไม่บังคับให้คำนวณ layout ใหม่ทุกเฟรม
 *
 * ⚠️ **ต้องเป็น `useLayoutEffect` ไม่ใช่ `useEffect`** — ต้องวัดให้เสร็จก่อน
 *    เบราว์เซอร์วาดเฟรมถัดไป ถ้าใช้ `useEffect` ผู้ใช้จะเห็นแถวกระโดดไปที่ใหม่
 *    ก่อนแล้ว animation ค่อยเริ่มจากตรงนั้น ซึ่งแย่กว่าไม่มี animation
 *
 * ⚠️ **ครอบทุกสาเหตุที่ทำให้ตำแหน่งเปลี่ยน** ไม่ใช่แค่การติ๊ก — เรียงใหม่จาก
 *    เซิร์ฟเวอร์ · เก็บเข้าคลัง · ลากจัดลำดับ ล้วนวิ่งผ่านทางนี้ทางเดียว
 *    ที่ทำแบบนี้เพราะการเรียงจริงเกิดฝั่งเซิร์ฟเวอร์ ตำแหน่งใหม่จึงมาถึง
 *    ตอน re-render ไม่ใช่ตอนที่เรากดปุ่ม
 */
export function useFlip(container: RefObject<HTMLElement | null>, key: string) {
  const seen = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const root = container.current
    if (!root) return

    // เช็กทุกครั้งที่รัน ไม่ใช่ตอนโหลดโมดูล — ผู้ใช้เปลี่ยนค่านี้กลางทางได้
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const rows = [...root.querySelectorAll<HTMLElement>('[data-flip]')]
    const next = new Map<string, number>()

    for (const el of rows) {
      const id = el.dataset.flip
      if (!id) continue
      const top = el.getBoundingClientRect().top
      next.set(id, top)

      const was = seen.current.get(id)
      if (was === undefined) continue        // แถวใหม่ — ไม่มีที่เดิมให้เดินทางจาก
      const dy = was - top
      if (Math.abs(dy) < 1) continue         // ไม่ได้ขยับจริง
      if (still) continue                    // ยังต้องวัดตำแหน่งไว้ แค่ไม่เล่น animation

      el.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
        {
          duration: 320,
          easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        }
      )
    }

    seen.current = next
  }, [container, key])
}
