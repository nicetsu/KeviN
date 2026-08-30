'use client'

import { useEffect, useRef, useState } from 'react'
import { VoiceCall as Session, type CallState, type Caption } from '@/lib/voice/session'

/** คำบรรยายที่ปิดก้อนแล้ว — ใช้บันทึกลงประวัติตอนวางสาย */
export type VoiceTurn = { role: 'user' | 'assistant'; content: string }

const LABEL: Record<CallState, { title: string; hint: string }> = {
  idle:         { title: 'พร้อมคุยแล้ว',   hint: 'ไมค์ยังปิดอยู่' },
  connecting:   { title: 'กำลังต่อสาย…',   hint: 'ขออนุญาตใช้ไมค์' },
  listening:    { title: 'กำลังฟัง',        hint: 'พูดแทรกได้ตลอด' },
  thinking:     { title: 'กำลังเปิดดูข้อมูล', hint: 'สักครู่' },
  speaking:     { title: 'กำลังตอบ',        hint: 'แตะที่ไหนก็ได้เพื่อพูดแทรก' },
  reconnecting: { title: 'กำลังตอบ',        hint: 'สักครู่' },
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function VoiceCall({ onTranscript }: { onTranscript: (turns: VoiceTurn[]) => void }) {
  const [state, setState] = useState<CallState | 'idle'>('idle')
  const [live, setLive] = useState<Caption | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const session = useRef<Session | null>(null)
  /** คำบรรยายที่กำลังสะสมของ turn ปัจจุบัน */
  const buffer = useRef<{ user: string; kevin: string }>({ user: '', kevin: '' })
  const turns = useRef<VoiceTurn[]>([])

  const running = state !== 'idle'

  /*
   * ตัวจับเวลา — นับจาก `startedAt` ของ session **ไม่ใช่นับเอง**
   *
   * สายถูกตัดที่ 15 นาทีแล้วต่อใหม่เงียบ ๆ · ถ้านับใหม่ทุกครั้งที่ต่อ
   * เลขจะเด้งกลับเป็น 00:00 แล้วผู้ใช้จะอ่านว่าสายหลุด ทั้งที่คุยต่อเนื่องอยู่
   */
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const s = session.current
      if (s) setElapsed(Date.now() - s.startedAt)
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  /*
   * ล็อกหน้าจอหรือสลับไปแอปอื่น = วางสายให้เลย
   *
   * เบราว์เซอร์หยุดเสียงอยู่แล้วเมื่อหน้าถูกซ่อน · ถ้าปล่อยสายค้างไว้จะได้สาย
   * ที่ตายแล้วแต่หน้าจอยังบอกว่ากำลังคุยอยู่ ซึ่งแย่กว่าการวางให้ตรง ๆ
   */
  useEffect(() => {
    if (!running) return
    const onHide = () => { if (document.hidden) void hangUp('หน้าจอถูกปิด — วางสายให้แล้ว') }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  })

  function flush() {
    const { user, kevin } = buffer.current
    if (user.trim()) turns.current.push({ role: 'user', content: user.trim() })
    if (kevin.trim()) turns.current.push({ role: 'assistant', content: kevin.trim() })
    buffer.current = { user: '', kevin: '' }
  }

  async function begin() {
    setError(null)
    turns.current = []
    buffer.current = { user: '', kevin: '' }

    const s = new Session({
      onState: setState,
      onCaption: (c) => {
        buffer.current[c.who === 'user' ? 'user' : 'kevin'] += c.text
        setLive({ who: c.who, text: buffer.current[c.who === 'user' ? 'user' : 'kevin'] })
      },
      onTurnEnd: () => flush(),
      onError: (m) => setError(m),
      onEnded: (reason) => {
        flush()
        if (turns.current.length > 0) onTranscript(turns.current)
        session.current = null
        setState('idle')
        setLive(null)
        setElapsed(0)
        if (reason && reason !== 'วางสายแล้ว') setError(reason)
      },
    })

    session.current = s
    await s.start()
  }

  async function hangUp(reason?: string) {
    await session.current?.stop(reason)
  }

  if (!running) {
    return (
      <div className="stage">
        <div className="orb" aria-hidden="true">
          <MicIcon color="var(--muted)" />
        </div>
        <div className="stage__state">
          {LABEL.idle.title}
          <small>{LABEL.idle.hint}</small>
        </div>
        <p className="muted stage__note">
          ถามเรื่องตาราง งาน และกิจกรรมได้
          <br />
          <span className="mono-hint">ยังแก้ข้อมูลไม่ได้จากที่นี่</span>
        </p>

        {error && <p className="alert alert--gap" role="alert">{error}</p>}

        <button className="btn stage__go" onClick={begin}>
          <MicIcon color="#12102A" size={17} />
          เริ่มโทร
        </button>
      </div>
    )
  }

  const label = LABEL[state as CallState]
  const speaking = state === 'speaking' || state === 'reconnecting'

  return (
    <div className="stage">
      <div className="call__timer">
        <span className="call__dot" /> กำลังคุย {mmss(elapsed)}
      </div>

      <div className={`orb${speaking ? ' orb--think' : ' orb--live'}`} aria-hidden="true">
        <div className="wave">
          {[12, 26, 40, 22, 34, 14].map((h, i) => (
            <u key={i} style={{ height: h, background: speaking ? 'var(--brand)' : 'var(--sched)' }} />
          ))}
        </div>
      </div>

      <div className="stage__state" style={{ color: speaking ? undefined : 'var(--sched)' }}>
        {label.title}
        <small>{label.hint}</small>
      </div>

      {/*
        คำบรรยายขึ้นตลอดสาย — ได้ transcript มาฟรีอยู่แล้ว
        และหูฟังรหัสห้องอย่าง "E 17501" พลาดง่ายกว่าตาอ่านมาก
      */}
      {live?.text && (
        <div className="caption" aria-live="polite">
          <b>{live.who === 'user' ? 'คุณ' : 'KeviN'}</b>
          {live.text}
        </div>
      )}

      {error && <p className="alert alert--gap" role="alert">{error}</p>}

      <div className="call__bar">
        <button
          className="btn btn--quiet"
          onClick={() => { setMuted(!muted); session.current?.setMuted(!muted) }}
        >
          {muted ? 'เปิดไมค์' : 'ปิดไมค์'}
        </button>
        <button className="btn btn--end" onClick={() => hangUp()}>วางสาย</button>
      </div>
    </div>
  )
}

function MicIcon({ color, size = 34 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      {size > 20 && <path d="M12 18v3.5" />}
    </svg>
  )
}
