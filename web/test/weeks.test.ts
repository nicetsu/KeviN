/**
 * lib/weeks.ts — ตรรกะการซ้ำของช่วงเวลาประจำ
 *
 * ⚠️ ไฟล์นี้ต้องให้ผลตรงกับ `schedule_occurrences()` ใน DB เป๊ะ
 * แก้ที่ใดที่หนึ่งต้องแก้อีกที่ด้วย (ARCHITECTURE.md §4)
 *
 * วันอ้างอิงที่ใช้ทั้งไฟล์
 *   2026-08-24 จันทร์ · 2026-08-26 พุธ · 2026-08-28 ศุกร์ · 2026-08-30 อาทิตย์
 *   2026-08-31 จันทร์ (ข้ามเดือน) · 2026-12-28 จันทร์ · 2027-01-01 ศุกร์ (ข้ามปี)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { snapToMonday, isMonday, rangeOffsets, expand, clashes, sharedWeeks } from '../lib/weeks'

test('snapToMonday · วันจันทร์อยู่ที่เดิม', () => {
  assert.equal(snapToMonday('2026-08-24'), '2026-08-24')
})

test('snapToMonday · วันพุธถอยไปวันจันทร์ต้นสัปดาห์', () => {
  assert.equal(snapToMonday('2026-08-26'), '2026-08-24')
})

test('snapToMonday · วันอาทิตย์ถอยไปจันทร์ของสัปดาห์เดียวกัน ไม่ใช่จันทร์ถัดไป', () => {
  // เคสที่พังง่ายสุด เพราะ getUTCDay() ให้อาทิตย์ = 0 ไม่ใช่ 6
  assert.equal(snapToMonday('2026-08-30'), '2026-08-24')
})

test('snapToMonday · ข้ามเดือนได้', () => {
  assert.equal(snapToMonday('2026-09-02'), '2026-08-31')
})

test('snapToMonday · ข้ามปีได้', () => {
  assert.equal(snapToMonday('2027-01-01'), '2026-12-28')
})

test('isMonday · จริงเฉพาะวันจันทร์', () => {
  assert.equal(isMonday('2026-08-24'), true)
})

test('isMonday · วันอื่นเป็นเท็จ — CHECK sched_start_is_mon จะปฏิเสธ', () => {
  assert.equal(isMonday('2026-08-26'), false)
})

test('rangeOffsets · โหมด "ซ้ำอีก N สัปดาห์" คลี่เป็น [0..N-1]', () => {
  assert.deepEqual(rangeOffsets(4), [0, 1, 2, 3])
})

test('rangeOffsets · 1 สัปดาห์ได้ [0]', () => {
  assert.deepEqual(rangeOffsets(1), [0])
})

test('rangeOffsets · 0 ถูกดันขึ้นเป็น 1 — CHECK sched_weeks_present ห้ามว่าง', () => {
  assert.deepEqual(rangeOffsets(0), [0])
})

test('rangeOffsets · ค่าติดลบถูกดันขึ้นเป็น 1', () => {
  assert.deepEqual(rangeOffsets(-3), [0])
})

test('rangeOffsets · ทศนิยมปัดลง', () => {
  assert.deepEqual(rangeOffsets(2.7), [0, 1])
})

test('rangeOffsets · NaN (ช่องว่างในฟอร์ม) ไม่ทำให้พัง', () => {
  assert.deepEqual(rangeOffsets(NaN), [0])
})

test('expand · คลี่สัปดาห์ติดกันสามสัปดาห์', () => {
  assert.deepEqual(expand('2026-08-24', 0, [0, 1, 2]), ['2026-08-24', '2026-08-31', '2026-09-07'])
})

test('expand · dayOfWeek เลื่อนจากวันจันทร์ (2 = พุธ)', () => {
  assert.deepEqual(expand('2026-08-24', 2, [0]), ['2026-08-26'])
})

test('expand · อินพุตไม่เรียง ผลลัพธ์ต้องเรียง', () => {
  assert.deepEqual(expand('2026-08-24', 0, [2, 0, 1]), ['2026-08-24', '2026-08-31', '2026-09-07'])
})

test('expand · offset ติดลบถูกทิ้ง ไม่ใช่คำนวณย้อนหลัง', () => {
  assert.deepEqual(expand('2026-08-24', 0, [-1, 0]), ['2026-08-24'])
})

test('expand · offset ที่ไม่ใช่จำนวนเต็มถูกทิ้ง', () => {
  assert.deepEqual(expand('2026-08-24', 0, [0.5, 0]), ['2026-08-24'])
})

test('expand · ไม่มีสัปดาห์เลยได้รายการว่าง', () => {
  assert.deepEqual(expand('2026-08-24', 0, []), [])
})

test('expand · ข้ามปีได้ (ศุกร์แรกของปี 2027)', () => {
  assert.deepEqual(expand('2026-12-28', 4, [0, 1]), ['2027-01-01', '2027-01-08'])
})

test('clashes · คนละวันไม่ชนกันแม้เวลาทับ', () => {
  const a = { day_of_week: 0, start_time: '09:00', end_time: '12:00' }
  const b = { day_of_week: 1, start_time: '09:00', end_time: '12:00' }
  assert.equal(clashes(a, b), false)
})

test('clashes · เวลาเหลื่อมกันในวันเดียวกันถือว่าชน', () => {
  const a = { day_of_week: 0, start_time: '09:00', end_time: '12:00' }
  const b = { day_of_week: 0, start_time: '11:00', end_time: '13:00' }
  assert.equal(clashes(a, b), true)
})

test('clashes · ต่อกันพอดี (จบ 12:00 เริ่ม 12:00) ไม่ถือว่าชน', () => {
  const a = { day_of_week: 0, start_time: '09:00', end_time: '12:00' }
  const b = { day_of_week: 0, start_time: '12:00', end_time: '13:00' }
  assert.equal(clashes(a, b), false)
})

test('clashes · อันหนึ่งอยู่ในอีกอันทั้งก้อนถือว่าชน', () => {
  const a = { day_of_week: 0, start_time: '09:00', end_time: '12:00' }
  const b = { day_of_week: 0, start_time: '10:00', end_time: '11:00' }
  assert.equal(clashes(a, b), true)
})

test('sharedWeeks · มีสัปดาห์ร่วมกันเป็นจริง', () => {
  assert.equal(sharedWeeks('2026-08-24', [0, 1], '2026-08-24', [1, 2]), true)
})

test('sharedWeeks · ไม่มีสัปดาห์ร่วมกันเป็นเท็จ — เวลาชนแต่คนละสัปดาห์ไม่ใช่การชน', () => {
  assert.equal(sharedWeeks('2026-08-24', [0], '2026-08-24', [1]), false)
})

test('sharedWeeks · start_date ต่างกันแต่ตกสัปดาห์เดียวกัน ต้องจับได้', () => {
  // เทียบที่วันจริง ไม่ใช่ที่เลข offset — offset 1 กับ 0 ตรงกันเมื่อ start ห่างกัน 1 สัปดาห์
  assert.equal(sharedWeeks('2026-08-24', [1], '2026-08-31', [0]), true)
})

test('sharedWeeks · ฝั่งใดฝั่งหนึ่งไม่มีสัปดาห์เลยเป็นเท็จ', () => {
  assert.equal(sharedWeeks('2026-08-24', [0, 1], '2026-08-24', []), false)
})
