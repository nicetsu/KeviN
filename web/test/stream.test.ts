/**
 * lib/chat/stream.ts — ตัวต่อชิ้นของสายคำตอบแชต
 *
 * จุดที่พลาดแล้วเงียบคือ **ก้อนที่เครือข่ายส่งมาไม่ได้จบตรงบรรทัดพอดี**
 * ถ้าอ่านทีละก้อนแล้วแกะ JSON ตรง ๆ ประโยคจะหายไปเป็นช่วง ๆ โดยหน้าจอ
 * ยังดูเหมือนทำงานปกติ · เทสต์ชุดนี้จึงหั่นก้อนในที่ที่แย่ที่สุดเท่าที่จะทำได้
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { ndjsonParser, type ChatEvent } from '../lib/chat/stream'

const line = (e: Record<string, unknown>) => `${JSON.stringify(e)}\n`

test('หลายเหตุการณ์ในก้อนเดียว ออกมาครบตามลำดับ', () => {
  const p = ndjsonParser()
  const got = p.push(line({ t: 'delta', v: 'สวัสดี' }) + line({ t: 'delta', v: 'ครับ' }))
  assert.deepEqual(got, [
    { t: 'delta', v: 'สวัสดี' },
    { t: 'delta', v: 'ครับ' },
  ])
})

test('บรรทัดที่ถูกหั่นกลางคัน ต้องรอก้อนถัดไป ไม่ใช่หายไป', () => {
  const p = ndjsonParser()
  const whole = line({ t: 'delta', v: 'พรุ่งนี้ติดคาบเช้า' })
  const cut = Math.floor(whole.length / 2)

  assert.deepEqual(p.push(whole.slice(0, cut)), [], 'ครึ่งบรรทัดยังไม่ใช่เหตุการณ์')
  assert.deepEqual(p.push(whole.slice(cut)), [{ t: 'delta', v: 'พรุ่งนี้ติดคาบเช้า' }])
})

test('หั่นทีละตัวอักษรก็ยังได้ข้อความครบเหมือนเดิม', () => {
  const events = [
    line({ t: 'delta', v: 'ก' }),
    line({ t: 'delta', v: 'ข' }),
    line({ t: 'done', conversationId: 'c1', reply: 'กข' }),
  ].join('')

  const p = ndjsonParser()
  const got: ChatEvent[] = []
  for (const ch of events) got.push(...p.push(ch))
  got.push(...p.end())

  assert.equal(got.length, 3)
  assert.equal(got.filter((e) => e.t === 'delta').map((e) => (e.t === 'delta' ? e.v : '')).join(''), 'กข')
  assert.equal(got[2].t, 'done')
})

test('บรรทัดว่างถูกข้าม ไม่กลายเป็นเหตุการณ์เปล่า', () => {
  const p = ndjsonParser()
  assert.deepEqual(p.push('\n\n' + line({ t: 'reset' }) + '\n'), [{ t: 'reset' }])
})

test('บรรทัดที่อ่านไม่ออกถูกข้าม ไม่ล้มทั้งสาย', () => {
  const p = ndjsonParser()
  const got = p.push('{ไม่ใช่ json\n' + line({ t: 'delta', v: 'ต่อได้' }))
  assert.deepEqual(got, [{ t: 'delta', v: 'ต่อได้' }])
})

test('ชนิดที่ไม่รู้จักถูกข้าม — ของใหม่จากเซิร์ฟเวอร์ต้องไม่ทำจอพัง', () => {
  const p = ndjsonParser()
  const got = p.push(line({ t: 'อะไรสักอย่าง', v: 1 }) + line({ t: 'delta', v: 'ยังไหว' }))
  assert.deepEqual(got, [{ t: 'delta', v: 'ยังไหว' }])
})

test('บรรทัดสุดท้ายที่ไม่มีขึ้นบรรทัดใหม่ปิดท้าย ต้องได้จาก end()', () => {
  const p = ndjsonParser()
  assert.deepEqual(p.push(JSON.stringify({ t: 'done', conversationId: 'c1', reply: 'จบ' })), [])
  assert.deepEqual(p.end(), [{ t: 'done', conversationId: 'c1', reply: 'จบ' }])
})

test('end() ที่ไม่มีอะไรค้าง คืนรายการว่าง และเรียกซ้ำได้', () => {
  const p = ndjsonParser()
  p.push(line({ t: 'reset' }))
  assert.deepEqual(p.end(), [])
  assert.deepEqual(p.end(), [])
})

test('ร่างเดินทางมาทั้งก้อนได้ — การ์ดขึ้นก่อนคำตอบจบ', () => {
  const draft = {
    id: 'd_1',
    heading: 'เพิ่มงาน',
    title: 'ส่งรายงาน',
    lines: [{ label: 'วิชา', value: 'สถาปัตยกรรมเครือข่าย' }],
    action: { kind: 'add_item', type: 'task', projectId: 'p1', title: 'ส่งรายงาน' },
  }
  const p = ndjsonParser()
  const got = p.push(line({ t: 'draft', v: draft }))
  assert.equal(got.length, 1)
  assert.equal(got[0].t === 'draft' && got[0].v.id, 'd_1')
})
