/**
 * lib/voice/transcript.ts — สิ่งที่พูดระหว่างสายต้องไม่ถูกบันทึก
 *
 * เจ้าของสั่งเอง · เก็บเฉพาะสิ่งที่ KeviN ตอบ ฝั่งตัวเองลงเป็นคำว่า voice
 * เทสต์ชุดนี้คือด่านที่จับได้ถ้ามีคนเผลอถอดออกในอนาคต
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { redactVoiceTurns, VOICE_PLACEHOLDER, type Turn } from '../lib/voice/transcript'

test('สิ่งที่ผู้ใช้พูดถูกแทนที่ด้วย voice', () => {
  const out = redactVoiceTurns([{ role: 'user', content: 'พรุ่งนี้ติดอะไรบ้าง' }])
  assert.deepEqual(out, [{ role: 'user', content: VOICE_PLACEHOLDER }])
})

test('คำตอบของ KeviN เก็บไว้ครบไม่ถูกแตะ', () => {
  const reply = 'พรุ่งนี้มีเรียน 2 วิชาครับ 10:00 ที่ E 17501'
  const out = redactVoiceTurns([{ role: 'assistant', content: reply }])
  assert.deepEqual(out, [{ role: 'assistant', content: reply }])
})

test('บทสนทนาสลับกันไปมา — ฝั่งผู้ใช้หายหมด ฝั่ง KeviN อยู่ครบ', () => {
  const turns: Turn[] = [
    { role: 'user', content: 'พรุ่งนี้ติดอะไร' },
    { role: 'assistant', content: 'มีเรียน 2 วิชา' },
    { role: 'user', content: 'แล้วงานส่งล่ะ' },
    { role: 'assistant', content: 'มี Homework 4' },
  ]
  const out = redactVoiceTurns(turns)
  assert.deepEqual(out.map((t) => t.content), [VOICE_PLACEHOLDER, 'มีเรียน 2 วิชา', VOICE_PLACEHOLDER, 'มี Homework 4'])
})

test('จำนวนแถวไม่เปลี่ยน — ยังเห็นจังหวะว่าใครพูดตอนไหน', () => {
  // ถ้าตัดแถวฝั่งผู้ใช้ทิ้ง ประวัติจะกลายเป็นคำตอบลอย ๆ เรียงกันโดยไม่รู้ว่าตอบอะไร
  const turns: Turn[] = [
    { role: 'user', content: 'ก' }, { role: 'assistant', content: 'ข' },
    { role: 'user', content: 'ค' },
  ]
  assert.equal(redactVoiceTurns(turns).length, 3)
  assert.deepEqual(redactVoiceTurns(turns).map((t) => t.role), ['user', 'assistant', 'user'])
})

test('ไม่มีเศษของสิ่งที่พูดหลงเหลืออยู่เลย', () => {
  const secret = 'รหัสตู้เซฟคือหนึ่งสองสามสี่'
  const out = redactVoiceTurns([{ role: 'user', content: secret }])
  assert.equal(JSON.stringify(out).includes('รหัส'), false)
  assert.equal(JSON.stringify(out).includes('หนึ่งสองสามสี่'), false)
})

test('ไม่แก้อาร์เรย์ต้นฉบับ', () => {
  const turns: Turn[] = [{ role: 'user', content: 'ของเดิม' }]
  redactVoiceTurns(turns)
  assert.equal(turns[0].content, 'ของเดิม')
})

test('รายการว่างได้รายการว่าง', () => {
  assert.deepEqual(redactVoiceTurns([]), [])
})
