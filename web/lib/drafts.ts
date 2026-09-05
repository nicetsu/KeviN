/**
 * ร่างการกระทำ — สิ่งที่ผู้ช่วย **เสนอ** ว่าจะทำ ยังไม่ได้ทำ
 *
 * หลักการเดียวของทั้งเรื่องนี้คือ **โมเดลไม่เขียน โมเดลเสนอ** (doc/WRITE.md)
 * ชั้น tool คืนวัตถุในไฟล์นี้กลับมา เว็บวาดเป็นการ์ด แล้วการเขียนจริงเกิดที่
 * `app/actions/propose.ts` ตอนผู้ใช้กดยืนยัน
 *
 * ⚠️ ไฟล์นี้อยู่นอก `lib/ai/` โดยตั้งใจ — ทั้งฝั่ง client และ server ใช้ร่วมกัน
 *    และ `test/guard.test.ts` ตรวจเฉพาะ `lib/ai/` ซึ่งต้องไม่มีทางเขียนอยู่เลย
 *
 * ⚠️ **ร่างไม่ลง DB** อยู่ใน state ฝั่งเว็บอย่างเดียว · หายไปพร้อมการรีเฟรช
 *    คือพฤติกรรมที่ถูก ไม่ใช่บั๊ก — ร่างที่ค้างข้ามวันไม่ควรยืนยันได้อีก
 *    เพราะบริบทที่ทำให้เกิดร่างนั้นหมดอายุไปแล้ว
 */

/** ชนิดของงานที่ผู้ช่วยเสนอได้ · **ไม่มีการลบถาวรอยู่ในรายการนี้โดยตั้งใจ** */
export type DraftAction =
  | {
      kind: 'add_item'
      /** `shortnote` ไม่มีเวลาและไม่มีสถานะเสร็จ (CHECK `shortnote_timeless`) */
      type: 'task' | 'reminder' | 'shortnote'
      projectId: string
      title: string
      body?: string
      /** ISO · task เท่านั้น — reminder ห้ามมี (CHECK `reminder_no_due`) */
      dueAt?: string
      /** ISO · reminder เท่านั้น — task ห้ามมี (CHECK `task_no_remind`) */
      remindAt?: string
    }
  | {
      kind: 'edit_item'
      itemId: string
      title?: string
      body?: string
      /** `null` = ล้างค่าทิ้ง · `undefined` = ไม่แตะ */
      dueAt?: string | null
      remindAt?: string | null
      /** ย้ายข้ามวิชา — ย้ายกลับได้จึงถือว่าย้อนกลับได้ */
      projectId?: string
    }
  | { kind: 'complete_item'; itemId: string; done: boolean }
  | { kind: 'archive_item'; itemId: string }
  | {
      kind: 'add_event'
      projectId: string
      title: string
      body?: string
      startsAt: string
      endsAt: string
      location?: string
      label?: string
    }

export type DraftKind = DraftAction['kind']

/** หนึ่งบรรทัดในการ์ด — ของที่ผู้ใช้ต้องทานก่อนกดยืนยัน */
export type DraftLine = {
  label: string
  value: string
  /** ค่าเดิมสำหรับการแก้ · มีเมื่อไหร่การ์ดจะแสดงคู่กันว่าเปลี่ยนจากอะไรเป็นอะไร */
  was?: string
  /** เน้นสีเส้นตายให้ต่างจากบรรทัดอื่น */
  tone?: 'due' | 'plain'
}

export type Draft = {
  /**
   * id ชั่วคราวของร่าง — **ไม่ใช่ id ในฐานข้อมูล**
   *
   * มีไว้ให้พูดแก้ต่อได้ ("เปลี่ยนเป็นวันศุกร์" → แก้ร่างใบเดิม ไม่ใช่สร้างใบใหม่)
   * และให้ปุ่มยืนยันชี้ถูกใบตอนมีหลายใบซ้อนกัน
   */
  id: string
  /**
   * รอบการแก้ของร่างใบนี้ — เพิ่มทีละหนึ่งทุกครั้งที่ `propose_update_draft` แก้มัน
   *
   * ⚠️ **มีไว้ให้การ์ดบนจอรีเซ็ตตัวเอง** · `DraftCard` เก็บค่าที่กำลังแก้ไว้ใน state
   *    ของตัวเอง ถ้าร่างใบเดิมถูกแก้แล้ว React ยัง mount การ์ดตัวเดิมอยู่ (เพราะ
   *    `key` เป็น id ซึ่งไม่เปลี่ยน) ผู้ใช้จะเห็นของเก่าค้างทั้งที่ข้อมูลใหม่มาแล้ว
   *    ทุกที่ที่วางการ์ดจึงต้องใช้ `key` ที่มี `rev` ประกอบด้วย — `draftKey()`
   */
  rev?: number
  action: DraftAction
  /** พาดหัวการ์ด เช่น "เพิ่มงาน" · "เลื่อนกำหนดส่ง" */
  heading: string
  /** ชื่อของสิ่งที่กำลังพูดถึง — ตัวใหญ่สุดในการ์ด */
  title: string
  lines: DraftLine[]
  /** ประโยคที่ทำให้เกิดร่างนี้ · เผื่ออ่านแล้วงงว่ามาจากไหน */
  source?: string
}

/** ชนิดที่ผู้ช่วยเสนอได้ทั้งหมด — ใช้ตรวจฝั่ง server ว่า kind ที่ส่งมาอยู่ในรายการ */
export const DRAFT_KINDS: readonly DraftKind[] = [
  'add_item',
  'edit_item',
  'complete_item',
  'archive_item',
  'add_event',
]

export function isDraftKind(v: unknown): v is DraftKind {
  return typeof v === 'string' && (DRAFT_KINDS as readonly string[]).includes(v)
}

/**
 * ฟิลด์เวลาที่ร่างใบนี้ **แก้ได้จริง** · `null` = ไม่มี จึงไม่ต้องขึ้นช่องให้กรอก
 *
 * ⚠️ ช่องเวลาที่ขึ้นมาแล้วไม่มีที่ให้ค่าลง คือช่องที่กรอกแล้วหายเงียบ ๆ ตอนกด
 *    "เอาตามนี้" · สองกรณีที่เคยเป็นแบบนั้น (เจอ 4 ก.ย. 2026) —
 *    **โน้ต** ซึ่งไม่มีเวลาเลย (CHECK `shortnote_timeless`) และ **ร่างแก้ที่ไม่ได้แตะเวลา**
 *    ซึ่งชั้นเสนอจงใจไม่ใส่ฟิลด์เวลามาให้ (`undefined` = ไม่แตะ ต่างจาก `null` = ล้าง)
 */
export function draftTimeField(action: DraftAction): 'due' | 'remind' | 'start' | null {
  switch (action.kind) {
    case 'add_item':
      return action.type === 'task' ? 'due' : action.type === 'reminder' ? 'remind' : null
    case 'edit_item':
      return action.dueAt !== undefined ? 'due' : action.remindAt !== undefined ? 'remind' : null
    case 'add_event':
      return 'start'
    default:
      return null
  }
}

/**
 * คำที่ใช้บนปุ่มยืนยัน — ต่างกันตามชนิดเพราะ "ยืนยัน" เฉย ๆ บอกไม่ได้ว่ากำลังจะทำอะไร
 * และการ์ดอาจถูกอ่านผ่าน ๆ ระหว่างคุยอยู่
 */
export function confirmLabel(kind: DraftKind): string {
  switch (kind) {
    case 'add_item':
      return 'เพิ่มเลย'
    case 'edit_item':
      return 'บันทึกการแก้'
    case 'complete_item':
      return 'ยืนยัน'
    case 'archive_item':
      return 'เก็บเข้าคลัง'
    case 'add_event':
      return 'เพิ่มกิจกรรม'
  }
}

/**
 * `key` ของการ์ดหนึ่งใบ — **ต้องใช้ตัวนี้ทุกที่ที่วาง `DraftCard`**
 *
 * ใช้ id เปล่า ๆ ไม่ได้ เพราะร่างที่ถูกแก้ยังเป็นใบเดิม id จึงไม่เปลี่ยน
 * React จะไม่ mount ใหม่ แล้วค่าที่การ์ดถือไว้ใน state จะเป็นของรอบก่อน
 */
export function draftKey(draft: Draft): string {
  return `${draft.id}#${draft.rev ?? 0}`
}

/**
 * อ่านร่างค้างที่เบราว์เซอร์ส่งมากับคำขอ — **ขาเข้าที่เชื่อไม่ได้**
 *
 * ใช้ที่ `/api/chat` และ `/api/read/[tool]` ก่อนส่งเข้า `runTool` · กันแค่รูปทรง
 * ไม่ได้กันความจริง เพราะความจริงของร่างถูกตรวจอีกทีตอน `propose_update_draft`
 * เรียก `build` ใหม่ทั้งใบ และอีกทีตอนเขียนจริงที่ `lib/applyDraft.ts`
 *
 * ⚠️ **มีเพดานจำนวน** ร่างค้างบนจอจริง ๆ มีไม่กี่ใบ · ถ้าไม่จำกัด คำขอเดียว
 *    ยัดร่างมาเป็นพันใบก็ได้ ซึ่งกลายเป็นภาระของเซิร์ฟเวอร์ฟรี ๆ
 */
export function readOpenDrafts(raw: unknown, max = 12): Draft[] {
  if (!Array.isArray(raw)) return []
  const out: Draft[] = []
  for (const v of raw.slice(-max)) {
    if (!v || typeof v !== 'object') continue
    const d = v as Partial<Draft>
    const action = d.action as { kind?: unknown } | undefined
    if (typeof d.id !== 'string' || !action || !isDraftKind(action.kind)) continue
    if (typeof d.heading !== 'string' || typeof d.title !== 'string') continue
    out.push({
      id: d.id,
      rev: typeof d.rev === 'number' && Number.isFinite(d.rev) ? d.rev : 0,
      heading: d.heading,
      title: d.title,
      lines: Array.isArray(d.lines) ? d.lines : [],
      action: d.action as DraftAction,
      source: typeof d.source === 'string' ? d.source : undefined,
    })
  }
  return out
}
