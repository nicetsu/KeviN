import { Skeleton } from '@/components/Reveal'

/**
 * ระหว่างรอเซิร์ฟเวอร์ — **ห้องโทรที่เหมือนของจริงทุกจุด**
 *
 * ⚠️ **ห้ามลบไฟล์นี้เพื่อหวังว่าจะไม่มีโครงร่าง** — ลองมาแล้ว 2 ก.ย. 2026 แล้วพัง
 *    `app/loading.tsx` ของ root ครอบทุก route ที่ไม่มีของตัวเอง · ลบไฟล์นี้ทิ้ง
 *    หน้านี้จึงไปได้โครงร่าง**ของหน้ารายการ**มาแทน ซึ่งแย่กว่าเดิมมาก
 *
 * ⚠️ **เห็นแค่วงกลม — ข้อความกับปุ่มมีอยู่แต่ล่องหน** (เจ้าของเคาะ 2 ก.ย. 2026)
 *
 *    สองก้อนนั้นเป็น `visibility: hidden` ไม่ใช่ถูกลบทิ้ง เพราะ `.stage` จัดของ
 *    กึ่งกลางแนวตั้ง · ถ้าไม่มีอะไรถ่วงข้างใต้ **วงกลมจะเลื่อนลงไปอยู่กลางฉาก**
 *    แล้วกระโดดขึ้นตอนเนื้อจริงมา (วัดเจอ 35px) — นี่คือสาเหตุของรอยสะดุด
 *    ที่ตามแก้กันมาหลายรอบ
 *
 *    เคยลองให้เห็นข้อความกับปุ่มด้วยเพื่อให้สองภาพเหมือนกันสนิท แต่เจ้าของ
 *    ไม่เอา — ตอนยังโหลดไม่เสร็จควรมีแค่วงกลม · ของสองก้อนนั้นจึงโผล่พร้อม
 *    เนื้อจริงเป็นการเคลื่อนไหวเดียว ไม่ใช่การจางซ้อนของที่แสดงอยู่แล้ว
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
            {/* ล่องหนแต่ยังกินที่ — กันวงกลมเลื่อนลงไปอยู่กลางฉาก */}
            <div className="stage__state enter__ghost">
              พร้อมคุยแล้ว
              <small>ไมค์ยังปิดอยู่</small>
            </div>
            <button type="button" className="btn stage__go enter__ghost" disabled tabIndex={-1}>
              {/* ไอคอนตัวเดียวกับของจริง ไม่ใช่ที่ว่างเปล่า ไม่งั้นปุ่มคนละความสูง */}
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
