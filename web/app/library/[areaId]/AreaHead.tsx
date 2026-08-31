'use client'

import { useLayoutEffect, useRef } from 'react'
import { land, startTransform } from '@/lib/cardFlight'

/**
 * หัวของหน้า Area — บินออกมาจากตำแหน่งการ์ดที่ถูกกดในหน้าคลัง
 *
 * ⚠️ **ต้องเป็น `useLayoutEffect`** ต้องตั้งท่าเริ่มต้นให้เสร็จก่อนเบราว์เซอร์
 *    วาดเฟรมแรก ถ้าใช้ `useEffect` ผู้ใช้จะเห็นหัวโผล่ที่ตำแหน่งจริงก่อน
 *    แล้วค่อยกระโดดกลับไปเริ่มบิน ซึ่งแย่กว่าไม่มี animation
 *
 * ⚠️ **ไม่ทำอะไรเลยถ้าไม่มีค่าที่จดไว้** — เข้าหน้านี้ตรง ๆ จาก URL
 *    หรือกดย้อนกลับ หัวก็แค่อยู่ที่ของมันเฉย ๆ ไม่มีการเคลื่อนไหวที่อธิบายไม่ได้
 */
export default function AreaHead({
  areaId,
  colorClass,
  name,
  count,
  attention,
}: {
  areaId: string
  colorClass: string
  name: string
  count: string
  attention: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const from = land(areaId, Date.now())
    if (!from) return

    const to = el.getBoundingClientRect()

    // ⚠️ ต้องตั้ง **ก่อน** เริ่ม animate — Web Animations API อ่านค่านี้จาก
    //    element ไม่ใช่จาก keyframes · ถ้าตั้งทีหลังจะย่อจากกึ่งกลางแล้วตำแหน่งเพี้ยน
    el.style.transformOrigin = 'top left'

    el.animate(
      [
        { transform: startTransform(from, to), opacity: 0.65 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 340, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
    )
  }, [areaId])

  return (
    <div ref={ref} className={`acard acard--head ${colorClass}`}>
      <span className="acard__nm">{name}</span>
      <span className="acard__ct">{count}</span>
      {attention > 0 && <span className="acard__badge">{attention}</span>}
    </div>
  )
}
