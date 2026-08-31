import { Skeleton } from '@/components/Reveal'
import { HeadSkeleton, RowsSkeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <Skeleton>
      <main className="wrap">
        <HeadSkeleton wide="7rem" />
        <RowsSkeleton rows={2} />
      </main>
    </Skeleton>
  )
}
