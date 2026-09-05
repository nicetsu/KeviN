import { Skeleton } from '@/components/Reveal'
import { HeadSkeleton, RowsSkeleton } from '@/components/Skeleton'

/**
 * โครงร่างของหน้าประวัติ
 *
 * ⚠️ หน้าใหม่ทุกหน้าต้องมีไฟล์นี้ · ถ้าไม่มี มันจะตกไปใช้ `app/loading.tsx`
 *    ของ root ซึ่งเป็นโครงร่างของหน้ารายการวันนี้ ผิดกว่าการไม่มีโครงร่างเลย
 */
export default function Loading() {
  return (
    <Skeleton>
      <main className="wrap">
        <HeadSkeleton wide="10rem" />
        <RowsSkeleton rows={5} />
      </main>
    </Skeleton>
  )
}
