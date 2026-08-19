import { createClient } from '@/lib/supabase/server'
import { bangkokToday } from '@/lib/time'
import QuickAdd, { type QuickProject } from './QuickAdd'

/**
 * โหลดรายชื่อวิชาให้ตัวตีความ แล้วแขวนปุ่มเพิ่มเร็วไว้ทุกหน้า
 * ไม่แสดงตอนยังไม่ล็อกอิน — ไม่มี project ก็ไม่มีอะไรให้เพิ่ม
 */
export default async function QuickAddMount() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null

  const { data } = await supabase
    .from('projects')
    .select('id, name, description')
    .is('archived_at', null)
    .order('sort_order')

  const projects: QuickProject[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    // รหัสวิชาใน description ใช้ค้นได้ด้วย เช่นพิมพ์ 01219241
    aliases: String(p.description ?? '')
      .split('·')
      .map((s: string) => s.trim())
      .filter((s: string) => /^\d{8}/.test(s))
      .map((s: string) => s.split(/[\s-]/)[0]),
  }))

  if (projects.length === 0) return null

  return <QuickAdd projects={projects} today={bangkokToday().dateKey} />
}
