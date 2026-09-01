import { Skeleton } from '@/components/Reveal'

/**
 * โครงร่างของห้องคุย — **ต้องเป็นรูปเดียวกับของจริงที่กำลังจะมา**
 *
 * ของเดิมเป็นโครงรายการ (หัว + สามแถว) ซึ่งไม่ตรงกับหน้านี้เลย
 * พอเนื้อจริงมาถึงจึงเห็นเป็นการกระโดดคนละรูป แทนที่จะเป็นโครงร่างที่กลายเป็นเนื้อ
 *
 * ⚠️ ทำโครงของ **โหมดแชต** เพราะฝั่งเซิร์ฟเวอร์เริ่มที่แชตเสมอ
 *    (`useMode` คืน 'chat' เป็น server snapshot) · ถ้าผู้ใช้เลือกโหมดโทรไว้
 *    จอจะสลับตอน hydrate ซึ่งเร็วกว่าการรอข้อมูลมาก
 *
 * ⚠️ ใช้ `.talk` ครอบเหมือนของจริง เพื่อให้**แสงพื้นหลังติดมาตั้งแต่ตอนโหลด**
 *    ไม่งั้นจะเห็นพื้นเปลี่ยนสีตอนเนื้อจริงมาถึง
 */
export default function Loading() {
  return (
    <Skeleton>
      <main className="wrap">
        <div className="talk">
          <div className="talk__head">
            <div className="skel" style={{ height: '1.6rem', width: '5rem' }} />
            <div className="skel" style={{ height: '2rem', width: '2rem', borderRadius: '50%' }} />
          </div>

          {/* แท็บสองโหมด — กรอบจริง ข้างในเป็นโครง */}
          <div className="seg seg--wide" aria-hidden="true">
            <div className="skel" style={{ flex: 1, height: '1.6rem', margin: '0 2px' }} />
            <div className="skel" style={{ flex: 1, height: '1.6rem', margin: '0 2px' }} />
          </div>

          {/* ฟองข้อความ · สลับข้างและยาวไม่เท่ากันเหมือนบทสนทนาจริง
              ไม่สุ่มความกว้าง เพราะ server กับ client ต้อง render ตรงกัน */}
          <div className="thread">
            <div className="skel skel-bubble skel-bubble--me" style={{ width: '52%', height: '2.4rem' }} />
            <div className="skel skel-bubble skel-bubble--ai" style={{ width: '78%', height: '3.6rem' }} />
            <div className="skel skel-bubble skel-bubble--me" style={{ width: '44%', height: '2.4rem' }} />
            <div className="skel skel-bubble skel-bubble--ai" style={{ width: '66%', height: '2.9rem' }} />
          </div>

          <div className="composer">
            <div className="skel" style={{ flex: 1, height: '2.5rem', borderRadius: 'var(--r-pill)' }} />
            <div className="skel" style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%' }} />
          </div>
        </div>
      </main>
    </Skeleton>
  )
}
