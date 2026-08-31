/**
 * lib/archive.ts — ของที่รอถูกลบถาวร
 *
 * ไฟล์นี้พลาดแล้วผู้ใช้จะเชื่อผิดว่าของยังมีเวลาเหลือ แล้วมันหายไปคืนนั้น
 * ซึ่งกู้ไม่ได้ — เป็นความผิดพลาดที่แพงที่สุดในหน้านั้น
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { KEEP_DAYS, msLeft, leftLabel, isUrgent, groupByLeft, byWhom } from '../lib/archive'

const DAY = 86_400_000
const NOW = new Date('2026-09-01T12:00:00.000Z').getTime()
const at = (iso: string, auto = false) => ({ archivedAt: iso, auto })

test('เก็บวันนี้ เหลือครบเจ็ดวัน', () => {
  assert.equal(msLeft(at('2026-09-01T12:00:00.000Z'), NOW), KEEP_DAYS * DAY)
})

test('เก็บมาหกวันแล้ว เหลืออีกวันเดียว', () => {
  assert.equal(msLeft(at('2026-08-26T12:00:00.000Z'), NOW), DAY)
})

test('เลยเจ็ดวันแล้วได้ค่าติดลบ — รอบ cron ถัดไปจะพาไป', () => {
  assert.ok(msLeft(at('2026-08-20T12:00:00.000Z'), NOW) < 0)
  assert.equal(leftLabel(msLeft(at('2026-08-20T12:00:00.000Z'), NOW)), 'ลบคืนนี้')
})

test('ต่ำกว่าหนึ่งวันบอกเป็นชั่วโมง', () => {
  // "อีก 0 วัน" ไม่ได้บอกอะไรกับคนที่กำลังตัดสินใจว่าจะรีบไหม
  assert.equal(leftLabel(4 * 3_600_000), 'อีก 4 ชม.')
  assert.equal(leftLabel(23 * 3_600_000), 'อีก 23 ชม.')
})

test('ไม่ถึงชั่วโมงบอกให้รู้ว่าจวนแล้ว', () => {
  assert.equal(leftLabel(30 * 60_000), 'อีกไม่ถึงชั่วโมง')
  assert.equal(leftLabel(1), 'อีกไม่ถึงชั่วโมง')
})

test('ตั้งแต่หนึ่งวันขึ้นไปบอกเป็นวัน', () => {
  assert.equal(leftLabel(DAY), 'อีก 1 วัน')
  assert.equal(leftLabel(6 * DAY), 'อีก 6 วัน')
})

test('ศูนย์กับติดลบเป็นลบคืนนี้เหมือนกัน', () => {
  assert.equal(leftLabel(0), 'ลบคืนนี้')
  assert.equal(leftLabel(-DAY), 'ลบคืนนี้')
})

test('เหลือไม่ถึงวันคือเร่งด่วน', () => {
  assert.equal(isUrgent(DAY - 1), true)
  assert.equal(isUrgent(DAY), false)
  assert.equal(isUrgent(-DAY), true)
})

// ---- การจัดกลุ่ม ----

test('เรียงตามเวลาที่เหลือ ไม่ใช่เวลาที่เก็บ', () => {
  // ถ้าเรียงตามเวลาที่เก็บ ของที่ปลอดภัยที่สุดจะขึ้นบนสุด ซึ่งกลับหัวกับคำถาม
  // ที่ผู้ใช้เปิดหน้านี้มาถาม — "อันไหนกำลังจะหาย"
  const rows = [
    at('2026-09-01T00:00:00.000Z'), // เพิ่งเก็บ · เหลือเยอะ
    at('2026-08-26T00:00:00.000Z'), // เก็บนานแล้ว · จวนหาย
  ]
  const groups = groupByLeft(rows, NOW)
  assert.equal(groups[0].key, 'urgent')
  assert.deepEqual(groups[0].rows, [1])
  assert.equal(groups[1].key, 'soon')
  assert.deepEqual(groups[1].rows, [0])
})

test('กลุ่มที่ไม่มีสมาชิกไม่โผล่', () => {
  const groups = groupByLeft([at('2026-09-01T00:00:00.000Z')], NOW)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].key, 'soon')
})

test('รายการว่างได้กลุ่มว่าง', () => {
  assert.deepEqual(groupByLeft([], NOW), [])
})

test('ภายในกลุ่มเดียวกันก็เรียงจากจวนที่สุดก่อน', () => {
  const rows = [
    at('2026-08-27T12:00:00.000Z'), // เหลือ 2 วัน
    at('2026-08-29T12:00:00.000Z'), // เหลือ 4 วัน
    at('2026-08-28T12:00:00.000Z'), // เหลือ 3 วัน
  ]
  assert.deepEqual(groupByLeft(rows, NOW)[0].rows, [0, 2, 1])
})

test('แยกได้ว่าใครเป็นคนเก็บ', () => {
  // ระบบเก็บให้ = ของที่หมดอายุไปเอง ผู้ใช้อาจไม่เคยรู้ตัว
  // กดเก็บเอง = ของที่ตั้งใจทิ้ง · สองอย่างนี้ต้องการความสนใจไม่เท่ากัน
  assert.equal(byWhom(true), 'ระบบเก็บให้')
  assert.equal(byWhom(false), 'คุณกดเก็บเอง')
})

test('KEEP_DAYS ต้องเป็น 7 — ต้องตรงกับ purge_archived() ใน DB', () => {
  // แก้ที่หนึ่งแล้วลืมอีกที่ = หน้าจอนับถอยหลังผิดโดยไม่มีอะไรฟ้อง
  assert.equal(KEEP_DAYS, 7)
})
