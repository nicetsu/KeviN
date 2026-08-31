'use client'

import Link from 'next/link'
import { LANG_LABEL } from '@/lib/ai/lang'
import { VOICES } from '@/lib/ai/voices'
import { useTalkPrefs } from '@/lib/talkPrefs'
import { useMic, useMicList } from '@/lib/voice/micStore'
import { resolveMic } from '@/lib/voice/mic'

/**
 * สรุปค่าที่ตั้งไว้สำหรับการคุยกับ KeviN · แสดงในหน้าตั้งค่า
 *
 * ⚠️ **ไม่ได้ย้ายตัวตั้งค่ามาที่นี่** — ทั้งภาษา เสียง และไมโครโฟนปรับที่แผง
 *    ตั้งค่าการคุยในหน้า KeviN ที่เดียว เพราะเป็นของที่อยากปรับตอนกำลังจะคุย
 *    ที่นี่เป็น**ที่ที่สอง**ที่หาเจอ — หน้าที่ชื่อ "ตั้งค่า" ควรบอกได้ว่าตั้งอะไรไว้บ้าง
 *
 *    ที่นี่เป็น**ที่ที่สอง**ที่หาเจอ — หน้าที่ชื่อ "ตั้งค่า" ควรบอกได้ว่า
 *    ตอนนี้ตั้งอะไรไว้บ้าง แม้จะไม่ใช่ที่ที่ใช้ปรับบ่อยที่สุด
 *
 * ทั้งสองที่อ่านจาก `localStorage` ก้อนเดียวกัน จึงไม่มีทางไม่ตรงกัน
 */
export default function TalkSummary() {
  const prefs = useTalkPrefs()
  const chosenMic = useMic()
  const mics = useMicList()

  const voice = VOICES.find((v) => v.id === prefs.voice)
  const mic = mics.find((m) => m.id === resolveMic(chosenMic, mics))

  const rows = [
    { label: 'ภาษา', value: LANG_LABEL[prefs.lang] },
    { label: 'เสียง', value: voice ? `${voice.label}${voice.desc ? ` · ${voice.desc}` : ''}` : '—' },
  ]

  return (
    <>
      {rows.map((r) => (
        <div className="row" key={r.label}>
          <span className="row__stripe" style={{ background: 'var(--brand)' }} />
          <div className="row__body">
            <div className="row__title">{r.label}</div>
            <div className="row__meta">{r.value}</div>
          </div>
        </div>
      ))}

      <div className="row">
        <span className="row__stripe" style={{ background: 'var(--brand)' }} />
        <div className="row__body">
          <div className="row__title">ไมโครโฟน</div>
          <div className="row__meta">{mic?.label ?? 'อัตโนมัติ'}</div>
        </div>
      </div>

      <Link href="/kevin" className="back" style={{ marginTop: '0.5rem' }}>
        ปรับที่หน้า KeviN ›
      </Link>
    </>
  )
}
