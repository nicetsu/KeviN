import { Skeleton } from '@/components/Reveal'

/**
 * ระหว่างรอเซิร์ฟเวอร์ — **ห้องโทรที่กำลังก่อตัว ไม่ใช่โครงร่างของหน้ารายการ**
 *
 * ⚠️ เดิมที่นี่เป็น `HeadSkeleton` + `RowsSkeleton` ซึ่งเป็นภาพของหน้าที่มีรายการ
 *    แต่หน้านี้เปิดมาเป็นโหมดโทรเสมอแล้ว (1 ก.ย. 2026) โครงร่างสามแถวจึงกลาย
 *    เป็นภาพของหน้าที่ไม่มีอยู่จริง แล้วกระโดดเป็นวงกลมตอนเนื้อมาถึง
 *
 * ⚠️ **ต้องใช้คลาสชุดเดียวกับหน้าจริงเป๊ะ** (`.talk` `.talk__top` `.seg` `.stage` `.orb`)
 *    วงกลมกับแถบหัวจะได้อยู่ตำแหน่งเดิมทั้งก่อนและหลัง เนื้อจริงมาถึงแล้ว
 *    จึงเป็นการจางทับที่เดียวกัน ไม่ใช่การขยับ · แก้ที่หน้าจริงต้องแก้ที่นี่ด้วย
 *
 * ⚠️ **ไม่มีข้อความสถานะและไม่มีปุ่มเริ่มโทร** โดยตั้งใจ — ตอนนี้ยังไม่พร้อมคุยจริง
 *    การขึ้น "พร้อมคุยแล้ว" ตั้งแต่ยังโหลดไม่เสร็จคือการโกหกผู้ใช้
 *    ทั้งสองอย่างโผล่พร้อมเนื้อจริง ซึ่งเป็นวินาทีที่มันเป็นเรื่องจริงพอดี
 *
 * ⚠️ ปุ่มแท็บเป็น `disabled` — มองเห็นแต่กดไม่ได้ เพราะยังไม่มีอะไรให้สลับไป
 */
export default function Loading() {
  return (
    <Skeleton>
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

          {/* คลื่นสองระลอกบิดแสงพื้นข้างหลัง ไม่ได้ทาสีทับ — วงกลมก่อตัวตรงกลาง */}
          <div className="stage stage--enter" aria-hidden="true">
            <span className="enter__heat" />
            <span className="enter__heat" />
            <div className="orb" />

            {/*
              ⚠️ **ที่ว่างขนาดเท่าข้อความกับปุ่มของจริง** — `visibility: hidden`
                 ไม่ใช่ `display: none` · ถ้าไม่มีสองก้อนนี้ `.stage` จะจัดกึ่งกลาง
                 โดยนับแค่วงกลม วงกลมเลยอยู่ต่ำกว่าหน้าจริง **แล้วกระโดดขึ้น
                 ตอนเนื้อมาถึง** (วัดเจอตอนทำ 2 ก.ย. 2026)
                 ข้อความจริงยังไม่ขึ้นตรงนี้เพราะยังไม่พร้อมคุยจริง
            */}
            <div className="stage__state enter__ghost">
              พร้อมคุยแล้ว
              <small>ไมค์ยังปิดอยู่</small>
            </div>
            <button type="button" className="btn stage__go enter__ghost" disabled tabIndex={-1}>
              {/* ⚠️ ช่องเปล่าขนาดเท่าไอคอนไมค์ของจริง (17px) — ปุ่มจริงสูงกว่าปุ่มที่มี
                  แต่ตัวหนังสือ ถ้าไม่เผื่อไว้ วงกลมจะเลื่อน 35px ตอนเนื้อมาถึง */}
              <span className="enter__ghosticon" />
              เริ่มโทร
            </button>
          </div>
        </div>
      </main>
    </Skeleton>
  )
}
