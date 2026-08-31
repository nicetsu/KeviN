import { HeadSkeleton, SecSkeleton, RowsSkeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <main className="wrap">
      <HeadSkeleton wide="9rem" />
      <SecSkeleton wide="7rem" />
      <RowsSkeleton rows={4} />
    </main>
  )
}
