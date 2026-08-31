import { Skeleton } from '@/components/Reveal'
import { HeadSkeleton, SecSkeleton, RowsSkeleton } from '@/components/Skeleton'

/**
 * ⚠️ **ครอบ `/library/[areaId]` ด้วย** — `loading.tsx` ใน segment เป็น
 *    Suspense boundary ของทุก route ลูกที่ไม่มีของตัวเอง
 *    หน้า Area จึงเห็นโครงร่างชุดนี้ ซึ่งหน้าตาไม่ตรงกับหน้านั้นเท่าไหร่
 *    แต่ยังดีกว่าจอค้างเปล่า ๆ ระหว่างรอเซิร์ฟเวอร์
 */
export default function Loading() {
  return (
    <Skeleton>
      <main className="wrap">
        <HeadSkeleton wide="5rem" />
        <div className="areas">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ height: '92px', borderRadius: 'var(--r-card)' }} />
          ))}
        </div>
        <SecSkeleton wide="8rem" />
        <RowsSkeleton rows={2} />
      </main>
    </Skeleton>
  )
}
