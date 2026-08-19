import { HeadSkeleton, RowsSkeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <main className="wrap">
      <HeadSkeleton wide="7rem" />
      <RowsSkeleton rows={2} />
    </main>
  )
}
