'use client'

/**
 * เข้าสู่ระบบ และ สมัครด้วยรหัสเชิญ
 *
 * ⚠️ **ด่านรหัสเชิญที่อยู่ในไฟล์นี้ไม่ได้กันอะไรเลย** — anon key อยู่ใน bundle
 *    ที่ผู้ใช้เปิดดูได้ ใครก็เรียก `supabase.auth.signUp()` ตรงจากคอนโซลได้
 *    โดยไม่ผ่านหน้าจอนี้ · **ตัวที่กันจริงคือ trigger `handle_new_user()` ใน DB**
 *    (supabase/migrations/20260908120000_multi_user.sql)
 *
 *    ที่ยังเช็กตรงนี้เพราะ trigger ที่ raise จะโผล่มาเป็น "Database error saving
 *    new user" ซึ่งอ่านไม่รู้เรื่อง · สองชั้นนี้ทำคนละหน้าที่ — ชั้นนี้ทำข้อความ
 *    ชั้นนั้นทำการกัน · **ห้ามถอดชั้น DB ออกเพราะคิดว่าชั้นนี้พอแล้ว**
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'in' | 'up'

/**
 * ⚠️ **ค่านี้เป็นแค่ด่านมารยาท** — ตัวที่บังคับจริงคือ Supabase Auth ซึ่งตั้ง
 *    ค่าเริ่มต้นไว้ที่ 6 · ถ้าอยากให้สองค่าตรงกัน ต้องไปตั้ง Minimum password
 *    length เป็น 8 ในหน้า Authentication → Sign In / Providers ด้วย
 */
const MIN_PASSWORD = 8

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  /** เปลี่ยนโหมดแล้วล้างสิ่งที่ค้างจากโหมดก่อน — ข้อความผิดของอีกโหมดไม่ควรค้างอยู่ */
  function switchTo(next: Mode) {
    if (next === mode) return
    setMode(next)
    setError(null)
    setSent(false)
  }

  function clearError() {
    if (error) setError(null)
  }

  async function signIn() {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      // "ยังไม่ยืนยันอีเมล" ต้องแยกจาก "รหัสผิด" ให้ขาด — ไม่งั้นคนที่สมัครแล้ว
      // ลืมกดลิงก์ในเมล จะนั่งพิมพ์รหัสผ่านใหม่ซ้ำ ๆ ทั้งที่รหัสถูกมาตลอด
      if (error.code === 'email_not_confirmed') {
        setError('อีเมลนี้ยังไม่ได้ยืนยัน — เปิดลิงก์ในเมลที่ส่งไปก่อน')
        setSent(true)
        return
      }
      setError(
        error.message === 'Invalid login credentials'
          ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
          : error.message
      )
      return
    }

    router.replace('/')
    router.refresh()
  }

  async function signUp() {
    const supabase = createClient()
    const code = invite.trim()

    // เช็กรหัสก่อนเพื่อให้ได้ข้อความที่อ่านรู้เรื่อง · ไม่ใช่เพื่อกัน (ดูหัวไฟล์)
    const { data: valid, error: checkError } = await supabase.rpc('invite_code_valid', {
      p_code: code,
    })
    if (checkError) {
      setError('ตรวจรหัสเชิญไม่สำเร็จ · ลองใหม่อีกครั้ง')
      return
    }
    if (valid !== true) {
      setError('รหัสเชิญนี้ใช้ไม่ได้ หรือถูกใช้ไปแล้ว')
      return
    }

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // trigger ใน DB อ่านค่านี้จาก raw_user_meta_data — ชื่อคีย์ต้องตรงกัน
        data: { invite_code: code },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })

    if (error) {
      // รหัสอาจถูกใช้ไปในจังหวะระหว่างที่เช็กกับที่สมัคร (สองคนกดพร้อมกัน)
      // trigger เป็นตัวตัดสินจริง ข้อความที่ได้จึงเป็นของ Postgres ที่อ่านไม่ออก
      setError(
        error.message.includes('Database error')
          ? 'รหัสเชิญนี้เพิ่งถูกใช้ไป · ขอรหัสใหม่'
          : error.message
      )
      return
    }

    setSent(true)
    setPassword('')
  }

  async function resend() {
    setBusy(true)
    const supabase = createClient()
    await supabase.auth.resend({ type: 'signup', email: email.trim() })
    setBusy(false)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('กรอกอีเมลและรหัสผ่านก่อน')
      return
    }
    if (mode === 'up') {
      if (!invite.trim()) {
        setError('ต้องมีรหัสเชิญถึงจะสมัครได้')
        return
      }
      if (password.length < MIN_PASSWORD) {
        setError(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัว`)
        return
      }
    }

    setBusy(true)
    try {
      await (mode === 'in' ? signIn() : signUp())
    } finally {
      setBusy(false)
    }
  }

  // สมัครสำเร็จแล้ว — จอนี้แทนที่ฟอร์มทั้งใบ เพราะสิ่งเดียวที่ต้องทำต่อคือเปิดเมล
  if (sent && mode === 'up') {
    return (
      <main className="wrap" style={{ maxWidth: 380, paddingTop: '5rem' }}>
        <div className="page-head">
          <h1>KeviN</h1>
          <div className="sub">ยืนยันอีเมล</div>
        </div>

        <div className="empty">
          <strong>ส่งลิงก์ไปที่ {email.trim()} แล้ว</strong>
          เปิดเมลแล้วกดลิงก์ในนั้นก่อน ถึงจะเข้าใช้งานได้
        </div>

        <div className="actions">
          <button className="btn btn--ghost" type="button" onClick={resend} disabled={busy}>
            {busy ? 'กำลังส่ง…' : 'ส่งอีกครั้ง'}
          </button>
          <button className="btn btn--quiet" type="button" onClick={() => switchTo('in')}>
            กลับไปเข้าสู่ระบบ
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="wrap" style={{ maxWidth: 380, paddingTop: '5rem' }}>
      <div className="page-head">
        <h1>KeviN</h1>
        <div className="sub">{mode === 'in' ? 'เข้าสู่ระบบ' : 'สมัครด้วยรหัสเชิญ'}</div>
      </div>

      <div className="seg seg--wide" role="group" aria-label="เข้าสู่ระบบหรือสมัคร">
        <button type="button" data-on={mode === 'in'} onClick={() => switchTo('in')}>
          เข้าสู่ระบบ
        </button>
        <button type="button" data-on={mode === 'up'} onClick={() => switchTo('up')}>
          สมัคร
        </button>
      </div>

      <form onSubmit={onSubmit} noValidate style={{ marginTop: '1.4rem' }}>
        <label className="field">
          <span>อีเมล</span>
          <input
            className="input"
            type="email"
            value={email}
            autoComplete="email"
            autoFocus
            onChange={(e) => {
              setEmail(e.target.value)
              clearError()
            }}
          />
        </label>

        <label className="field">
          <span>รหัสผ่าน</span>
          <input
            className="input"
            type="password"
            value={password}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            onChange={(e) => {
              setPassword(e.target.value)
              clearError()
            }}
          />
          {mode === 'up' && <span className="hint">อย่างน้อย {MIN_PASSWORD} ตัว</span>}
        </label>

        {mode === 'up' && (
          <label className="field">
            <span>รหัสเชิญ</span>
            <input
              className="input"
              type="text"
              value={invite}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => {
                setInvite(e.target.value)
                clearError()
              }}
            />
            <span className="hint">ใช้ได้ครั้งเดียว</span>
          </label>
        )}

        {error && (
          <p className="alert" style={{ margin: '0 0 0.9rem' }} role="alert">
            {error}
          </p>
        )}

        {sent && mode === 'in' && (
          <button
            className="btn btn--ghost"
            type="button"
            onClick={resend}
            disabled={busy}
            style={{ width: '100%', marginBottom: '0.9rem' }}
          >
            {busy ? 'กำลังส่ง…' : 'ส่งลิงก์ยืนยันอีกครั้ง'}
          </button>
        )}

        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy
            ? mode === 'in'
              ? 'กำลังเข้าสู่ระบบ…'
              : 'กำลังสมัคร…'
            : mode === 'in'
              ? 'เข้าสู่ระบบ'
              : 'สมัคร'}
        </button>
      </form>
    </main>
  )
}
