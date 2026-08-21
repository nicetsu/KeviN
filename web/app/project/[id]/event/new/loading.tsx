import { HeadSkeleton, RowsSkeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <main className="wrap">
      <HeadSkeleton wide="14rem" />
      <RowsSkeleton rows={4} />
    </main>
  )
}
