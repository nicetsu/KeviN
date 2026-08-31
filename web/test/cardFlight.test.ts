/**
 * lib/cardFlight.ts — การ์ดที่บินไปเป็นหัวของหน้าถัดไป
 *
 * พลาดแล้วไม่มี error ให้เห็น · หัวจะบินมาจากที่ผิด หรือบินทั้งที่ไม่ควรบิน
 * ซึ่งอ่านออกมาเป็น "แอปกระตุก" มากกว่า "แอปมีบั๊ก"
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { takeOff, land, startTransform, FLIGHT_TTL_MS, type Flight } from '../lib/cardFlight'

/** `sessionStorage` ปลอมแบบง่าย — ไฟล์ที่ทดสอบใช้แค่ get/set/remove */
function fakeStorage() {
  const box = new Map<string, string>()
  return {
    getItem: (k: string) => box.get(k) ?? null,
    setItem: (k: string, v: string) => void box.set(k, v),
    removeItem: (k: string) => void box.delete(k),
    size: () => box.size,
  }
}

function withStorage<T>(fn: () => T): T {
  const s = fakeStorage()
  ;(globalThis as unknown as { sessionStorage: unknown }).sessionStorage = s
  try {
    return fn()
  } finally {
    delete (globalThis as unknown as { sessionStorage?: unknown }).sessionStorage
  }
}

const rect = (x: number, y: number, w: number, h: number) =>
  ({ left: x, top: y, width: w, height: h }) as DOMRect

const NOW = 1_000_000

test('จดแล้วอ่านกลับได้ในเวลาที่ยังไม่หมดอายุ', () =>
  withStorage(() => {
    takeOff('a', rect(10, 20, 160, 92), NOW)
    const f = land('a', NOW + 100)
    assert.equal(f?.x, 10)
    assert.equal(f?.y, 20)
    assert.equal(f?.w, 160)
    assert.equal(f?.h, 92)
  }))

test('อ่านแล้วหายทันที ไม่ค้างไปรอบถัดไป', () =>
  withStorage(() => {
    // ค้างไว้แล้วหัวของหน้าอื่นจะบินมาจากตำแหน่งที่ไม่เกี่ยวอะไรเลย
    // เกิดได้จริงเมื่อผู้ใช้กดแล้วกดย้อนกลับเร็ว ๆ
    takeOff('a', rect(0, 0, 10, 10), NOW)
    assert.ok(land('a', NOW))
    assert.equal(land('a', NOW), null)
  }))

test('หมดอายุแล้วไม่บิน', () =>
  withStorage(() => {
    // การเคลื่อนไหวที่มาช้ากว่าการกระทำ อ่านไม่ออกว่าเกี่ยวกัน
    takeOff('a', rect(0, 0, 10, 10), NOW)
    assert.equal(land('a', NOW + FLIGHT_TTL_MS + 1), null)
  }))

test('ที่ขอบเวลาพอดียังบินได้', () =>
  withStorage(() => {
    takeOff('a', rect(0, 0, 10, 10), NOW)
    assert.ok(land('a', NOW + FLIGHT_TTL_MS))
  }))

test('id ไม่ตรงไม่บิน — กัน Area อื่นหยิบไปใช้', () =>
  withStorage(() => {
    takeOff('a', rect(0, 0, 10, 10), NOW)
    assert.equal(land('b', NOW), null)
  }))

test('ไม่เคยจดก็ไม่พัง', () =>
  withStorage(() => {
    assert.equal(land('a', NOW), null)
  }))

test('ค่าที่เสียหายไม่ทำให้พัง', () =>
  withStorage(() => {
    sessionStorage.setItem('kevin.card.flight', '{ไม่ใช่ JSON')
    assert.equal(land('a', NOW), null)
  }))

test('ขนาดศูนย์ไม่บิน — หารด้วยศูนย์แล้วได้ค่าเพี้ยน', () =>
  withStorage(() => {
    takeOff('a', rect(0, 0, 0, 0), NOW)
    assert.equal(land('a', NOW), null)
  }))

// ---- ท่าเริ่มต้น ----

const flight = (x: number, y: number, w: number, h: number): Flight =>
  ({ id: 'a', x, y, w, h, at: NOW })

test('ย้อนระยะและขนาดกลับไปที่การ์ดเดิม', () => {
  // การ์ดอยู่ (10,20) ขนาด 160×92 · หัวอยู่ (16,120) ขนาด 320×76
  const t = startTransform(flight(10, 20, 160, 92), rect(16, 120, 320, 76))
  assert.equal(t, 'translate(-6px, -100px) scale(0.5, 1.211)')
})

test('อยู่ที่เดียวกันขนาดเท่ากัน = ไม่ขยับ', () => {
  const t = startTransform(flight(10, 20, 100, 50), rect(10, 20, 100, 50))
  assert.equal(t, 'translate(0px, 0px) scale(1, 1)')
})

test('ปลายทางขนาดศูนย์ไม่ทำให้ได้ scale เป็น Infinity', () => {
  // เกิดได้ถ้า element ยังไม่ถูกวางตอนวัด · ต้องได้ค่าที่ใช้ต่อได้ ไม่ใช่ NaN
  const t = startTransform(flight(0, 0, 100, 50), rect(0, 0, 0, 0))
  assert.equal(t.includes('Infinity'), false)
  assert.equal(t.includes('NaN'), false)
})
