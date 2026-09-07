import Link from 'next/link'
import { Content } from '@/components/Reveal'
import { signOut } from '@/app/actions/auth'
import { KEEP_DAYS } from '@/lib/archive'
import { createClient } from '@/lib/supabase/server'
import NotificationSetup from './NotificationSetup'
import TalkSummary from './TalkSummary'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, device_label, enabled, created_at')
    .order('created_at')

  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

  // อ่านอีเมลจาก claim ในเครื่อง ไม่ยิงเน็ต — เหตุผลเดียวกับ `currentUserId()`
  const { data: claimData } = await supabase.auth.getClaims()
  const email = typeof claimData?.claims?.email === 'string' ? claimData.claims.email : null

  // นับของในคลังเพื่อบอกจำนวนที่ทางเข้า
  const { count } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .not('archived_at', 'is', null)
  const archivedCount = count ?? 0

  return (
    <Content>
      <main className="wrap">
        <div className="page-head">
          <h1>ตั้งค่า</h1>
        </div>

        <div className="sec">
          <span>การแจ้งเตือน</span>
          <span>{subs?.length ?? 0} เครื่อง</span>
        </div>

        {vapid ? (
          <NotificationSetup vapidPublicKey={vapid} serverHasSubscription={(subs ?? []).length > 0} />
        ) : (
          <p className="alert">ยังไม่ได้ตั้งค่า VAPID public key</p>
        )}

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

        {/*
          ค่าที่ตั้งไว้สำหรับการคุย — **ไม่ได้ย้ายตัวตั้งค่ามาที่นี่**
          ปุ่มฟันเฟืองในหน้า KeviN ยังอยู่ เพราะเป็นของที่อยากปรับระหว่างคุย
          ที่นี่เป็นที่ที่สองที่หาเจอ · หน้าที่ชื่อ "ตั้งค่า" ควรบอกได้ว่าตั้งอะไรไว้
        */}
        <div className="sec"><span>คุยกับ KeviN</span><span /></div>
        <TalkSummary />

        {/*
          เก็บกวาดทำงานทุกคืนตีสามโดยไม่มีใครเห็น — อย่างน้อยต้องมีที่ให้รู้ว่า
          มันทำอะไรอยู่ และของที่ถูกเก็บไปแล้วดูได้ที่ไหน
        */}
        <div className="sec"><span>การเก็บกวาด</span><span /></div>
        <div className="row">
          <span className="row__stripe" style={{ background: 'var(--faint)' }} />
          <div className="row__body">
            <div className="row__title">เก็บของที่ผ่านไปแล้วอัตโนมัติ</div>
            <div className="row__meta">ทุกคืน 03:00 · การเตือนที่ข้ามวัน และงานที่เสร็จแล้วเลยวันส่ง</div>
          </div>
        </div>
        <div className="row">
          <span className="row__stripe" style={{ background: 'var(--due)' }} />
          <div className="row__body">
            <div className="row__title">ลบถาวรหลังเก็บไว้ครบ {KEEP_DAYS} วัน</div>
            <div className="row__meta">กู้คืนไม่ได้ · กดคืนได้ก่อนถึงกำหนด</div>
          </div>
        </div>
        <Link href="/library/archive" className="archive-link">
          <span>ดูของที่เก็บไว้</span>
          <span className="archive-link__n">{archivedCount > 0 ? `${archivedCount} ›` : '›'}</span>
        </Link>

        {/*
          อยู่ล่างสุดโดยตั้งใจ — เป็นของที่กดปีละครั้ง และการวางไว้บนสุดจะทำให้
          ปุ่มที่พาออกจากแอปอยู่ในสายตาตลอดเวลาที่มาหาเรื่องอื่น
        */}
        <div className="sec sec--gap"><span>บัญชี</span><span /></div>
        {email && (
          <div className="row">
            <span className="row__stripe" style={{ background: 'var(--brand)' }} />
            <div className="row__body">
              <div className="row__title">{email}</div>
              <div className="row__meta">ข้อมูลทั้งหมดในแอปผูกกับบัญชีนี้บัญชีเดียว</div>
            </div>
          </div>
        )}
        <form action={signOut}>
          <button className="btn btn--quiet" type="submit" style={{ width: '100%', marginTop: '0.9rem' }}>
            ออกจากระบบ
          </button>
        </form>
      </main>
    </Content>
  )
}
