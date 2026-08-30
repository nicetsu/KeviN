/**
 * lib/chat/links.ts — กันผู้ช่วยพาผู้ใช้ไปหน้าที่ไม่มีอยู่
 *
 * เคสในไฟล์นี้มาจากของจริงที่เจอตอนทดสอบ ไม่ได้คิดขึ้นเอง
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeLinks, isRealRoute, BAD_LINK } from '../lib/chat/links'

const UID = 'df0b84cf-7223-4557-8b02-245b9675c3a9'

test('เส้นทางจริงผ่านทั้งหมด', () => {
  for (const p of ['/', '/calendar', '/library', '/settings', '/kevin',
                   `/project/${UID}`, `/project/${UID}/schedule`,
                   `/project/${UID}/event/${UID}`, `/project/${UID}/event/${UID}/edit`,
                   `/project/${UID}/event/new`]) {
    assert.equal(isRealRoute(p), true, p)
  }
})

test('path ที่แต่งขึ้นเองไม่ผ่าน', () => {
  // ของจริงที่โมเดลตอบมาตอนทดสอบ
  assert.equal(isRealRoute('/items/overdue'), false)
  assert.equal(isRealRoute('/tasks'), false)
  assert.equal(isRealRoute(`/project/${UID}/items`), false)
  assert.equal(isRealRoute('/project/123'), false)
})

test('URL ภายนอกถูกแทนที่', () => {
  // เคสแรกที่เจอ — ตอบว่าไปแก้ที่ https://tasks.google.com/ ซึ่งไม่ใช่ของระบบนี้
  const r = sanitizeLinks('เข้าไปแก้ได้ที่ https://tasks.google.com/ ครับ')
  assert.equal(r.removed, 1)
  assert.equal(r.text.includes('tasks.google.com'), false)
  assert.ok(r.text.includes(BAD_LINK))
})

test('path ปลอมถูกแทนที่', () => {
  const r = sanitizeLinks('ปรับได้ที่ /items/overdue ครับ')
  assert.equal(r.removed, 1)
  assert.equal(r.text.includes('/items/overdue'), false)
})

test('ลิงก์จริงไม่ถูกแตะ', () => {
  const text = `ดูได้ที่ /project/${UID} ครับ`
  const r = sanitizeLinks(text)
  assert.equal(r.removed, 0)
  assert.equal(r.text, text)
})

test('วรรคตอนท้ายลิงก์ไม่ทำให้ลิงก์จริงพัง', () => {
  const r = sanitizeLinks(`ดูที่ /project/${UID}.`)
  assert.equal(r.removed, 0)
  assert.ok(r.text.endsWith('.'))
})

test('หลายลิงก์ในข้อความเดียว นับและแทนที่เฉพาะอันที่ผิด', () => {
  const r = sanitizeLinks(`มีสองที่ /calendar และ /items/all และ /project/${UID}`)
  assert.equal(r.removed, 1)
  assert.ok(r.text.includes('/calendar'))
  assert.ok(r.text.includes(`/project/${UID}`))
})

test('ข้อความที่ไม่มีลิงก์เลยไม่ถูกแตะ', () => {
  const text = 'พรุ่งนี้มีเรียน 3 วิชา 10:00–12:00 ที่ E 17501'
  assert.deepEqual(sanitizeLinks(text), { text, removed: 0 })
})

test('เศษส่วนหรือเวลาไม่ถูกเข้าใจผิดว่าเป็นลิงก์', () => {
  const text = 'คาบ 10:00-12:00 วันที่ 31/8 ห้อง E11-S603'
  assert.equal(sanitizeLinks(text).removed, 0)
})
