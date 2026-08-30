/**
 * lib/agenda.ts — เติมเวลาจบของกำหนดการที่เว้นว่าง
 *
 * `end_time` ไม่บังคับโดยตั้งใจ (doc/DECISIONS.md) การเติมจึงเกิดตอน **แสดงผล**
 * ไม่ใช่ตอนเก็บ — ไม่งั้นแค่เปิดหน้าแก้แล้วกดบันทึก ข้อมูลที่ยืดหยุ่นจะถูกตรึงถาวร
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAgenda, agendaDayKey, agendaClock, type AgendaRow } from '../lib/agenda'

const row = (over: Partial<AgendaRow> & { id: string }): AgendaRow => ({
  day_offset: 0,
  start_time: '09:00:00',
  end_time: null,
  title: 'รายการ',
  ...over,
})

const endsById = (rows: AgendaRow[], eventEnd: string | null) =>
  Object.fromEntries(resolveAgenda(rows, eventEnd).map((l) => [l.id, l.endsAt]))

test('กำหนดการว่างเปล่าได้รายการว่าง', () => {
  assert.deepEqual(resolveAgenda([], '17:00:00'), [])
})

test('เวลาจบที่กรอกไว้เองชนะเสมอ', () => {
  const rows = [
    row({ id: 'a', start_time: '09:00:00', end_time: '09:30:00' }),
    row({ id: 'b', start_time: '10:00:00' }),
  ]
  // ไม่ถูกดึงเป็น 10:00 ตามบรรทัดถัดไป เพราะช่องว่าง 09:30–10:00 คือพักจริง
  assert.equal(endsById(rows, '17:00:00').a, '09:30:00')
})

test('เว้นว่างแล้วใช้เวลาเริ่มของบรรทัดถัดไปในวันเดียวกัน', () => {
  const rows = [
    row({ id: 'a', start_time: '09:00:00' }),
    row({ id: 'b', start_time: '09:50:00' }),
  ]
  assert.equal(endsById(rows, '17:00:00').a, '09:50:00')
})

test('บรรทัดสุดท้ายจริง ๆ ใช้เวลาจบของ event', () => {
  const rows = [row({ id: 'a', start_time: '16:00:00' })]
  assert.equal(endsById(rows, '17:00:00').a, '17:00:00')
})

test('บรรทัดสุดท้ายเมื่อไม่รู้เวลาจบของ event ได้ null ไม่ใช่เดา', () => {
  assert.equal(endsById([row({ id: 'a' })], null).a, null)
})

test('บรรทัดสุดท้ายของวันไม่ยืมเวลาของวันถัดไป', () => {
  // ถ้ายืม จะแปลว่ากิจกรรมวิ่งข้ามคืน ซึ่งแทบไม่เคยเป็นความจริง
  const rows = [
    row({ id: 'd0last', day_offset: 0, start_time: '16:00:00' }),
    row({ id: 'd1first', day_offset: 1, start_time: '09:00:00' }),
  ]
  assert.equal(endsById(rows, '17:00:00').d0last, null)
})

test('บรรทัดสุดท้ายของวันสุดท้ายยังได้เวลาจบของ event', () => {
  const rows = [
    row({ id: 'd0', day_offset: 0, start_time: '16:00:00' }),
    row({ id: 'd1', day_offset: 1, start_time: '09:00:00' }),
  ]
  assert.equal(endsById(rows, '17:00:00').d1, '17:00:00')
})

test('อินพุตที่ไม่เรียงถูกจัดเรียงก่อนเติมเวลา', () => {
  const rows = [
    row({ id: 'late', start_time: '11:00:00' }),
    row({ id: 'early', start_time: '09:00:00' }),
  ]
  const lines = resolveAgenda(rows, '17:00:00')
  assert.deepEqual(lines.map((l) => l.id), ['early', 'late'])
  assert.equal(lines[0].endsAt, '11:00:00')
})

test('เรียงตาม day_offset ก่อน แล้วค่อยเวลา', () => {
  const rows = [
    row({ id: 'd1early', day_offset: 1, start_time: '08:00:00' }),
    row({ id: 'd0late', day_offset: 0, start_time: '23:00:00' }),
  ]
  const lines = resolveAgenda(rows, null)
  assert.deepEqual(lines.map((l) => l.id), ['d0late', 'd1early'])
})

test('ไม่แก้ข้อมูลต้นทาง — end_time ที่เป็น null ต้องยังเป็น null', () => {
  // การเติมเกิดตอนแสดงผล ถ้าเผลอเขียนกลับเข้า row จะไหลลง DB ผ่านหน้าแก้
  const rows = [row({ id: 'a', start_time: '09:00:00' }), row({ id: 'b', start_time: '10:00:00' })]
  resolveAgenda(rows, '17:00:00')
  assert.equal(rows[0].end_time, null)
})

test('agendaDayKey · วันแรกคือวันเริ่มงาน', () => {
  assert.equal(agendaDayKey('2026-09-05', 0), '2026-09-05')
})

test('agendaDayKey · วันถัดไปนับจากวันเริ่ม', () => {
  assert.equal(agendaDayKey('2026-09-05', 2), '2026-09-07')
})

test('agendaDayKey · ข้ามเดือนได้', () => {
  assert.equal(agendaDayKey('2026-09-30', 1), '2026-10-01')
})

test('agendaClock · มีเวลาจบแสดงเป็นช่วง', () => {
  const line = { ...row({ id: 'a', start_time: '09:30:00' }), endsAt: '09:50:00' }
  assert.equal(agendaClock(line), '09:30 – 09:50')
})

test('agendaClock · ไม่รู้เวลาจบก็แสดงแค่เวลาเริ่ม ไม่ใส่ขีดค้างไว้', () => {
  const line = { ...row({ id: 'a', start_time: '09:30:00' }), endsAt: null }
  assert.equal(agendaClock(line), '09:30')
})
