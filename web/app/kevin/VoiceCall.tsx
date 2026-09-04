'use client'

import { useEffect, useState } from 'react'
import { useCall, mmss } from '@/components/CallProvider'
import DraftCard from '@/components/DraftCard'
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

  /*
   * คลื่นตอนเข้าห้อง — **เล่นที่นี่ ไม่ใช่ใน `loading.tsx`** (แก้ 2 ก.ย. 2026)
   *
   * ⚠️ เคยอยู่ในโครงร่าง แล้วโดนตัดกลางคันทุกครั้ง เพราะเซิร์ฟเวอร์ตอบ
   *    เร็วกว่าความยาวคลื่น (1.3s) มาก · โครงร่างหายไปพร้อมคลื่นที่ยังไม่จบ
   *    เจ้าของเห็นเป็นอาการ "หยุดกลางคันแล้วเข้าหน้าหลัก"
   *
   *    อยู่บนหน้าจริงแล้วมันเล่นจนจบเสมอ ไม่ว่าเซิร์ฟเวอร์จะเร็วแค่ไหน
   *    และ **ไม่หน่วงอะไรเลย** — ปุ่มเริ่มโทรกดได้ตั้งแต่วินาทีแรก
   *
   * ⚠️ ตัวจับเวลาเอา element ออกเมื่อจบ ไม่ใช่ปล่อยให้ค้าง — `backdrop-filter`
   *    ที่ค้างอยู่จะกินแรงเครื่องตลอดเวลาที่เปิดหน้านี้ทิ้งไว้
   *
   * ⚠️ เล่นซ้ำเมื่อกลับมาที่ห้องหลังวางสาย เพราะ `TalkRoom` remount
   *    (key ผูกกับจำนวนข้อความ) — ตั้งใจ อ่านเป็นการกลับเข้าห้อง
   */
  const [entering, setEntering] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 1400)
    return () => clearTimeout(t)
  }, [])

  /*
   * ⚠️ **ห้ามใส่ state "กำลังกดโทร" มาที่นี่อีก** — เคยใส่แล้วพัง (1 ก.ย. 2026)
   *
   *    `session.start()` เรียก `onState('connecting')` เป็นบรรทัดแรก **ก่อน**
   *    ขอสิทธิ์ไมค์ด้วยซ้ำ · `running` จึงเป็น true ทันทีที่กด และฉากนี้หายไปเอง
   *    ไม่มีช่วงเวลาที่ต้องเอา state มาช่วยปิดปุ่มเลย
   *
   *    ที่พังคือ state ตัวนั้นไม่ถูกล้างตอนวางสาย (คอมโพเนนต์ไม่ได้ remount
   *    แค่ return JSX คนละก้อน) ปุ่มเริ่มโทรจึงหายถาวรจนกว่าจะรีเฟรช
   */
  if (!running) {
    return (
      <div className="stage">
        {/* วงเปล่า ไม่มีไอคอนไมค์ — นี่คือตัว KeviN ไม่ใช่ปุ่ม (doc/DECISIONS.md) */}
        {/*
          ⚠️ ตอนเพิ่งเข้าห้องยังใส่ `orb--wait` ไว้ด้วย — พื้นจึงยังโปร่งเท่าโครงร่าง
             แล้ว `orb--fill` ค่อยไล่พื้นม่วงทับขึ้นมา · พอ `entering` หมด คลาสทั้งคู่
             หายไปพร้อมกัน ซึ่งตอนนั้นพื้นม่วงทึบเต็มอยู่แล้ว จึงไม่มีอะไรกระพริบ
        */}
        <div className={`orb${entering ? ' orb--wait orb--fill' : ''}`} aria-hidden="true">
          {entering && (
            <>
              <span className="enter__heat" />
              <span className="enter__heat" />
            </>
          )}
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
          <MicIcon color="var(--brand)" size={17} />
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
                /* ม่วงทั้งคู่ตามที่เจ้าของสั่ง — แยกสองสถานะด้วยความสว่าง
                   ฟังเรา = ม่วงสว่าง · KeviN ตอบ = ม่วงเข้ม (globals.css) */
                background: answering ? 'var(--brand-deep)' : 'var(--brand)',
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
      {/*
        **แบบ 07** — ร่างอยู่ในกล่องเดียวกับคำพูดที่ทำให้เกิดมัน (เจ้าของเคาะ 2 ก.ย. 2026)
        อ่านแล้วรู้ทันทีว่าการ์ดนี้มาจากประโยคไหน โดยไม่ต้องเดา

        ⚠️ **กล่องนี้สูงที่สุดในฉาก** — คำบรรยายบวกร่างบวกปุ่มสามใบ
           `max-height` ของทั้งกล่องกับของ `.dcard` ข้างในคือสิ่งเดียวที่กัน
           ไม่ให้ปุ่มวางสายถูกดันตกจอบนเครื่องเตี้ย · วัดบนจอ 360×640 ก่อนแตะความสูง
      */}
      {(call.live?.text || call.drafts.length > 0) && (
        <div className="caption caption--live" aria-live="polite">
          {call.live?.text && (
            <>
              <b>KeviN</b>
              {call.live.text}
            </>
          )}

          {call.drafts.map((d) => (
            <div key={d.id} className="caption__draft">
              <DraftCard draft={d} onSettled={call.dropDraft} />
            </div>
          ))}
        </div>
      )}

      {call.error && <p className="alert alert--gap" role="alert">{call.error}</p>}

      {/*
        ⚠️ ปุ่มไม่มีตัวอักษรบนตัวมันแล้ว — `aria-label` คือทางเดียวที่คนใช้
           screen reader จะรู้ว่าปุ่มไหนวางสาย · ป้ายใต้ปุ่มเป็นของสายตาอย่างเดียว
      */}
      <div className="callbtns">
        <button
          className={`callbtn${call.muted ? ' callbtn--muted' : ''}`}
          onClick={call.toggleMute}
          aria-label={call.muted ? 'เปิดไมค์' : 'ปิดไมค์'}
        >
          <i>{call.muted ? <MicOffIcon size={20} /> : <MicIcon color="currentColor" size={20} />}</i>
          <span>{call.muted ? 'เปิดไมค์' : 'ปิดไมค์'}</span>
        </button>
        <button className="callbtn callbtn--end" onClick={() => call.hangUp()} aria-label="วางสาย">
          <i><HangUpIcon size={20} /></i>
          <span>วางสาย</span>
        </button>
      </div>
    </div>
  )
}

/*
 * ⚠️ ไมค์ขีดทับกับหูโทรศัพท์คว่ำ **ต้องต่างกันด้วยรูปทรง ไม่ใช่แค่สี**
 *    ถ้าใช้ไมค์ทั้งคู่แล้วต่างแค่แดง จะกดวางสายพลาดตอนตั้งใจจะปิดไมค์
 */
function MicOffIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
      <path d="M3.5 3.5l17 17" />
    </svg>
  )
}

function HangUpIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.2 14.6c-.9-.9-.7-2.4.4-3.1C5.9 10 8.8 9.1 12 9.1s6.1.9 8.4 2.4c1.1.7 1.3 2.2.4 3.1l-1.4 1.4a1.7 1.7 0 0 1-2.1.2l-1.8-1.2a1.7 1.7 0 0 1-.7-1.4v-1.3c-1.9-.6-4-.6-5.9 0v1.3c0 .6-.3 1.1-.7 1.4l-1.8 1.2a1.7 1.7 0 0 1-2.1-.2z" />
    </svg>
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
