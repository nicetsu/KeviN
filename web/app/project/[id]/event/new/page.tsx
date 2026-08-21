import { connection } from 'next/server'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { bangkokToday } from '@/lib/time'
import EventEditor, { newLine } from '../EventEditor'

export const dynamic = 'force-dynamic'

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // `connection()` ประกาศว่าหน้านี้ขึ้นกับ request จริง — ไม่งั้นวันเริ่มต้นของฟอร์ม
  // จะถูกตรึงไว้ที่วันที่ build แล้วผิดเงียบ ๆ (เหตุผลเดียวกับหน้าวันนี้)
  await connection()
  const today = bangkokToday().dateKey

  const { data } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()

  return (
    <main className="wrap">
      <EventEditor
        projectId={id}
        projectName={data.name}
        eventId={null}
        archived={false}
        initial={{
          title: '',
          body: '',
          startDate: today,
          startTime: '09:00',
          endDate: today,
          endTime: '12:00',
          location: '',
          label: '',
        }}
        initialLines={[newLine(0, '09:00')]}
      />
    </main>
  )
}
