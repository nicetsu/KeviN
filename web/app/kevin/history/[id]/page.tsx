import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Content } from '@/components/Reveal'
import Autolink from '@/lib/autolink'
import MessageText from '@/lib/chat/MessageText'
import { conversationById } from '@/lib/chat/store'
import { VOICE_PLACEHOLDER } from '@/lib/voice/transcript'
import { bangkokTime, thaiDateLabel } from '@/lib/time'

export const dynamic = 'force-dynamic'

/**
 * บทสนทนาหนึ่งอัน · **อ่านอย่างเดียว**
 *
 * ใช้ฟองข้อความทรงเดียวกับห้องคุย เพราะการอ่านย้อนหลังกับการอ่านสด
 * เป็นการอ่านสิ่งเดียวกัน · ต่างกันแค่ตรงนี้ไม่มีช่องพิมพ์และไม่มีการ์ดร่าง
 *
 * ⚠️ **ไม่มีปุ่มลบรายอัน** โดยตั้งใจ — การล้างประวัติที่มีอยู่แล้วลบถาวรทันที
 *    ไม่มีคลังให้กู้คืน · เพิ่มปุ่มลบในหน้าที่เปิดมาอ่านเฉย ๆ คือการเชิญให้พลาด
 *    ในที่ที่พลาดแล้วย้อนไม่ได้ (หลัก UX ข้อ 5)
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const convo = await conversationById(id).catch(() => null)
  // RLS ทำให้ "ไม่มี" กับ "ไม่ใช่ของเรา" เหมือนกัน ซึ่งถูกแล้ว — ทั้งคู่คือหาไม่เจอ
  if (!convo) notFound()

  const key = new Date(new Date(convo.startedAt).getTime() + 7 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)

  return (
    <Content>
      <main className="wrap">
        <div className="page-head">
          <Link href="/kevin/history" className="back">‹ ประวัติการคุย</Link>
          <h1>{thaiDateLabel(key)}</h1>
          <div className="sub">
            เริ่มจาก{convo.startedVia === 'voice' ? 'การโทร' : 'แชต'} {bangkokTime(convo.startedAt)}
            {' · '}
            {convo.messages.length} ข้อความ
          </div>
        </div>

        <div className="thread thread--past">
          {convo.messages.map((m) => {
            const mine = m.role === 'user'
            // สิ่งที่พูดระหว่างสายไม่ถูกบันทึก — แถวนี้คือ**ที่ว่างแทนของจริง**
            // แสดงเป็นป้ายจาง ๆ ไม่ใช่ข้อความ เพราะมันไม่ใช่คำที่ใครพิมพ์
            if (mine && m.content === VOICE_PLACEHOLDER) {
              return (
                <div key={m.id} className="msg msg--me msg--voiceless">
                  พูดด้วยเสียง · ไม่ได้บันทึกไว้
                </div>
              )
            }
            return (
              <div key={m.id} className={`msg${mine ? ' msg--me' : ' msg--ai'}`}>
                {mine ? <Autolink text={m.content} /> : <MessageText text={m.content} />}
                {m.via === 'voice' && <span className="msg__via">จากสาย</span>}
              </div>
            )
          })}
        </div>
      </main>
    </Content>
  )
}
