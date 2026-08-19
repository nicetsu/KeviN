import { HeadSkeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <main className="wrap">
      <HeadSkeleton wide="12rem" />
      <div className="skel" style={{ height: '14rem', borderRadius: 'var(--r-card)' }} />
    </main>
  )
}
