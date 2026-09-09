/**
 * ด่านกัน "ค่าคงที่ในโค้ดที่ผูกกับชื่อ Area"
 *
 * ผู้ใช้เปลี่ยนชื่อ Area เองได้ตั้งแต่ 8 ก.ย. 2026 · โค้ดที่ตัดสินอะไรก็ตาม
 * จากชื่อ Area จึงพังทันทีที่มีคนเปลี่ยนชื่อ **โดยไม่มี error สักบรรทัด**
 * มันแค่แสดงผลผิดหรือมองไม่เห็นข้อมูลเฉย ๆ
 *
 * เคยเกิดมาแล้วสองครั้งด้วยกลไกเดียวกันเป๊ะ
 *   1. `VISIBLE_AREAS` ผูกกับชื่อ → ผู้ช่วยตาบอดทั้งด้าน (ถอดทั้งกลไก 8 ก.ย. 2026)
 *   2. ป้าย "วิชา"/"โปรเจกต์" จาก `area.name === 'Class'` (แก้ 9 ก.ย. 2026)
 *
 * ไฟล์นี้อ่านซอร์สจริงเหมือน `guard.test.ts` ไม่ได้รันโค้ด — จึงจับได้ตั้งแต่
 * ตอนที่ใครเผลอเขียนเข้ามาใหม่ ก่อนที่จะมีใครไปเปลี่ยนชื่อจริง
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** ชื่อ Area ที่ `handle_new_user()` seed ให้ผู้ใช้ใหม่ทุกคน */
const SEED_AREAS = ['Class', 'Competition', 'Personal', 'General']

const ROOTS = ['app', 'components', 'lib']

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) out.push(p)
  }
  return out
}

/** ตัดคอมเมนต์ทิ้งก่อนตรวจ — คอมเมนต์เล่าประวัติของบั๊กนี้ได้ แต่โค้ดห้ามทำ */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
}

const sources = () =>
  ROOTS.flatMap((r) => walk(join(process.cwd(), r))).map((f) => ({
    file: f.slice(process.cwd().length + 1).replace(/\\/g, '/'),
    text: readFileSync(f, 'utf8'),
  }))

test('มีไฟล์ให้ตรวจจริง — กันเคสที่ path เพี้ยนแล้วเทสต์ผ่านฟรี', () => {
  const files = sources().map((s) => s.file)
  assert.ok(files.length >= 40, `เจอแค่ ${files.length} ไฟล์`)
  assert.ok(files.includes('app/library/page.tsx'))
  assert.ok(files.includes('app/library/[areaId]/ProjectTree.tsx'))
})

test('ไม่มีที่ไหนเทียบค่ากับชื่อ Area ตั้งต้น', () => {
  for (const { file, text } of sources()) {
    const code = codeOnly(text)
    for (const name of SEED_AREAS) {
      // ทั้งการเทียบตรง ๆ และการยัดเป็นค่าใน query (`.eq('name', 'Class')`)
      const quoted = new RegExp(`['"\`]${name}['"\`]`)
      assert.equal(
        quoted.test(code),
        false,
        `${file} อ้างชื่อ Area "${name}" ตรง ๆ — ผู้ใช้เปลี่ยนชื่อแล้วจะพังเงียบ ๆ`,
      )
    }
  }
})

test('ป้ายในหน้าคลังไม่ได้มาจากชื่อ Area', () => {
  const files = sources()
  const library = files.filter((s) => s.file.startsWith('app/library/'))
  assert.ok(library.length >= 4)
  for (const { file, text } of library) {
    // รูปทั่วไปของบั๊กเดิม: ตัดสินคำที่จะโชว์จากฟิลด์ `name` ของ Area
    assert.equal(
      /area\.name\s*[=!]==/.test(codeOnly(text)),
      false,
      `${file} ตัดสินอะไรบางอย่างจาก area.name`,
    )
  }
})
