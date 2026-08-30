/**
 * lib/calendar.ts — รูปเดียวที่ปฏิทินและ hero กิน
 *
 * เคสที่แพงที่สุดคือ `end_time = "24:00:00"` ซึ่ง `new Date()` คืน Invalid Date
 * **เงียบ ๆ ไม่ throw** — บล็อกที่วิ่งชนเที่ยงคืนของ event ข้ามวันเจอเคสนี้ทุกใบ
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  entryKey,
  spanLabel,
  entryStartMs,
  entryEndMs,
  ENTRY_COLOR,
  type CalendarEntry,
} from '../lib/calendar'

const entry = (over: Partial<CalendarEntry> = {}): CalendarEntry => ({
  kind: 'class',
  source_id: 'aaaa-1111',
  project_id: 'proj-1',
  project_name: 'แคลคูลัส 1',
  area_name: 'Class',
  title: 'แคลคูลัส 1',
  occurs_on: '2026-09-05',
  start_time: '09:00:00',
  end_time: '12:30:00',
  location: 'LH-201',
  label: null,
  skipped: false,
  trimmed: false,
  ...over,
})

test('entryKey · คาบเดียวกันคนละวันต้องได้คีย์ต่างกัน', () => {
  // คาบเรียนใบเดียวโผล่ทุกสัปดาห์ — ใช้ source_id อย่างเดียวจะชนกันทันที
  const a = entryKey(entry({ occurs_on: '2026-09-05' }))
  const b = entryKey(entry({ occurs_on: '2026-09-12' }))
  assert.notEqual(a, b)
})

test('entryKey · event ข้ามคืนที่ถูกหั่นเป็นสองบล็อกได้คีย์ต่างกัน', () => {
  const night = entryKey(entry({ kind: 'event', occurs_on: '2026-09-05', end_time: '24:00:00' }))
  const morning = entryKey(entry({ kind: 'event', occurs_on: '2026-09-06', start_time: '00:00:00' }))
  assert.notEqual(night, morning)
})

test('entryKey · kind ต่างกันแยกออกจากกันแม้ id ชนกัน', () => {
  assert.notEqual(entryKey(entry({ kind: 'class' })), entryKey(entry({ kind: 'event' })))
})

test('spanLabel · ตัดวินาทีทิ้ง', () => {
  assert.equal(spanLabel(entry()), '09:00–12:30')
})

test('spanLabel · 24:00 อ่านออกไม่กลายเป็น "24:00:0" หรือค่าว่าง', () => {
  assert.equal(spanLabel(entry({ start_time: '20:00:00', end_time: '24:00:00' })), '20:00–24:00')
})

test('entryStartMs · ตีความเป็นเวลาไทย (UTC+7) ไม่ใช่เวลาเครื่อง', () => {
  assert.equal(entryStartMs(entry()), Date.UTC(2026, 8, 5, 2, 0, 0))
})

test('entryEndMs · เวลาปกติแปลงตรงไปตรงมา', () => {
  assert.equal(entryEndMs(entry()), Date.UTC(2026, 8, 5, 5, 30, 0))
})

test('entryEndMs · 24:00:00 คือเที่ยงคืนของวันถัดไป ไม่ใช่ Invalid Date', () => {
  const ms = entryEndMs(entry({ start_time: '20:00:00', end_time: '24:00:00' }))
  assert.ok(Number.isFinite(ms), 'ต้องไม่เป็น NaN — Invalid Date ไม่ throw จึงหลุดไปเงียบ ๆ')
  assert.equal(ms, Date.UTC(2026, 8, 5, 17, 0, 0))
})

test('entryEndMs · บล็อกที่ชนเที่ยงคืนต้องจบหลังเริ่ม', () => {
  const e = entry({ start_time: '20:00:00', end_time: '24:00:00' })
  assert.ok(entryEndMs(e) > entryStartMs(e))
})

test('entryEndMs · รอยต่อของ event ข้ามคืนต้องสนิท ไม่มีช่องว่างและไม่ทับกัน', () => {
  // นี่คือสิ่งที่ calendar_entries() สัญญาไว้ตอนหั่น event ข้ามคืนเป็นบล็อกรายวัน
  const night = entry({ kind: 'event', occurs_on: '2026-09-05', start_time: '20:00:00', end_time: '24:00:00' })
  const morning = entry({ kind: 'event', occurs_on: '2026-09-06', start_time: '00:00:00', end_time: '09:00:00' })
  assert.equal(entryEndMs(night), entryStartMs(morning))
})

test('ENTRY_COLOR · คาบเรียนกับกิจกรรมคนละสี', () => {
  // เคาะ 21 ส.ค. หลังเห็นของจริง — บนปฏิทินสัปดาห์ต้องแยกออกว่าอันไหนต้องไป อันไหนสมัครเอง
  assert.notEqual(ENTRY_COLOR.class, ENTRY_COLOR.event)
})
