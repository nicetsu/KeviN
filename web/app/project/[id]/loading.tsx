import { Skeleton } from '@/components/Reveal'
import { HeadSkeleton, SecSkeleton, RowsSkeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <Skeleton>
      <main className="wrap">
        <HeadSkeleton wide="13rem" />
        <div className="skel" style={{ height: '4rem', borderRadius: 'var(--r-tile)' }} />
        <SecSkeleton wide="3rem" />
        <RowsSkeleton rows={3} />
        <SecSkeleton wide="3.5rem" />
        <RowsSkeleton rows={2} />
      </main>
    </Skeleton>
  )
}
