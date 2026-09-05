import Link from 'next/link'
import { Content } from '@/components/Reveal'
import { conversationList, type ConversationSummary } from '@/lib/chat/store'
import { bangkokTime, thaiDateLabel } from '@/lib/time'

export const dynamic = 'force-dynamic'

/**
 * ประวัติการคุยย้อนหลัง
 *
 * ก่อนหน้านี้บทสนทนาถูกเก็บลง DB ครบทุกคำแต่**ไม่มีหน้าไหนมองเห็นมันเลย** —
 * มีแต่บทสนทนาล่าสุดที่ไหลอยู่ในห้องคุย กับปุ่มล้างประวัติในหน้าตั้งค่า
 * ซึ่งลบถาวรทันที · ผู้ใช้จึงกดลบของที่ไม่เคยเห็นว่ามีอะไรอยู่ (ARCHITECTURE.md §11)
 *
 * ⚠️ **อ่านอย่างเดียว ไม่มีการ์ดร่างในหน้านี้** — ร่างมีอายุแค่หน้าจอตอนนั้น
 *    ถ้าประวัติย้อนหลังมีปุ่มยืนยัน ผู้ใช้จะยืนยันของที่บริบทหมดอายุไปนานแล้ว
 *    (ARCHITECTURE.md §7) · ร่างไม่เคยถูกบันทึกลง DB อยู่แล้ว ตรงนี้จึงไม่มีอะไรให้พลาด
 */
function stamp(iso: string) {
  const key = new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
  return `${thaiDateLabel(key)} · ${bangkokTime(iso)}`
}

function Row({ c }: { c: ConversationSummary }) {
  return (
    <Link className="hrow" href={`/kevin/history/${c.id}`}>
      <span className={`hrow__via hrow__via--${c.startedVia}`}>
        {c.startedVia === 'voice' ? 'โทร' : 'แชต'}
      </span>
      <span className="hrow__body">
        <strong className="hrow__title">
          {c.preview || 'บทสนทนาด้วยเสียง'}
        </strong>
        <span className="hrow__meta">
          {stamp(c.startedAt)} · {c.count} ข้อความ
        </span>
      </span>
    </Link>
  )
}

export default async function HistoryPage() {
  let rows: ConversationSummary[] = []
  let loadError: string | null = null

  try {
    rows = await conversationList()
  } catch (e) {
    // ไม่ล้มทั้งหน้า — ปุ่มกลับไปห้องคุยยังต้องกดได้แม้รายการจะโหลดไม่ขึ้น
    loadError = e instanceof Error ? e.message : 'โหลดประวัติไม่สำเร็จ'
  }

  return (
    <Content>
      <main className="wrap">
        <div className="page-head">
          <Link href="/kevin" className="back">‹ ห้องคุย</Link>
          <h1>ประวัติการคุย</h1>
          <div className="sub">ทุกบทสนทนาที่ยังไม่ถูกล้าง · ใหม่สุดอยู่บน</div>
        </div>

        {loadError && (
          <p className="alert alert--gap" role="alert">
            โหลดประวัติไม่สำเร็จ · {loadError}
          </p>
        )}

        {!loadError && rows.length === 0 && (
          <p className="muted">ยังไม่เคยคุยกันเลย · กลับไปที่ห้องคุยแล้วเริ่มได้เลย</p>
        )}

        <div className="hlist">
          {rows.map((c) => (
            <Row key={c.id} c={c} />
          ))}
        </div>

        {rows.length > 0 && (
          <p className="muted hnote">
            สิ่งที่พูดระหว่างสายไม่ถูกบันทึก เก็บเฉพาะที่ KeviN ตอบ
            <br />
            ล้างประวัติทั้งหมดได้จากปุ่มฟันเฟืองในห้องคุย · <strong>ลบแล้วไม่มีคลังให้กู้คืน</strong>
          </p>
        )}
      </main>
    </Content>
  )
}
