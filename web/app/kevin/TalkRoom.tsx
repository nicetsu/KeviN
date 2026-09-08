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
import { ndjsonParser, type ChatEvent } from '@/lib/chat/stream'
import {
  ACCEPTED_TYPES,
  BadImage,
  hadImage,
  imageHistoryLine,
  prepareImage,
  withoutImageMark,
  type InlineImage,
} from '@/lib/chat/image'

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
 *    (ARCHITECTURE.md §6) — ถ้าวันไหนหน้านี้เริ่มขอไมค์ตอน mount ถือว่าพัง
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
 * ซึ่งถูกแล้ว เพราะบริบทที่ทำให้เกิดร่างนั้นหมดอายุไปแล้ว (ARCHITECTURE.md §7)
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
   * การปล่อยให้ค้างอยู่หน้าโทรที่กดไม่ได้ ไม่ช่วยอะไรเลย (ARCHITECTURE.md §6)
   */
  const mode: Mode = call.quotaOut ? 'chat' : chosen
  const [conversationId, setConversationId] = useState(initialId)
  const [lines, setLines] = useState<Line[]>(
    initialMessages.map((m) => ({ role: m.role, content: m.content, via: m.via }))
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
   * รูปที่รอส่ง — **ใบเดียวต่อหนึ่งข้อความ**
   *
   * `preview` เป็น object URL ที่ต้องคืนเองตอนทิ้งรูป ไม่งั้นรูปที่ย่อแล้วค้าง
   * อยู่ในหน่วยความจำของแท็บไปจนกว่าจะปิด · ทุกทางที่ล้างรูปต้องผ่าน `clearShot()`
   * ทางเดียว ไม่ใช่ `setShot(null)` ตรง ๆ กระจายอยู่หลายที่แล้วลืมคืนบางที่
   */
  const [shot, setShot] = useState<{ image: InlineImage; preview: string } | null>(null)
  const [loadingShot, setLoadingShot] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  const tail = useRef<HTMLDivElement>(null)

  function clearShot() {
    setShot((prev) => {
      if (prev) URL.revokeObjectURL(prev.preview)
      return null
    })
    // ล้างค่าในตัวเลือกไฟล์ด้วย ไม่งั้นเลือก**ไฟล์เดิมซ้ำ**แล้ว `change` ไม่ยิง
    // — ผู้ใช้กดเลือกรูปเดิมอีกทีแล้วไม่มีอะไรเกิดขึ้น โดยไม่มีอะไรฟ้อง
    if (picker.current) picker.current.value = ''
  }

  async function pickImage(file: File | undefined) {
    if (!file) return
    setError(null)
    setLoadingShot(true)
    try {
      const image = await prepareImage(file)
      clearShot()
      setShot({ image, preview: URL.createObjectURL(file) })
    } catch (e) {
      setError(e instanceof BadImage ? e.message : 'เปิดรูปนี้ไม่ได้ · ลองรูปอื่น')
      if (picker.current) picker.current.value = ''
    }
    setLoadingShot(false)
  }

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
    // แนบรูปมาเฉย ๆ โดยไม่พิมพ์อะไรคือการใช้งานปกติ — ถ่ายกระดานแล้วส่งเลย
    const attached = shot
    if ((!trimmed && !attached) || busy) return

    setError(null)
    setDraft('')
    clearShot()
    setBusy(true)

    const history = lines.filter((l) => !l.pending)
    /*
     * ฟองของผู้ใช้เก็บ **สิ่งเดียวกับที่ลง DB** คือป้าย `[รูป]` ไม่ใช่ตัวรูป
     *
     * ตั้งใจให้สิ่งที่เห็นบนจอตรงกับสิ่งที่ถูกเก็บ — กติกาเดียวกับ `- voice -`
     * ของโหมดโทร · ถ้าโชว์รูปจริงในฟอง มันจะหายไปเฉย ๆ ตอนรีเฟรชแล้วเหลือ `[รูป]`
     * ซึ่งอ่านเหมือนของหาย ทั้งที่ความจริงคือมันไม่เคยถูกเก็บตั้งแต่แรก
     */
    setLines((prev) => [
      ...prev,
      { role: 'user', content: attached ? imageHistoryLine(trimmed) : trimmed, via: 'chat' },
    ])

    /*
     * ร่างที่ค้างอยู่บนจอตอนนี้ — ส่งไปกับคำขอเพื่อให้ `propose_update_draft`
     * แก้ **ใบเดิม** ได้ · ร่างไม่ได้ลง DB เซิร์ฟเวอร์จึงไม่รู้ถ้าไม่ส่งไปเอง
     * · รวมร่างจากสายเสียงด้วย เพราะมันเป็นของค้างของทั้งห้อง ไม่ใช่ของโหมดใดโหมดหนึ่ง
     */
    const onScreen = [...lines.flatMap((l) => l.drafts ?? []), ...call.drafts]

    /* ฟองที่ข้อความไหลลงไปทีละชิ้น · ถูกแทนที่ด้วยฉบับจริงตอนจบ */
    const flowing = { role: 'assistant' as const, content: '', via: 'chat' as const, pending: true }
    let streamed = ''
    const incoming: Draft[] = []

    /** ทับใบเดิมถ้า id ซ้ำ — ร่างที่ถูกแก้กลับมาพร้อม id เดิมเสมอ */
    const collect = (d: Draft) => {
      const at = incoming.findIndex((x) => x.id === d.id)
      if (at >= 0) incoming[at] = d
      else incoming.push(d)
    }

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
          // รูปเดินทางไปกับคำขอนี้ใบเดียว · ประวัติที่ส่งกลับไปข้างบนเป็นข้อความล้วน
          // เสมอ รูปเก่าจึงไม่ถูกส่งซ้ำทุกครั้งที่พิมพ์ต่อ (app/api/chat/route.ts)
          image: attached?.image,
        }),
      })

      /*
       * ด่านที่ตอบก่อนเริ่มสาย (ยังไม่ล็อกอิน · อินพุตไม่ผ่าน) ยังตอบเป็น JSON ก้อนเดียว
       * เพราะตอนนั้นยังไม่มีอะไรให้ไหล · แยกด้วย content-type ไม่ใช่เดาจากสถานะ
       */
      const ct = res.headers.get('content-type') ?? ''
      if (!res.body || !ct.includes('ndjson')) {
        const data = await res.json().catch(() => ({ error: 'ตอบไม่สำเร็จ' }))
        setError(data.error ?? 'ตอบไม่สำเร็จ')
        setBusy(false)
        return
      }

      setLines((prev) => [...prev, flowing])

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      const parser = ndjsonParser()
      let failed: string | null = null
      let finished: { reply: string; conversationId?: string; warning?: string } | null = null

      const handle = (e: ChatEvent) => {
        if (e.t === 'delta') streamed += e.v
        // โมเดลเปลี่ยนใจไปเรียก tool — สิ่งที่ไหลไปแล้วไม่ใช่คำตอบ
        else if (e.t === 'reset') streamed = ''
        else if (e.t === 'draft') collect(e.v)
        else if (e.t === 'error') failed = e.error
        else if (e.t === 'done') {
          finished = { reply: e.reply, conversationId: e.conversationId, warning: e.warning }
          for (const d of e.drafts ?? []) collect(d)
        }
        if (e.t === 'delta' || e.t === 'reset') {
          // หาฟองที่กำลังไหลจาก **ธง `pending`** ไม่ใช่จากตัวตนของวัตถุ —
          // ทุกครั้งที่อัปเดต state ฟองถูกแทนด้วยสำเนาใหม่ ตัวตนเดิมจึงหายไปทันที
          const now = streamed
          setLines((prev) => prev.map((l) => (l.pending ? { ...l, content: now } : l)))
        }
      }

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        for (const e of parser.push(decoder.decode(value, { stream: true }))) handle(e)
      }
      for (const e of parser.end()) handle(e)

      if (failed) {
        setError(failed)
        setLines((prev) => prev.filter((l) => !l.pending))
        setBusy(false)
        return
      }

      /*
       * ⚠️ **ข้อความสุดท้ายมาจาก `done` ไม่ใช่จากสิ่งที่ไหลมา** — `delta` ยังไม่ผ่าน
       *    ด่านตรวจลิงก์ (ลิงก์ถูกหั่นข้ามก้อนได้ ตรวจทีละชิ้นจึงไม่มีทางถูก)
       *    สิ่งที่ค้างบนจอจึงต้องเป็นฉบับที่ผ่านด่านแล้วเสมอ (lib/chat/links.ts)
       */
      const final: { reply: string; conversationId?: string; warning?: string } =
        finished ?? { reply: streamed }
      if (final.conversationId) setConversationId(final.conversationId)

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
        const kept = prev.filter((l) => !l.pending)
        const seen = new Set(kept.flatMap((l) => (l.drafts ?? []).map((d) => d.id)))
        const revised = kept.map((l) =>
          l.drafts?.some((d) => incoming.some((n) => n.id === d.id))
            ? { ...l, drafts: l.drafts.map((d) => incoming.find((n) => n.id === d.id) ?? d) }
            : l
        )
        const fresh = incoming.filter((d) => !seen.has(d.id) && !voiceIds.has(d.id))
        return [
          ...revised,
          {
            role: 'assistant' as const,
            content: final.reply,
            via: 'chat' as const,
            drafts: fresh.length ? fresh : undefined,
          },
        ]
      })
      if (final.warning) setError(final.warning)
    } catch {
      setError('ต่อเน็ตไม่ได้ · ลองใหม่อีกครั้ง')
      setLines((prev) => prev.filter((l) => !l.pending))
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

            {/*
              ตัวบอกว่ากำลังคิด **หายทันทีที่ตัวอักษรเริ่มไหล** — ข้อความที่ไหลอยู่
              บอกเรื่องเดียวกันแต่บอกได้ดีกว่า · ปล่อยไว้ทั้งคู่จะกลายเป็นสองอย่าง
              ที่พูดเรื่องเดียวกันพร้อมกัน
            */}
            {busy && !lines.some((l) => l.pending && l.content) && (
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
            {/*
              รูปที่รอส่ง อยู่ **เหนือแถวช่องพิมพ์** ไม่ใช่ในแถวเดียวกัน
              เพราะคำเตือนเรื่องรูปถึง Google ต้องอ่านออกเต็มบรรทัดบนจอ 360px
              ไม่ใช่บีบให้เหลือสามคำข้างช่องพิมพ์
            */}
            {shot && (
              <div className="shot">
                {/* eslint-disable-next-line @next/next/no-img-element -- object URL ชั่วคราว ไม่ใช่ของที่ optimize ได้ */}
                <img className="shot__thumb" src={shot.preview} alt="รูปที่จะแนบไป" />
                <div className="shot__say">
                  <strong>แนบรูปนี้ไป</strong>
                  {/*
                    ⚠️ คำเตือนอยู่ **ตรงจุดที่แนบรูป ไม่ใช่ในหน้าตั้งค่า**
                       (เจ้าของเคาะ 8 ก.ย. 2026) — ภาพถ่ายมักติดของที่ไม่ได้ตั้งใจส่ง
                       และตอนนี้มีผู้ใช้หลายคน เจ้าของยืนยันแทนเขาไม่ได้
                  */}
                  <span className="mono-hint">รูปถูกส่งให้ AI อ่านครั้งเดียว ไม่ได้เก็บไว้</span>
                </div>
                <button type="button" className="shot__drop" onClick={clearShot} aria-label="เอารูปออก">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                       aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <div className="composer__row">
              <input
                ref={picker}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                hidden
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
              {/* ⚠️ ปุ่มเป็นไอคอนล้วนทั้งคู่ — `aria-label` คือชื่อเดียวที่มันมี */}
              <button
                type="button"
                className="composer__clip"
                onClick={() => picker.current?.click()}
                disabled={busy || loadingShot}
                aria-label="แนบรูป"
                title="แนบรูป"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                     strokeLinejoin="round" aria-hidden="true">
                  <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.2-9.19a3.67 3.67 0 1 1 5.18 5.18l-9.2 9.2a1.83 1.83 0 1 1-2.59-2.6l8.5-8.48" />
                </svg>
              </button>

              <input
                className="composer__field"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={shot ? 'บอกเพิ่มได้ หรือส่งเลย' : 'พิมพ์ข้อความ'}
                enterKeyHint="send"
                disabled={busy}
              />
              <button
                className="composer__send"
                type="submit"
                disabled={busy || loadingShot || (!draft.trim() && !shot)}
                aria-label="ส่ง"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"
                     strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
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
  /*
   * ประโยคที่เคยมีรูปแนบมา — ตัวรูปไม่ได้ถูกเก็บ เหลือแต่ป้าย
   *
   * แสดงเป็น**ป้าย** ไม่ใช่ปล่อยให้ `[รูป]` ปนอยู่ในเนื้อความ เพราะมันไม่ใช่
   * คำที่ผู้ใช้พิมพ์ · และป้ายทำให้ประวัติอ่านออกว่าตรงนี้เคยมีอะไรที่ตอนนี้ไม่มีแล้ว
   */
  const shotted = mine && hadImage(line.content)
  const said = shotted ? withoutImageMark(line.content) : line.content
  return (
    <>
    <div className={`msg${mine ? ' msg--me' : ' msg--ai'}`}>
      {shotted && <span className="msg__shot">รูปที่ส่งไป · ไม่ได้เก็บไว้</span>}
      {/*
        ฝั่งผู้ช่วยแกะ markdown · ฝั่งผู้ใช้ไม่แกะ
        สิ่งที่ผู้ใช้พิมพ์ไม่ใช่ markdown และค่าที่โหมดโทรบันทึกคือ `- voice -`
        ซึ่งถ้าเอาไปแกะจะกลายเป็นรายการหัวข้อย่อยที่เขียนว่า "voice -"
      */}
      {said && (mine ? <Autolink text={said} /> : <MessageText text={said} />)}
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
