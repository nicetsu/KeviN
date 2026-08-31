'use client'

/**
 * ไมค์ที่เลือกไว้ เก็บใน localStorage แยกจาก `talkPrefs`
 *
 * ⚠️ **แยกคีย์โดยตั้งใจ** — `talkPrefs` ถูกส่งขึ้นเซิร์ฟเวอร์ไปกับคำขอ token
 *    ส่วน `deviceId` ไม่มีใครฝั่งเซิร์ฟเวอร์ใช้ · รวมกันคือส่งข้อมูลอุปกรณ์
 *    ออกจากเครื่องฟรี ๆ (lib/voice/mic.ts)
 *
 * ⚠️ กับดัก `useSyncExternalStore` แบบเดียวกับ `talkPrefs` — `getSnapshot`
 *    ต้องคืนตัวเดิมเมื่อไม่มีอะไรเปลี่ยน · ที่นี่ค่าเป็น **สตริง** ไม่ใช่ออบเจกต์
 *    จึงเทียบด้วย `Object.is` ได้ตรง ๆ ไม่ต้องจำสตริงดิบไว้เหมือนไฟล์นั้น
 */
import { useSyncExternalStore } from 'react'
import { micOptions, MIC_AUTO, type MicOption } from './mic'

const KEY = 'kevin.talk.mic'

const listeners = new Set<() => void>()

function read(): string {
  try {
    return window.localStorage.getItem(KEY) || MIC_AUTO
  } catch {
    return MIC_AUTO
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function setMic(id: string) {
  try {
    if (id === MIC_AUTO) window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, id)
  } catch {
    /* ไม่จำก็ได้ · สายยังโทรได้ */
  }
  for (const listener of listeners) listener()
}

/** ฝั่งเซิร์ฟเวอร์ไม่มี localStorage — ใช้อัตโนมัติ */
export function useMic(): string {
  return useSyncExternalStore(subscribe, read, () => MIC_AUTO)
}

// ---------------------------------------------------------------------------
// รายชื่ออุปกรณ์ — external store อีกตัว
//
// รายการไมค์เป็นของ**นอก React** ที่เปลี่ยนเองได้ตลอดเวลา (เสียบหูฟังกลางสาย)
// จึงต้อง subscribe ไม่ใช่อ่านครั้งเดียวตอน mount
//
// ⚠️ ที่ไม่ทำเป็น `useEffect` + `setState` เพราะ `enumerateDevices()` เป็น async
//    การ setState ใน effect body ทำให้เกิด cascading render ซึ่ง React ห้าม
//    (lint จับได้ตอนเขียนรอบแรก) · รูป external store ตรงกับธรรมชาติของมันกว่า
// ---------------------------------------------------------------------------

const EMPTY: MicOption[] = [{ id: MIC_AUTO, label: 'อัตโนมัติ', hint: 'ตามที่เครื่องเลือกให้' }]

let list: MicOption[] = EMPTY
/** ลายนิ้วมือของรายการล่าสุด · ใช้ตัดสินว่าต้องเปลี่ยน reference ไหม */
let listKey = ''
const listListeners = new Set<() => void>()

/**
 * ⚠️ ต้องคืน**ตัวเดิม**เมื่อรายการไม่เปลี่ยน — `useSyncExternalStore` เทียบด้วย
 *    `Object.is` ถ้าสร้างอาร์เรย์ใหม่ทุกครั้งจะ re-render ไม่รู้จบ
 *    (กับดักเดียวกับที่ `talkPrefs` เจอ · doc/TRAPS.md)
 */
function readList(): MicOption[] {
  return list
}

async function pull() {
  const devices = await navigator.mediaDevices?.enumerateDevices?.().catch(() => null)
  if (!devices) return
  const next = micOptions(devices)
  const key = next.map((o) => `${o.id}:${o.label}`).join('|')
  if (key === listKey) return
  listKey = key
  list = next
  for (const listener of listListeners) listener()
}

function subscribeList(onChange: () => void) {
  listListeners.add(onChange)
  const md = navigator.mediaDevices
  const onDeviceChange = () => void pull()
  md?.addEventListener?.('devicechange', onDeviceChange)
  void pull()
  return () => {
    listListeners.delete(onChange)
    md?.removeEventListener?.('devicechange', onDeviceChange)
  }
}

/** ฝั่งเซิร์ฟเวอร์ไม่มีอุปกรณ์ — คืนแค่แถว "อัตโนมัติ" */
export function useMicList(): MicOption[] {
  return useSyncExternalStore(subscribeList, readList, () => EMPTY)
}
