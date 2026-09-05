/**
 * โครงร่างระหว่างรอข้อมูล — ใช้ใน loading.tsx ของแต่ละหน้า
 *
 * มีไว้เพื่อ "ความรู้สึก" ไม่ใช่ความเร็วจริง · ทุกหน้าเป็น force-dynamic
 * (ข้อมูลผูกกับ auth.uid() แคชร่วมกันไม่ได้) กดเปลี่ยนหน้าจึงต้องรอเซิร์ฟเวอร์
 * เสมอ ถ้าไม่มีอะไรขึ้นเลยระหว่างนั้น จอจะดูค้างทั้งที่ระบบทำงานอยู่
 *
 * ไม่ใช้วงกลมหมุน — โครงร่างบอกได้ด้วยว่ากำลังจะได้อะไรมา (ARCHITECTURE.md §9)
 */

/** หัวข้อหน้า */
export function HeadSkeleton({ wide = '9rem' }: { wide?: string }) {
  return (
    <div className="page-head">
      <div className="skel" style={{ height: '1.6rem', width: wide }} />
    </div>
  )
}

/** แถบหัวกลุ่ม เช่น "วันนี้ 5" */
export function SecSkeleton({ wide = '4.5rem' }: { wide?: string }) {
  return (
    <div className="sec">
      <span className="skel" style={{ height: '0.75rem', width: wide, display: 'block' }} />
    </div>
  )
}

/**
 * แถวรายการ · ความกว้างไล่ลงทีละแถวให้ดูเป็นธรรมชาติ
 * ไม่สุ่มความกว้าง เพราะ server กับ client ต้อง render ตรงกัน
 */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  const widths = ['82%', '64%', '73%', '55%', '77%', '61%']
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div className="row" key={i}>
          <span className="row__stripe skel" />
          <div className="row__body">
            <div className="skel" style={{ height: '0.95rem', width: widths[i % widths.length] }} />
            <div className="skel" style={{ height: '0.7rem', width: '38%', marginTop: '0.4rem' }} />
          </div>
        </div>
      ))}
    </>
  )
}
