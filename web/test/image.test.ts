/**
 * lib/chat/image.ts — รูปที่แนบมากับข้อความ
 *
 * เทสต์ที่นี่ครอบเฉพาะส่วนที่เป็นตรรกะล้วน — การตรวจสิ่งที่มากับคำขอ · การนับ
 * ขนาดจาก base64 · การย่อขนาด · และรูปของสิ่งที่ลงประวัติ
 * ส่วน `prepareImage()` ต้องมี canvas จริงจึงไม่มีที่นี่ (มันเป็นของเบราว์เซอร์)
 *
 * ของที่กันไว้ทั้งหมดเป็นตระกูล **"ถูกบนจอ ผิดข้างใน และเงียบ"** ทั้งนั้น —
 * รูปที่ถูกเมินโดยไม่มีใครรู้ · เพดานที่นับผิดจนของใหญ่หลุดเข้ามา · และป้าย
 * ในประวัติที่เพี้ยนจนโมเดลนึกว่ายังเห็นรูปอยู่
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCEPTED_TYPES,
  BadImage,
  IMAGE_PLACEHOLDER,
  MAX_BYTES,
  MAX_EDGE,
  base64Bytes,
  fitWithin,
  hadImage,
  imageHistoryLine,
  readInlineImage,
  shotsToRevoke,
  withoutImageMark,
} from '../lib/chat/image'

/** base64 ของ n ไบต์ · ไม่ต้องเป็นรูปจริงเพราะด่านนี้ไม่ได้ถอดรหัสอะไร */
const b64 = (bytes: number) => Buffer.alloc(bytes).toString('base64')

const ok = { mimeType: 'image/jpeg', data: b64(1000) }

// ---- ด่านตรวจของที่มากับคำขอ ---------------------------------------------

test('ไม่ได้แนบรูปมา = null ไม่ใช่ error', () => {
  // เป็นเรื่องปกติที่สุด · ข้อความเปล่า ๆ ต้องผ่านด่านนี้ไปได้เงียบ ๆ
  assert.equal(readInlineImage(undefined), null)
  assert.equal(readInlineImage(null), null)
})

test('แนบมาแต่ใช้ไม่ได้ ต้อง **โยน** ไม่ใช่คืน null', () => {
  /*
   * ⚠️ นี่คือหัวใจของไฟล์นี้ — ถ้าเมินรูปที่ผิดรูปแล้วปล่อยคำขอผ่านไปเฉย ๆ
   *    โมเดลจะได้ข้อความเปล่าแล้วตอบว่า "ไม่เห็นรูปเลยครับ" ทั้งที่ผู้ใช้แนบไปแล้ว
   *    · ผู้ใช้จะแนบใหม่ซ้ำ ๆ แล้วเจอผลเดิมโดยไม่มีอะไรบอกว่าเกิดอะไรขึ้น
   */
  for (const bad of [
    'ไม่ใช่ออบเจกต์',
    {},
    { mimeType: 'image/jpeg' },
    { mimeType: 'image/jpeg', data: '' },
    { data: b64(10) },
  ]) {
    assert.throws(() => readInlineImage(bad), BadImage, `ควรปฏิเสธ: ${JSON.stringify(bad)}`)
  }
})

test('รับเฉพาะชนิดที่ประกาศไว้', () => {
  for (const mimeType of ACCEPTED_TYPES) {
    assert.deepEqual(readInlineImage({ mimeType, data: ok.data }), { mimeType, data: ok.data })
  }
  // HEIC อยู่นอกรายการโดยตั้งใจ — เบราว์เซอร์ถอดรหัสไม่ได้จึงย่อขนาดไม่ได้
  for (const mimeType of ['image/heic', 'image/gif', 'application/pdf', 'text/plain']) {
    assert.throws(() => readInlineImage({ mimeType, data: ok.data }), BadImage, mimeType)
  }
})

test('เพดานขนาดอยู่ฝั่งเซิร์ฟเวอร์ ไม่ใช่แค่ฝั่งจอ', () => {
  // การย่อขนาดฝั่งเบราว์เซอร์เป็นเรื่องของความเร็ว ไม่ใช่เรื่องของการกัน —
  // `/api/chat` ถูกยิงตรงได้เหมือนทุก endpoint (doc/TRAPS.md)
  assert.ok(readInlineImage({ mimeType: 'image/png', data: b64(MAX_BYTES) }))
  assert.throws(
    () => readInlineImage({ mimeType: 'image/png', data: b64(MAX_BYTES + 1024) }),
    BadImage
  )
})

// ---- นับขนาดโดยไม่ถอดรหัส --------------------------------------------------

test('นับไบต์จาก base64 ได้ตรงโดยไม่ต้องถอดรหัส', () => {
  /*
   * ถอดรหัสเพื่อจะรู้ขนาด แปลว่ายอมกินหน่วยความจำเท่าไฟล์ไปแล้ว **ก่อน**
   * จะได้ปฏิเสธ ซึ่งกลับหัวกับเหตุผลที่มีเพดานตั้งแต่แรก
   */
  for (const n of [0, 1, 2, 3, 4, 5, 100, 1023, 65_536]) {
    assert.equal(base64Bytes(Buffer.alloc(n).toString('base64')), n, `${n} ไบต์`)
  }
})

// ---- ย่อขนาด ---------------------------------------------------------------

test('ย่อให้ด้านยาวสุดพอดีเพดาน และคงอัตราส่วน', () => {
  const wide = fitWithin(4000, 3000)
  assert.equal(wide.width, MAX_EDGE)
  assert.equal(wide.height, Math.round((MAX_EDGE * 3000) / 4000))

  // แนวตั้งต้องคิดจากด้านสูง ไม่ใช่ด้านกว้างเสมอไป
  const tall = fitWithin(3000, 4000)
  assert.equal(tall.height, MAX_EDGE)
  assert.equal(tall.width, Math.round((MAX_EDGE * 3000) / 4000))
})

test('รูปที่เล็กอยู่แล้วไม่ถูกขยาย', () => {
  // ขยายแล้วไม่ได้รายละเอียดเพิ่มสักพิกเซล ได้แต่ไฟล์ที่ใหญ่ขึ้นเปล่า ๆ
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 })
  assert.deepEqual(fitWithin(MAX_EDGE, 100), { width: MAX_EDGE, height: 100 })
})

test('รูปแถบยาวมาก ๆ ด้านสั้นต้องไม่กลายเป็น 0', () => {
  // canvas ที่กว้างหรือสูงเป็น 0 ถูกปฏิเสธด้วย error ที่อ่านไม่ออกว่าเกี่ยวกับอะไร
  const thin = fitWithin(20_000, 3)
  assert.equal(thin.width, MAX_EDGE)
  assert.ok(thin.height >= 1, 'ด้านสั้นต้องเหลืออย่างน้อย 1px')
})

// ---- ป้ายในประวัติ ---------------------------------------------------------

test('ประวัติเก็บป้าย ไม่ใช่ตัวรูป', () => {
  assert.equal(imageHistoryLine('ส่งวันศุกร์'), `${IMAGE_PLACEHOLDER} ส่งวันศุกร์`)
  // แนบรูปเปล่า ๆ โดยไม่พิมพ์อะไรคือการใช้งานปกติ — ต้องไม่เหลือช่องว่างห้อยท้าย
  assert.equal(imageHistoryLine(''), IMAGE_PLACEHOLDER)
  assert.equal(imageHistoryLine('   '), IMAGE_PLACEHOLDER)
})

test('อ่านย้อนได้ว่าประโยคไหนเคยมีรูป และข้อความจริงคืออะไร', () => {
  /*
   * ทั้งฟองบนจอและ prompt ข้อ 12 พึ่งป้ายนี้ตัวเดียวกัน — ฝั่งจอใช้ตัดสินว่าจะ
   * ติดป้าย "รูปที่ส่งไป" ไหม ส่วนโมเดลใช้รู้ว่ามีรูปที่**มันมองไม่เห็นแล้ว**
   */
  const line = imageHistoryLine('ตารางสอบ')
  assert.equal(hadImage(line), true)
  assert.equal(withoutImageMark(line), 'ตารางสอบ')

  assert.equal(hadImage('พรุ่งนี้ติดอะไร'), false)
  assert.equal(withoutImageMark('พรุ่งนี้ติดอะไร'), 'พรุ่งนี้ติดอะไร')
  assert.equal(withoutImageMark(IMAGE_PLACEHOLDER), '')
})

// ---- รูปที่ยังอยู่บนจอให้ทานเทียบกับการ์ด --------------------------------

test('เก็บรูปล่าสุดไว้ตามเพดาน · ที่เกินต้องถูกคืนทิ้ง', () => {
  /*
   * รูปที่ส่งไปแล้วยังอยู่ให้ทานเทียบกับการ์ด (เจ้าของขอ 8 ก.ย. 2026)
   * แต่มันคือ blob ในหน่วยความจำของแท็บจริง ๆ — **การลืมคืนคือหน่วยความจำที่รั่ว
   * แบบไม่มีอะไรฟ้อง** จนแท็บบนมือถือโดนเบราว์เซอร์ฆ่าแล้วผู้ใช้อ่านว่า "แอปเด้ง"
   */
  assert.deepEqual(shotsToRevoke(['a', 'b', 'c'], 3), [])
  assert.deepEqual(shotsToRevoke(['a', 'b', 'c', 'd'], 3), ['a'])
  assert.deepEqual(shotsToRevoke(['a', 'b', 'c', 'd', 'e'], 3), ['a', 'b'])
})

test('ยังไม่ถึงเพดาน ไม่คืนอะไรเลย', () => {
  assert.deepEqual(shotsToRevoke([], 3), [])
  assert.deepEqual(shotsToRevoke(['a'], 3), [])
})

test('เพดานเป็นศูนย์ = ไม่เก็บรูปไว้เลยสักใบ', () => {
  // ทางถอยถ้าวันหนึ่งเจอว่าเปลืองหน่วยความจำเกินไป — ตั้ง KEEP_SHOTS เป็น 0
  // แล้วพฤติกรรมกลับไปเป็นแบบเดิมทั้งหมด โดยไม่ต้องรื้อโค้ดส่วนอื่น
  assert.deepEqual(shotsToRevoke(['a', 'b'], 0), ['a', 'b'])
})

test('ป้ายต้องเป็นสิ่งที่ผู้ใช้พิมพ์เองได้ยาก', () => {
  // เหตุผลเดียวกับ `- voice -` — วงเล็บเหลี่ยมทำให้อ่านออกว่าเป็นที่ว่างแทนของจริง
  // ไม่ใช่คำที่ใครพิมพ์มา · และถ้าวันหนึ่งเปลี่ยนค่านี้ ต้องแก้กติกาข้อ 12 ตามด้วย
  assert.equal(IMAGE_PLACEHOLDER, '[รูป]')
})
