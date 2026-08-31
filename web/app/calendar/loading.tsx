import { Skeleton } from '@/components/Reveal'
import { HeadSkeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <Skeleton>
      <main className="wrap">
        <HeadSkeleton wide="8rem" />
        <div className="skel" style={{ height: '19rem', borderRadius: 'var(--r-card)' }} />
      </main>
    </Skeleton>
  )
}
