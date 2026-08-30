'use client'

/**
 * ภาษาที่ผู้ใช้เลือก เก็บใน localStorage
 *
 * ⚠️ **กับดักของ `useSyncExternalStore` กับค่าที่เป็นออบเจกต์**
 *    `getSnapshot` ต้องคืน**ตัวเดิม**เมื่อไม่มีอะไรเปลี่ยน · ถ้า parse JSON ใหม่
 *    ทุกครั้งที่ถูกเรียก จะได้ออบเจกต์ใหม่ทุกรอบ React เทียบด้วย `Object.is`
 *    แล้วเห็นว่าต่างเสมอ → re-render ไม่รู้จบจนหน้าค้าง
 *
 *    จึงจำสตริงดิบไว้ แล้วสร้างออบเจกต์ใหม่ต่อเมื่อสตริงเปลี่ยนจริงเท่านั้น
 *    (สองที่ก่อนหน้าคือโหมดคุยกับสถานะไมค์ คืนสตริงจึงไม่เจอปัญหานี้)
 */
import { useSyncExternalStore } from 'react'
import { DEFAULT_LANGS, isLang, type Lang, type LangPrefs } from '@/lib/ai/lang'

const KEY = 'kevin.talk.lang'

const listeners = new Set<() => void>()

let cachedRaw: string | null | undefined
let cachedValue: LangPrefs = DEFAULT_LANGS

function parse(raw: string | null): LangPrefs {
  if (!raw) return DEFAULT_LANGS
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    return {
      input: isLang(o.input) ? o.input : DEFAULT_LANGS.input,
      reply: isLang(o.reply) ? o.reply : DEFAULT_LANGS.reply,
    }
  } catch {
    return DEFAULT_LANGS
  }
}

function read(): LangPrefs {
  let raw: string | null = null
  try { raw = window.localStorage.getItem(KEY) } catch { raw = null }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedValue = parse(raw)
  }
  return cachedValue
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function setLang(which: keyof LangPrefs, value: Lang) {
  const next: LangPrefs = { ...read(), [which]: value }
  try { window.localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ไม่จำก็ได้ */ }
  for (const listener of listeners) listener()
}

/** ฝั่งเซิร์ฟเวอร์ไม่มี localStorage — ใช้ค่าตั้งต้นซึ่งเป็นไทยทั้งคู่ */
export function useLangs(): LangPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_LANGS)
}
