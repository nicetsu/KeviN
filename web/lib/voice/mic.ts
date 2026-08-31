/**
 * เลือกไมค์ที่จะใช้คุย
 *
 * เจ้าของขอ 1 ก.ย. 2026 — เสียบหูฟังแล้วอยากเลือกได้ว่าจะพูดผ่านไมค์หูฟัง
 * หรือไมค์ในตัวเครื่อง เพราะระบบปฏิบัติการเลือกให้ไม่ตรงกับที่ต้องการเสมอไป
 *
 * ⚠️ **เก็บแยกจาก `talkPrefs` โดยตั้งใจ** — ภาษากับเสียงถูกส่งขึ้นเซิร์ฟเวอร์
 *    ไปกับคำขอ token ส่วน `deviceId` เป็นของเฉพาะเครื่องและเฉพาะเบราว์เซอร์นั้น
 *    ไม่มีใครฝั่งเซิร์ฟเวอร์ใช้มันเลย · เอาไปรวมกันคือส่งข้อมูลอุปกรณ์ออกจาก
 *    เครื่องโดยไม่ได้อะไรกลับมา
 *
 * ⚠️ **`deviceId` เปลี่ยนได้เมื่อผู้ใช้ล้างสิทธิ์เว็บไซต์** ค่าที่จำไว้จึงอาจ
 *    ชี้ไปอุปกรณ์ที่ไม่มีอยู่แล้ว · ทุกจุดที่ใช้ต้องเผื่อกรณีหาไม่เจอเสมอ
 */

/** ให้เบราว์เซอร์เลือกเอง — แถวแรกของรายการเสมอ */
export const MIC_AUTO = 'auto'

export type MicOption = {
  id: string
  label: string
  /** คำขยายใต้ชื่อ · ว่างได้ */
  hint: string
}

/** รูปที่ต้องการจาก `MediaDeviceInfo` — เขียนเองเพื่อให้เทสต์ไม่ต้องพึ่ง DOM */
export type DeviceLike = { kind: string; deviceId: string; label: string }

/**
 * เดาว่าอุปกรณ์นี้คืออะไรจากชื่อที่ระบบตั้งมา
 *
 * ⚠️ **เดาได้แค่คำใบ้ ห้ามเอาไปเปลี่ยนชื่ออุปกรณ์** — ชื่อจริงที่ระบบตั้งมา
 *    ต้องแสดงตามนั้นเสมอ เพราะเป็นสิ่งเดียวที่ผู้ใช้เอาไปเทียบกับของจริงได้
 *    ถ้าเราเปลี่ยนเป็น "หูฟัง" แล้วเดาผิด ผู้ใช้จะเลือกผิดโดยไม่มีทางรู้
 */
function hintOf(label: string): string {
  const l = label.toLowerCase()
  if (/bluetooth|bt\b/.test(l)) return 'บลูทูธ'
  if (/headset|headphone|earbud|earphone|หูฟัง/.test(l)) return 'หูฟัง'
  if (/built-?in|internal|handset|phone|ในตัว/.test(l)) return 'ไมค์ในตัวเครื่อง'
  if (/wired|usb|3\.5/.test(l)) return 'ต่อสาย'
  return ''
}

/** ชื่อของระบบที่ไม่ได้บอกอะไร — ตัดคำนำหน้าออกให้อ่านง่าย */
const NOISE = /^(default|communications)\s*[-–]\s*/i

/**
 * แปลงรายการอุปกรณ์ดิบเป็นตัวเลือกที่โชว์ได้
 *
 * - เอาเฉพาะ `audioinput`
 * - `deviceId` ซ้ำถูกตัด (Windows คืน `default` กับ `communications` ที่ชี้ตัวเดียวกัน)
 * - **label ว่างแปลว่ายังไม่ได้สิทธิ์ไมค์** เบราว์เซอร์ปิดชื่อไว้จนกว่าจะอนุญาต
 *   ตั้งชื่อให้เป็น "ไมโครโฟน N" ไปก่อน ดีกว่าโชว์แถวเปล่า
 * - แถวแรกเป็น "อัตโนมัติ" เสมอ แบบเดียวกับรายการเสียง
 */
export function micOptions(devices: readonly DeviceLike[]): MicOption[] {
  const out: MicOption[] = [{ id: MIC_AUTO, label: 'อัตโนมัติ', hint: 'ตามที่เครื่องเลือกให้' }]
  const seen = new Set<string>()
  let n = 0

  for (const d of devices) {
    if (d.kind !== 'audioinput') continue
    if (!d.deviceId || seen.has(d.deviceId)) continue
    seen.add(d.deviceId)
    n++

    const clean = d.label.replace(NOISE, '').trim()
    out.push(
      clean
        ? { id: d.deviceId, label: clean, hint: hintOf(clean) }
        : { id: d.deviceId, label: `ไมโครโฟน ${n}`, hint: 'ยังไม่รู้ชื่อจนกว่าจะอนุญาตไมค์' }
    )
  }

  return out
}

/**
 * ค่าที่จำไว้ยังใช้ได้ไหม
 *
 * อุปกรณ์ที่หายไป (ถอดหูฟังแล้ว) ต้องปัดกลับเป็นอัตโนมัติ **ไม่ใช่ค้างไว้**
 * ไม่งั้นจะเปิดสายไม่ติดโดยที่หน้าจอยังโชว์ชื่ออุปกรณ์เดิมอยู่
 */
export function resolveMic(chosen: string, options: readonly MicOption[]): string {
  return options.some((o) => o.id === chosen) ? chosen : MIC_AUTO
}

/**
 * ข้อจำกัดที่ส่งให้ `getUserMedia`
 *
 * ⚠️ ใช้ `ideal` ไม่ใช่ `exact` — `exact` ทำให้ `getUserMedia` ทั้งคำสั่ง
 *    ล้มด้วย `OverconstrainedError` เมื่ออุปกรณ์นั้นหายไประหว่างทาง
 *    เช่น ถอดหูฟังตอนกำลังต่อสาย · `ideal` ตกกลับไปใช้ไมค์อื่นแทนแล้วสายยังติด
 */
export function micConstraints(chosen: string): MediaTrackConstraints {
  const base: MediaTrackConstraints = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
  }
  return chosen === MIC_AUTO ? base : { ...base, deviceId: { ideal: chosen } }
}
