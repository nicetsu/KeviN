/**
 * lib/parse.ts — ตีความบรรทัดเดียวเป็น item (หน้าเพิ่มเร็ว S8)
 *
 * กฎการเดาชนิด ต้องตรงกับ doc/CLAUDE-PROJECT-PROMPT.md
 *   มีเวลาเจาะจง -> reminder · มีวันแต่ไม่มีเวลา -> task + due_at · ไม่มีทั้งคู่ -> task เปล่า
 *
 * วันอ้างอิงทั้งไฟล์คือ **พุธ 26 ส.ค. 2026** เลือกวันกลางสัปดาห์
 * เพื่อให้ทดสอบได้ทั้งวันที่ผ่านมาแล้วและวันที่ยังมาไม่ถึงในสัปดาห์เดียวกัน
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseQuickAdd } from '../lib/parse'

const TODAY = '2026-08-26' // พุธ

const PROJECTS = [
  { id: 'p1', name: 'แคลคูลัส 1' },
  { id: 'p2', name: 'ฟิสิกส์ทั่วไป' },
  { id: 'p3', name: 'Data Structures', aliases: ['DS'] },
]

const run = (text: string, projects = PROJECTS) =>
  parseQuickAdd({ text, today: TODAY, projects })

test('ข้อความล้วนกลายเป็น task ที่ไม่กำหนดวัน', () => {
  const r = run('ซื้อสมุด')
  assert.equal(r.type, 'task')
  assert.equal(r.title, 'ซื้อสมุด')
  assert.equal(r.date, null)
  assert.equal(r.time, null)
  assert.equal(r.projectId, null)
})

test('มีเวลาเจาะจงกลายเป็น reminder', () => {
  const r = run('ประชุม 14:30')
  assert.equal(r.type, 'reminder')
  assert.equal(r.time, '14:30')
  assert.equal(r.title, 'ประชุม')
})

test('เวลาคั่นด้วยจุดก็อ่านได้ (พิมพ์ 14.30 บนมือถือง่ายกว่า)', () => {
  assert.equal(run('ประชุม 14.30').time, '14:30')
})

test('เวลาเกินขอบถูกหนีบ ไม่ใช่ปฏิเสธทั้งบรรทัด', () => {
  // ตีความผิดยังแก้ได้บนหน้าจอ แต่ถ้าปฏิเสธทั้งบรรทัดคือพิมพ์ใหม่หมด
  assert.equal(run('อะไรสักอย่าง 25:70').time, '23:59')
})

test('"3 โมงเย็น" เป็น 15:00', () => {
  assert.equal(run('เจอกัน 3 โมงเย็น').time, '15:00')
})

test('"9 โมงเช้า" เป็น 09:00 ไม่บวก 12', () => {
  assert.equal(run('เข้าแล็บ 9 โมงเช้า').time, '09:00')
})

test('"วันนี้" คือวันที่ส่งเข้ามา', () => {
  assert.equal(run('ส่งงาน วันนี้').date, TODAY)
})

test('"พรุ่งนี้" บวกหนึ่งวัน และยังเป็น task เพราะไม่มีเวลา', () => {
  const r = run('ส่งงาน พรุ่งนี้')
  assert.equal(r.date, '2026-08-27')
  assert.equal(r.type, 'task')
})

test('"มะรืนนี้" บวกสองวัน', () => {
  assert.equal(run('ส่งงาน มะรืนนี้').date, '2026-08-28')
})

test('"มะรืน" แบบไม่มี "นี้" ก็ได้', () => {
  assert.equal(run('ส่งงาน มะรืน').date, '2026-08-28')
})

test('ชื่อวันชี้ไปครั้งถัดไปเสมอ — "พุธ" ตอนวันพุธคือพุธหน้า', () => {
  assert.equal(run('ติว พุธ').date, '2026-09-02')
})

test('ชื่อวันที่ยังมาไม่ถึงอยู่ในสัปดาห์เดียวกัน', () => {
  assert.equal(run('ติว ศุกร์').date, '2026-08-28')
})

test('ภาษาไทยไม่เว้นวรรคก็จับได้ — "ติวพุธ"', () => {
  // regex ที่บังคับ \s ขนาบคำจะจับเคสนี้ไม่ได้เลย (doc/TRAPS.md)
  const r = run('ติวพุธ')
  assert.equal(r.date, '2026-09-02')
  assert.equal(r.title, 'ติว')
})

test('วันที่แบบ 22/8', () => {
  assert.equal(run('ส่ง 22/8').date, '2026-08-22')
})

test('วันที่แบบ "22 ส.ค."', () => {
  const r = run('ส่ง 22 ส.ค.')
  assert.equal(r.date, '2026-08-22')
  assert.equal(r.title, 'ส่ง')
})

test('จับชื่อวิชาแล้วตัดออกจากหัวข้อ', () => {
  const r = run('ส่งการบ้าน แคลคูลัส พรุ่งนี้')
  assert.equal(r.projectId, 'p1')
  assert.equal(r.title, 'ส่งการบ้าน')
  assert.equal(r.date, '2026-08-27')
})

test('จับ alias ที่สั้นกว่าเกณฑ์คำปกติได้', () => {
  // 'DS' ยาวแค่ 2 ตัว tokensOf จะกรองทิ้ง แต่ aliases ต้องรอด
  assert.equal(run('ส่งแล็บ DS').projectId, 'p3')
})

test('เมื่อตรงหลายวิชา เลือกคำที่ยาวกว่า', () => {
  const projects = [
    { id: 'short', name: 'ฟิสิกส์' },
    { id: 'long', name: 'ฟิสิกส์ทั่วไป' },
  ]
  assert.equal(run('อ่าน ฟิสิกส์ทั่วไป', projects).projectId, 'long')
})

test('ไม่ตรงวิชาไหนเลยได้ null ไม่ใช่เดามั่ว', () => {
  assert.equal(run('ตัดผม').projectId, null)
})

test('เวลาและวันมาด้วยกันได้ ผลเป็น reminder ที่รู้วัน', () => {
  const r = run('quiz แคลคูลัส ศุกร์ 09:00')
  assert.equal(r.type, 'reminder')
  assert.equal(r.date, '2026-08-28')
  assert.equal(r.time, '09:00')
  assert.equal(r.projectId, 'p1')
  assert.equal(r.title, 'quiz')
})

test('matched รายงานว่าเข้าใจส่วนไหนไปบ้าง', () => {
  // หน้าเพิ่มเร็วเอา matched ไปโชว์ว่าเดาอะไร — เดาผิดได้ แต่ต้องเห็นว่าเดาอะไร
  const r = run('quiz แคลคูลัส ศุกร์ 09:00')
  assert.deepEqual(r.matched, { time: '09:00', date: 'ศุกร์', project: 'แคลคูลัส' })
})
