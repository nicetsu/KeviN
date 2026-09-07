/**
 * lib/chat/quota.ts — แยก 429 ของ Gemini เป็น "หมดโควตาวัน" กับ "เร็วเกินไป"
 *
 * สิ่งที่ต้องจริงเสมอ: **เมื่อไม่แน่ใจ ห้ามประกาศว่าหมดทั้งวัน**
 * เพราะข้อความนั้นทำให้ผู้ใช้เลิกใช้ทั้งวัน และในโหมดเสียงยังดันเขาออกไป
 * โหมดแชตทั้งรอบ ทั้งที่รอยี่สิบวินาทีก็โทรได้
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyRateLimit, rateLimitMessage } from '../lib/chat/quota'

/** รูปจริงของ body ที่ Google ส่งมาตอนชนเพดานต่อนาที */
const PER_MINUTE = JSON.stringify({
  error: {
    code: 429,
    message: 'Quota exceeded',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel' }],
      },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '20s' },
    ],
  },
})

/** ตอนชนเพดานรายวัน Google ไล่รายชื่อโควตามาหลายตัว **รวมตัวที่มีคำว่า minute ด้วย** */
const PER_DAY = JSON.stringify({
  error: {
    code: 429,
    details: [
      {
        violations: [
          { quotaId: 'GenerateRequestsPerMinutePerProjectPerModel' },
          { quotaId: 'GenerateRequestsPerDayPerProjectPerModel' },
        ],
      },
    ],
  },
})

test('เพดานต่อนาที อ่านออกว่าเป็นนาที และเก็บเวลาที่ให้รอมาด้วย', () => {
  const r = classifyRateLimit(PER_MINUTE)
  assert.equal(r.kind, 'minute')
  assert.equal(r.retryAfterSec, 20)
})

test('เพดานรายวัน ต้องชนะแม้ body จะมีคำว่า minute ปนอยู่', () => {
  // ถ้าตรวจนาทีก่อน จะอ่านวันเป็นนาทีตลอด แล้วบอกให้ผู้ใช้รอ 20 วินาทีทั้งที่หมดจริง
  assert.equal(classifyRateLimit(PER_DAY).kind, 'day')
})

test('429 ที่ไม่บอกชื่อโควตาเลย เป็น unknown ไม่ใช่ day', () => {
  assert.equal(classifyRateLimit('{"error":{"code":429}}').kind, 'unknown')
  assert.equal(classifyRateLimit('').kind, 'unknown')
})

test('มี retryDelay สั้น ๆ แต่ไม่บอกชื่อโควตา ถือว่าเป็นการหน่วงชั่วคราว', () => {
  const r = classifyRateLimit('{"retryDelay":"7s"}')
  assert.equal(r.kind, 'minute')
  assert.equal(r.retryAfterSec, 7)
})

test('retryDelay ที่มีทศนิยม ปัดขึ้นเป็นวินาทีเต็ม', () => {
  // "อีก 12.4 วินาที" อ่านแล้วดูแม่นเกินจริง และปัดลงจะบอกให้ลองก่อนเวลา
  assert.equal(classifyRateLimit('{"retryDelay":"12.4s"}').retryAfterSec, 13)
})

test('retryDelay ยาว ๆ ที่ไม่บอกชื่อโควตา ไม่ถูกเดาว่าเป็นนาที', () => {
  assert.equal(classifyRateLimit('{"retryDelay":"3600s"}').kind, 'unknown')
})

test('ชื่อโควตาแบบเว้นวรรคและตัวพิมพ์ใหญ่ ก็ต้องอ่านออก', () => {
  assert.equal(classifyRateLimit('Quota exceeded: requests per day').kind, 'day')
  assert.equal(classifyRateLimit('LIMIT: Requests Per Minute').kind, 'minute')
})

test('หมดโควตารายวัน — เสียงชี้ไปแชต แชตชี้ไปพรุ่งนี้', () => {
  const day = { kind: 'day' as const }
  assert.match(rateLimitMessage(day, 'voice'), /พิมพ์คุยต่อ/)
  assert.match(rateLimitMessage(day, 'chat'), /พรุ่งนี้/)
})

test('เร็วเกินไป ต้องไม่มีคำว่าหมดหรือวันนี้อยู่ในข้อความเลย', () => {
  // นี่คือบั๊กเดิมทั้งอัน — ข้อความที่บอกว่าหมดทั้งวันทำให้เขาเลิกใช้ทั้งวัน
  for (const ch of ['chat', 'voice'] as const) {
    const m = rateLimitMessage({ kind: 'minute', retryAfterSec: 20 }, ch)
    assert.equal(/หมด|วันนี้/.test(m), false, m)
    assert.match(m, /20 วินาที/)
  }
})

test('ไม่รู้ว่าชนอะไร ก็ยังห้ามบอกว่าหมดโควตา', () => {
  const m = rateLimitMessage({ kind: 'unknown' }, 'chat')
  assert.equal(/หมด|วันนี้/.test(m), false, m)
})

test('ไม่มีเวลาที่ให้รอ ก็ไม่แต่งตัวเลขขึ้นมาเอง', () => {
  const m = rateLimitMessage({ kind: 'minute' }, 'chat')
  assert.equal(/\d/.test(m), false, m)
})
