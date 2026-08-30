'use client'

import { useEffect, useRef, useState } from 'react'
import { LANG_LABEL, type Lang } from '@/lib/ai/lang'
import { VOICES } from '@/lib/ai/voices'
import { setPrefs, type TalkPrefs } from '@/lib/talkPrefs'
import { previewVoice } from '@/lib/voice/preview'

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

          <div className="set__label set__label--block">เสียง</div>
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
    </div>
  )
}
