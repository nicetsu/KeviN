/**
 * ล็อกภาษาของบทสนทนา — ไทยหรืออังกฤษเท่านั้น
 *
 * ⚠️ **บังคับได้แค่ที่ระดับ prompt ไม่ใช่ระดับ config**
 *    เอกสารของ Live API ระบุว่าโมเดล native audio "เลือกภาษาเอง และไม่รองรับ
 *    การตั้ง language code" · ทางเดียวที่จำกัดได้คือสั่งใน system instruction
 *    จึงเป็นแรงกดที่หนัก **แต่ไม่ใช่การันตี** — ถ้ายังหลุด ต้องแก้ที่ถ้อยคำตรงนี้
 *
 * ที่ต้องทำเพราะของจริงพัง: พูดไทยแล้วตัวถอดเสียงเดาเป็นจีน ฮินดี เกาหลี
 * สลับกันไปมาในสายเดียว (เจอบนมือถือจริง 31 ส.ค. 2026)
 *
 * แยกสองค่าโดยตั้งใจ — คนที่อยากฝึกฟังอังกฤษแต่ยังพูดไทยไม่คล่อง
 * ควรตั้ง "พูดไทย · ตอบอังกฤษ" ได้ ไม่ใช่ต้องเลือกภาษาเดียวทั้งบทสนทนา
 */

export type Lang = 'th' | 'en'

export type LangPrefs = {
  /** ภาษาที่ผู้ใช้พูดหรือพิมพ์ */
  input: Lang
  /** ภาษาที่ KeviN ตอบ */
  reply: Lang
}

export const DEFAULT_LANGS: LangPrefs = { input: 'th', reply: 'th' }

/** ชื่อที่ใช้บนจอ · UI ของแอปเป็นไทยทั้งหมด ป้ายจึงเป็นไทย */
export const LANG_LABEL: Record<Lang, string> = { th: 'ไทย', en: 'อังกฤษ' }

export function isLang(v: unknown): v is Lang {
  return v === 'th' || v === 'en'
}

/** อ่านค่าจากสิ่งที่ไม่น่าเชื่อถือ (body ของ request หรือ localStorage) */
export function readLangs(raw: unknown): LangPrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_LANGS
  const o = raw as Record<string, unknown>
  return {
    input: isLang(o.input) ? o.input : DEFAULT_LANGS.input,
    reply: isLang(o.reply) ? o.reply : DEFAULT_LANGS.reply,
  }
}

const NAME: Record<Lang, string> = { th: 'ภาษาไทย', en: 'ภาษาอังกฤษ' }

/**
 * ท่อนที่ต่อเข้า system prompt
 *
 * เขียนสามชั้นโดยตั้งใจ — บอกว่าผู้ใช้พูดภาษาอะไร บอกว่าให้ตอบภาษาอะไร
 * และ**บอกว่าจะทำอย่างไรเมื่อฟังไม่ชัด** ซึ่งเป็นจุดที่ของจริงพัง:
 * พอฟังไม่ออก โมเดลไปเดาเป็นภาษาอื่นแทนที่จะถามซ้ำ
 */
export function langRules({ input, reply }: LangPrefs): string {
  const sameLang = input === reply
  return [
    'ภาษา',
    `- ผู้ใช้พูดและพิมพ์เป็น**${NAME[input]}เท่านั้น**`,
    `- คุณต้องตอบเป็น**${NAME[reply]}เท่านั้น**${sameLang ? '' : ` แม้ผู้ใช้จะพูด${NAME[input]}ก็ตาม`}`,
    `- **ห้ามใช้ภาษาอื่นนอกจากไทยกับอังกฤษเด็ดขาด** ไม่ว่ากรณีใด`,
    `- ถ้าฟังไม่ชัดหรือไม่แน่ใจว่าผู้ใช้พูดอะไร **ให้ถามซ้ำเป็น${NAME[reply]}**`,
    `  **ห้ามเดาว่าเป็นภาษาอื่นแล้วตอบภาษานั้น** และห้ามแปลสิ่งที่ได้ยินเป็นภาษาอื่น`,
    `- ชื่อวิชา ชื่อห้อง และรหัสวิชา ให้คงไว้ตามที่อยู่ในข้อมูล ไม่ต้องแปล`,
  ].join('\n')
}
