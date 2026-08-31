/**
 * คีย์สีใน `areas.color` → คลาสที่มี gradient ใน globals.css
 *
 * ⚠️ **คีย์ต้องตรงกับชื่อ Area จริง** ของเดิมเป็น `hack`/`fin`/`pers` ค้างมาจาก
 *    ชื่อ Area รุ่นก่อน (Hackathon · Financial · Personal) ซึ่งเปลี่ยนไปแล้ว
 *    ตั้งแต่ 31 ส.ค. 2026 — สีถูกแต่ชื่อโกหก คนอ่านโค้ดเห็น `fin` แล้วนึกว่าการเงิน
 *
 * ⚠️ ถ้าต้องเปลี่ยนคีย์อีกรอบ **ลำดับสำคัญ** — คีย์ที่ถูกใช้เป็นทั้งชื่อเก่าและ
 *    ชื่อใหม่ (คราวนี้คือ `pers`) ต้องถูกปลดออกก่อนเสมอ ไม่งั้นสองแถวจะชนกัน
 *    แล้วโดนเปลี่ยนพร้อมกันทั้งคู่ (doc/TRAPS.md)
 *
 * แยกออกมาจาก `app/library/page.tsx` ตอนทำหน้า Area แยก เพราะตอนนี้มีสองหน้าที่ใช้
 */
export const AREA_CLASS: Record<string, string> = {
  class: 'acard--class',
  comp: 'acard--comp',
  pers: 'acard--pers',
  gen: 'acard--gen',
}
