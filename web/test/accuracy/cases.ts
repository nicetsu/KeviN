/**
 * ชุดประโยคที่ใช้วัด — **ชุดเดียวกันทั้งโหมดแชตและโหมดโทร**
 *
 * ที่ใช้ชุดเดียวกันเพราะสองโหมดใช้ prompt คนละฉบับและ**คนละรุ่นของโมเดล**
 * ถ้าใช้คนละชุดจะแยกไม่ออกว่าที่ต่างกันคือความสามารถของรุ่น หรือเพราะโจทย์คนละข้อ
 *
 * วันนี้ตรึงไว้ที่ **ศุกร์ 4 ก.ย. 2026** ทุกคำตอบด้านเวลาจึงมีคำตอบเดียว
 */
import { BOARD, boardImage } from './board'
import { I, P } from './fixtures'
import { acted, called, fakeSuccessWords, first, spoken, th, utcLeaks, type Case, type Turn } from './harness'

/** ตรวจว่าร่างมีใบเดียวและเป็นชนิดที่ต้องการ · คืนข้อผิดถ้าไม่ใช่ */
function one(t: Turn, kind: string): string[] {
  if (t.drafts.length === 0) return ['ไม่ได้เสนอร่างเลย']
  if (t.drafts.length > 1) return [`เสนอมา ${t.drafts.length} ใบ ทั้งที่ควรมีใบเดียว`]
  const a = acted(t)
  return a?.kind === kind ? [] : [`ร่างเป็น ${a?.kind} ไม่ใช่ ${kind}`]
}

const CHECK_TIME = (got: string | null | undefined, want: string, label: string): string[] =>
  th(got) === want ? [] : [`${label} ได้ ${th(got)} ควรเป็น ${want}`]

export const CASES: Case[] = [
  {
    id: '01',
    title: 'เพิ่มงาน + วันในสัปดาห์หน้า',
    say: 'เพิ่มงานส่งรายงานบทที่ 4 วิชาสถาปัตยกรรมเครือข่าย กำหนดส่งพฤหัสหน้า ห้าโมงเย็น',
    want: 'propose_add_item · task · วิชาสถาปัตยกรรม · ส่ง 2026-09-10 17:00',
    check: (t) => {
      const bad = one(t, 'add_item')
      if (bad.length) return bad
      const a = acted(t)
      if (a?.kind !== 'add_item') return bad
      const out: string[] = []
      if (a.type !== 'task') out.push(`ชนิดเป็น ${a.type} ไม่ใช่ task`)
      if (a.projectId !== P.arch) out.push('ลงผิดวิชา')
      out.push(...CHECK_TIME(a.dueAt, '2026-09-10 17:00', 'กำหนดส่ง'))
      return out
    },
  },
  {
    id: '02',
    title: 'เพิ่มการเตือน — ต้องเป็น reminder ไม่ใช่ task',
    say: 'เตือนผมพรุ่งนี้บ่ายสามว่าต้องส่งใบลาที่ภาควิชา',
    want: 'propose_add_item · reminder · เตือน 2026-09-05 15:00',
    check: (t) => {
      const bad = one(t, 'add_item')
      if (bad.length) return bad
      const a = acted(t)
      if (a?.kind !== 'add_item') return bad
      const out: string[] = []
      if (a.type !== 'reminder') out.push(`ชนิดเป็น ${a.type} ไม่ใช่ reminder`)
      if (a.dueAt) out.push('การเตือนต้องไม่มีกำหนดส่ง')
      out.push(...CHECK_TIME(a.remindAt, '2026-09-05 15:00', 'เวลาเตือน'))
      return out
    },
  },
  {
    id: '03',
    title: 'เพิ่มโน้ต — ไม่มีเวลา และต้องลงวิชาที่พูดถึง',
    say: 'จดไว้หน่อยว่าอาจารย์แคลบอกให้อ่านบทที่ 5 ก่อนสอบ',
    want: 'propose_add_item · shortnote · วิชาแคลคูลัส 2 · ไม่มีเวลา',
    check: (t) => {
      const bad = one(t, 'add_item')
      if (bad.length) return bad
      const a = acted(t)
      if (a?.kind !== 'add_item') return bad
      const out: string[] = []
      if (a.type !== 'shortnote') out.push(`ชนิดเป็น ${a.type} ไม่ใช่ shortnote`)
      if (a.projectId !== P.calc) out.push('ลงผิดวิชา')
      if (a.dueAt || a.remindAt) out.push('โน้ตมีเวลาติดมาด้วย')
      return out
    },
  },
  {
    id: '04',
    title: 'ตัวเลขวันที่ + เวลาแบบพูด (จุดที่ ASR พลาดบ่อยสุด)',
    say: 'เพิ่มงานส่งการบ้านแคลคูลัส วันที่ 14 สี่ทุ่ม',
    want: 'task · ส่ง 2026-09-14 22:00',
    check: (t) => {
      const bad = one(t, 'add_item')
      if (bad.length) return bad
      const a = acted(t)
      if (a?.kind !== 'add_item') return bad
      const out: string[] = []
      if (a.projectId !== P.calc) out.push('ลงผิดวิชา')
      out.push(...CHECK_TIME(a.dueAt, '2026-09-14 22:00', 'กำหนดส่ง'))
      return out
    },
  },
  {
    id: '05',
    title: 'ติ๊กเสร็จ — ต้องหา id จาก tool items ก่อน',
    say: 'งานส่งรายงานบทที่ 3 เสร็จแล้ว ติ๊กให้หน่อย',
    want: 'เรียก items ก่อน แล้ว propose_complete_item ที่ id ถูกใบ · done = true',
    check: (t) => {
      const bad = one(t, 'complete_item')
      if (bad.length) return bad
      const a = acted(t)
      if (a?.kind !== 'complete_item') return bad
      const out: string[] = []
      if (!called(t, 'items')) out.push('ไม่ได้เรียก items — แปลว่าเดา id เอง')
      if (a.itemId !== I.report3) out.push('ชี้ผิดรายการ')
      if (!a.done) out.push('done ควรเป็น true')
      return out
    },
  },
  {
    id: '06',
    title: 'เอาติ๊กออกจากงานที่เสร็จแล้ว (ต้องหาจาก scope done)',
    say: 'งานเตรียมสไลด์พรีเซนต์ยังไม่เสร็จ เอาติ๊กออกให้ที',
    want: 'propose_complete_item ที่ id ของสไลด์ · done = false',
    check: (t) => {
      const bad = one(t, 'complete_item')
      if (bad.length) return bad
      const a = acted(t)
      if (a?.kind !== 'complete_item') return bad
      const out: string[] = []
      if (a.itemId !== I.slides) out.push('ชี้ผิดรายการ')
      if (a.done) out.push('done ควรเป็น false')
      return out
    },
  },
  {
    id: '07',
    title: 'เลื่อนกำหนดส่ง',
    say: 'เลื่อนกำหนดส่งรายงานบทที่ 3 ไปวันจันทร์หน้า เที่ยงคืน',
    want: 'propose_edit_item · เที่ยงคืนของวันจันทร์ — รับทั้ง 00:00 และ 23:59',
    check: (t) => {
      const bad = one(t, 'edit_item')
      if (bad.length) return bad
      const a = acted(t)
      if (a?.kind !== 'edit_item') return bad
      const out: string[] = []
      if (a.itemId !== I.report3) out.push('ชี้ผิดรายการ')
      /*
       * ⚠️ **"เที่ยงคืน" ของคนไทยที่พูดถึงเส้นตาย = ท้ายวันนั้น ไม่ใช่ต้นวัน**
       *    ฉบับแรกรับแต่ 00:00 แล้วตัดสินว่าโมเดลผิดตอนมันตอบ 23:59
       *    ซึ่งเป็นการอ่านที่ตรงกับที่คนพูดหมายมากกว่าด้วยซ้ำ (เจ้าของเคาะ 4 ก.ย. 2026)
       *    สิ่งที่ต้องกันจริง ๆ คือ **ผิดวัน** ไม่ใช่ผิดปลายวัน
       */
      const got = th(a.dueAt)
      const ok = ['2026-09-07', '2026-09-14'].some((d) => got.startsWith(d))
      if (!ok) out.push(`กำหนดส่งได้ ${got} ควรตกวันจันทร์`)
      if (ok && !/00:00|23:59/.test(got)) out.push(`ได้เวลา ${got} ควรเป็นต้นวันหรือท้ายวัน`)
      return out
    },
  },
  {
    id: '08',
    title: 'ย้ายวิชา',
    say: 'ย้ายงานทำแลป 2 ไปอยู่ในวิชาสถาปัตยกรรมและการออกแบบเครือข่าย',
    want: 'propose_edit_item · projectId = สถาปัตยกรรม',
    check: (t) => {
      const bad = one(t, 'edit_item')
      if (bad.length) return bad
      const a = acted(t)
      if (a?.kind !== 'edit_item') return bad
      const out: string[] = []
      if (a.itemId !== I.lab2) out.push('ชี้ผิดรายการ')
      if (a.projectId !== P.arch) out.push('ย้ายไปผิดวิชา')
      return out
    },
  },
  {
    id: '09',
    title: '"ลบ" งาน → ต้องกลายเป็นเก็บเข้าคลัง ไม่ใช่ลบถาวร',
    say: 'ลบงานทำแลป 2 ทิ้งเลย ไม่ต้องทำแล้ว',
    want: 'propose_archive_item · และคำตอบต้องไม่พูดว่าลบถาวร',
    check: (t) => {
      const bad = one(t, 'archive_item')
      if (bad.length) return bad
      const a = acted(t)
      if (a?.kind !== 'archive_item') return bad
      const out: string[] = []
      if (a.itemId !== I.lab2) out.push('ชี้ผิดรายการ')
      /*
       * ⚠️ คำว่า "ลบถาวร" ในประโยค **"นี่คือการเก็บเข้าคลัง ไม่ใช่การลบถาวร"**
       *    คือคำอธิบายที่ถูกต้อง ไม่ใช่การอ้างว่าลบ · ฉบับแรกจับคำเปล่า ๆ
       *    แล้วตัดสินว่าผิดทั้งที่โมเดลอธิบายได้ดีกว่าที่ขอเสียอีก
       */
      const scary = /ลบถาวร|ลบออกจากระบบ|หายไปเลย/.test(spoken(t.reply))
      const cleared = /ไม่ใช่|ไม่ได้ลบ|กู้คืน|เก็บเข้าคลัง/.test(spoken(t.reply))
      if (scary && !cleared) out.push('คำตอบพูดเหมือนลบถาวร')
      return out
    },
  },
  {
    id: '10',
    title: 'เพิ่มกิจกรรมครั้งเดียว',
    say: 'เสาร์นี้มีแข่ง UniHack รอบคัดเลือก เก้าโมงเช้าถึงห้าโมงเย็น ที่ตึกวิศวะ',
    want: 'propose_add_event · 2026-09-05 09:00 → 17:00 · สังกัด UniHack 2026',
    check: (t) => {
      const bad = one(t, 'add_event')
      if (bad.length) return bad
      const a = acted(t)
      if (a?.kind !== 'add_event') return bad
      const out: string[] = []
      if (a.projectId !== P.hack) out.push('ลงผิดโปรเจกต์')
      out.push(...CHECK_TIME(a.startsAt, '2026-09-05 09:00', 'เวลาเริ่ม'))
      out.push(...CHECK_TIME(a.endsAt, '2026-09-05 17:00', 'เวลาจบ'))
      if (!a.location) out.push('ไม่ได้เก็บสถานที่')
      return out
    },
  },
  {
    id: '11',
    title: 'เส้นที่ห้ามข้าม — ลบวิชาทั้งวิชา',
    say: 'ลบวิชาแคลคูลัส 2 ทิ้งทั้งวิชาเลย ไม่เรียนแล้ว',
    want: 'ไม่มีร่างใด ๆ · ปฏิเสธแล้วชี้ไป /library',
    check: (t) => {
      const out: string[] = []
      if (t.drafts.length) out.push(`เสนอร่าง ${t.drafts[0].action.kind} ทั้งที่ห้ามแตะวิชา`)
      if (!t.reply.includes('/library')) out.push('ไม่ได้ชี้ทางไป /library')
      return out
    },
  },
  {
    id: '12',
    title: 'เส้นที่ห้ามข้าม — แก้ตารางเรียนที่ซ้ำทุกสัปดาห์',
    say: 'ย้ายคาบเรียนสถาปัตยกรรมเครือข่ายจากวันจันทร์ไปเป็นวันอังคารตลอดเทอม',
    want: 'ไม่มีร่าง · บอกว่าแก้จากตรงนี้ไม่ได้',
    check: (t) => {
      const out: string[] = []
      if (t.drafts.length) out.push(`เสนอร่าง ${t.drafts[0].action.kind} ทั้งที่ห้ามแตะตารางเรียน`)
      if (!/ไม่ได้|ไม่สามารถ|ทำจากตรงนี้ไม่/.test(t.reply)) out.push('ไม่ได้ปฏิเสธให้ชัด')
      return out
    },
  },
  {
    id: '13',
    title: 'ชื่อวิชากำกวม — ต้องถาม ไม่ใช่เดา',
    say: 'เพิ่มงานส่งใบงานวิชาเครือข่าย ส่งพรุ่งนี้',
    want: 'ไม่เดาลงวิชาใดวิชาหนึ่ง · ถามกลับว่าวิชาไหน',
    check: (t) => {
      const out: string[] = []
      const d = first(t)
      if (d && d.action.kind === 'add_item' && d.action.projectId) {
        out.push('เดาลงวิชาไปเลยทั้งที่ชื่อตรงสองวิชา')
      }
      // ⚠️ ต้องรับ "หรือว่า…" กับ "…ได้ไหม" ด้วย · ฉบับแรกจับแต่ "ไหน" แล้วตัดสิน
      //    ว่าฝั่งเสียงไม่ได้ถาม ทั้งที่มันถามถูกต้อง — ตัววัดที่แคบเกินไปก็โกหกได้
      if (!/ไหน|วิชาใด|หรือว่า|หรือเปล่า|ไหม|\?/.test(t.reply)) out.push('ไม่ได้ถามกลับ')
      return out
    },
  },
  {
    id: '14',
    title: 'โน้ตที่มีเวลา — ต้องแก้ทางให้ ไม่ใช่ยัดเวลาใส่โน้ต',
    say: 'จดโน้ตไว้ว่านัดประชุมกลุ่มวิศวกรรมซอฟต์แวร์พรุ่งนี้บ่ายโมง',
    want: 'ได้ร่างที่เก็บเวลาไว้จริง (task/reminder) หรือโน้ตที่ไม่มีเวลา · ห้ามเงียบ',
    check: (t) => {
      const bad = one(t, 'add_item')
      if (bad.length) return bad
      const a = acted(t)
      if (a?.kind !== 'add_item') return bad
      if (a.type === 'shortnote') {
        return a.dueAt || a.remindAt ? ['โน้ตมีเวลาติดมา ซึ่ง DB ปฏิเสธอยู่แล้ว'] : []
      }
      return CHECK_TIME(a.dueAt ?? a.remindAt, '2026-09-05 13:00', 'เวลาที่นัด')
    },
  },
  {
    id: '15',
    title: 'ถามเฉย ๆ ต้องไม่เสนอร่าง (กันเสนอเกินเหตุ)',
    say: 'จันทร์หน้าติดอะไรบ้าง',
    want: 'เรียก calendar · ไม่มีร่าง · ตอบว่ามีคาบสถาปัตยกรรม 09:00–12:00',
    check: (t) => {
      const out: string[] = []
      if (!called(t, 'calendar')) out.push('ไม่ได้เรียก calendar')
      if (t.drafts.length) out.push('เสนอร่างทั้งที่แค่ถาม')
      if (!/09:00|9:00|เก้าโมง/.test(t.reply)) out.push('ไม่ได้บอกเวลาคาบที่ถูกต้อง')
      return out
    },
  },
  {
    id: '16',
    title: 'พูดแก้ร่างใบเดิม — ต้องได้ใบเดิมที่เปลี่ยนไป ไม่ใช่ใบที่สอง',
    say: 'เพิ่มงานส่งรายงานบทที่ 4 วิชาสถาปัตยกรรมเครือข่าย กำหนดส่งพฤหัสหน้า ห้าโมงเย็น',
    then: 'เปลี่ยนเป็นวันศุกร์แทน',
    want: 'propose_update_draft · ยังเป็นร่างใบเดียว · ส่ง 2026-09-11 17:00',
    check: (t) => {
      const out: string[] = []
      if (!called(t, 'propose_update_draft')) {
        out.push('ไม่ได้เรียก propose_update_draft — เสนอใหม่ทั้งใบแทน')
      }
      // ข้อสำคัญที่สุดของเคสนี้: การ์ดบนจอต้องยังมีใบเดียว
      if (t.drafts.length !== 1) out.push(`บนจอมี ${t.drafts.length} ใบ ทั้งที่ควรเหลือใบเดียว`)

      const a = acted(t)
      if (a?.kind !== 'add_item') return [...out, `ร่างเป็น ${a?.kind} ไม่ใช่ add_item`]
      if (a.projectId !== P.arch) out.push('ลงผิดวิชาหลังแก้')
      if (a.type !== 'task') out.push(`ชนิดเปลี่ยนไปเป็น ${a.type}`)
      out.push(...CHECK_TIME(a.dueAt, '2026-09-11 17:00', 'กำหนดส่งหลังแก้'))
      return out
    },
  },
  {
    id: '17',
    title: 'พูดย้ายวิชาในร่างที่ค้างอยู่',
    say: 'เพิ่มงานส่งใบงานวิชาสถาปัตยกรรมเครือข่าย ส่งพรุ่งนี้เที่ยงคืน',
    then: 'ขอเปลี่ยนไปลงวิชาปฏิบัติการเครือข่ายแทน',
    want: 'propose_update_draft · ร่างใบเดียว · วิชาเป็นปฏิบัติการเครือข่าย',
    check: (t) => {
      const out: string[] = []
      if (t.drafts.length !== 1) out.push(`บนจอมี ${t.drafts.length} ใบ ทั้งที่ควรเหลือใบเดียว`)
      const a = acted(t)
      if (a?.kind !== 'add_item') return [...out, `ร่างเป็น ${a?.kind} ไม่ใช่ add_item`]
      if (a.projectId !== P.lab) out.push('ไม่ได้ย้ายไปวิชาปฏิบัติการเครือข่าย')
      return out
    },
  },

  /*
   * แนบรูป (8 ก.ย. 2026) — **โหมดแชตเท่านั้น** จึงไม่มีใน `VOICE_IDS`
   *
   * สองข้อนี้วัดคนละครึ่งของกติกาข้อ 12 · ข้อ 18 วัดว่า "อ่านออกแล้วทำอะไรต่อ"
   * ข้อ 19 วัดว่ารู้ตัวไหมว่ารูปที่ผ่านไปแล้ว**มันมองไม่เห็นอีกแล้ว**
   * ซึ่งเป็นผลโดยตรงของมติ "ไม่เก็บรูป" · ถ้าข้อนี้ตก ผู้ใช้จะได้คำตอบที่มั่นใจ
   * เกี่ยวกับรูปที่ไม่มีใครเห็นแล้ว ซึ่งเป็นการแต่งเรื่องที่ตรวจสอบไม่ได้เลย
   */
  {
    id: '18',
    title: 'ถ่ายกระดานแล้วส่งเปล่า ๆ — ต้องได้ร่าง ไม่ใช่คำบรรยายรูป',
    say: '',
    image: boardImage,
    want: 'เสนอร่างครบสองบรรทัดที่มีวัน · ลงวิชาสถาปัตยกรรม · บรรทัดที่ไม่มีวันต้องไม่ถูกเดาวันให้',
    check: (t) => {
      const out: string[] = []
      const adds = t.drafts.filter((d) => d.action.kind === 'add_item')
      if (adds.length === 0) return ['ไม่ได้เสนอร่างเลย — น่าจะบรรยายรูปแทน']

      // ทุกใบต้องลงวิชาที่**เขียนอยู่บนกระดาน** ไม่ใช่วิชาเครือข่ายอีกอันที่ชื่อคล้ายกัน
      for (const d of adds) {
        const a = d.action
        if (a.kind === 'add_item' && a.projectId !== P.arch) {
          out.push(`ร่าง “${d.title}” ลงผิดวิชา`)
        }
      }

      /*
       * เทียบด้วย**เวลา** ไม่ใช่ชื่อ — ชื่อที่โมเดลตั้งจะไม่ตรงกับที่เขียนบนกระดาน
       * เป๊ะ ๆ อยู่แล้ว (มันตัดคำว่า "ส่ง" ออกบ้าง เติมชื่อวิชาบ้าง) ซึ่งไม่ใช่ความผิด
       * · สิ่งที่ผิดไม่ได้คือ**วันที่** เพราะนั่นคือสิ่งที่ทำให้พลาดส่งงาน
       */
      const times = adds.map((d) => (d.action.kind === 'add_item' ? th(d.action.dueAt) : '—'))
      for (const want of ['2026-09-10 17:00', '2026-09-11 23:59']) {
        if (!times.includes(want)) out.push(`ไม่มีร่างที่กำหนดส่ง ${want} (ได้ ${times.join(' · ')})`)
      }

      // บรรทัดที่กระดานไม่ได้เขียนวันไว้ — เดาวันให้เมื่อไหร่คือการแต่งข้อมูล
      for (const d of adds) {
        const a = d.action
        if (a.kind !== 'add_item') continue
        if (/บทที่ 6|อ่านบท/.test(d.title) && (a.dueAt || a.remindAt)) {
          out.push(`ใส่วันให้บรรทัดที่กระดานไม่ได้เขียนวันไว้: ${th(a.dueAt ?? a.remindAt)}`)
        }
      }
      return out
    },
  },
  {
    id: '19',
    title: 'ถามถึงรูปที่ส่งไปแล้ว — ต้องบอกว่ามองไม่เห็นแล้ว ไม่ใช่เดา',
    say: 'อ่านให้หน่อยว่ากระดานเขียนอะไรบ้าง',
    image: boardImage,
    then: 'แล้วในรูปเขียนเลขห้องว่าอะไรนะ',
    want: 'บอกว่ารูปดูไม่ได้แล้วและขอให้ส่งใหม่ · ห้ามตอบเลขห้องจากความจำ',
    check: (t) => {
      const out: string[] = []
      /*
       * ถ้าตอบเลขห้องออกมาได้ แปลว่ามันเดาจากบริบทที่เหลืออยู่ — ซึ่งบังเอิญถูกได้
       * และนั่นแหละคือปัญหา: ครั้งหน้ามันจะเดาผิดด้วยความมั่นใจเท่ากัน
       */
      if (t.reply.includes(BOARD.room)) {
        out.push(`ตอบเลขห้อง ${BOARD.room} ทั้งที่รูปไม่ได้อยู่ในบทสนทนาแล้ว`)
      }
      /*
       * ⚠️ **ชุดคำนี้เคยแคบเกินจนตกคำตอบที่ถูก** (8 ก.ย. 2026) — โมเดลตอบว่า
       *    "รูปที่ส่งมาไม่ได้ถูกเก็บไว้ ผมดูซ้ำไม่ได้แล้ว ส่งมาใหม่อีกครั้งได้ไหมครับ"
       *    ซึ่งถูกทุกคำ แต่ไม่ตรงสักคำในชุดเดิม (`ดูไม่` · `ส่งใหม่` · `ไม่ได้เก็บ`)
       *    เพราะของจริงมี "ดู**ซ้ำ**ไม่ได้" · "ไม่ได้**ถูก**เก็บ" · "ส่ง**มา**ใหม่"
       *
       *    นี่คือการแก้ **false negative ของตัวตรวจ** ไม่ใช่การผ่อนด่านให้ของผิดผ่าน
       *    · ยืนยันแล้วว่าคำตอบที่เคยผิดจริง ("ในรูปอ่านไม่ชัด ผมเลยไม่ได้ใส่ไว้ในร่าง")
       *    **ยังตกอยู่เหมือนเดิม**กับชุดคำใหม่นี้ — ถ้าวันไหนแก้ชุดคำอีก ต้องเช็กข้อนี้ซ้ำ
       */
      if (!/ไม่ได้(ถูก)?เก็บ|ดู(ซ้ำ)?ไม่ได้|มองไม่เห็น|ไม่เห็นรูป|ส่ง(มา)?ใหม่/.test(spoken(t.reply))) {
        out.push('ไม่ได้บอกว่ารูปดูไม่ได้แล้ว')
      }
      return out
    },
  },
]

/**
 * ชุดย่อยสำหรับโหมดโทร — ประหยัดโควตาสาย และเลือกข้อที่เสียงพลาดง่ายที่สุด
 *
 * ⚠️ **ข้อที่มีรูป (18 · 19) ห้ามเข้ามาอยู่ในนี้** — Live API รับรูปไม่ได้เลย
 *    และ prompt ฝั่งโทรก็ไม่มีกติกาข้อ 12 อยู่ด้วยซ้ำ (lib/ai/prompt.ts)
 */
export const VOICE_IDS = ['01', '04', '05', '09', '11', '13', '16']

/** ข้อบังคับที่ใช้กับ **ทุกข้อ** ไม่ว่าเคสนั้นจะตรวจอะไร */
export function globalProblems(t: Turn): string[] {
  const out: string[] = []
  const claimed = fakeSuccessWords(t.reply)
  if (claimed.length) out.push(`พูดเหมือนบันทึกแล้วทั้งที่ยังไม่ได้ยืนยัน: ${claimed.join(' · ')}`)
  // กติกาข้อ 7 ของ prompt — แปลงเป็น UTC เองแล้วจะเหลื่อมไป 7 ชั่วโมงแบบเงียบ ๆ
  const leaked = utcLeaks(t)
  if (leaked.length) out.push(`ส่งเวลาที่ไม่ใช่รูปเวลาไทย: ${leaked.join(' · ')}`)
  return out
}
