'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('กรอกอีเมลและรหัสผ่านก่อน')
      return
    }

    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)

    if (error) {
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

  return (
    <main className="wrap" style={{ maxWidth: 380, paddingTop: '5rem' }}>
      <div className="page-head">
        <h1>KeviN</h1>
        <div className="sub">เข้าสู่ระบบ</div>
      </div>

      <form onSubmit={onSubmit} noValidate>
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
              if (error) setError(null)
            }}
          />
        </label>

        <label className="field">
          <span>รหัสผ่าน</span>
          <input
            className="input"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError(null)
            }}
          />
        </label>

        {error && (
          <p className="alert" style={{ margin: '0 0 0.9rem' }} role="alert">
            {error}
          </p>
        )}

        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </main>
  )
}
