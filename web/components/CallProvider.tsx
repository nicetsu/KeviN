'use client'

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { VoiceCall as Session, type CallState, type Caption } from '@/lib/voice/session'
import { useTalkPrefs } from '@/lib/talkPrefs'
import { redactVoiceTurns } from '@/lib/voice/transcript'

export type VoiceTurn = { role: 'user' | 'assistant'; content: string }

type CallApi = {
  state: CallState | 'idle'
  /** null = ยังไม่ได้โทร */
  live: Caption | null
  elapsed: number
  muted: boolean
  error: string | null
  /** true = โควตาเสียงหมด · หน้าจอควรดันไปโหมดแชต */
  quotaOut: boolean
  /** turn ที่ปิดก้อนแล้วในสายปัจจุบัน · หน้า KeviN เอาไปแสดงสด */
  turns: VoiceTurn[]
  start: () => Promise<void>
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

  const [state, setState] = useState<CallState | 'idle'>('idle')
  const [live, setLive] = useState<Caption | null>(null)
  const [turns, setTurns] = useState<VoiceTurn[]>([])
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quotaOut, setQuotaOut] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const session = useRef<Session | null>(null)
  const buffer = useRef({ user: '', kevin: '' })
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
    const { user, kevin } = buffer.current
    const next: VoiceTurn[] = []
    // สิ่งที่พูดออกไปไม่ถูกเก็บ — ลงเป็นคำว่า voice แทน (lib/voice/transcript.ts)
    // คำบรรยายสด ๆ ระหว่างสายยังโชว์ข้อความจริงอยู่ แค่ไม่ถูกบันทึก
    if (user.trim()) next.push({ role: 'user', content: user.trim() })
    if (kevin.trim()) next.push({ role: 'assistant', content: kevin.trim() })
    buffer.current = { user: '', kevin: '' }
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
    buffer.current = { user: '', kevin: '' }
    setTurns([])

    const s = new Session(prefs, {
      onState: setState,
      onCaption: (c) => {
        const slot = c.who === 'user' ? 'user' : 'kevin'
        buffer.current[slot] += c.text
        setLive({ who: c.who, text: buffer.current[slot] })
      },
      onTurnEnd: flush,
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
        setMuted(false)
        if (reason && reason !== 'วางสายแล้ว') setError(reason)
      },
    })

    session.current = s
    await s.start()
  }, [flush, persist, prefs])

  const hangUp = useCallback(async (reason?: string) => {
    await session.current?.stop(reason)
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

  const api = useMemo<CallApi>(() => ({
    state, live, elapsed, muted, error, quotaOut, turns,
    start, hangUp, toggleMute,
    dismissError: () => setError(null),
  }), [state, live, elapsed, muted, error, quotaOut, turns, start, hangUp, toggleMute])

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* แถบตามไปทุกหน้า — ไมค์ที่เปิดค้างต้องมองเห็นตลอด (หลัก UX ข้อ 5) */}
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
