'use client'

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { VoiceCall as Session, type CallState, type Caption } from '@/lib/voice/session'
import { useTalkPrefs } from '@/lib/talkPrefs'
import { redactVoiceTurns } from '@/lib/voice/transcript'
import { setMic, useMic } from '@/lib/voice/micStore'
import type { Draft } from '@/lib/drafts'
import DraftSheet from '@/components/DraftSheet'

export type VoiceTurn = { role: 'user' | 'assistant'; content: string }

type CallApi = {
  state: CallState | 'idle'
  /** null = ยังไม่ได้โทร */
  live: Caption | null
  elapsed: number
  muted: boolean
  error: string | null
  /** ความดังของเสียงที่พูดอยู่ 0–1 · ให้วงเสียงขยับตามของจริง */
  level: number
  /** true = โควตาเสียงหมด · หน้าจอควรดันไปโหมดแชต */
  quotaOut: boolean
  /** turn ที่ปิดก้อนแล้วในสายปัจจุบัน · หน้า KeviN เอาไปแสดงสด */
  turns: VoiceTurn[]
  /**
   * ร่างที่ผู้ช่วยเสนอระหว่างสายและยังไม่ได้ยืนยัน
   *
   * ⚠️ **อยู่ที่นี่ ไม่ใช่ในหน้า KeviN** ด้วยเหตุผลเดียวกับที่ session อยู่ที่นี่ —
   *    สลับไปดูปฏิทินกลางสายแล้วร่างต้องไม่หาย · และต้องรอดข้ามการต่อสายใหม่
   *    ตอน Live API ตัดที่ 15 นาที ซึ่งเกิดใต้ระดับนี้ทั้งหมด
   */
  drafts: Draft[]
  /** เอาร่างออกจากจอ — ใช้ทั้งตอนกดทิ้งและตอนยืนยันสำเร็จ */
  dropDraft: (id: string) => void
  start: () => Promise<void>
  /** สลับไมค์ระหว่างสาย · ไม่มีสายอยู่ก็เรียกได้ ค่าจะไปมีผลตอนโทรครั้งถัดไป */
  switchMic: (deviceId: string) => Promise<void>
  hangUp: (reason?: string) => Promise<void>
  toggleMute: () => void
  dismissError: () => void
}

const Ctx = createContext<CallApi | null>(null)

/** ใช้ได้ทุกที่ที่อยู่ใต้ provider · โยน error ถ้าลืมครอบ จะได้รู้ตอนพัฒนา ไม่ใช่ตอนผู้ใช้กด */
export function useCall(): CallApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useCall ต้องอยู่ใต้ <CallProvider>')
  return api
}

/**
 * เจ้าของสายตัวจริง — อยู่ระดับ layout **ไม่ใช่ในหน้า KeviN**
 *
 * ถ้าเก็บ session ไว้ในคอมโพเนนต์ของหน้า พอผู้ใช้กดไปดูปฏิทินกลางสาย
 * คอมโพเนนต์จะถูก unmount แล้วสายตายทันที · สลับไปดูอะไรแล้วสายตัด
 * คือสิ่งที่ทำให้คนเลิกใช้ (doc/CHAT.md §8)
 */
export default function CallProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const path = usePathname()
  const prefs = useTalkPrefs()
  const mic = useMic()

  const [drafts, setDrafts] = useState<Draft[]>([])
  const [state, setState] = useState<CallState | 'idle'>('idle')
  const [live, setLive] = useState<Caption | null>(null)
  const [turns, setTurns] = useState<VoiceTurn[]>([])
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quotaOut, setQuotaOut] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)

  const session = useRef<Session | null>(null)
  /*
   * ⚠️ ฝั่งผู้ใช้เก็บแค่**ธงว่าพูดหรือยัง** ไม่เก็บข้อความ
   *
   * เจ้าของสั่ง 1 ก.ย. 2026 ว่าคำบรรยายสดฝั่งตัวเองไม่ต้องขึ้นจอ · พอไม่ต้องแสดง
   * ก็ไม่มีเหตุผลจะถือข้อความนั้นไว้ในหน่วยความจำเลย เหลือแค่ต้องรู้ว่ารอบนี้
   * ผู้ใช้พูดไหม เพื่อจะได้ลงแถว `- voice -` ในประวัติให้ครบจังหวะ
   */
  const buffer = useRef({ spoke: false, kevin: '' })
  const collected = useRef<VoiceTurn[]>([])

  const running = state !== 'idle'

  /*
   * ตัวจับเวลา — อ่านจาก `startedAt` ของ session **ไม่ได้นับเอง**
   *
   * สายถูกตัดที่ 15 นาทีแล้วต่อใหม่เงียบ ๆ · ถ้านับใหม่ทุกครั้งที่ต่อ เลขจะเด้ง
   * กลับเป็น 00:00 แล้วผู้ใช้จะอ่านว่าสายหลุด ทั้งที่บทสนทนาต่อเนื่องอยู่
   */
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const s = session.current
      if (s) setElapsed(Date.now() - s.startedAt)
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  const flush = useCallback(() => {
    const { spoke, kevin } = buffer.current
    const next: VoiceTurn[] = []
    // ยังส่งผ่าน redactVoiceTurns เหมือนเดิม — ชั้นบังคับฝั่งเบราว์เซอร์ต้องอยู่
    // แม้ตอนนี้จะไม่มีข้อความจริงให้แทนที่แล้วก็ตาม (lib/voice/transcript.ts)
    if (spoke) next.push({ role: 'user', content: '' })
    if (kevin.trim()) next.push({ role: 'assistant', content: kevin.trim() })
    buffer.current = { spoke: false, kevin: '' }
    if (next.length) {
      collected.current = [...collected.current, ...redactVoiceTurns(next)]
      setTurns(collected.current)
    }
  }, [])

  /** บันทึกลงประวัติเดียวกับแชต · ทำที่นี่เพราะสายจบตอนอยู่หน้าไหนก็ได้ */
  const persist = useCallback(async () => {
    const all = collected.current
    if (all.length === 0) return
    try {
      const res = await fetch('/api/voice/transcript', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ turns: all }),
      })
      const data = await res.json()
      if (!data.ok) setError(`คุยจบแล้วแต่บันทึกไม่สำเร็จ · ${data.error ?? ''}`)
      // ให้หน้า KeviN โหลดประวัติชุดใหม่จากเซิร์ฟเวอร์
      else router.refresh()
    } catch {
      setError('คุยจบแล้วแต่บันทึกไม่สำเร็จ')
    }
  }, [router])

  const start = useCallback(async () => {
    if (session.current) return
    setError(null)
    setQuotaOut(false)
    collected.current = []
    buffer.current = { spoke: false, kevin: '' }
    setTurns([])
    /*
     * ล้างร่างค้างตอน**เริ่มสายใหม่** ไม่ใช่ตอนวางสาย
     *
     * วางสายแล้วร่างต้องยังอยู่ให้กดยืนยันได้ — คนวางสายเพราะพูดจบ ไม่ใช่เพราะ
     * เปลี่ยนใจ · แต่พอเริ่มสายใหม่แปลว่าเริ่มเรื่องใหม่ ของค้างจากรอบก่อนไม่ควรตามมา
     */
    setDrafts([])

    const s = new Session(prefs, {
      onState: setState,
      onCaption: (c) => {
        // ฝั่งผู้ใช้: จำแค่ว่าพูดแล้ว · ไม่เก็บข้อความ และไม่ขึ้นจอ
        if (c.who === 'user') {
          buffer.current.spoke = true
          return
        }
        buffer.current.kevin += c.text
        setLive({ who: 'kevin', text: buffer.current.kevin })
      },
      onTurnEnd: flush,
      onLevel: setLevel,
      /* ใบใหม่ต่อท้าย ไม่ทับของเดิม — พูดรวดเดียวสามงานต้องได้สามใบ */
      onDraft: (d) => setDrafts((prev) => [...prev, d]),
      onError: (m) => {
        setError(m)
        // โควตาเสียงหมด = คนละโควตากับแชต · หน้าจอจะดันไปโหมดแชตให้
        if (/โควตา/.test(m)) setQuotaOut(true)
      },
      onEnded: (reason) => {
        flush()
        void persist()
        session.current = null
        setState('idle')
        setLive(null)
        setElapsed(0)
        setLevel(0)
        setMuted(false)
        if (reason && reason !== 'วางสายแล้ว') setError(reason)
      },
    }, mic)

    session.current = s
    await s.start()
  }, [flush, persist, prefs, mic])

  const hangUp = useCallback(async (reason?: string) => {
    await session.current?.stop(reason)
  }, [])

  /**
   * สลับไมค์ทันทีถ้ามีสายอยู่ · ถ้าไม่มี ค่าใน localStorage จะไปมีผลตอนโทรครั้งหน้า
   *
   * ต่างจากภาษาและเสียงที่ล็อกไปกับ token แล้วแก้กลางสายไม่ได้ —
   * ไมค์เป็นของฝั่งเบราว์เซอร์ล้วน เสียบหูฟังกลางสายแล้วสลับได้เลย
   */
  const switchMic = useCallback(async (deviceId: string) => {
    setMic(deviceId)
    try {
      await session.current?.switchMic(deviceId)
    } catch {
      setError('สลับไมค์ไม่สำเร็จ — สายยังใช้ไมค์ตัวเดิมอยู่')
    }
  }, [])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      session.current?.setMuted(!m)
      return !m
    })
  }, [])

  /*
   * ล็อกหน้าจอหรือสลับไปแอปอื่น = วางสายให้เลย
   * เบราว์เซอร์หยุดเสียงอยู่แล้วเมื่อหน้าถูกซ่อน ปล่อยค้างไว้จะได้สายที่ตายแล้ว
   * แต่หน้าจอยังบอกว่ากำลังคุยอยู่
   */
  useEffect(() => {
    if (!running) return
    const onHide = () => {
      if (document.hidden) void hangUp('หน้าจอถูกปิด — วางสายให้แล้ว')
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [running, hangUp])

  const dropDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const api = useMemo<CallApi>(() => ({
    state, live, elapsed, muted, error, quotaOut, turns, level, drafts,
    start, hangUp, toggleMute, switchMic,
    dropDraft,
    dismissError: () => setError(null),
  }), [state, live, elapsed, muted, error, quotaOut, turns, level, drafts, start, hangUp, toggleMute, switchMic, dropDraft])

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* แถบตามไปทุกหน้า — ไมค์ที่เปิดค้างต้องมองเห็นตลอด (หลัก UX ข้อ 5) */}
      {/*
        ร่างค้างตามไปหน้าอื่นด้วย (แบบ 02) — เหตุผลเดียวกับแถบ "กำลังคุย"
        คือของที่ยังไม่จบต้องมองเห็นตลอด ไม่ใช่รอให้กลับมาเจอเอง
      */}
      {!path.startsWith('/kevin') && <DraftSheet />}

      {running && !path.startsWith('/kevin') && (
        <button className="callbar" onClick={() => router.push('/kevin')}>
          <span className="call__dot" />
          กำลังคุย {mmss(elapsed)}
          <span className="callbar__hint">แตะเพื่อกลับ</span>
        </button>
      )}
    </Ctx.Provider>
  )
}

export function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
