'use client'

/**
 * ภาษาและเสียงที่ผู้ใช้เลือก เก็บใน localStorage
 *
 * ⚠️ **กับดักของ `useSyncExternalStore` กับค่าที่เป็นออบเจกต์**
 *    `getSnapshot` ต้องคืน**ตัวเดิม**เมื่อไม่มีอะไรเปลี่ยน · ถ้า parse JSON ใหม่
 *    ทุกครั้งที่ถูกเรียก จะได้ออบเจกต์ใหม่ทุกรอบ React เทียบด้วย `Object.is`
 *    แล้วเห็นว่าต่างเสมอ → re-render ไม่รู้จบจนหน้าค้าง (doc/TRAPS.md)
 *
 *    จึงจำสตริงดิบไว้ แล้วสร้างออบเจกต์ใหม่ต่อเมื่อสตริงเปลี่ยนจริงเท่านั้น
 */
import { useSyncExternalStore } from 'react'
import { DEFAULT_LANG, readLang, type Lang } from '@/lib/ai/lang'
import { readVoice, VOICE_AUTO, type VoiceChoice } from '@/lib/ai/voices'

export type TalkPrefs = { lang: Lang; voice: VoiceChoice }

export const DEFAULT_PREFS: TalkPrefs = { lang: DEFAULT_LANG, voice: VOICE_AUTO }

/** เปลี่ยนชื่อคีย์จากของเดิมโดยตั้งใจ — โครงข้างในเปลี่ยนไปแล้ว ค่าเก่าใช้ต่อไม่ได้ */
const KEY = 'kevin.talk.prefs'

const listeners = new Set<() => void>()

let cachedRaw: string | null | undefined
let cachedValue: TalkPrefs = DEFAULT_PREFS

function parse(raw: string | null): TalkPrefs {
  if (!raw) return DEFAULT_PREFS
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    return { lang: readLang(o.lang), voice: readVoice(o.voice) }
  } catch {
    return DEFAULT_PREFS
  }
}

function read(): TalkPrefs {
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

export function setPrefs(patch: Partial<TalkPrefs>) {
  const next: TalkPrefs = { ...read(), ...patch }
  try { window.localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ไม่จำก็ได้ */ }
  for (const listener of listeners) listener()
}

/** ฝั่งเซิร์ฟเวอร์ไม่มี localStorage — ใช้ค่าตั้งต้น */
export function useTalkPrefs(): TalkPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_PREFS)
}
