'use client'

import { useEffect, useState } from 'react'
import { saveSubscription, removeSubscription, sendTestReminder } from '@/app/actions/push'

type State = 'checking' | 'unsupported' | 'ios-needs-install' | 'default' | 'granted' | 'denied'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

function deviceLabel() {
  const ua = navigator.userAgent
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac/.test(ua) ? 'Mac' : 'อื่น ๆ'
  const br = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'เบราว์เซอร์'
  return `${os} · ${br}`
}

export default function NotificationSetup({
  vapidPublicKey,
  serverHasSubscription,
}: {
  vapidPublicKey: string
  /** มีแถวใน push_subscriptions แล้วหรือยัง — สำคัญกว่าสถานะ permission */
  serverHasSubscription: boolean
}) {
  const [state, setState] = useState<State>('checking')
  // อนุญาตแล้ว ≠ สมัครรับแล้ว · ต้องมี subscription จริงทั้งในเบราว์เซอร์และใน DB
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ua = navigator.userAgent
    const isIOS = /iPhone|iPad|iPod/.test(ua)
    const installed =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS ใช้ property เฉพาะตัว
      (navigator as unknown as { standalone?: boolean }).standalone === true

    // iOS ไม่ให้เว็บทั่วไปส่ง push — ต้องติดตั้งลงหน้าจอโฮมก่อน (doc/TRAPS.md)
    if (isIOS && !installed) { setState('ios-needs-install'); return }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported'); return
    }
    setState(Notification.permission as State)

    // ตรวจว่ามี subscription จริงไหม ไม่ใช่แค่ permission
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub) && serverHasSubscription))
      .catch(() => setSubscribed(false))
  }, [serverHasSubscription])

  async function enable() {
    setError(null); setMsg(null); setBusy(true)
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const permission = await Notification.requestPermission()
      setState(permission as State)
      if (permission !== 'granted') {
        setBusy(false)
        setError('ยังไม่ได้รับอนุญาต — เปิดสิทธิ์แจ้งเตือนของเว็บนี้ในตั้งค่าเบราว์เซอร์')
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const res = await saveSubscription({
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh!,
        auth: json.keys!.auth!,
        deviceLabel: deviceLabel(),
      })
      if (!res.ok) { setError(res.error); setBusy(false); return }
      setSubscribed(true)
      setMsg('เปิดการแจ้งเตือนบนเครื่องนี้แล้ว')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เปิดการแจ้งเตือนไม่สำเร็จ')
    }
    setBusy(false)
  }

  async function disable() {
    setError(null); setMsg(null); setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await removeSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setSubscribed(false)
      setMsg('ปิดการแจ้งเตือนบนเครื่องนี้แล้ว')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ปิดไม่สำเร็จ')
    }
    setBusy(false)
  }

  async function test() {
    setError(null); setMsg(null); setBusy(true)
    const res = await sendTestReminder()
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setMsg('ตั้งการเตือนทดสอบแล้ว — ควรเด้งภายใน 1 นาที (cron ทำงานทุกนาที)')
  }

  if (state === 'checking') return <div className="skel" style={{ height: 80 }} />

  if (state === 'ios-needs-install') {
    return (
      <div className="empty" style={{ textAlign: 'left' }}>
        <strong>บน iPhone ต้องติดตั้งลงหน้าจอโฮมก่อน</strong>
        <p className="muted" style={{ marginTop: '0.4rem' }}>
          Safari บน iPhone ไม่ให้เว็บทั่วไปส่งการแจ้งเตือน ต้องเปิดจากไอคอนบนหน้าจอโฮมเท่านั้น
        </p>
        <ol className="steps">
          <li>กดปุ่ม <strong>แชร์</strong> ด้านล่างของ Safari</li>
          <li>เลื่อนหา <strong>เพิ่มลงในหน้าจอโฮม</strong></li>
          <li>ปิด Safari แล้ว<strong>เปิด KeviN จากไอคอน</strong>บนหน้าจอโฮม</li>
          <li>กลับมาหน้านี้อีกครั้ง แล้วกดเปิดการแจ้งเตือน</li>
        </ol>
      </div>
    )
  }

  if (state === 'unsupported') {
    return <p className="alert">เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนแบบ push</p>
  }

  return (
    <>
      <p className="muted" style={{ marginBottom: '0.9rem' }}>
        สิทธิ์แจ้งเตือน:{' '}
        <strong className="strong">
          {state === 'granted' ? 'อนุญาตแล้ว' : state === 'denied' ? 'ถูกปฏิเสธ' : 'ยังไม่ได้ขอ'}
        </strong>
        {' · '}สมัครรับแล้ว:{' '}
        <strong className="strong">{subscribed ? 'ใช่' : 'ยัง'}</strong>
      </p>

      {state === 'granted' && !subscribed && (
        <p className="alert alert--gap">
          เบราว์เซอร์อนุญาตแล้ว แต่เครื่องนี้ยังไม่ได้สมัครรับ — กดปุ่มด้านล่างให้จบขั้นตอน
          ไม่งั้นการเตือนจะถูกทำเครื่องหมายว่าส่งแล้วทั้งที่ไม่มีอะไรเด้ง
        </p>
      )}

      {state === 'denied' && (
        <p className="alert alert--gap">
          เบราว์เซอร์จำการปฏิเสธไว้ ต้องไปเปิดสิทธิ์แจ้งเตือนของเว็บนี้เองในตั้งค่าเบราว์เซอร์
        </p>
      )}

      <div className="actions">
        {!subscribed ? (
          <button className="btn" disabled={busy || state === 'denied'} onClick={enable}>
            {busy ? 'กำลังตั้งค่า…' : state === 'granted' ? 'สมัครรับบนเครื่องนี้' : 'เปิดการแจ้งเตือน'}
          </button>
        ) : (
          <>
            <button className="btn" disabled={busy} onClick={test}>
              ส่งการแจ้งเตือนทดสอบ
            </button>
            <button className="btn btn--quiet" disabled={busy} onClick={disable}>
              ปิดบนเครื่องนี้
            </button>
          </>
        )}
      </div>

      {msg && <p className="hint" style={{ marginTop: '0.8rem' }}>{msg}</p>}
      {error && <p className="alert alert--gap" role="alert">{error}</p>}
    </>
  )
}
