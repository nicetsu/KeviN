import { Skeleton } from '@/components/Reveal'
import { HeadSkeleton, SecSkeleton, RowsSkeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <Skeleton>
      <main className="wrap">
        <HeadSkeleton wide="11rem" />
        <div className="skel" style={{ height: '5.5rem', borderRadius: 'var(--r-card)' }} />
        <SecSkeleton />
        <RowsSkeleton rows={4} />
      </main>
    </Skeleton>
  )
}
