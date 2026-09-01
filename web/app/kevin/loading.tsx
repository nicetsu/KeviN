import { Skeleton } from '@/components/Reveal'

/**
 * ระหว่างรอเซิร์ฟเวอร์ — **ห้องโทรที่เหมือนของจริงทุกจุด**
 *
 * ⚠️ **ห้ามลบไฟล์นี้เพื่อหวังว่าจะไม่มีโครงร่าง** — ลองมาแล้ว 2 ก.ย. 2026 แล้วพัง
 *    `app/loading.tsx` ของ root ครอบทุก route ที่ไม่มีของตัวเอง · ลบไฟล์นี้ทิ้ง
 *    หน้านี้จึงไปได้โครงร่าง**ของหน้ารายการ**มาแทน ซึ่งแย่กว่าเดิมมาก
 *
 * ⚠️ **ต้องเหมือนหน้าจริงทุกพิกเซล** รวมข้อความและปุ่ม — นี่คือหัวใจ
 *    เจ้าของทักซ้ำสามรอบว่าตอนเข้าหน้ายังสะดุด ทุกครั้งสาเหตุคือ*ของที่ไม่ตรงกัน*
 *    ระหว่างสองภาพนี้: วงกลมคนละพิกัด · ข้อความที่โผล่ทีหลัง · ปุ่มที่ยังไม่มี
 *    ถ้าสองภาพเหมือนกันสนิท การสลับจะมองไม่เห็นเลย เพราะไม่มีอะไรเปลี่ยน
 *
 *    เคยจงใจไม่ใส่ข้อความกับปุ่มเพราะ "ยังไม่พร้อมคุยจริง" — ความซื่อสัตย์นั้น
 *    แลกมาด้วยรอยสะดุดที่เห็นทุกครั้ง และมันเป็นความจริงอยู่แล้วในทางปฏิบัติ
 *    (ไมค์ปิดอยู่จริง และหน้าพร้อมใน ~200ms) จึงเลือกความเนียนแทน
 *
 * ⚠️ ปุ่มเป็น `disabled` — หน้าตาเหมือนเป๊ะแต่กดไม่ได้ · ช่วงที่กดไม่ได้สั้นมาก
 *    จนแทบไม่มีทางกดทัน และการกดไม่ติดยังดีกว่าการกดแล้วเปิดไมค์ก่อนหน้าพร้อม
 *
 * ⚠️ **ไม่มีคลื่นที่นี่** — คลื่นเล่นบน `VoiceCall` เพราะที่นี่มันโดนตัดกลางคันเสมอ
 */
export default function Loading() {
  return (
    <Skeleton name="talk">
      <main className="wrap">
        <div className="talk">
          <div className="talk__top">
            <div className="talk__head">
              <h1>KeviN</h1>
              <span className="gear gear--wait" aria-hidden="true" />
            </div>
            <div className="seg seg--wide" aria-hidden="true">
              <button type="button" disabled data-on="false">แชต</button>
              <button type="button" disabled data-on="true">โทร</button>
            </div>
          </div>

          <div className="stage" aria-hidden="true">
            <div className="orb" />
            <div className="stage__state">
              พร้อมคุยแล้ว
              <small>ไมค์ยังปิดอยู่</small>
            </div>
            <button type="button" className="btn stage__go" disabled tabIndex={-1}>
              {/* ต้องเป็นไอคอนตัวเดียวกับของจริง ไม่ใช่ที่ว่างเปล่า ไม่งั้นปุ่มคนละความสูง */}
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none"
                   stroke="var(--brand)" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <rect x="9" y="2.5" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
              </svg>
              เริ่มโทร
            </button>
          </div>
        </div>
      </main>
    </Skeleton>
  )
}
