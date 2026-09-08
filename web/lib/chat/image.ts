/**
 * รูปที่แนบมากับข้อความในโหมดแชต
 *
 * **รูปไม่ถูกเก็บที่ไหนเลย** — มันมีชีวิตแค่คำขอเดียว ส่งไปให้โมเดลอ่านแล้วหายไป
 * ประวัติลงเป็น `[รูป]` ต่อด้วยข้อความที่พิมพ์ แบบเดียวกับ `- voice -` ของโหมดโทร
 * (doc/DECISIONS.md · 8 ก.ย. 2026) · ผลพลอยได้คือไม่ต้องมี bucket ไม่ต้องมี RLS
 * ไม่ต้องมีสายพานลบ และ `/kevin/history` ไม่ต้องแก้สักบรรทัด
 *
 * ⚠️ **นำเข้าแบบ relative ไม่ใช่ `@/`** — ไฟล์นี้มีเทสต์เอื้อมถึง และชุดเทสต์
 *    รันด้วย node ตรง ๆ ซึ่งไม่รู้จัก path alias ของ bundler (ARCHITECTURE.md §5)
 *
 * ⚠️ อยู่นอก `lib/ai/**` เหมือน `lib/drafts.ts` — ที่นั่นคือเขตของชั้น tool
 *    ที่ `test/guard.test.ts` เฝ้าอยู่ ส่วนไฟล์นี้เป็นของเปลือกแชต ไม่ใช่ของโมเดล
 */

/**
 * ชนิดที่รับ — ตรงกับที่ Gemini รับ inline ได้ และตรงกับที่ `<input accept>` กรอง
 *
 * HEIC ของ iPhone **ไม่อยู่ในรายการโดยตั้งใจ** เพราะเบราว์เซอร์ถอดรหัสมันไม่ได้
 * จึงย่อขนาดไม่ได้ · แต่ตัวเลือกรูปของ iOS แปลง HEIC เป็น JPEG ให้เองตอนอัปโหลด
 * ผู้ใช้จึงไม่เจอทางตัน ตราบใดที่เราไม่ไปประกาศว่ารับ `image/heic`
 */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** ชนิดที่ **ส่งจริง** เสมอ · เบราว์เซอร์วาดใหม่เป็น JPEG ก่อนส่งทุกครั้ง */
export const SEND_TYPE = 'image/jpeg'

/**
 * ด้านยาวสุดหลังย่อ
 *
 * รูปจากมือถือยุคนี้ยาว 3000–4000px ซึ่งเปลืองเน็ตของผู้ใช้เปล่า ๆ เพราะโมเดล
 * หั่นเป็นไทล์แล้วคิดโทเคนเท่าเดิมอยู่ดี · แต่**ย่อมากเกินไปคือการทำลายสิ่งที่
 * ต้องอ่าน** — ลายมือบนกระดานกับรหัสห้องอย่าง `E11-S604` คือของชิ้นเล็กที่สุดในรูป
 * และเป็นของที่ผิดแล้วแพงที่สุด · 1600 คือจุดที่ยังอ่านออกแต่ไฟล์เหลือหลักร้อย kB
 */
export const MAX_EDGE = 1600

/** คุณภาพ JPEG · ต่ำกว่านี้ตัวอักษรบาง ๆ เริ่มมีขอบเลอะ */
export const JPEG_QUALITY = 0.82

/**
 * เพดานขนาดรูปที่เซิร์ฟเวอร์ยอมรับ (ไบต์ก่อนเข้ารหัส base64)
 *
 * ของที่ผ่านการย่อแล้วอยู่ราว 200–500 kB · 4 MB จึงเหลือเฟือสำหรับรูปที่แปลก
 * กว่าปกติ แต่ยังกันคำขอที่ยัดไฟล์ 20 MB เข้ามาซ้ำ ๆ ใส่เซิร์ฟเวอร์แพลนฟรี
 *
 * ⚠️ **ด่านนี้ต้องอยู่ฝั่งเซิร์ฟเวอร์** การย่อขนาดฝั่งเบราว์เซอร์เป็นเรื่องของ
 *    ความเร็ว ไม่ใช่เรื่องของการกัน — `/api/chat` ถูกยิงตรงได้เหมือน endpoint อื่น
 */
export const MAX_BYTES = 4 * 1024 * 1024

/** รูปหนึ่งใบในรูปที่เดินทางระหว่างเบราว์เซอร์ เซิร์ฟเวอร์ และโมเดล */
export type InlineImage = {
  mimeType: string
  /** เนื้อรูปเข้ารหัส base64 · **ไม่มี** `data:` นำหน้า */
  data: string
}

/**
 * ที่ว่างแทนตัวรูปในประวัติ
 *
 * คร่อมด้วยวงเล็บเหลี่ยมเพื่อให้อ่านออกทันทีว่าเป็น**ที่ว่างแทนของจริง**
 * ไม่ใช่คำที่ผู้ใช้พิมพ์เอง — เหตุผลเดียวกับ `VOICE_PLACEHOLDER`
 */
export const IMAGE_PLACEHOLDER = '[รูป]'

/**
 * สิ่งที่ลงประวัติเมื่อคำขอนี้มีรูป
 *
 * ⚠️ ต้องเรียก**ทั้งสองฝั่ง** — ฝั่งเบราว์เซอร์เพื่อให้ฟองที่เห็นตรงกับสิ่งที่เก็บ
 *    และฝั่งเซิร์ฟเวอร์เพื่อบังคับต่อให้โค้ดฝั่งจอถูกแก้ในอนาคต
 *    (กติกาเดียวกับ `redactVoiceTurns` ใน lib/voice/transcript.ts)
 */
export function imageHistoryLine(text: string): string {
  const t = text.trim()
  return t ? `${IMAGE_PLACEHOLDER} ${t}` : IMAGE_PLACEHOLDER
}

/** ประโยคนี้เคยมีรูปแนบมาไหม — ใช้ตัดสินว่าจะติดป้ายบนฟองข้อความ */
export function hadImage(content: string): boolean {
  return content.startsWith(IMAGE_PLACEHOLDER)
}

/** ตัดป้าย `[รูป]` ออกเหลือแต่ข้อความที่ผู้ใช้พิมพ์จริง */
export function withoutImageMark(content: string): string {
  return hadImage(content) ? content.slice(IMAGE_PLACEHOLDER.length).trim() : content
}

export class BadImage extends Error {}

/**
 * ตรวจรูปที่มากับคำขอ
 *
 * คืน `null` เมื่อ**ไม่ได้แนบมา** ซึ่งเป็นเรื่องปกติ · โยน `BadImage` เมื่อแนบมา
 * แต่ใช้ไม่ได้ — สองกรณีนี้ต้องแยกกัน ไม่งั้นรูปที่ใหญ่เกินจะถูกเมินเงียบ ๆ
 * แล้วโมเดลตอบว่า "ไม่เห็นรูปเลยครับ" ทั้งที่ผู้ใช้แนบมาแล้วจริง ๆ
 */
export function readInlineImage(raw: unknown): InlineImage | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'object') throw new BadImage('รูปที่แนบมาอ่านไม่ออก')

  const v = raw as Partial<InlineImage>
  if (typeof v.mimeType !== 'string' || typeof v.data !== 'string' || !v.data) {
    throw new BadImage('รูปที่แนบมาอ่านไม่ออก')
  }
  if (!(ACCEPTED_TYPES as readonly string[]).includes(v.mimeType)) {
    throw new BadImage('รับเฉพาะรูป JPEG PNG และ WebP')
  }
  if (base64Bytes(v.data) > MAX_BYTES) {
    throw new BadImage('รูปใหญ่เกินไป · ลองถ่ายใหม่หรือย่อขนาดก่อน')
  }
  return { mimeType: v.mimeType, data: v.data }
}

/**
 * ขนาดจริงของ base64 หนึ่งก้อน โดย**ไม่ต้องถอดรหัสมันออกมาก่อน**
 *
 * ถอดรหัสเพื่อจะรู้ขนาด แปลว่ายอมกินหน่วยความจำเท่าไฟล์ไปแล้วก่อนจะได้ปฏิเสธ
 * ซึ่งกลับหัวกับเหตุผลที่มีเพดานตั้งแต่แรก · base64 4 ตัวอักษร = 3 ไบต์
 * และ `=` ท้ายก้อนคือไบต์ที่ไม่มีจริง
 */
export function base64Bytes(data: string): number {
  const pad = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((data.length * 3) / 4) - pad)
}

/**
 * ขนาดหลังย่อให้ด้านยาวสุดไม่เกิน `max` โดยคงอัตราส่วนเดิม
 *
 * **รูปที่เล็กอยู่แล้วไม่ถูกขยาย** — ขยายแล้วไม่ได้รายละเอียดเพิ่มสักพิกเซล
 * ได้แต่ไฟล์ที่ใหญ่ขึ้นเปล่า ๆ
 */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_EDGE
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max || longest === 0) return { width, height }
  const scale = max / longest
  // ปัดขึ้นอย่างน้อย 1px เสมอ — รูปแถบยาวมาก ๆ ปัดลงแล้วได้ด้านสั้นเป็น 0
  // ซึ่ง canvas ปฏิเสธด้วย error ที่อ่านไม่ออกว่าเกี่ยวกับอะไร
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * ย่อรูปที่ผู้ใช้เลือกแล้ววาดใหม่เป็น JPEG — **ฝั่งเบราว์เซอร์เท่านั้น**
 *
 * ที่ต้องวาดใหม่ ไม่ใช่ส่งไฟล์เดิมไปตรง ๆ มีสองเหตุผลที่ต่างกันคนละเรื่อง
 *
 * 1. **ขนาด** รูปจากมือถือหนัก 3–8 MB · ส่งดิบคือให้ผู้ใช้รอบนเน็ตมือถือ
 *    เพื่อรายละเอียดที่โมเดลไม่ได้ใช้
 * 2. **สิ่งที่ติดมากับไฟล์** การวาดลง canvas ใหม่**ทิ้ง EXIF ทั้งก้อน** ซึ่งรวม
 *    พิกัด GPS ที่ถ่ายและรุ่นเครื่อง · ผู้ใช้ตั้งใจส่งกระดาน ไม่ได้ตั้งใจส่งว่า
 *    ตัวเองอยู่ตึกไหน — และปลายทางคือ free tier ที่เอาข้อมูลไปพัฒนาผลิตภัณฑ์
 *
 * ⚠️ **ต้องอ่าน `orientation` ของ EXIF ผ่าน `createImageBitmap`** ไม่ใช่ `<img>` ธรรมดา
 *    รูปแนวตั้งจากกล้องเก็บเป็นแนวนอนพร้อมธงหมุน · ถ้าไม่สั่ง `imageOrientation`
 *    จะได้รูปตะแคงโดยไม่มี error แล้วโมเดลอ่านตัวหนังสือไม่ออกทั้งใบ
 */
export async function prepareImage(file: File): Promise<InlineImage> {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    throw new BadImage('รับเฉพาะรูป JPEG PNG และ WebP')
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const size = fitWithin(bitmap.width, bitmap.height)

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new BadImage('เบราว์เซอร์นี้ย่อรูปไม่ได้')
  }
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, SEND_TYPE, JPEG_QUALITY)
  )
  if (!blob) throw new BadImage('ย่อรูปไม่สำเร็จ')
  if (blob.size > MAX_BYTES) throw new BadImage('รูปใหญ่เกินไป · ลองถ่ายใหม่')

  return { mimeType: SEND_TYPE, data: await toBase64(blob) }
}

/**
 * Blob → base64 เปล่า ๆ (ไม่มี `data:` นำหน้า)
 *
 * ผ่าน `FileReader` ไม่ใช่ `btoa(String.fromCharCode(...))` เพราะตัวหลังกาง
 * ไบต์ทั้งไฟล์เป็นอาร์กิวเมนต์ของฟังก์ชันเดียว แล้วล้มด้วย stack overflow
 * ที่ขนาดหลักแสนไบต์ ซึ่งรูปทุกใบเกินอยู่แล้ว
 */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new BadImage('อ่านไฟล์ไม่สำเร็จ'))
    reader.onload = () => {
      const url = String(reader.result)
      const comma = url.indexOf(',')
      if (comma < 0) reject(new BadImage('อ่านไฟล์ไม่สำเร็จ'))
      else resolve(url.slice(comma + 1))
    }
    reader.readAsDataURL(blob)
  })
}
