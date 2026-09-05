/**
 * ต่อ `ReadOnlyDb` เข้ากับ Supabase จริง
 *
 * ไฟล์นี้เป็น**ที่เดียว**ที่ชั้น tool แตะ Supabase client ตัวจริง ซึ่งมี
 * `.insert()` / `.update()` / `.delete()` ติดมาด้วยเสมอ · ที่เหลือของชั้น tool
 * เห็นแค่ interface ที่ไม่มีเมธอดเขียนเลย (ARCHITECTURE.md §6)
 *
 * กติกาของไฟล์นี้: **ห้ามมีคำว่า insert/update/delete/upsert ปรากฏข้างล่างนี้**
 */
import { createClient } from '@/lib/supabase/server'
import { ToolFetchError, type Query, type ReadOnlyDb, type ReadableRpc } from './db'

export async function readOnlyDb(): Promise<ReadOnlyDb> {
  const supabase = await createClient()

  return {
    async rpc<T>(fn: ReadableRpc, args: Record<string, unknown>): Promise<T[]> {
      const { data, error } = await supabase.rpc(fn, args)
      if (error) throw new ToolFetchError(error.message)
      return (data ?? []) as T[]
    },

    async rows<T>(query: Query): Promise<T[]> {
      // ตัว builder ของ PostgREST เปลี่ยน type ไปเรื่อยตามเมธอดที่ต่อ ซึ่งเขียน
      // ให้ถูกทั้งสายโดยไม่ใช้ any แทบเป็นไปไม่ได้ · จำกัดไว้ในฟังก์ชันเดียวนี้
      /* eslint-disable @typescript-eslint/no-explicit-any */
      let q: any = supabase.from(query.table).select(query.columns)

      for (const f of query.filters ?? []) {
        if (f.op === 'is') q = q.is(f.col, f.value)
        else if (f.op === 'in') q = q.in(f.col, [...f.value])
        else q = q[f.op](f.col, f.value)
      }

      if (query.order) {
        q = q.order(query.order.col, {
          ascending: query.order.ascending ?? true,
          nullsFirst: false,
        })
      }

      const { data, error } = await q.limit(query.limit)
      /* eslint-enable @typescript-eslint/no-explicit-any */

      if (error) throw new ToolFetchError(error.message)
      return (data ?? []) as T[]
    },
  }
}
