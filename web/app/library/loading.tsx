import { Skeleton } from '@/components/Reveal'
import { HeadSkeleton, SecSkeleton, RowsSkeleton } from '@/components/Skeleton'

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
