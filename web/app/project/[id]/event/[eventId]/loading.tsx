import { HeadSkeleton, SecSkeleton, RowsSkeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <main className="wrap">
      <HeadSkeleton wide="11rem" />
      <div className="skel" style={{ height: '1.6rem', width: '16rem', borderRadius: 'var(--r-pill)' }} />
      <SecSkeleton wide="4rem" />
      <RowsSkeleton rows={5} />
      <SecSkeleton wide="4.5rem" />
      <RowsSkeleton rows={2} />
    </main>
  )
}
