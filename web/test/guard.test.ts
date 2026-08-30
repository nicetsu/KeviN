/**
 * ด่านที่ยืนแทน "ชั้นกันเขียนที่ 3"
 *
 * ดีไซน์เดิมวางไว้ว่าชั้นที่สามจะเป็น role ที่ Postgres ปฏิเสธการเขียนเอง
 * **แต่ทำแล้วจะเก็บภาษีทุก migration ในอนาคต** — ตารางใหม่ต้องเพิ่ม policy
 * ให้ role นั้นทุกครั้ง ลืมเมื่อไหร่ผู้ช่วยจะมองไม่เห็นตารางนั้นแบบเงียบ ๆ
 * ซึ่งเป็นความพังแบบเดียวกับที่โปรเจกต์นี้พยายามหลีกเลี่ยงที่สุด
 *
 * เคสที่กลัวจริง ๆ คือ "อนาคตมีคนเผลอเติมทางเขียนเข้าไปในชั้น tool"
 * ไฟล์นี้จับเคสนั้นตรง ๆ โดยไม่ต้องพึ่งคนรีวิว และไม่มีอะไรต้องดูแลเพิ่ม
 *
 * เทสต์ที่นี่อ่านซอร์สจริง ไม่ได้รันโค้ด — จึงจับได้แม้ทางที่เขียนนั้นยังไม่ถูกเรียก
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const AI_DIR = join(process.cwd(), 'lib', 'ai')

/** ไฟล์เดียวที่ได้รับอนุญาตให้แตะ Supabase client ตัวจริง */
const ADAPTER = 'supabaseDb.ts'

const sources = () =>
  readdirSync(AI_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, text: readFileSync(join(AI_DIR, f), 'utf8') }))

/** ตัดคอมเมนต์ทิ้งก่อนตรวจ — คอมเมนต์พูดถึงคำว่า insert ได้ แต่โค้ดห้าม */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
}

test('มีไฟล์ให้ตรวจจริง — กันเคสที่ path เพี้ยนแล้วเทสต์ผ่านฟรี', () => {
  const files = sources().map((s) => s.file)
  assert.ok(files.length >= 4, `เจอแค่ ${files.length} ไฟล์ใน lib/ai`)
  assert.ok(files.includes('tools.ts'))
  assert.ok(files.includes(ADAPTER))
})

test('มีแค่ตัวแปลงไฟล์เดียวที่ import Supabase client ตัวจริง', () => {
  // client ตัวจริงมี .insert() ติดมาด้วยเสมอ · ใครก็ตามที่ถือมันเขียนข้อมูลได้
  for (const { file, text } of sources()) {
    if (file === ADAPTER) continue
    const imports = /from\s+['"]@\/lib\/supabase\/[^'"]+['"]/.test(codeOnly(text))
    assert.equal(imports, false, `${file} ไม่ควร import Supabase client ตรง ๆ`)
  }
})

test('ไม่มีคำสั่งเขียนข้อมูลในชั้น tool เลย', () => {
  const writes = [/\.insert\s*\(/, /\.update\s*\(/, /\.delete\s*\(/, /\.upsert\s*\(/]
  for (const { file, text } of sources()) {
    const code = codeOnly(text)
    for (const re of writes) {
      assert.equal(re.test(code), false, `${file} มีคำสั่งเขียน ${re.source}`)
    }
  }
})

test('รายชื่อฟังก์ชัน DB ที่เรียกได้เป็นรายการปิด และเป็นตัวอ่านทั้งหมด', () => {
  // เพิ่มชื่อใหม่ต้องมาแก้ที่ ReadableRpc ก่อน ซึ่งเป็นจุดที่คนอ่านโค้ดจะสะดุด
  const db = readFileSync(join(AI_DIR, 'db.ts'), 'utf8')
  const m = db.match(/export type ReadableRpc\s*=\s*([^\n]+)/)
  assert.ok(m, 'หา ReadableRpc ไม่เจอ')
  const names = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  assert.ok(names.length > 0)
  for (const n of names) {
    assert.equal(/claim|insert|update|delete|set|write/i.test(n), false, `${n} ฟังดูเหมือนเขียนข้อมูล`)
  }
  // claim_due_reminders เป็น security definer ที่ข้าม RLS — ห้ามหลุดเข้ามาเด็ดขาด
  assert.equal(names.includes('claim_due_reminders'), false)
})

test('interface ของ DB ไม่มีเมธอดเขียนอยู่ในนิยาม', () => {
  const db = codeOnly(readFileSync(join(AI_DIR, 'db.ts'), 'utf8'))
  const body = db.slice(db.indexOf('export type ReadOnlyDb'))
  for (const verb of ['insert', 'update', 'delete', 'upsert']) {
    assert.equal(body.includes(verb), false, `ReadOnlyDb มีเมธอด ${verb}`)
  }
})

test('ตัวแปลงเองก็ต้องไม่มีคำสั่งเขียน แม้จะถือ client ตัวจริงอยู่', () => {
  const code = codeOnly(readFileSync(join(AI_DIR, ADAPTER), 'utf8'))
  for (const verb of ['insert', 'update', 'delete', 'upsert']) {
    assert.equal(code.includes(verb), false, `${ADAPTER} มีคำว่า ${verb} ในโค้ด`)
  }
})
