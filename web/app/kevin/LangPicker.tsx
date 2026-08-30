'use client'

import { useState } from 'react'
import { LANG_LABEL, type Lang, type LangPrefs } from '@/lib/ai/lang'
import { setLang } from '@/lib/langPrefs'

/**
 * ตั้งค่าภาษา — แยก "ภาษาที่เราพูด" ออกจาก "ภาษาที่ KeviN ตอบ"
 *
 * แยกสองค่าเพราะสองอย่างนี้ไม่จำเป็นต้องเหมือนกัน — พูดไทยแล้วให้มันตอบอังกฤษ
 * เป็นการฝึกฟังที่ใช้ได้จริง ส่วนบังคับให้เลือกภาษาเดียวทั้งบทสนทนาปิดทางนั้นไปเลย
 *
 * ยุบไว้เป็นบรรทัดเดียวโดยตั้งใจ · บนจอ 360px พื้นที่เหนือสายข้อความมีค่ามาก
 * และเป็นของที่ตั้งครั้งเดียวแล้วแทบไม่แตะอีก ไม่ควรกินที่ถาวร
 */
export default function LangPicker({ langs, locked }: { langs: LangPrefs; locked: boolean }) {
  const [open, setOpen] = useState(false)

  const summary = `พูด${LANG_LABEL[langs.input]} · ตอบ${LANG_LABEL[langs.reply]}`

  return (
    <div className="lang">
      <button
        className="lang__toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        ภาษา · {summary}
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="lang__body">
          <Row
            label="ภาษาที่คุณพูด"
            value={langs.input}
            onPick={(v) => setLang('input', v)}
            locked={locked}
          />
          <Row
            label="ภาษาที่ KeviN ตอบ"
            value={langs.reply}
            onPick={(v) => setLang('reply', v)}
            locked={locked}
          />

          {locked ? (
            /* setup ของ Live API แก้กลางสายไม่ได้ ภาษาจึงถูกล็อกไปกับ token */
            <p className="lang__note">วางสายก่อนถึงจะเปลี่ยนภาษาได้</p>
          ) : (
            <p className="lang__note">
              เป็นการสั่งโมเดล ไม่ใช่การล็อกที่ระบบ — ถ้ายังหลุดเป็นภาษาอื่น บอกได้
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({
  label, value, onPick, locked,
}: {
  label: string
  value: Lang
  onPick: (v: Lang) => void
  locked: boolean
}) {
  return (
    <div className="lang__row">
      <span className="lang__label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {(['th', 'en'] as const).map((l) => (
          <button
            key={l}
            data-on={value === l}
            disabled={locked}
            onClick={() => onPick(l)}
          >
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>
    </div>
  )
}
