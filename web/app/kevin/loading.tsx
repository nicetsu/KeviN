import { HeadSkeleton, RowsSkeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <main className="wrap">
      <HeadSkeleton wide="5rem" />
      <RowsSkeleton rows={3} />
    </main>
  )
}
