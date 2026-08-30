/**
 * lib/libraryOpen.ts — สถานะกาง/หุบของหน้าคลัง เก็บใน cookie
 *
 * หัวใจอยู่ที่ **สองสถานะที่ห้ามปนกัน** ไม่งั้นบั๊กหน้าคลังกระพริบจะกลับมา
 *   `null` = ยังไม่เคยบันทึก (ปิดหมดเป็นค่าเริ่มต้น)
 *   `[]`   = เคยบันทึกว่าปิดหมด — ห้ามเด้งกางเอง
 * cookie ที่ค่าเป็นสตริงเปล่าแยกจาก cookie ที่ไม่มีอยู่ไม่ได้ ค่าว่างจึงเขียนเป็น "v1"
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeOpen, encodeOpen, LIBRARY_OPEN_COOKIE } from '../lib/libraryOpen'

test('decodeOpen · ไม่มี cookie เลยได้ null (ยังไม่เคยบันทึก)', () => {
  assert.equal(decodeOpen(undefined), null)
})

test('decodeOpen · cookie เป็น null ได้ null', () => {
  assert.equal(decodeOpen(null), null)
})

test('decodeOpen · สตริงเปล่าได้ null ไม่ใช่ []', () => {
  assert.equal(decodeOpen(''), null)
})

test('decodeOpen · "v1" คือเคยบันทึกว่าปิดหมด ได้ []', () => {
  assert.deepEqual(decodeOpen('v1'), [])
})

test('decodeOpen · "ยังไม่เคยบันทึก" กับ "บันทึกว่าปิดหมด" ต้องแยกออกจากกัน', () => {
  // ถ้าสองอย่างนี้พร่า หน้าคลังจะเด้งกางเองหลังผู้ใช้ตั้งใจหุบทุกอัน
  assert.notDeepEqual(decodeOpen(undefined), decodeOpen('v1'))
})

test('decodeOpen · กางหนึ่ง Area', () => {
  assert.deepEqual(decodeOpen('v1.aaaa'), ['aaaa'])
})

test('decodeOpen · กางหลาย Area', () => {
  assert.deepEqual(decodeOpen('v1.aaaa.bbbb'), ['aaaa', 'bbbb'])
})

test('decodeOpen · ตัวคั่นค้างท้ายไม่กลายเป็นรายการว่าง', () => {
  assert.deepEqual(decodeOpen('v1.aaaa.'), ['aaaa'])
})

test('decodeOpen · รุ่นที่ไม่รู้จักถือว่ายังไม่เคยบันทึก', () => {
  // เผื่อวันหน้าเปลี่ยนรูปแบบ cookie เก่าต้องไม่ทำให้หน้าพัง
  assert.equal(decodeOpen('v2.aaaa'), null)
})

test('decodeOpen · ค่ามั่ว ๆ ถือว่ายังไม่เคยบันทึก', () => {
  assert.equal(decodeOpen('อะไรก็ไม่รู้'), null)
})

test('decodeOpen · ค่าที่ขึ้นต้นด้วย v1 แต่ไม่มีตัวคั่น ไม่ถูกอ่านผิด', () => {
  assert.equal(decodeOpen('v10.aaaa'), null)
})

test('encodeOpen · ไม่มีอะไรกางเลยเขียนเป็น "v1" ไม่ใช่สตริงเปล่า', () => {
  assert.equal(encodeOpen([]), 'v1')
})

test('encodeOpen · หนึ่ง Area', () => {
  assert.equal(encodeOpen(['aaaa']), 'v1.aaaa')
})

test('encodeOpen · หลาย Area', () => {
  assert.equal(encodeOpen(['aaaa', 'bbbb']), 'v1.aaaa.bbbb')
})

test('encodeOpen · รับ Set ได้ (ฝั่ง UI เก็บเป็น Set)', () => {
  assert.equal(encodeOpen(new Set(['aaaa', 'bbbb'])), 'v1.aaaa.bbbb')
})

test('ไป-กลับ · รายการว่างรอดข้าม cookie มาเป็น [] ไม่ใช่ null', () => {
  assert.deepEqual(decodeOpen(encodeOpen([])), [])
})

test('ไป-กลับ · รายการปกติรอดข้าม cookie ครบ', () => {
  const ids = ['aaaa', 'bbbb', 'cccc']
  assert.deepEqual(decodeOpen(encodeOpen(ids)), ids)
})

test('ชื่อ cookie คงที่ — เปลี่ยนแล้วสถานะที่ผู้ใช้ตั้งไว้หายทั้งหมด', () => {
  assert.equal(LIBRARY_OPEN_COOKIE, 'kevin.library.open')
})
