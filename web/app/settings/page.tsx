import { Content } from '@/components/Reveal'
import { createClient } from '@/lib/supabase/server'
import NotificationSetup from './NotificationSetup'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, device_label, enabled, created_at')
    .order('created_at')

  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

  return (
    <Content>
      <main className="wrap">
        <div className="page-head">
          <h1>ตั้งค่า</h1>
          <div className="sub">การแจ้งเตือน</div>
        </div>

        {vapid ? (
          <NotificationSetup vapidPublicKey={vapid} serverHasSubscription={(subs ?? []).length > 0} />
        ) : (
          <p className="alert">ยังไม่ได้ตั้งค่า VAPID public key</p>
        )}

        <div className="sec"><span>เครื่องที่เปิดไว้</span><span>{subs?.length ?? 0}</span></div>
        {(subs ?? []).length === 0 ? (
          <p className="none">ยังไม่มีเครื่องไหนเปิดการแจ้งเตือน</p>
        ) : (
          (subs ?? []).map((s) => (
            <div className="row" key={s.id}>
              <span className="row__stripe" style={{ background: s.enabled ? 'var(--task)' : 'var(--faint)' }} />
              <div className="row__body">
                <div className="row__title">{s.device_label ?? 'ไม่ทราบชื่อเครื่อง'}</div>
                <div className="row__meta">{s.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</div>
              </div>
            </div>
          ))
        )}
      </main>
    </Content>
  )
}
