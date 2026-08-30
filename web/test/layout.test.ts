/**
 * lib/layout.ts — จัดบล็อกที่เวลาชนกันในปฏิทินสัปดาห์
 *
 * ปฏิทินกลับแกน (วัน = แกนตั้ง) บล็อกที่ชนกันจึง **แบ่งความสูง** ของแถววันนั้น
 * `lane` = ช่องที่เท่าไหร่ · `of` = แบ่งเป็นกี่ช่อง · ทุกบล็อกในกลุ่มเดียวกันต้อง `of` เท่ากัน
 * ไม่งั้นบล็อกที่อยู่คนละกลุ่มจะสูงไม่เท่ากันแล้วเรียงไม่ตรง
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutDay } from '../lib/layout'

type Block = { id: string; start: number; end: number }
const span = (b: Block) => ({ start: b.start, end: b.end })

/** { id: [lane, of] } — เทียบด้วย id เพราะลำดับผลลัพธ์เป็นลำดับที่เรียงแล้ว */
const placedById = (out: ReturnType<typeof layoutDay<Block>>) =>
  Object.fromEntries(out.map((p) => [p.item.id, [p.lane, p.of]]))

test('ไม่มีบล็อกเลยได้รายการว่าง', () => {
  assert.deepEqual(layoutDay<Block>([], span), [])
})

test('บล็อกเดียวได้เต็มความสูง (lane 0 จาก 1)', () => {
  const out = layoutDay([{ id: 'a', start: 9, end: 11 }], span)
  assert.deepEqual(placedById(out), { a: [0, 1] })
})

test('สองบล็อกที่ไม่ชนกันต่างคนต่างเต็มความสูง', () => {
  const out = layoutDay(
    [{ id: 'a', start: 9, end: 10 }, { id: 'b', start: 11, end: 12 }],
    span
  )
  assert.deepEqual(placedById(out), { a: [0, 1], b: [0, 1] })
})

test('ต่อกันพอดี (จบ 11 เริ่ม 11) ไม่ถือว่าชน', () => {
  // ขอบเขตเปิด-ปิด · คาบติดกันเป็นเรื่องปกติในตารางเรียน ถ้านับว่าชนจะโดนหั่นครึ่งทั้งวัน
  const out = layoutDay(
    [{ id: 'a', start: 9, end: 11 }, { id: 'b', start: 11, end: 13 }],
    span
  )
  assert.deepEqual(placedById(out), { a: [0, 1], b: [0, 1] })
})

test('สองบล็อกชนกันแบ่งครึ่ง', () => {
  const out = layoutDay(
    [{ id: 'a', start: 9, end: 12 }, { id: 'b', start: 11, end: 13 }],
    span
  )
  assert.deepEqual(placedById(out), { a: [0, 2], b: [1, 2] })
})

test('บล็อกที่ครอบอีกบล็อกทั้งก้อนก็ชน', () => {
  const out = layoutDay(
    [{ id: 'a', start: 9, end: 13 }, { id: 'b', start: 10, end: 11 }],
    span
  )
  assert.deepEqual(placedById(out), { a: [0, 2], b: [1, 2] })
})

test('สามบล็อกชนกันหมดแบ่งสามส่วน', () => {
  const out = layoutDay(
    [
      { id: 'a', start: 9, end: 12 },
      { id: 'b', start: 10, end: 13 },
      { id: 'c', start: 11, end: 14 },
    ],
    span
  )
  assert.deepEqual(placedById(out), { a: [0, 3], b: [1, 3], c: [2, 3] })
})

test('ชนต่อเนื่อง A–B, B–C แต่ A ไม่ชน C ต้องเป็นกลุ่มเดียว of เท่ากัน', () => {
  // ถ้าแยกเป็นสองกลุ่ม A กับ C จะสูงไม่เท่า B แล้วเหลื่อมกันบนจอ
  // C กลับไปใช้ lane 0 ได้เพราะไม่ชน A
  const out = layoutDay(
    [
      { id: 'a', start: 9, end: 11 },
      { id: 'b', start: 10, end: 12 },
      { id: 'c', start: 11.5, end: 13 },
    ],
    span
  )
  assert.deepEqual(placedById(out), { a: [0, 2], b: [1, 2], c: [0, 2] })
})

test('บล็อกกลางที่คร่อมสองบล็อกซึ่งไม่ชนกันเอง ดึงทั้งสามเป็นกลุ่มเดียว', () => {
  // A(9–10) กับ B(10–11) ไม่ชนกัน แต่กิจกรรม C(9:30–10:30) คร่อมทั้งคู่
  const out = layoutDay(
    [
      { id: 'a', start: 9, end: 10 },
      { id: 'b', start: 10, end: 11 },
      { id: 'c', start: 9.5, end: 10.5 },
    ],
    span
  )
  assert.deepEqual(placedById(out), { a: [0, 2], c: [1, 2], b: [0, 2] })
})

test('ลำดับอินพุตไม่มีผลต่อผลลัพธ์', () => {
  // ข้อมูลจาก calendar_entries() มาปนกันระหว่างคาบเรียนกับกิจกรรม ลำดับไม่แน่นอน
  const blocks: Block[] = [
    { id: 'a', start: 9, end: 12 },
    { id: 'b', start: 10, end: 13 },
    { id: 'c', start: 11, end: 14 },
  ]
  const forward = placedById(layoutDay(blocks, span))
  const backward = placedById(layoutDay(blocks.slice().reverse(), span))
  assert.deepEqual(backward, forward)
})
