/**
 * lib/ai/visibility.ts — เส้นแบ่งว่า Area ไหนออกจากเครื่องไปหาโมเดลได้
 *
 * ไฟล์นี้พลาดแล้วไม่มีอะไรฟ้อง — ข้อมูลไหลออกไปโดยหน้าจอยังดูปกติทุกอย่าง
 *
 * ⚠️ **เทสต์กลไกแยกจากเทสต์นโยบาย** — ของเดิมฝังรายชื่อ Area ปัจจุบันไว้ใน
 *    หลายเคส พอเจ้าของเปลี่ยนใจว่า Area ไหนเห็นได้ ต้องแก้เทสต์ทั้งกอง
 *    ทั้งที่กลไกไม่ได้เปลี่ยนเลย · เคสกลไกจึงใช้ชื่อสมมติที่ไม่มีในรายการ
 *    และมีเคสนโยบายแค่เคสเดียวที่แก้ง่ายเมื่อเจ้าของเปลี่ยนใจ
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { areaIsVisible, keepVisible, VISIBLE_AREAS } from '../lib/ai/visibility'

/** Area สมมติที่ยังไม่ได้อยู่ในรายการ — แทน "Area ที่สร้างใหม่วันหน้า" */
const UNLISTED = 'Health'

// ---- กลไก ----

test('Area ที่ไม่อยู่ในรายการไม่ผ่าน — นี่คือทั้งหมดที่ allowlist ทำ', () => {
  // ประโยชน์ที่แท้จริงของ allowlist ไม่ใช่การกรอง Area ที่มีอยู่วันนี้
  // แต่คือ Area ที่สร้างใหม่วันหน้าถูกซ่อนไว้ก่อนโดยไม่ต้องมีใครไปสั่ง
  assert.equal(areaIsVisible(UNLISTED), false)
  assert.equal(areaIsVisible('การเงินส่วนตัว'), false)
})

test('Area ที่อยู่ในรายการผ่าน', () => {
  for (const name of VISIBLE_AREAS) assert.equal(areaIsVisible(name), true, name)
})

test('เทียบชื่อแบบตรงตัว ตัวพิมพ์ต่างกันไม่ผ่าน', () => {
  assert.equal(areaIsVisible('class'), false)
  assert.equal(areaIsVisible('CLASS'), false)
})

test('null · undefined · สตริงเปล่า ไม่ผ่าน', () => {
  // ไม่รู้ว่าแถวนี้อยู่ Area ไหน = ไม่ปล่อย · เกิดได้จริงเมื่อ join ไม่ติด
  assert.equal(areaIsVisible(null), false)
  assert.equal(areaIsVisible(undefined), false)
  assert.equal(areaIsVisible(''), false)
})

test('keepVisible คัดเฉพาะแถวที่ปล่อยได้', () => {
  const rows = [
    { id: 'a', area: 'Class' },
    { id: 'b', area: UNLISTED },
    { id: 'c', area: 'General' },
  ]
  assert.deepEqual(
    keepVisible(rows, (r) => r.area).map((r) => r.id),
    ['a', 'c']
  )
})

test('keepVisible ตัดแถวที่หา Area ไม่เจอทิ้ง', () => {
  const rows = [{ id: 'a', area: 'Class' }, { id: 'b', area: null }]
  assert.deepEqual(
    keepVisible(rows, (r) => r.area).map((r) => r.id),
    ['a']
  )
})

test('keepVisible ไม่แก้อาร์เรย์ต้นฉบับ', () => {
  const rows = [{ area: 'Class' }, { area: UNLISTED }]
  keepVisible(rows, (r) => r.area)
  assert.equal(rows.length, 2)
})

test('รายการว่างได้รายการว่าง', () => {
  assert.deepEqual(keepVisible([], () => 'Class'), [])
})

// ---- นโยบายปัจจุบัน · เคสเดียว แก้ที่นี่ที่เดียวเมื่อเจ้าของเปลี่ยนใจ ----

test('นโยบายวันนี้: เปิดครบทั้งสี่ Area ที่มีอยู่จริง', () => {
  // เจ้าของยืนยัน 31 ส.ค. 2026 ว่าไม่มีข้อมูลสำคัญใน Personal กับ General
  assert.deepEqual([...VISIBLE_AREAS].sort(), ['Class', 'Competition', 'General', 'Personal'])
})

test('ชื่อ Area เก่าที่เลิกใช้แล้วไม่หลงเหลืออยู่ในรายการ', () => {
  for (const old of ['Hackathon', 'Financial']) {
    assert.equal(VISIBLE_AREAS.includes(old), false, `${old} เป็นชื่อเก่า`)
  }
})
