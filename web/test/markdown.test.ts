/**
 * lib/chat/markdown.ts — แกะ markdown ที่ผู้ช่วยเขียนมา
 *
 * ตัวแกะที่เขียนเองพังได้สองทาง และทั้งสองทางไม่มี error ให้เห็น:
 * เครื่องหมายโผล่บนจอเป็นตัวดิบ หรือข้อความหายไปพร้อมกับเครื่องหมาย
 * เคสส่วนใหญ่ที่นี่จึงตรวจว่า **ตัวอักษรทุกตัวยังอยู่ครบ**
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBlocks, tokenize, type Token } from '../lib/chat/markdown'

/** ดึงข้อความล้วนออกจาก token — ใช้ยืนยันว่าไม่มีตัวอักษรหายระหว่างทาง */
function plain(tokens: readonly Token[]): string {
  return tokens
    .map((t) => {
      switch (t.kind) {
        case 'text':
          return t.text
        case 'code':
          return t.text
        case 'link':
          return t.label
        default:
          return plain(t.children)
      }
    })
    .join('')
}

// ---- inline ----

test('ตัวหนา', () => {
  const t = tokenize('พรุ่งนี้ **09:00–12:00** ที่ E11-S601')
  assert.equal(plain(t), 'พรุ่งนี้ 09:00–12:00 ที่ E11-S601')
  assert.ok(t.some((x) => x.kind === 'strong'))
})

test('ตัวหนาที่มีทวิภาคอยู่ข้างใน — เคสที่เจ้าของเจอจริง', () => {
  // ของจริงบนจอคือ `**09:00–12:00:**` ซึ่งโผล่เป็นดาวดิบทั้งชุด
  const t = tokenize('- **09:00–12:00:** กระบวนการพัฒนาซอฟต์แวร์')
  assert.equal(plain(t).includes('**'), false, 'ดาวต้องไม่เหลือ')
  assert.ok(plain(t).includes('09:00–12:00:'))
})

test('ตัวหนามาก่อนตัวเอียง ไม่งั้นดาวจะเหลือค้าง', () => {
  const t = tokenize('**หนา** กับ *เอียง*')
  assert.equal(plain(t), 'หนา กับ เอียง')
  assert.ok(t.some((x) => x.kind === 'strong'))
  assert.ok(t.some((x) => x.kind === 'em'))
})

test('โค้ดไม่ถูกตีความต่อ', () => {
  const t = tokenize('พิมพ์ `**ไม่ใช่ตัวหนา**` ได้')
  const code = t.find((x) => x.kind === 'code')
  assert.equal(code?.kind === 'code' && code.text, '**ไม่ใช่ตัวหนา**')
})

test('ดาวเดี่ยวที่ไม่ได้ปิดคู่ยังเป็นข้อความเดิม', () => {
  // ผู้ช่วยพิมพ์ดาวลอย ๆ ได้ ห้ามกลืนหายไป
  assert.equal(plain(tokenize('2 * 3 = 6')), '2 * 3 = 6')
  assert.equal(plain(tokenize('เหลือ **ครึ่ง')), 'เหลือ **ครึ่ง')
})

test('ลิงก์แบบ markdown', () => {
  const t = tokenize('แก้ได้ที่ [หน้าคลัง](/library)')
  const link = t.find((x) => x.kind === 'link')
  assert.equal(link?.kind === 'link' && link.href, '/library')
  assert.equal(link?.kind === 'link' && link.label, 'หน้าคลัง')
})

test('เส้นทางที่เขียนโดด ๆ กลายเป็นลิงก์', () => {
  const t = tokenize('เข้าไปที่ /library ได้เลย')
  assert.ok(t.some((x) => x.kind === 'link' && x.href === '/library'))
})

test('จุดท้ายประโยคไม่ติดไปกับลิงก์', () => {
  const t = tokenize('ดูที่ /calendar.')
  const link = t.find((x) => x.kind === 'link')
  assert.equal(link?.kind === 'link' && link.href, '/calendar')
  assert.equal(plain(t), 'ดูที่ /calendar.')
})

test('เศษวันที่ที่มีทับไม่ถูกจับเป็นลิงก์', () => {
  // "1/9" ต้องไม่กลายเป็นเส้นทาง
  assert.equal(tokenize('ส่ง 1/9 นะ').some((x) => x.kind === 'link'), false)
})

// ---- block ----

test('รายการหัวข้อย่อยติดกันรวมเป็นก้อนเดียว', () => {
  const b = parseBlocks('- อันแรก\n- อันสอง\n- อันสาม')
  assert.equal(b.length, 1)
  assert.equal(b[0].kind === 'list' && b[0].items.length, 3)
  assert.equal(b[0].kind === 'list' && b[0].ordered, false)
})

test('รายการมีเลขแยกจากรายการหัวข้อย่อย', () => {
  const b = parseBlocks('- ก\n1. ข')
  assert.equal(b.length, 2)
  assert.equal(b[0].kind === 'list' && b[0].ordered, false)
  assert.equal(b[1].kind === 'list' && b[1].ordered, true)
})

test('ขีดสามแบบนับเป็นหัวข้อย่อยเหมือนกัน', () => {
  // โมเดลสลับใช้ทั้งสามแบบในคำตอบเดียวกันได้
  for (const mark of ['-', '*', '•']) {
    const b = parseBlocks(`${mark} รายการ`)
    assert.equal(b[0].kind, 'list', `${mark} ต้องเป็นรายการ`)
  }
})

test('บรรทัดว่างปิดย่อหน้า', () => {
  const b = parseBlocks('ย่อหน้าแรก\n\nย่อหน้าสอง')
  assert.equal(b.length, 2)
  assert.equal(b[0].kind, 'p')
  assert.equal(b[1].kind, 'p')
})

test('บรรทัดต่อกันอยู่ในย่อหน้าเดียว แต่แยกบรรทัด', () => {
  const b = parseBlocks('บรรทัดแรก\nบรรทัดสอง')
  assert.equal(b.length, 1)
  assert.equal(b[0].kind === 'p' && b[0].lines.length, 2)
})

test('บรรทัดว่างซ้อนกันไม่สร้างย่อหน้าเปล่า', () => {
  const b = parseBlocks('ก\n\n\n\nข')
  assert.equal(b.length, 2)
})

test('ข้อความว่างได้รายการว่าง ไม่ใช่ย่อหน้าเปล่า', () => {
  assert.deepEqual(parseBlocks(''), [])
  assert.deepEqual(parseBlocks('\n\n'), [])
})

test('หัวข้อ', () => {
  const b = parseBlocks('## พรุ่งนี้\nมีสองวิชา')
  assert.equal(b[0].kind, 'h')
  assert.equal(b[0].kind === 'h' && b[0].level, 2)
  assert.equal(b[1].kind, 'p')
})

test('ชั้นลึกกว่าสามยุบลงมาที่สาม — ฟองแชตไม่มีที่ให้ไล่หกชั้น', () => {
  const b = parseBlocks('###### ลึกมาก')
  assert.equal(b[0].kind === 'h' && b[0].level, 3)
})

test('คำตอบจริงที่เจ้าของเจอ แกะแล้วต้องไม่เหลือเครื่องหมายดิบ', () => {
  const answer = [
    'พรุ่งนี้ (1 ก.ย.) มีเรียน 2 วิชาครับ:',
    '',
    '- **09:00–12:00:** กระบวนการพัฒนาซอฟต์แวร์เชิงเดี่ยว (ปฏิบัติ) ที่ E11-S601',
    '- **13:00–15:00:** คณิตศาสตร์เต็มหน่วยและพีชคณิตเชิงเส้น (บรรยาย) ที่ E11-S603',
  ].join('\n')

  const b = parseBlocks(answer)
  assert.equal(b.length, 2)
  assert.equal(b[0].kind, 'p')
  assert.equal(b[1].kind === 'list' && b[1].items.length, 2)

  const text = b
    .map((x) =>
      x.kind === 'p'
        ? x.lines.map(plain).join(' ')
        : x.kind === 'list'
          ? x.items.map(plain).join(' ')
          : plain(x.tokens)
    )
    .join(' ')
  assert.equal(text.includes('**'), false)
  assert.ok(text.includes('E11-S603'))
})
