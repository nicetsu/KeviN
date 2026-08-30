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
import { DEFAULT_LANGS, isLang, langRules, readLangs } from '../lib/ai/lang'
import { systemPrompt } from '../lib/ai/prompt'

const TODAY = '2026-08-31'

test('isLang รับเฉพาะ th กับ en', () => {
  assert.equal(isLang('th'), true)
  assert.equal(isLang('en'), true)
  assert.equal(isLang('zh'), false)
  assert.equal(isLang('ko'), false)
  assert.equal(isLang(''), false)
  assert.equal(isLang(undefined), false)
})

test('readLangs ปัดค่าที่ไม่รู้จักกลับเป็นค่าตั้งต้น ไม่ส่งดิบเข้า prompt', () => {
  assert.deepEqual(readLangs({ input: 'zh', reply: 'hi' }), DEFAULT_LANGS)
  assert.deepEqual(readLangs(null), DEFAULT_LANGS)
  assert.deepEqual(readLangs('en'), DEFAULT_LANGS)
})

test('readLangs รับค่าที่ถูกต้อง และรับแบบผสมได้', () => {
  assert.deepEqual(readLangs({ input: 'th', reply: 'en' }), { input: 'th', reply: 'en' })
  assert.deepEqual(readLangs({ input: 'en' }), { input: 'en', reply: 'th' })
})

test('ค่าตั้งต้นเป็นไทยทั้งคู่', () => {
  assert.deepEqual(DEFAULT_LANGS, { input: 'th', reply: 'th' })
})

test('กฎภาษาห้ามใช้ภาษาอื่นชัดเจน', () => {
  const rules = langRules({ input: 'th', reply: 'th' })
  assert.match(rules, /ห้ามใช้ภาษาอื่นนอกจากไทยกับอังกฤษ/)
})

test('กฎภาษาสั่งให้ถามซ้ำเมื่อฟังไม่ชัด แทนที่จะเดาเป็นภาษาอื่น', () => {
  // นี่คือจุดที่ของจริงพัง — พอฟังไม่ออก มันไปเดาเป็นจีน/เกาหลีแทนที่จะถาม
  const rules = langRules(DEFAULT_LANGS)
  assert.match(rules, /ให้ถามซ้ำ/)
  assert.match(rules, /ห้ามเดาว่าเป็นภาษาอื่น/)
})

test('ตั้งพูดไทยตอบอังกฤษได้ และกฎบอกว่าให้ตอบอังกฤษแม้ผู้ใช้พูดไทย', () => {
  const rules = langRules({ input: 'th', reply: 'en' })
  assert.match(rules, /ผู้ใช้พูดและพิมพ์เป็น\*\*ภาษาไทยเท่านั้น\*\*/)
  assert.match(rules, /ตอบเป็น\*\*ภาษาอังกฤษเท่านั้น\*\*/)
  assert.match(rules, /แม้ผู้ใช้จะพูดภาษาไทย/)
})

test('ภาษาเดียวกันทั้งสองฝั่งไม่มีวลี "แม้ผู้ใช้จะพูด" ให้รก', () => {
  assert.equal(langRules({ input: 'th', reply: 'th' }).includes('แม้ผู้ใช้จะพูด'), false)
})

test('ชื่อวิชาและรหัสห้องต้องไม่ถูกแปล', () => {
  assert.match(langRules(DEFAULT_LANGS), /ไม่ต้องแปล/)
})

test('systemPrompt ใส่กฎภาษาเข้าไปจริงทั้งสองโหมด', () => {
  for (const mode of ['chat', 'voice'] as const) {
    const p = systemPrompt(mode, TODAY, { input: 'en', reply: 'en' })
    assert.match(p, /ภาษาอังกฤษเท่านั้น/)
    assert.match(p, /ห้ามใช้ภาษาอื่น/)
  }
})

test('systemPrompt ไม่ใส่ langs ก็ยังได้กฎภาษาแบบไทย', () => {
  assert.match(systemPrompt('chat', TODAY), /ภาษาไทยเท่านั้น/)
})

test('วันที่ยังอยู่ท้ายสุด แม้จะแทรกกฎภาษาเข้ามา', () => {
  // ส่วนที่เหลือต้องเป็น prefix คงที่ที่แคชได้
  const p = systemPrompt('chat', TODAY, { input: 'th', reply: 'en' })
  assert.ok(p.trimEnd().endsWith(`วันนี้คือ ${TODAY} (เวลาไทย)`))
})

test('เปลี่ยนภาษาแล้ว prompt เปลี่ยนจริง ไม่ใช่เงียบ ๆ ใช้ค่าเดิม', () => {
  const th = systemPrompt('voice', TODAY, { input: 'th', reply: 'th' })
  const en = systemPrompt('voice', TODAY, { input: 'th', reply: 'en' })
  assert.notEqual(th, en)
})
