/**
 * lib/ai/visibility.ts — เส้นแบ่งว่า Area ไหนออกจากเครื่องไปหาโมเดลได้
 *
 * ไฟล์นี้พลาดแล้วไม่มีอะไรฟ้อง — ข้อมูลไหลออกไปโดยหน้าจอยังดูปกติทุกอย่าง
 * เคสที่สำคัญที่สุดคือเคส "ไม่รู้จัก" ซึ่งต้องตอบว่าไม่ปล่อย ไม่ใช่ปล่อย
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { areaIsVisible, keepVisible, VISIBLE_AREAS } from '../lib/ai/visibility'

test('Area ที่อนุญาตผ่านได้', () => {
  assert.equal(areaIsVisible('Class'), true)
  assert.equal(areaIsVisible('Hackathon'), true)
})

test('Financial ไม่ผ่าน', () => {
  assert.equal(areaIsVisible('Financial'), false)
})

test('Personal ไม่ผ่าน', () => {
  assert.equal(areaIsVisible('Personal'), false)
})

test('Area ที่ยังไม่รู้จักไม่ผ่าน — allowlist ต้องพลาดไปทางเงียบ', () => {
  // ถ้าเป็น blocklist วันหนึ่งสร้าง Area "การเงินส่วนตัว" ขึ้นมาจะรั่วทันที
  assert.equal(areaIsVisible('การเงินส่วนตัว'), false)
  assert.equal(areaIsVisible('Health'), false)
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
    { id: 'b', area: 'Financial' },
    { id: 'c', area: 'Hackathon' },
    { id: 'd', area: 'Personal' },
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
  const rows = [{ area: 'Class' }, { area: 'Financial' }]
  keepVisible(rows, (r) => r.area)
  assert.equal(rows.length, 2)
})

test('รายการว่างได้รายการว่าง', () => {
  assert.deepEqual(keepVisible([], () => 'Class'), [])
})

test('VISIBLE_AREAS ไม่มี Financial หรือ Personal หลุดเข้าไป', () => {
  // เทสต์ตัวนี้มีไว้ให้พังตอนมีคนเผลอเติมชื่อผิดลงในรายการ
  assert.equal(VISIBLE_AREAS.includes('Financial'), false)
  assert.equal(VISIBLE_AREAS.includes('Personal'), false)
})
