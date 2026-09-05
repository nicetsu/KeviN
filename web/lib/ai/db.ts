/**
 * หน้าตาของฐานข้อมูลเท่าที่ชั้น tool มองเห็น
 *
 * **ชั้นที่ 2 ของสามชั้นที่กันการเขียน** (ARCHITECTURE.md §6)
 *
 * ไม่ใช่ allowlist ที่ต้องคอยดูแล แต่เป็นการตัดความสามารถทิ้งตั้งแต่ในนิยาม —
 * interface นี้ **ไม่มีเมธอดสำหรับเขียนเลย** ไม่มี insert ไม่มี update ไม่มี delete
 * ไม่มี rpc ที่รับฟังก์ชันนอกรายการ · โค้ดที่พยายามเขียนข้อมูลจะคอมไพล์ไม่ผ่าน
 * ไม่ใช่พังตอนรัน
 *
 * ที่ไม่ส่ง Supabase client เข้ามาตรง ๆ ก็เพราะเหตุนี้ — client ตัวจริงมี
 * `.insert()` ติดมาด้วยเสมอ ใครเผลอเรียกก็เขียนได้เลย
 */

/** ฟังก์ชันใน DB ที่เรียกได้ · เพิ่มชื่อใหม่ต้องมาแก้ที่นี่ก่อน */
export type ReadableRpc = 'calendar_entries' | 'schedule_occurrences'

export type Filter =
  | { col: string; op: 'eq' | 'gt' | 'gte' | 'lt' | 'lte'; value: string | number | boolean }
  | { col: string; op: 'is'; value: null }
  | { col: string; op: 'in'; value: readonly (string | number)[] }

export type Query = {
  table: string
  columns: string
  filters?: readonly Filter[]
  order?: { col: string; ascending?: boolean }
  /** กันคำตอบยาวจนกินโควตาโทเคน · ทุก tool ต้องใส่ */
  limit: number
}

export type ReadOnlyDb = {
  rpc<T>(fn: ReadableRpc, args: Record<string, unknown>): Promise<T[]>
  rows<T>(query: Query): Promise<T[]>
}

/**
 * ข้อผิดพลาดที่ต้องบอกโมเดลตรง ๆ ว่า **ดึงข้อมูลไม่ได้**
 *
 * ห้ามกลืนแล้วคืนรายการว่างเด็ดขาด — โมเดลจะพูดอย่างมั่นใจว่า "พรุ่งนี้ว่าง"
 * ทั้งที่แค่ query ไม่ผ่าน ซึ่งเป็นคำโกหกที่แพงที่สุดที่แอปนี้พูดได้
 * และผิดหลัก UX ข้อ 5 ตรง ๆ (ARCHITECTURE.md §6)
 */
export class ToolFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolFetchError'
  }
}
