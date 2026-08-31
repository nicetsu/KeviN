'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { takeOff } from '@/lib/cardFlight'

/**
 * การ์ด Area ในหน้าคลัง — จดตำแหน่งตัวเองไว้ตอนถูกกด
 *
 * หน้าถัดไปเอาไปใช้ให้หัวของมัน "บิน" ออกมาจากตรงนี้ (lib/cardFlight.ts)
 * ถ้าจดไม่ได้หรือหน้าถัดไปโหลดช้า ก็แค่ไม่มี animation — การเปลี่ยนหน้ายังปกติ
 */
export default function AreaCard({
  id,
  name,
  colorClass,
  count,
  attention,
}: {
  id: string
  name: string
  colorClass: string
  count: string
  attention: number
}) {
  const ref = useRef<HTMLAnchorElement | null>(null)

  return (
    <Link
      ref={ref}
      href={`/library/${id}`}
      className={`acard ${colorClass}`}
      transitionTypes={['nav-forward']}
      onClick={() => {
        const el = ref.current
        if (el) takeOff(id, el.getBoundingClientRect(), Date.now())
      }}
    >
      <span className="acard__nm">{name}</span>
      <span className="acard__ct">{count}</span>
      {attention > 0 && <span className="acard__badge">{attention}</span>}
    </Link>
  )
}
