'use client'

import { useCall, mmss } from '@/components/CallProvider'
import type { CallState } from '@/lib/voice/session'

/** รูปคลื่น · แท่งกลางไวกว่าแท่งริม ทำให้ค่าเดียวดูเป็นคลื่นไม่ใช่แถบ */
const WAVE = [
  { idle: 12, gain: 16 },
  { idle: 26, gain: 30 },
  { idle: 40, gain: 40 },
  { idle: 22, gain: 34 },
  { idle: 34, gain: 26 },
  { idle: 14, gain: 14 },
]

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
        {call.error && <p className="alert alert--gap" role="alert">{call.error}</p>}

        {/* ⚠️ ตัวเลือกไมค์ย้ายไปหน้าตั้งค่าแล้ว (เจ้าของเคาะ 1 ก.ย. 2026)
            เป็นของที่ตั้งครั้งเดียวแล้วจบ ไม่ใช่ของที่ปรับทุกครั้งก่อนโทร
            ต่างจากภาษากับเสียงที่ยังอยู่ในหน้านี้เพราะปรับระหว่างคุย */}

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

      {/*
        วงเสียง — ตอนเราพูด แท่งขยับตาม **ความดังจริง** ที่ worklet วัดมาให้
        ตอน KeviN ตอบ กลับไปใช้จังหวะที่เขียนไว้ เพราะเราไม่ได้วัดเสียงขาออก
        (เสียงตอบมาเป็นก้อน base64 ที่เล่นผ่าน AudioContext คนละทาง)

        `SHAPE` ทำให้แท่งกลางสูงกว่าแท่งริม — เสียงจริงมีค่าเดียว ถ้าให้ทุกแท่ง
        สูงเท่ากันจะดูเหมือนแถบสี่เหลี่ยมขยับ ไม่เหมือนคลื่นเสียง
      */}
      <div className={`orb${answering ? ' orb--think' : ' orb--live'}`} aria-hidden="true">
        <div className="wave">
          {WAVE.map((shape, i) => (
            <u
              key={i}
              style={{
                height: answering ? shape.idle : 6 + Math.min(1, call.level * 4) * shape.gain,
                background: answering ? 'var(--brand)' : 'var(--sched)',
                transition: answering ? undefined : 'height 90ms linear',
              }}
            />
          ))}
        </div>
      </div>

      <div className="stage__state" style={answering ? undefined : { color: 'var(--sched)' }}>
        {label.title}
        <small>{label.hint}</small>
      </div>

      {/*
        คำบรรยาย **ฝั่ง KeviN เท่านั้น** — หูฟังรหัสห้องอย่าง "E 17501"
        พลาดง่ายกว่าตาอ่านมาก จึงยังต้องมี
        แต่ฝั่งผู้ใช้ไม่ขึ้นเลยตามที่เจ้าของสั่ง (1 ก.ย. 2026) — เห็นคำที่ตัวเอง
        เพิ่งพูดวิ่งขึ้นจอไม่ได้ช่วยอะไร และผิดเวลาก็อ่านว่าระบบฟังผิด
        ทั้งที่มันฟังถูก · ที่ค้างคำตอบล่าสุดไว้ตอนเราพูด เพราะยังอยากอ่านมันอยู่
      */}
      {call.live?.text && (
        <div className="caption" aria-live="polite">
          <b>KeviN</b>
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
