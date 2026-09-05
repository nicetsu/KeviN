import { Skeleton } from '@/components/Reveal'
import { HeadSkeleton, RowsSkeleton } from '@/components/Skeleton'

/** โครงร่างของบทสนทนาหนึ่งอัน · เหตุผลที่ต้องมีอยู่ใน `../loading.tsx` */
export default function Loading() {
  return (
    <Skeleton>
      <main className="wrap">
        <HeadSkeleton wide="8rem" />
        <RowsSkeleton rows={6} />
      </main>
    </Skeleton>
  )
}
