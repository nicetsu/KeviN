/**
 * lib/ai/lang.ts — ล็อกภาษาไว้ที่ไทยกับอังกฤษ
 *
 * ที่ต้องมีเพราะของจริงพัง: พูดไทยแล้วตัวถอดเสียงเดาเป็นจีน ฮินดี เกาหลี
 * สลับกันในสายเดียว (เจอบนมือถือจริง 31 ส.ค. 2026)
 *
 * ⚠️ เทสต์นี้ตรวจได้แค่ว่า**คำสั่งถูกส่งไปจริง** ไม่ได้พิสูจน์ว่าโมเดลเชื่อฟัง
 *    Live API ไม่รับ language code จึงบังคับได้แค่ที่ระดับ prompt
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LANG, isLang, langRules, readLang } from '../lib/ai/lang'
import { systemPrompt } from '../lib/ai/prompt'

const TODAY = '2026-08-31'

test('isLang รับเฉพาะ th กับ en', () => {
  assert.equal(isLang('th'), true)
  assert.equal(isLang('en'), true)
  assert.equal(isLang('zh'), false)
  assert.equal(isLang('ko'), false)
  assert.equal(isLang(undefined), false)
})

test('readLang ปัดค่าที่ไม่รู้จักกลับเป็นค่าตั้งต้น ไม่ส่งดิบเข้า prompt', () => {
  assert.equal(readLang('zh'), DEFAULT_LANG)
  assert.equal(readLang(null), DEFAULT_LANG)
  assert.equal(readLang({ input: 'en' }), DEFAULT_LANG)
})

test('readLang รับค่าที่ถูกต้อง', () => {
  assert.equal(readLang('en'), 'en')
  assert.equal(readLang('th'), 'th')
})

test('ค่าตั้งต้นเป็นไทย', () => {
  assert.equal(DEFAULT_LANG, 'th')
})

test('กฎภาษาห้ามใช้ภาษาอื่นชัดเจน', () => {
  assert.match(langRules('th'), /ห้ามใช้ภาษาอื่นนอกจากไทยกับอังกฤษ/)
})

test('กฎภาษาสั่งให้ถามซ้ำเมื่อฟังไม่ชัด แทนที่จะเดาเป็นภาษาอื่น', () => {
  // นี่คือจุดที่ของจริงพัง — พอฟังไม่ออก มันไปเดาเป็นจีน/เกาหลีแทนที่จะถาม
  const rules = langRules('th')
  assert.match(rules, /ให้ถามซ้ำ/)
  assert.match(rules, /ห้ามเดาว่าเป็นภาษาอื่น/)
})

test('ภาษาเดียวใช้ทั้งฟังและตอบ — ไม่แยกสองค่าแล้ว', () => {
  assert.match(langRules('en'), /ภาษาอังกฤษเท่านั้น/)
  assert.match(langRules('en'), /ทั้งตอนผู้ใช้พูดและตอนคุณตอบ/)
})

test('ชื่อวิชาและรหัสห้องต้องไม่ถูกแปล', () => {
  assert.match(langRules('th'), /ไม่ต้องแปล/)
})

test('systemPrompt ใส่กฎภาษาเข้าไปจริงทั้งสองโหมด', () => {
  for (const mode of ['chat', 'voice'] as const) {
    const p = systemPrompt(mode, TODAY, 'en')
    assert.match(p, /ภาษาอังกฤษเท่านั้น/)
    assert.match(p, /ห้ามใช้ภาษาอื่น/)
  }
})

test('systemPrompt ไม่ใส่ภาษาก็ยังได้กฎแบบไทย', () => {
  assert.match(systemPrompt('chat', TODAY), /ภาษาไทยเท่านั้น/)
})

test('วันที่ยังอยู่ท้ายสุด แม้จะแทรกกฎภาษาเข้ามา', () => {
  const p = systemPrompt('chat', TODAY, 'en')
  assert.ok(p.trimEnd().endsWith(`วันนี้คือ ${TODAY} (เวลาไทย)`))
})

test('เปลี่ยนภาษาแล้ว prompt เปลี่ยนจริง ไม่ใช่เงียบ ๆ ใช้ค่าเดิม', () => {
  assert.notEqual(systemPrompt('voice', TODAY, 'th'), systemPrompt('voice', TODAY, 'en'))
})
