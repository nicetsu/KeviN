/**
 * lib/voice/mic.ts — รายการไมค์ให้เลือก
 *
 * พังแล้วไม่มี error ให้เห็น · สายยังต่อติดแค่ใช้ไมค์ผิดตัว
 * ซึ่งผู้ใช้จะรู้ก็ต่อเมื่อพูดไปแล้วอีกฝั่งไม่ได้ยิน
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { micOptions, resolveMic, micConstraints, MIC_AUTO } from '../lib/voice/mic'

const dev = (deviceId: string, label: string, kind = 'audioinput') => ({ kind, deviceId, label })

test('แถวแรกเป็นอัตโนมัติเสมอ แม้ไม่มีอุปกรณ์เลย', () => {
  const out = micOptions([])
  assert.equal(out.length, 1)
  assert.equal(out[0].id, MIC_AUTO)
})

test('เอาเฉพาะ audioinput', () => {
  const out = micOptions([
    dev('a', 'ไมค์'),
    dev('b', 'ลำโพง', 'audiooutput'),
    dev('c', 'กล้อง', 'videoinput'),
  ])
  assert.deepEqual(out.map((o) => o.id), [MIC_AUTO, 'a'])
})

test('deviceId ซ้ำถูกตัด', () => {
  // Windows คืน default กับ communications ที่ชี้อุปกรณ์ตัวเดียวกัน
  const out = micOptions([dev('same', 'ไมค์'), dev('same', 'ไมค์')])
  assert.equal(out.length, 2)
})

test('deviceId ว่างถูกข้าม', () => {
  assert.deepEqual(micOptions([dev('', 'ไม่มี id')]).map((o) => o.id), [MIC_AUTO])
})

test('label ว่าง (ยังไม่ได้สิทธิ์) ได้ชื่อชั่วคราวและคำอธิบาย', () => {
  const out = micOptions([dev('a', ''), dev('b', '')])
  assert.equal(out[1].label, 'ไมโครโฟน 1')
  assert.equal(out[2].label, 'ไมโครโฟน 2')
  assert.match(out[1].hint, /อนุญาต/)
})

test('ตัดคำนำหน้าที่ระบบใส่มา', () => {
  const out = micOptions([dev('a', 'Default - Headset Microphone')])
  assert.equal(out[1].label, 'Headset Microphone')
})

test('ชื่อจริงต้องไม่ถูกเปลี่ยน คำใบ้ไปอยู่แยกต่างหาก', () => {
  // เดาผิดได้ ชื่อจริงจึงต้องอยู่ครบให้ผู้ใช้เทียบกับของจริงเอง
  const out = micOptions([dev('a', 'Galaxy Buds Pro')])
  assert.equal(out[1].label, 'Galaxy Buds Pro')
})

test('คำใบ้แยกหูฟังกับไมค์ในตัว', () => {
  const out = micOptions([
    dev('a', 'Bluetooth Headset'),
    dev('b', 'Built-in Microphone'),
    dev('c', 'Some Device'),
  ])
  assert.equal(out[1].hint, 'บลูทูธ')
  assert.equal(out[2].hint, 'ไมค์ในตัวเครื่อง')
  assert.equal(out[3].hint, '')
})

test('อุปกรณ์ที่ถอดไปแล้วปัดกลับเป็นอัตโนมัติ', () => {
  // ค้างชื่อเดิมไว้ = เปิดสายไม่ติดโดยหน้าจอยังโชว์ชื่ออุปกรณ์ที่ไม่มีอยู่
  const options = micOptions([dev('ยังอยู่', 'ไมค์')])
  assert.equal(resolveMic('ถอดไปแล้ว', options), MIC_AUTO)
  assert.equal(resolveMic('ยังอยู่', options), 'ยังอยู่')
})

test('อัตโนมัติไม่ส่ง deviceId ไปเลย', () => {
  assert.equal('deviceId' in micConstraints(MIC_AUTO), false)
})

test('เลือกเองใช้ ideal ไม่ใช่ exact', () => {
  // exact ทำให้ทั้งคำสั่งล้มถ้าอุปกรณ์หายไประหว่างทาง เช่น ถอดหูฟังตอนต่อสาย
  const c = micConstraints('abc') as { deviceId: { ideal?: string; exact?: string } }
  assert.equal(c.deviceId.ideal, 'abc')
  assert.equal(c.deviceId.exact, undefined)
})

test('ตัวเลือกเสียงพื้นฐานติดไปด้วยทุกกรณี', () => {
  for (const choice of [MIC_AUTO, 'abc']) {
    const c = micConstraints(choice)
    assert.equal(c.channelCount, 1)
    assert.equal(c.echoCancellation, true)
    assert.equal(c.noiseSuppression, true)
  }
})
