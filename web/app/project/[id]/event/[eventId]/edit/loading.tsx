import { Skeleton } from '@/components/Reveal'
import { HeadSkeleton, RowsSkeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <Skeleton>
      <main className="wrap">
        <HeadSkeleton wide="14rem" />
        <RowsSkeleton rows={4} />
      </main>
    </Skeleton>
  )
}
