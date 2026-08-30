/**
 * เสียงของ KeviN
 *
 * รายการเดียว แถวแรกเป็นโหมด **ค่าตั้งต้น** ที่แยกตามภาษา
 * แถวที่เหลือเลือกแล้วใช้เสียงนั้น**ทั้งสองภาษา**
 *
 * ที่ต้องมีโหมดค่าตั้งต้นแยกออกมา เพราะสิ่งที่ทดสอบมาได้ (31 ส.ค. 2026):
 * ตั้ง `voiceName` เป็น `Fenrir` แล้ว **เสียงตอนพูดไทยเปลี่ยนตาม
 * แต่ตอนพูดอังกฤษไม่เปลี่ยน** — โมเดล native audio มีเสียงของตัวเอง
 * สำหรับบางภาษาที่ไปทับค่าที่เราตั้ง (ดู doc/TRAPS.md)
 *
 * เสียงที่เพราะในภาษาหนึ่งจึงไม่ได้แปลว่าเพราะในอีกภาษา · เจ้าของฟังทีละภาษา
 * แล้วเคาะคนละตัว — นั่นคือเหตุผลที่แถวแรกต้องแยกตามภาษา
 *
 * ⚠️ **"ไม่ส่ง speechConfig เลย" ไม่เท่ากับ "ส่งชื่อเสียงที่เป็นค่าเริ่มต้น"**
 *    ค่าว่างในไฟล์นี้แปลว่า *ไม่ส่งฟิลด์นั้นไปเลย*
 */
import type { Lang } from './lang'

/** ค่าที่เก็บใน localStorage และส่งขึ้นเซิร์ฟเวอร์ */
export type VoiceChoice = string

/** แถวแรกของรายการ · แยกตามภาษา */
export const VOICE_AUTO = 'auto'

/**
 * เสียงที่โหมดค่าตั้งต้นใช้ในแต่ละภาษา
 *
 * เจ้าของฟังจริงแล้วเคาะทีละภาษา — ไทยเอา `Charon` (ให้ข้อมูล) · อังกฤษเอา `Fenrir` (ตื่นเต้น)
 * ค่าว่างยังใช้ได้อยู่ แปลว่า "ไม่ส่ง `speechConfig` เลย" ซึ่งได้เสียงเริ่มต้นของโมเดล
 * — ต่างจากการส่งชื่อเสียงที่บังเอิญเหมือนค่าเริ่มต้น (doc/TRAPS.md)
 */
const AUTO_BY_LANG: Record<Lang, string> = { th: 'Charon', en: 'Fenrir' }

/**
 * รายการที่โชว์บนจอ
 *
 * คัดจาก 30 เสียงของ Gemini TTS โดยเน้นโทนเพื่อนตามที่เจ้าของขอ
 * · `Charon` ใส่มาตอนแรกเป็นขั้วตรงข้ามไว้เทียบ แล้วกลายเป็นตัวที่เจ้าของ
 *   เลือกใช้กับภาษาไทยจริง หลังจากฟังทั้งหมดแล้ว
 */
export const VOICES: readonly { id: string; label: string; desc: string }[] = [
  { id: VOICE_AUTO,          label: 'ค่าตั้งต้น',      desc: '' },
  { id: 'Fenrir',            label: 'Fenrir',         desc: 'ตื่นเต้น' },
  { id: 'Puck',              label: 'Puck',           desc: 'ร่าเริง' },
  { id: 'Zubenelgenubi',     label: 'Zubenelgenubi',  desc: 'กันเอง' },
  { id: 'Achird',            label: 'Achird',         desc: 'เป็นมิตร' },
  { id: 'Sulafat',           label: 'Sulafat',        desc: 'อบอุ่น' },
  { id: 'Aoede',             label: 'Aoede',          desc: 'สบาย ๆ' },
  { id: 'Vindemiatrix',      label: 'Vindemiatrix',   desc: 'อ่อนโยน' },
  { id: 'Charon',            label: 'Charon',         desc: 'ให้ข้อมูล' },
]

const IDS = new Set(VOICES.map((v) => v.id))

/** ค่าที่ไม่รู้จักถูกปัดกลับเป็นค่าตั้งต้น ไม่ส่งดิบขึ้นไปหา Google */
export function readVoice(raw: unknown): VoiceChoice {
  return typeof raw === 'string' && IDS.has(raw) ? raw : VOICE_AUTO
}

/**
 * ชื่อเสียงที่จะส่งไปจริง · `''` = ไม่ต้องส่ง `speechConfig` เลย
 *
 * โหมดค่าตั้งต้นเท่านั้นที่ดูภาษา · เสียงที่เลือกเองใช้ทั้งสองภาษาเหมือนกันหมด
 */
export function resolveVoice(choice: VoiceChoice, lang: Lang): string {
  const picked = readVoice(choice)
  return picked === VOICE_AUTO ? AUTO_BY_LANG[lang] : picked
}
