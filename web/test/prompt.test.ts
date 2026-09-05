/**
 * lib/ai/prompt.ts — prompt ของประตูแอป
 *
 * เทสต์ที่นี่ไม่ได้ตัดสินว่า prompt เขียนดีไหม แต่กันสองอย่างที่พังเงียบ:
 * รายชื่อวิชาหลุดเข้ามาเป็นสำเนาที่สอง และวันที่ไปอยู่ผิดที่จนแคชไม่ติด
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { systemPrompt } from '../lib/ai/prompt'
import { isRealRoute } from '../lib/chat/links'

const TODAY = '2026-08-30'

test('บอกชัดว่าเสนอได้ แต่บันทึกเองไม่ได้', () => {
  const p = systemPrompt('chat', TODAY)
  // หัวใจของทั้งเรื่อง — ถ้าประโยคนี้หาย โมเดลจะพูดว่า "บันทึกให้แล้ว"
  // ทั้งที่ยังไม่มีอะไรถูกเขียน ซึ่งเป็นคำโกหกที่ผู้ใช้เชื่อทันที
  assert.match(p, /ห้ามพูดว่าบันทึกให้แล้ว/)
  assert.match(p, /propose_/)
})

test('ห้ามกดยืนยันแทนผู้ใช้', () => {
  // ปุ่มบนจอเป็นเส้นแบ่งเดียวระหว่างการเสนอกับการเขียนจริง
  assert.match(systemPrompt('voice', TODAY), /ห้ามกดยืนยันแทนผู้ใช้/)
})

/**
 * สองกฎล่างนี้มาจากการวัดกับโมเดลจริง 4 ก.ย. 2026 (`test/accuracy/`)
 * ไม่ได้มาจากการนั่งคิด — แต่ละข้อคือพฤติกรรมที่เห็นกับตาแล้วว่าผิด
 */
test('ห้ามเลือกวิชาเองเมื่อชื่อตรงหลายอัน — ด่านในโค้ดกันตรงนี้ไม่ได้', () => {
  // `findProject()` โยน "ตรงกับหลายวิชา" เฉพาะตอนโมเดลส่งคำกำกวมมา
  // ถ้ามันเรียก `projects` มาดูแล้วส่งชื่อเต็มของอันที่เลือกเอง ด่านนั้นไม่ทำงานเลย
  // ของจริง: โหมดแชตเดาเอาอันแรกแล้วขึ้นการ์ดทันที
  for (const mode of ['chat', 'voice'] as const) {
    const p = systemPrompt(mode, TODAY)
    assert.match(p, /ห้ามเลือกให้เอง/)
    assert.match(p, /ห้ามเรียก `propose_` ในเทิร์นนั้น/)
    // ⚠️ ต้องมีทางให้ **เดินต่อ** ด้วย ไม่ใช่มีแต่คำสั่งห้าม — ฉบับที่ห้ามอย่างเดียว
    //    ทำให้มันถามทุกครั้งที่ชื่อวิชามีคำร่วมกัน แม้ผู้ใช้พูดชัดแล้ว (เจอ 4 ก.ย. 2026)
    assert.match(p, /มีคำที่โผล่ในชื่อวิชาเดียว/)
  }
})

test('เข้าใจแล้วให้เสนอเลย ไม่ต้องถามก่อนว่าจะให้ร่างไหม', () => {
  // การ์ดคือการถามอยู่แล้ว · ถามก่อนคือถามสองรอบเพื่อสิ่งเดียวกัน
  // ของจริง: โหมดเสียงตอบว่า "เอาแบบนี้ไหมครับ" แทนที่จะขึ้นการ์ดให้ ซึ่งกินเทิร์น
  // ในช่องทางที่เทิร์นแพงที่สุด
  const p = systemPrompt('voice', TODAY)
  assert.match(p, /การ์ดคือการถามอยู่แล้ว/)
  assert.match(p, /propose_archive_item/)
})

test('บอกว่าลบวิชาและแก้ตารางเรียนซ้ำทำไม่ได้', () => {
  const p = systemPrompt('chat', TODAY)
  assert.match(p, /ลบวิชา/)
  assert.match(p, /ซ้ำทุกสัปดาห์/)
})

test('สั่งให้ส่งเวลาไทยเข้า propose ไม่ใช่ UTC', () => {
  // แปลงเองเมื่อไหร่จะเหลื่อม 7 ชั่วโมงแบบเงียบ ๆ — เวลาที่ดูสมเหตุผลแต่ผิดวัน
  assert.match(systemPrompt('chat', TODAY), /ห้ามแปลงเป็น UTC เอง/)
})

test('สั่งห้ามตอบว่าไม่มีอะไรเมื่อ tool ล่ม', () => {
  // กฎข้อที่แพงที่สุดถ้าหายไป
  assert.match(systemPrompt('chat', TODAY), /ห้ามตอบว่าไม่มีอะไร/)
})

test('สั่งให้เคารพสถานะ "ไม่ไป"', () => {
  assert.match(systemPrompt('voice', TODAY), /ไม่ไป/)
})

test('โหมดเสียงกับโหมดแชตมีโทนต่างกัน แต่แกนเดียวกัน', () => {
  const chat = systemPrompt('chat', TODAY)
  const voice = systemPrompt('voice', TODAY)
  assert.notEqual(chat, voice)
  assert.match(voice, /เหมือนคนคุยกันจริง|คนคุยกันจริง/)
  for (const rule of ['ห้ามพูดว่าบันทึกให้แล้ว', 'ห้ามตอบว่าไม่มีอะไร', 'calendar']) {
    assert.ok(chat.includes(rule) && voice.includes(rule), `กฎ "${rule}" ต้องมีทั้งสองโหมด`)
  }
})

test('วันนี้อยู่ท้ายสุด — ส่วนที่เหลือจะได้เป็น prefix ที่แคชได้', () => {
  const p = systemPrompt('chat', TODAY)
  assert.ok(p.trimEnd().endsWith(`วันนี้คือ ${TODAY} (เวลาไทย)`))
})

test('เปลี่ยนวันแล้วต้องต่างกันแค่ท้ายสุด', () => {
  const a = systemPrompt('chat', '2026-08-30')
  const b = systemPrompt('chat', '2026-08-31')
  const head = (s: string) => s.slice(0, s.lastIndexOf('วันนี้คือ'))
  assert.equal(head(a), head(b))
})

test('ไม่มีรายชื่อวิชาฝังอยู่ใน prompt', () => {
  // ถ้าฝังไว้ มันจะเป็นสำเนาที่สองของข้อมูลใน DB แล้วเพี้ยนทันทีที่ขึ้นเทอมใหม่
  // ให้สั่งโมเดลเรียก tool `projects` เอาแทน
  const p = systemPrompt('chat', TODAY)
  for (const name of ['แคลคูลัส', 'ฟิสิกส์', 'UniHack', 'ดิสครีต', 'ลูกทุ่ง']) {
    assert.equal(p.includes(name), false, `เจอชื่อวิชา "${name}" ฝังอยู่`)
  }
  assert.match(p, /projects/)
})

test('สั่งให้บอกจำนวนของที่มองไม่เห็น', () => {
  // ถ้าไม่สั่ง ผู้ช่วยจะตอบว่า "ไม่มีอะไร" ทั้งที่ความจริงคือ "มี แต่ผมดูไม่ได้"
  const p = systemPrompt('chat', TODAY)
  assert.match(p, /hidden/)
  assert.match(p, /ดูไม่ได้/)
  assert.match(p, /ห้ามเดาว่ามันคืออะไร/)
})

test('ห้ามแต่งลิงก์เอง และลิงก์ต้องเป็น path ภายใน', () => {
  // เจอจริงตอนทดสอบ: โมเดลปฏิเสธถูกแล้วแต่ยื่น https://tasks.google.com/ ให้
  const p = systemPrompt('chat', TODAY)
  assert.match(p, /ห้ามแต่งเส้นทางขึ้นเอง/)
  assert.match(p, /ห้ามส่งลิงก์ไปเว็บอื่น/)
  assert.match(p, /ขึ้นต้นด้วย \//)
})

test('บอกหน้าประจำที่ใช้ได้ ไม่ใช่แค่ห้าม', () => {
  // เจอจริงบนมือถือ 31 ส.ค.: ผู้ใช้ถามลอย ๆ ว่า "แก้ข้อมูลได้ไหม"
  // prompt เดิมสั่งว่า "ยื่นลิงก์ให้เลย" แต่ไม่เคยบอกว่ามีหน้าอะไรอยู่บ้าง
  // โมเดลจึงต้องเลือกระหว่างขัดคำสั่งกับแต่งลิงก์ — แล้วมันเลือกแต่ง
  const p = systemPrompt('chat', TODAY)
  for (const route of ['/calendar', '/library', '/settings']) {
    assert.ok(p.includes(route), `prompt ต้องบอกว่า ${route} มีอยู่`)
  }
})

test('ทุกเส้นทางที่ prompt เอ่ยถึงต้องผ่านตัวกรองลิงก์จริง', () => {
  // ผูกสองไฟล์เข้าด้วยกัน — เพิ่มหน้าใน prompt แล้วลืมเติมใน ROUTES
  // จะได้ลิงก์ที่ผู้ช่วยกล้ายื่นแต่ตัวกรองตัดทิ้ง ซึ่งพังแบบเงียบสนิท
  const p = systemPrompt('chat', TODAY)
  // เส้นทางที่ยกมาเป็นตัวอย่างของ "ไม่มีจริง" ไม่นับ — บรรทัดนั้นสอนว่าอะไรผิด
  const kept = p
    .split(/\n/)
    .filter((l) => !l.includes('ไม่มีอยู่จริง'))
    .join(' ')
  const routes = [...kept.matchAll(/(?<![\w/`])(\/[a-z]+)/g)].map((m) => m[1])
  assert.ok(routes.length >= 3, 'ต้องมีเส้นทางถูกอ้างอยู่จริง')
  for (const route of new Set(routes)) {
    assert.ok(isRealRoute(route), `prompt เอ่ยถึง ${route} แต่ตัวกรองไม่รู้จัก`)
  }
})
