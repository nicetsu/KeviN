/**
 * lib/drafts.ts — รูปของ "ร่าง" ที่ทั้งฝั่งเว็บและฝั่งเซิร์ฟเวอร์ใช้ร่วมกัน
 *
 * ที่ต้องมีเทสต์คุมคือ `draftTimeField()` ซึ่งตัดสินว่า **ช่องเวลาในแผงแก้
 * จะขึ้นไหมและค่าที่กรอกจะลงฟิลด์ไหน** · ถ้ามันตอบผิด ผลไม่ใช่ error
 * แต่เป็นช่องที่กรอกแล้วค่าหายเงียบ ๆ ตอนกด "เอาตามนี้" ซึ่งตามองไม่เห็น
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { confirmLabel, draftTimeField, isDraftKind, DRAFT_KINDS, type DraftAction } from '../lib/drafts'

test('งานใช้กำหนดส่ง · การเตือนใช้เวลาเตือน — คนละฟิลด์กัน', () => {
  const task: DraftAction = { kind: 'add_item', type: 'task', projectId: 'p', title: 'ส่งรายงาน' }
  const reminder: DraftAction = { kind: 'add_item', type: 'reminder', projectId: 'p', title: 'เตือน' }
  assert.equal(draftTimeField(task), 'due')
  assert.equal(draftTimeField(reminder), 'remind')
})

test('โน้ตไม่มีช่องเวลาให้กรอก — ไม่ใช่มีแล้วกรอกไม่ติด', () => {
  const note: DraftAction = { kind: 'add_item', type: 'shortnote', projectId: 'p', title: 'จดไว้' }
  assert.equal(draftTimeField(note), null)
})

test('ร่างแก้ที่ไม่ได้แตะเวลาไม่ขึ้นช่องเวลา', () => {
  const renameOnly: DraftAction = { kind: 'edit_item', itemId: 'i', title: 'ชื่อใหม่' }
  assert.equal(draftTimeField(renameOnly), null)
})

test('ร่างแก้ที่แตะเวลาขึ้นช่องของฟิลด์นั้น · ล้างค่า (null) ก็ยังนับว่าแตะ', () => {
  const moveDue: DraftAction = { kind: 'edit_item', itemId: 'i', dueAt: '2026-09-04T16:59:00.000Z' }
  const clearDue: DraftAction = { kind: 'edit_item', itemId: 'i', dueAt: null }
  const moveRemind: DraftAction = { kind: 'edit_item', itemId: 'i', remindAt: '2026-09-04T16:59:00.000Z' }
  assert.equal(draftTimeField(moveDue), 'due')
  assert.equal(draftTimeField(clearDue), 'due')
  assert.equal(draftTimeField(moveRemind), 'remind')
})

test('ติ๊กเสร็จกับเก็บเข้าคลังไม่มีเวลาให้แก้', () => {
  const done: DraftAction = { kind: 'complete_item', itemId: 'i', done: true }
  const archive: DraftAction = { kind: 'archive_item', itemId: 'i' }
  assert.equal(draftTimeField(done), null)
  assert.equal(draftTimeField(archive), null)
})

test('กิจกรรมแก้เวลาเริ่มได้เสมอ', () => {
  const ev: DraftAction = {
    kind: 'add_event',
    projectId: 'p',
    title: 'แข่ง',
    startsAt: '2026-09-05T02:00:00.000Z',
    endsAt: '2026-09-05T04:00:00.000Z',
  }
  assert.equal(draftTimeField(ev), 'start')
})

test('ทุกชนิดที่เสนอได้มีคำบนปุ่มยืนยันของตัวเอง ไม่ใช่ "ยืนยัน" เหมือนกันหมด', () => {
  const words = DRAFT_KINDS.map(confirmLabel)
  assert.ok(words.every((w) => w.length > 0))
  // อย่างน้อยต้องต่างกันเกินครึ่ง ไม่งั้นการ์ดที่อ่านผ่าน ๆ จะบอกไม่ได้ว่ากำลังจะทำอะไร
  assert.ok(new Set(words).size >= DRAFT_KINDS.length - 1)
})

test('ชนิดที่ไม่อยู่ในรายการถูกปฏิเสธ — ด่านนี้อยู่ฝั่งเซิร์ฟเวอร์ด้วย', () => {
  assert.equal(isDraftKind('add_item'), true)
  assert.equal(isDraftKind('delete_project'), false)
  assert.equal(isDraftKind(''), false)
  assert.equal(isDraftKind(null), false)
})
