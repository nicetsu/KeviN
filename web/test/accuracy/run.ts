/**
 * ตัววัดความแม่นของผู้ช่วยหลังเปิดให้ "เสนอการแก้ข้อมูล" ได้
 *
 * ⚠️ **ยิงโมเดลจริงและกินโควตา** — ไม่ได้อยู่ใน `npm test` โดยตั้งใจ
 *
 * ```
 * npx tsc -p tsconfig.test.json
 * node --env-file=.env.local .test-build/test/accuracy/run.js          # ทั้งสองโหมด
 * node --env-file=.env.local .test-build/test/accuracy/run.js chat     # แชตอย่างเดียว
 * node --env-file=.env.local .test-build/test/accuracy/run.js voice    # โทรอย่างเดียว
 * ```
 */
import { CASES, VOICE_IDS, globalProblems } from './cases'
import { askChat } from './chat'
import { VoiceProbe } from './voice'
import { report, type Result } from './harness'
import { TODAY } from './fixtures'

const which = process.argv[2] ?? 'both'
/** เลือกเฉพาะบางข้อได้ เช่น `run.js chat 05,13` — ไว้ยิงซ้ำจุดที่สงสัยโดยไม่เผาโควตา */
const only = (process.argv[3] ?? '').split(',').filter(Boolean)
const pick = (ids: string[]) => (only.length ? ids.filter((i) => only.includes(i)) : ids)

async function runChat(): Promise<{ pass: number; total: number }> {
  const results: Result[] = []
  const chosen = CASES.filter((c) => pick(CASES.map((x) => x.id)).includes(c.id))
  for (const [nth, c] of chosen.entries()) {
    /*
     * เว้นจังหวะระหว่างข้อ — เพดานของ free tier เป็น**ต่อนาที** ไม่ใช่ต่อวันอย่างเดียว
     * ยิงรวดเดียวทั้งชุดแล้วครึ่งชุดล้มด้วย 429 ทั้งที่โควตารายวันยังเหลือ (5 ก.ย. 2026)
     * หนึ่งเคสกินหลายรอบ (วน tool) จำนวนคำขอจริงจึงมากกว่าจำนวนเคสหลายเท่า
     */
    if (nth > 0) await new Promise((r) => setTimeout(r, 6_000))
    process.stderr.write(`  แชต [${c.id}] …${c.image ? ' (มีรูป)' : ''}\n`)
    // รูปถูกสร้างตอนนี้ ไม่ใช่ตอนประกาศเคส — ข้อที่ไม่ได้เลือกจะไม่เสียเวลาเรนเดอร์
    const turn = await askChat(c.say, c.then, c.image ? await c.image() : undefined)
    const problems = turn.error ? [`ล้ม: ${turn.error}`] : [...c.check(turn), ...globalProblems(turn)]
    results.push({ case: c, turn, problems })
  }
  return report('โหมดแชต · gemini-3.1-flash-lite', results)
}

async function runVoice(): Promise<{ pass: number; total: number }> {
  const picked = CASES.filter((c) => pick([...VOICE_IDS]).includes(c.id))
  const probe = new VoiceProbe()
  await probe.open()

  const results: Result[] = []
  try {
    for (const c of picked) {
      process.stderr.write(`  โทร [${c.id}] …\n`)
      // ประโยคเดียวกันแต่ถอดเครื่องหมายวรรคตอนออก — ให้เหมือนสิ่งที่ ASR ส่งเข้ามาจริง
      const asHeard = (s: string) => s.replace(/[,·]/g, ' ').replace(/\s+/g, ' ').trim()
      const heard = asHeard(c.say)
      let turn = await probe.say(heard)

      // เคสสองเทิร์น: ร่างค้างเดินทางต่อ · `calls` รวมของทั้งสองเทิร์นไว้ให้ตรวจได้
      if (c.then && !turn.error) {
        const before = turn.calls
        const next = await probe.say(asHeard(c.then), turn.drafts)
        turn = { ...next, calls: [...before, ...next.calls] }
      }

      const problems = turn.error ? [`ล้ม: ${turn.error}`] : [...c.check(turn), ...globalProblems(turn)]
      results.push({ case: { ...c, say: heard }, turn, problems })
    }
  } finally {
    probe.close()
  }
  return report('โหมดโทร · Live API (ป้อนเป็นข้อความ)', results)
}

async function main() {
  console.log(`วันนี้ของชุดทดสอบ: ${TODAY} (ศุกร์) · ข้อมูลเป็นชุดปลอมที่ตรึงไว้`)

  const totals: { label: string; pass: number; total: number }[] = []
  if (which === 'both' || which === 'chat') totals.push({ label: 'แชต', ...(await runChat()) })
  if (which === 'both' || which === 'voice') totals.push({ label: 'โทร', ...(await runVoice()) })

  console.log(`\n${'═'.repeat(72)}`)
  for (const t of totals) console.log(`  ${t.label}: ${t.pass}/${t.total}`)
  console.log('═'.repeat(72))
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
