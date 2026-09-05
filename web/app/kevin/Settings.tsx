'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { clearChatHistory } from '@/app/actions/chat'
import { LANG_LABEL, type Lang } from '@/lib/ai/lang'
import { VOICES } from '@/lib/ai/voices'
import { setPrefs, type TalkPrefs } from '@/lib/talkPrefs'
import { previewVoice } from '@/lib/voice/preview'
import MicPicker from './MicPicker'

/**
 * แผงตั้งค่าของหน้า KeviN
 *
 * แยกจากหน้า `/settings` ของแอปโดยตั้งใจ — อันนั้นเป็นเรื่องการแจ้งเตือน
 * ส่วนอันนี้เป็นเรื่องของบทสนทนา ซึ่งเป็นของที่อยากปรับตอนกำลังจะคุยพอดี
 * ไม่ใช่ตอนตั้งค่าเครื่อง
 *
 * ⚠️ ปิดไม่ได้ระหว่างกำลังคุย — ภาษาและเสียงถูกล็อกไปกับ token ตั้งแต่เปิดสาย
 *    เปลี่ยนกลางสายไม่มีผล จึงล็อกปุ่มไว้แทนที่จะให้กดแล้วเงียบ
 */
export default function Settings({
  prefs,
  locked,
  onClose,
}: {
  prefs: TalkPrefs
  locked: boolean
  onClose: () => void
}) {
  const [playing, setPlaying] = useState<Lang | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancel = useRef<(() => void) | null>(null)

  /* แผงเสียงเป็นชั้นที่สอง — รายการเก้าเสียงกับปุ่มฟังยาวเกินกว่าจะอยู่ในแผงแรก */
  const [voiceOpen, setVoiceOpen] = useState(false)

  /*
   * ⚠️ `armed` คือชั้นกันพลาดชั้นเดียวของการลบถาวร — แตะครั้งแรกแค่ถาม
   *    แตะซ้ำถึงลบจริง · **ไม่มีทางกู้คืนหลังจากนั้น** จึงห้ามถอดออก
   *    state ตายไปพร้อมการปิดแผง ซึ่งถูกแล้ว — เปิดใหม่ต้องเริ่มถามใหม่
   */
  const [armed, setArmed] = useState(false)
  const [cleared, setCleared] = useState<number | null>(null)
  const [pending, startClear] = useTransition()
  const router = useRouter()

  const voice = VOICES.find((v) => v.id === prefs.voice)

  // หยุดเสียงที่ค้างอยู่เมื่อปิดแผง — ไม่งั้นเสียงเล่นต่อทั้งที่ปิดไปแล้ว
  useEffect(() => () => cancel.current?.(), [])

  function listen(lang: Lang) {
    cancel.current?.()
    setError(null)
    setPlaying(lang)
    cancel.current = previewVoice(lang, prefs.voice, (err) => {
      setPlaying(null)
      if (err) setError(err)
    })
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="ตั้งค่าการคุย">
      <div className="sheet__panel">
        <div className="sheet__head">
          <strong>ตั้งค่าการคุย</strong>
          <button className="linkbtn" onClick={onClose}>ปิด</button>
        </div>

        {locked && (
          <p className="alert alert--gap" role="status">
            วางสายก่อนถึงจะเปลี่ยนได้ — ภาษาและเสียงถูกล็อกไว้ตั้งแต่เปิดสาย
          </p>
        )}

        <div className="set">
          <div className="set__row">
            <span className="set__label">ภาษา</span>
            <div className="seg" role="group" aria-label="ภาษา">
              {(['th', 'en'] as const).map((l) => (
                <button
                  key={l}
                  data-on={prefs.lang === l}
                  disabled={locked}
                  onClick={() => setPrefs({ lang: l })}
                >
                  {LANG_LABEL[l]}
                </button>
              ))}
            </div>
          </div>

          {/*
            ⚠️ ไม่มี `disabled={locked}` โดยตั้งใจ — ไมค์สลับกลางสายได้
               ต่างจากภาษากับเสียงที่ล็อกไปกับ token ตั้งแต่เปิดสาย
          */}
          <div className="set__row">
            <span className="set__label">ไมโครโฟน</span>
            <MicPicker />
          </div>

          {/* เสียงย้ายไปแผงที่สอง — เหลือแค่ชื่อที่เลือกอยู่กับทางเข้า */}
          <div className="set__row">
            <span className="set__label">เสียง</span>
            <button
              className="set__go"
              disabled={locked}
              onClick={() => setVoiceOpen(true)}
              aria-haspopup="dialog"
            >
              {voice ? voice.label : 'ค่าตั้งต้น'} ›
            </button>
          </div>

          <div className="set__label set__label--block">ประวัติการคุย</div>

          {/*
            ทางเข้าหน้าประวัติต้องอยู่**เหนือ**ปุ่มล้าง — ปุ่มล้างลบถาวรทันที
            ไม่มีคลังให้กู้คืน · การเห็นว่ามีอะไรอยู่ต้องมาก่อนการตัดสินใจลบเสมอ
          */}
          <div className="set__row">
            <span className="set__label">ย้อนดูบทสนทนาเก่า</span>
            <Link className="set__go" href="/kevin/history" onClick={onClose}>
              เปิดหน้าประวัติ ›
            </Link>
          </div>

          {/*
            ⚠️ ลบถาวร ไม่ใช่เก็บเข้าคลัง · ชั้นกันพลาดคือการแตะสองครั้ง
               ข้อความบนปุ่มจึงต้องบอกให้ชัดว่าครั้งที่สองคือจุดที่ย้อนไม่ได้แล้ว
          */}
          <button
            className={`btn btn--quiet set__wipe${armed ? ' set__wipe--armed' : ''}`}
            disabled={pending}
            onClick={() => {
              if (!armed) {
                setArmed(true)
                return
              }
              startClear(async () => {
                const res = await clearChatHistory()
                setArmed(false)
                if (res.ok) {
                  setCleared(res.removed)
                  setError(null)
                  router.refresh()
                } else {
                  setError(res.error)
                }
              })
            }}
          >
            {pending ? 'กำลังลบ…' : armed ? 'แน่ใจนะ · แตะอีกครั้งเพื่อลบถาวร' : 'ล้างประวัติการคุย'}
          </button>

          {cleared !== null && (
            <p className="set__note" role="status">
              {cleared === 0 ? 'ไม่มีบทสนทนาให้ลบ' : `ลบแล้ว ${cleared} บทสนทนา`}
            </p>
          )}

          {error && <p className="alert alert--gap" role="alert">{error}</p>}
        </div>
      </div>

      {voiceOpen && (
        /*
         * แผงที่สอง ซ้อนบนแผงแรก
         * z-index สูงกว่า `.sheet` ปกติ เพราะต้องอยู่เหนือแผงที่เปิดค้างอยู่
         */
        <div className="sheet sheet--over" role="dialog" aria-modal="true" aria-label="เลือกเสียง">
          <div className="sheet__panel">
            <div className="sheet__head">
              <strong>เสียง</strong>
              <button className="linkbtn" onClick={() => setVoiceOpen(false)}>เสร็จ</button>
            </div>

            <div className="voices" role="radiogroup" aria-label="เสียง">
              {VOICES.map((v) => (
                <button
                  key={v.id}
                  role="radio"
                  aria-checked={prefs.voice === v.id}
                  className={`voice${prefs.voice === v.id ? ' voice--on' : ''}`}
                  disabled={locked}
                  onClick={() => setPrefs({ voice: v.id })}
                >
                  <span className="voice__name">{v.label}</span>
                  {v.desc && <span className="voice__desc">{v.desc}</span>}
                </button>
              ))}
            </div>

            {/*
              ฟังจากสาย Live API จริง ไม่ใช่ TTS — เพราะ Live ให้เสียงไม่เหมือน TTS
              กดฟังหนึ่งครั้ง = เปิดสายจริงหนึ่งครั้ง กินโควตาเสียง
              ปุ่มอยู่ในแผงนี้เพราะคู่กับการเลือกเสียง ไม่ใช่ของที่ต้องเห็นตลอด
            */}
            <div className="set__try">
              {(['th', 'en'] as const).map((l) => (
                <button
                  key={l}
                  className="btn btn--quiet"
                  disabled={playing !== null}
                  onClick={() => listen(l)}
                >
                  {playing === l ? 'กำลังเล่น…' : `ฟัง${LANG_LABEL[l]}`}
                </button>
              ))}
            </div>

            {error && <p className="alert alert--gap" role="alert">{error}</p>}

            <p className="set__note">
              การกดฟังเปิดสายจริงหนึ่งครั้ง ใช้โควตาเสียงเหมือนการโทร
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
