import { latestConversation, type StoredMessage } from '@/lib/chat/store'
import TalkRoom from './TalkRoom'

export const dynamic = 'force-dynamic'

/**
 * ห้องคุยกับ KeviN — ประตูที่สาม
 *
 * โหลดบทสนทนาล่าสุดมาต่อ ไม่ได้เริ่มใหม่ทุกครั้ง · เพราะสองโหมดเขียนลง
 * บทสนทนาเดียวกัน วางสายแล้วเข้ามาพิมพ์ต่อจึงเห็นสิ่งที่เพิ่งคุยไป (doc/CHAT.md §9)
 */
export default async function KevinPage() {
  let conversationId: string | null = null
  let messages: StoredMessage[] = []
  let loadError: string | null = null

  try {
    const convo = await latestConversation()
    if (convo) {
      conversationId = convo.id
      messages = convo.messages
    }
  } catch (e) {
    // ไม่ล้มทั้งหน้า — พิมพ์คุยใหม่ยังทำได้แม้ประวัติเก่าจะโหลดไม่ขึ้น
    loadError = e instanceof Error ? e.message : 'โหลดบทสนทนาไม่สำเร็จ'
  }

  return (
    <main className="wrap">
      <div className="page-head">
        <h1>KeviN</h1>
      </div>
      <TalkRoom
        conversationId={conversationId}
        initialMessages={messages}
        loadError={loadError}
      />
    </main>
  )
}
