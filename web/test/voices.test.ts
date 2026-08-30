/**
 * lib/ai/voices.ts — เสียงของ KeviN
 *
 * แถวแรกคือโหมด "ค่าตั้งต้น" ที่แยกตามภาษา · แถวที่เหลือใช้ทั้งสองภาษา
 * ที่ต้องแยกโหมดแรกออกมา เพราะของจริงพิสูจน์แล้วว่าโมเดลทับเสียงที่เราตั้ง
 * ในบางภาษา (doc/TRAPS.md)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readVoice, resolveVoice, VOICES, VOICE_AUTO } from '../lib/ai/voices'

test('ค่าตั้งต้น: ไทยได้ Charon อังกฤษได้ Fenrir', () => {
  // เจ้าของฟังจริงแล้วเคาะทีละภาษา · เสียงที่เพราะในภาษาหนึ่งไม่ได้แปลว่าเพราะในอีกภาษา
  assert.equal(resolveVoice(VOICE_AUTO, 'th'), 'Charon')
  assert.equal(resolveVoice(VOICE_AUTO, 'en'), 'Fenrir')
})

test('ค่าตั้งต้นให้เสียงต่างกันสองภาษา — ไม่งั้นแถวแรกไม่ต้องแยกตามภาษาก็ได้', () => {
  assert.notEqual(resolveVoice(VOICE_AUTO, 'th'), resolveVoice(VOICE_AUTO, 'en'))
})

test('เสียงที่เลือกเองใช้ทั้งสองภาษาเหมือนกัน', () => {
  for (const lang of ['th', 'en'] as const) {
    assert.equal(resolveVoice('Puck', lang), 'Puck')
    assert.equal(resolveVoice('Charon', lang), 'Charon')
  }
})

test('เลือกเสียงเองต่างจากค่าตั้งต้น — เลือก Fenrir แล้วไทยก็ได้ Fenrir ด้วย', () => {
  // ถ้าสองอย่างนี้ให้ผลเหมือนกัน แถวแรกในรายการก็ไม่มีความหมาย
  assert.notEqual(resolveVoice('Fenrir', 'th'), resolveVoice(VOICE_AUTO, 'th'))
  assert.equal(resolveVoice('Fenrir', 'th'), 'Fenrir')
  // และเลือก Charon เองก็ต้องได้ Charon ทั้งสองภาษา ไม่ใช่แค่ไทย
  assert.equal(resolveVoice('Charon', 'en'), 'Charon')
})

test('ค่าที่ไม่รู้จักถูกปัดกลับเป็นค่าตั้งต้น ไม่ส่งดิบไปหา Google', () => {
  assert.equal(readVoice('DROP TABLE'), VOICE_AUTO)
  assert.equal(readVoice(''), VOICE_AUTO)
  assert.equal(readVoice(null), VOICE_AUTO)
  assert.equal(readVoice(123), VOICE_AUTO)
  assert.equal(resolveVoice('ไม่มีเสียงนี้', 'en'), 'Fenrir')
})

test('รายการมีค่าตั้งต้นเป็นแถวแรก และมีเสียงให้เลือกอีก 8 ตัว', () => {
  assert.equal(VOICES[0].id, VOICE_AUTO)
  assert.equal(VOICES[0].label, 'ค่าตั้งต้น')
  assert.equal(VOICES.length, 9)
})

test('แถวค่าตั้งต้นไม่มีคำอธิบายห้อยท้าย', () => {
  // เจ้าของสั่งให้เขียนแค่ "ค่าตั้งต้น" ไม่ต้องอธิบายว่าทำอะไร
  assert.equal(VOICES[0].desc, '')
})

test('ทุกเสียงที่เหลือมีคำอธิบายบุคลิก', () => {
  for (const v of VOICES.slice(1)) {
    assert.ok(v.desc.length > 0, `${v.id} ไม่มีคำอธิบาย`)
  }
})

test('ไม่มี id ซ้ำในรายการ', () => {
  assert.equal(new Set(VOICES.map((v) => v.id)).size, VOICES.length)
})
