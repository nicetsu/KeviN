'use client'

import { useEffect, useRef, useState } from 'react'
import type { StoredMessage } from '@/lib/chat/store'
import Autolink from '@/lib/autolink'
import MessageText from '@/lib/chat/MessageText'
import VoiceCall from './VoiceCall'
import { useCall } from '@/components/CallProvider'
import { useTalkPrefs } from '@/lib/talkPrefs'
import Settings from './Settings'
import DraftStack from '@/components/DraftStack'
import type { Draft } from '@/lib/drafts'

type Mode = 'chat' | 'voice'

/**
 * โหมดตั้งต้นเมื่อเปิดหน้านี้ — **โทรเสมอ** (เจ้าของเคาะ 1 ก.ย. 2026)
 *
 * เดิมจำโหมดล่าสุดไว้ใน `localStorage` แล้วกลับมาที่โหมดนั้น · เจ้าของขอให้
 * กดปุ่ม KeviN แล้วมาถึงหน้าโทรทุกครั้ง ไม่ว่าครั้งก่อนจะปิดท้ายด้วยโหมดไหน
 * เพราะการโทรเป็นสิ่งที่ตั้งใจมากดตรง ๆ ส่วนการพิมพ์คือสิ่งที่ค่อยเลือกทีหลัง
 * แท็บแชตยังอยู่ที่เดิม กดสลับได้ตลอด และการสลับมีผลแค่ภายในครั้งนี้
 *
 * ⚠️ **มาถึงโหมดโทร ไม่ใช่เริ่มโทร** — หน้าโทรมีสถานะนิ่งเป็นค่าตั้งต้นเสมอ
 *    ไมค์เปิดต่อเมื่อกดปุ่มเริ่มสายเท่านั้น การเปิดหน้าไม่ขอสิทธิ์อะไรทั้งนั้น
 *    (doc/CHAT.md §8) — ถ้าวันไหนหน้านี้เริ่มขอไมค์ตอน mount ถือว่าพัง
 *
 * ⚠️ ค่านี้ต้องเหมือนกันทั้งฝั่งเซิร์ฟเวอร์และไคลเอนต์ ห้ามไปอ่านจาก storage
 *    ตอน render ไม่งั้น hydrate แล้วแท็บจะกระโดดให้เห็น
 */
const INITIAL_MODE: Mode = 'voice'

/** ตัวอย่างคำถามที่ระบบตอบได้ดีจริง — สอนขอบเขตโดยไม่ต้องเขียนว่าทำอะไรไม่ได้ */
const STARTERS = [
  'พรุ่งนี้ติดอะไรบ้าง',
  'อาทิตย์นี้มีงานส่งอะไรไหม',
  'คาบว่างยาวสุดของสัปดาห์นี้',
]

/**
 * หนึ่งฟองในสายข้อความ
 *
 * `drafts` คือร่างที่ผู้ช่วยเสนอมาพร้อมคำตอบนั้น — **ไม่ได้บันทึกลงประวัติ**
 * มันมีอายุแค่หน้าจอนี้ · เลื่อนขึ้นไปดูบทสนทนาเก่าจะไม่เจอการ์ดที่กดยืนยันได้
 * ซึ่งถูกแล้ว เพราะบริบทที่ทำให้เกิดร่างนั้นหมดอายุไปแล้ว (doc/WRITE.md §8)
 */
type Line = {
  role: 'user' | 'assistant'
  content: string
  via: 'chat' | 'voice'
  pending?: boolean
  drafts?: Draft[]
}

export default function TalkRoom({
  conversationId: initialId,
  initialMessages,
  loadError,
}: {
  conversationId: string | null
  initialMessages: StoredMessage[]
  loadError: string | null
}) {
  const [chosen, setChosen] = useState<Mode>(INITIAL_MODE)
  const call = useCall()
  const prefs = useTalkPrefs()
  const [settingsOpen, setSettingsOpen] = useState(false)

  /*
   * โควตาเสียงหมด = **ดันไปโหมดแชตให้เลย** ไม่ใช่แค่ขึ้นข้อความ
   *
   * สองช่องทางใช้คนละรุ่นจึงคนละโควตา · เสียงหมดแล้วแชตยังใช้ได้ปกติ
   * การปล่อยให้ค้างอยู่หน้าโทรที่กดไม่ได้ ไม่ช่วยอะไรเลย (doc/CHAT.md §8)
   */
  const mode: Mode = call.quotaOut ? 'chat' : chosen
  const [conversationId, setConversationId] = useState(initialId)
  const [lines, setLines] = useState<Line[]>(
    initialMessages.map((m) => ({ role: m.role, content: m.content, via: m.via }))
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tail = useRef<HTMLDivElement>(null)

  /**
   * เอาการ์ดออกจากสายข้อความ — ใช้ทั้งตอนกดทิ้งและตอนยืนยันสำเร็จแล้วกดเลิกทำ
   *
   * ลบออกจาก `drafts` ของฟองนั้น ไม่ได้ลบทั้งฟอง — คำพูดของ KeviN ยังอยู่
   * เพราะมันเป็นส่วนหนึ่งของบทสนทนา ต่างจากร่างที่เป็นของชั่วคราว
   */
  function dismissDraft(id: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.drafts?.some((d) => d.id === id)
          ? { ...l, drafts: l.drafts.filter((d) => d.id !== id) }
          : l
      )
    )
  }

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

    /*
     * ร่างที่ค้างอยู่บนจอตอนนี้ — ส่งไปกับคำขอเพื่อให้ `propose_update_draft`
     * แก้ **ใบเดิม** ได้ · ร่างไม่ได้ลง DB เซิร์ฟเวอร์จึงไม่รู้ถ้าไม่ส่งไปเอง
     * · รวมร่างจากสายเสียงด้วย เพราะมันเป็นของค้างของทั้งห้อง ไม่ใช่ของโหมดใดโหมดหนึ่ง
     */
    const onScreen = [...lines.flatMap((l) => l.drafts ?? []), ...call.drafts]

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          conversationId,
          history: history.map((l) => ({ role: l.role, content: l.content })),
          lang: prefs.lang,
          drafts: onScreen,
        }),
      })
      const data = await res.json()

      if (!data.ok) {
        setError(data.error ?? 'ตอบไม่สำเร็จ')
      } else {
        setConversationId(data.conversationId)
        const incoming: Draft[] = Array.isArray(data.drafts) ? (data.drafts as Draft[]) : []

        /*
         * ร่างที่กลับมาพร้อม **id เดิม** คือใบเก่าที่ถูกแก้ ไม่ใช่ใบใหม่
         *
         * ต้องไปทับที่เดิม ไม่ใช่โผล่เป็นการ์ดใบที่สองใต้ฟองล่าสุด — ไม่งั้น
         * "เปลี่ยนเป็นวันศุกร์" จะได้การ์ดสองใบสำหรับงานชิ้นเดียว ซึ่งกดยืนยัน
         * ผิดใบได้ · ใบที่เกิดจากสายเสียงอยู่คนละที่ ต้องส่งกลับไปให้ provider ทับเอง
         */
        const voiceIds = new Set(call.drafts.map((d) => d.id))
        for (const d of incoming) if (voiceIds.has(d.id)) call.putDraft(d)

        setLines((prev) => {
          const seen = new Set(prev.flatMap((l) => (l.drafts ?? []).map((d) => d.id)))
          const revised = prev.map((l) =>
            l.drafts?.some((d) => incoming.some((n) => n.id === d.id))
              ? { ...l, drafts: l.drafts.map((d) => incoming.find((n) => n.id === d.id) ?? d) }
              : l
          )
          const fresh = incoming.filter((d) => !seen.has(d.id) && !voiceIds.has(d.id))
          return [
            ...revised,
            {
              role: 'assistant' as const,
              content: data.reply,
              via: 'chat' as const,
              drafts: fresh.length ? fresh : undefined,
            },
          ]
        })
        if (data.warning) setError(data.warning)
      }
    } catch {
      setError('ต่อเน็ตไม่ได้ · ลองใหม่อีกครั้ง')
    }
    setBusy(false)
  }

  return (
    <div className="talk">
      {settingsOpen && (
        <Settings
          prefs={prefs}
          locked={call.state !== 'idle'}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/*
        หัวข้อกับแท็บอยู่ในกล่องเดียวกันเพราะ**ลอยค้างบนสุดด้วยกัน** —
        แยกกันแล้วจะได้สองชั้นที่ค้างคนละที่ตอนเลื่อน ซึ่งอ่านเป็นของหลุด

        หัวข้ออยู่ในไฟล์นี้ ไม่ได้อยู่ใน page เพราะปุ่มฟันเฟืองต้องอยู่แถวเดียวกัน
        และมันเป็นคอมโพเนนต์ฝั่ง client ที่ถือสถานะการเปิดแผง
      */}
      <div className="talk__top">
      <div className="talk__head">
        <h1>KeviN</h1>
        <button
          className="gear"
          onClick={() => setSettingsOpen(true)}
          aria-label="ตั้งค่าการคุย"
          title="ตั้งค่าการคุย"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
               aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.5.55.87 1.06.99H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      <div className="seg seg--wide" role="tablist" aria-label="โหมดการคุย">
        {(['chat', 'voice'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            data-on={mode === m}
            onClick={() => setChosen(m)}
          >
            {m === 'chat' ? 'แชต' : 'โทร'}
          </button>
        ))}
      </div>
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
              <Bubble key={i} line={l} onDismiss={dismissDraft} />
            ))}

            {/* ข้อความจากสายที่ยังคุยอยู่ · จะถูกบันทึกจริงตอนวางสาย */}
            {call.turns.map((t, i) => (
              <Bubble key={`v${i}`} line={{ ...t, via: 'voice' }} />
            ))}

            {/*
              ร่างจากสายเสียงที่ยังค้างอยู่ — ขึ้นในโหมดแชตด้วย เพราะสลับโหมด
              กลางสายแล้วร่างต้องไม่หายไป · มันเป็นของค้างของทั้งห้อง ไม่ใช่ของโหมดใดโหมดหนึ่ง
            */}
            <DraftStack drafts={call.drafts} onSettled={call.dropDraft} />

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
            {/* ⚠️ ปุ่มเป็นลูกศรอย่างเดียว — `aria-label` คือชื่อเดียวที่มันมี */}
            <button
              className="composer__send"
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="ส่ง"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </form>
        </>
      ) : (
        <VoiceCall />
      )}
    </div>
  )
}

function Bubble({ line, onDismiss }: { line: Line; onDismiss?: (id: string) => void }) {
  const mine = line.role === 'user'
  return (
    <>
    <div className={`msg${mine ? ' msg--me' : ' msg--ai'}`}>
      {/*
        ฝั่งผู้ช่วยแกะ markdown · ฝั่งผู้ใช้ไม่แกะ
        สิ่งที่ผู้ใช้พิมพ์ไม่ใช่ markdown และค่าที่โหมดโทรบันทึกคือ `- voice -`
        ซึ่งถ้าเอาไปแกะจะกลายเป็นรายการหัวข้อย่อยที่เขียนว่า "voice -"
      */}
      {mine ? <Autolink text={line.content} /> : <MessageText text={line.content} />}
      {line.via === 'voice' && <span className="msg__via">จากสาย</span>}
    </div>

    {/*
      การ์ดอยู่ **ใต้ฟองที่ทำให้เกิดมัน** ไม่ใช่ลอยแยก — นี่คือหัวใจของแบบ 07
      ที่เจ้าของเลือก · อ่านแล้วรู้ทันทีว่าร่างนี้มาจากประโยคไหน
    */}
    {line.drafts && <DraftStack drafts={line.drafts} onSettled={onDismiss} />}
    </>
  )
}
