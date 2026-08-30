'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { StoredMessage } from '@/lib/chat/store'
import Autolink from '@/lib/autolink'
import VoiceCall from './VoiceCall'
import { useCall } from '@/components/CallProvider'

type Mode = 'chat' | 'voice'

const MODE_KEY = 'kevin.talk.mode'

/**
 * โหมดล่าสุดที่เลือกไว้ — เก็บใน localStorage
 *
 * ใช้ `useSyncExternalStore` ไม่ใช่ effect + setState เพราะ localStorage
 * เป็นแหล่งข้อมูลภายนอกที่ React ควรสมัครรับ · รูปแบบเดียวกับ `components/Hero.tsx`
 * และ `app/settings/NotificationSetup.tsx` ที่แก้ไปแล้วด้วยเหตุผลเดียวกัน
 *
 * ⚠️ **จำโหมดได้ แต่ห้ามจำจนเริ่มโทรเอง** — โหมดโทรมีสถานะนิ่งเป็นค่าตั้งต้นเสมอ
 *    การกลับมาเจอโหมดโทรที่เลือกไว้ ไม่ได้แปลว่าไมค์เปิด (doc/CHAT.md §8)
 */
const modeListeners = new Set<() => void>()

function readMode(): Mode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'voice' ? 'voice' : 'chat'
  } catch {
    return 'chat' // โหมดส่วนตัวหรือปิด storage ไว้ — ไม่ใช่เรื่องคอขาดบาดตาย
  }
}

function subscribeMode(onChange: () => void) {
  modeListeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    modeListeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function writeMode(next: Mode) {
  try { window.localStorage.setItem(MODE_KEY, next) } catch { /* ไม่จำก็ได้ */ }
  for (const listener of modeListeners) listener()
}

/** ฝั่งเซิร์ฟเวอร์ไม่มี localStorage — เริ่มที่แชตซึ่งเป็นโหมดที่ไม่ขอสิทธิ์อะไรเลย */
function useMode(): Mode {
  return useSyncExternalStore(subscribeMode, readMode, () => 'chat')
}

/** ตัวอย่างคำถามที่ระบบตอบได้ดีจริง — สอนขอบเขตโดยไม่ต้องเขียนว่าทำอะไรไม่ได้ */
const STARTERS = [
  'พรุ่งนี้ติดอะไรบ้าง',
  'อาทิตย์นี้มีงานส่งอะไรไหม',
  'คาบว่างยาวสุดของสัปดาห์นี้',
]

type Line = { role: 'user' | 'assistant'; content: string; via: 'chat' | 'voice'; pending?: boolean }

export default function TalkRoom({
  conversationId: initialId,
  initialMessages,
  loadError,
}: {
  conversationId: string | null
  initialMessages: StoredMessage[]
  loadError: string | null
}) {
  const stored = useMode()
  const call = useCall()

  /*
   * โควตาเสียงหมด = **ดันไปโหมดแชตให้เลย** ไม่ใช่แค่ขึ้นข้อความ
   *
   * สองช่องทางใช้คนละรุ่นจึงคนละโควตา · เสียงหมดแล้วแชตยังใช้ได้ปกติ
   * การปล่อยให้ค้างอยู่หน้าโทรที่กดไม่ได้ ไม่ช่วยอะไรเลย (doc/CHAT.md §8)
   */
  const mode: Mode = call.quotaOut ? 'chat' : stored
  const [conversationId, setConversationId] = useState(initialId)
  const [lines, setLines] = useState<Line[]>(
    initialMessages.map((m) => ({ role: m.role, content: m.content, via: m.via }))
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tail = useRef<HTMLDivElement>(null)

  useEffect(() => {
    tail.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [lines.length, busy])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return

    setError(null)
    setDraft('')
    setBusy(true)

    const history = lines.filter((l) => !l.pending)
    setLines((prev) => [...prev, { role: 'user', content: trimmed, via: 'chat' }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          conversationId,
          history: history.map((l) => ({ role: l.role, content: l.content })),
        }),
      })
      const data = await res.json()

      if (!data.ok) {
        setError(data.error ?? 'ตอบไม่สำเร็จ')
      } else {
        setConversationId(data.conversationId)
        setLines((prev) => [...prev, { role: 'assistant', content: data.reply, via: 'chat' }])
        if (data.warning) setError(data.warning)
      }
    } catch {
      setError('ต่อเน็ตไม่ได้ · ลองใหม่อีกครั้ง')
    }
    setBusy(false)
  }

  return (
    <div className="talk">
      <div className="seg seg--wide" role="tablist" aria-label="โหมดการคุย">
        {(['chat', 'voice'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            data-on={mode === m}
            onClick={() => writeMode(m)}
          >
            {m === 'chat' ? 'แชต' : 'โทร'}
          </button>
        ))}
      </div>

      {call.quotaOut && (
        <p className="alert alert--gap" role="status">
          โควตาเสียงของวันนี้หมดแล้ว — พิมพ์คุยต่อได้ตามปกติ คนละโควตากัน
        </p>
      )}

      {loadError && (
        <p className="alert alert--gap" role="alert">
          โหลดประวัติไม่สำเร็จ · {loadError}
        </p>
      )}

      {mode === 'chat' ? (
        <>
          <div className="thread">
            {lines.length === 0 && !loadError && (
              <div className="talk__empty">
                <strong>ถามอะไรก็ได้เรื่องตารางคุณ</strong>
                <p className="muted">
                  อ่านตาราง งาน กิจกรรม และเวลาที่ตัดทอนไว้ได้ทั้งหมด
                  <br />
                  <span className="mono-hint">แก้ข้อมูลยังต้องทำในแอป</span>
                </p>
                <div className="talk__starters">
                  {STARTERS.map((s) => (
                    <button key={s} className="talk__starter" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lines.map((l, i) => (
              <Bubble key={i} line={l} />
            ))}

            {/* ข้อความจากสายที่ยังคุยอยู่ · จะถูกบันทึกจริงตอนวางสาย */}
            {call.turns.map((t, i) => (
              <Bubble key={`v${i}`} line={{ ...t, via: 'voice' }} />
            ))}

            {busy && (
              <div className="talk__typing" aria-live="polite">
                <span className="talk__dot" /> กำลังอ่านข้อมูล…
              </div>
            )}
            <div ref={tail} />
          </div>

          {error && <p className="alert alert--gap" role="alert">{error}</p>}

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
          >
            <input
              className="composer__field"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="พิมพ์ข้อความ"
              enterKeyHint="send"
              disabled={busy}
            />
            <button className="btn" type="submit" disabled={busy || !draft.trim()}>
              ส่ง
            </button>
          </form>
        </>
      ) : (
        <VoiceCall />
      )}
    </div>
  )
}

function Bubble({ line }: { line: Line }) {
  const mine = line.role === 'user'
  return (
    <div className={`msg${mine ? ' msg--me' : ' msg--ai'}`}>
      <Autolink text={line.content} />
      {line.via === 'voice' && <span className="msg__via">จากสาย</span>}
    </div>
  )
}
