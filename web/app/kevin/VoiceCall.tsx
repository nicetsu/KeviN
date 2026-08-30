'use client'

import { useCall, mmss } from '@/components/CallProvider'
import type { CallState } from '@/lib/voice/session'

const LABEL: Record<CallState, { title: string; hint: string }> = {
  idle:         { title: 'พร้อมคุยแล้ว',     hint: 'ไมค์ยังปิดอยู่' },
  connecting:   { title: 'กำลังต่อสาย…',     hint: 'ขออนุญาตใช้ไมค์' },
  listening:    { title: 'กำลังฟัง',          hint: 'พูดแทรกได้ตลอด' },
  thinking:     { title: 'กำลังเปิดดูข้อมูล', hint: 'สักครู่' },
  speaking:     { title: 'กำลังตอบ',          hint: 'พูดแทรกได้เลย' },
  reconnecting: { title: 'กำลังตอบ',          hint: 'สักครู่' },
}

/**
 * หน้าจอโหมดโทร — **ไม่ได้เป็นเจ้าของสาย**
 *
 * สายอยู่ที่ `CallProvider` ระดับ layout เพื่อให้ผู้ใช้สลับไปดูปฏิทินกลางสายได้
 * โดยสายไม่ตาย · ที่นี่เหลือแค่วาดสถานะกับปุ่ม
 */
export default function VoiceCall() {
  const call = useCall()
  const running = call.state !== 'idle'

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

        {call.error && <p className="alert alert--gap" role="alert">{call.error}</p>}

        {/* ขอสิทธิ์ไมค์ตอนกด ไม่ใช่ตอนเข้าหน้า — ป๊อปอัปที่เด้งโดยไม่ได้ขอมักโดนปฏิเสธ */}
        <button className="btn stage__go" onClick={call.start}>
          <MicIcon color="#12102A" size={17} />
          เริ่มโทร
        </button>
      </div>
    )
  }

  const label = LABEL[call.state as CallState]
  const answering = call.state === 'speaking' || call.state === 'reconnecting'

  return (
    <div className="stage">
      <div className="call__timer">
        <span className="call__dot" /> กำลังคุย {mmss(call.elapsed)}
      </div>

      <div className={`orb${answering ? ' orb--think' : ' orb--live'}`} aria-hidden="true">
        <div className="wave">
          {[12, 26, 40, 22, 34, 14].map((h, i) => (
            <u key={i} style={{ height: h, background: answering ? 'var(--brand)' : 'var(--sched)' }} />
          ))}
        </div>
      </div>

      <div className="stage__state" style={answering ? undefined : { color: 'var(--sched)' }}>
        {label.title}
        <small>{label.hint}</small>
      </div>

      {/*
        คำบรรยายขึ้นตลอดสาย — ได้ transcript มาฟรีอยู่แล้ว
        และหูฟังรหัสห้องอย่าง "E 17501" พลาดง่ายกว่าตาอ่านมาก
      */}
      {call.live?.text && (
        <div className="caption" aria-live="polite">
          <b>{call.live.who === 'user' ? 'คุณ' : 'KeviN'}</b>
          {call.live.text}
        </div>
      )}

      {call.error && <p className="alert alert--gap" role="alert">{call.error}</p>}

      <div className="call__bar">
        <button className="btn btn--quiet" onClick={call.toggleMute}>
          {call.muted ? 'เปิดไมค์' : 'ปิดไมค์'}
        </button>
        <button className="btn btn--end" onClick={() => call.hangUp()}>วางสาย</button>
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
