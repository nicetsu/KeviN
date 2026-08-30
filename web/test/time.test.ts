/**
 * lib/time.ts — เวลาไทยทั้งหมดอยู่ไฟล์นี้ที่เดียว
 *
 * ไทยเป็น UTC+7 คงที่ ไม่มี DST · เคสที่แพงที่สุดคือ **ช่วงหัวค่ำถึงเที่ยงคืน UTC**
 * ซึ่งวันไทยเดินไปข้างหน้าแล้วแต่วัน UTC ยังไม่เปลี่ยน — ถ้าพลาดตรงนี้
 * หน้าวันนี้จะโชว์ของเมื่อวานอยู่จนถึงเจ็ดโมงเช้า โดยไม่มีอะไรฟ้อง
 */
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  bangkokToday,
  bangkokNow,
  bangkokTime,
  thaiDateLabel,
  thaiMonthLabel,
  thaiRangeLabel,
  clockLabel,
  overdueLabel,
  soonLabel,
  mondayOf,
  addDays,
  addMonths,
  dayAheadLabel,
  hourOf,
} from '../lib/time'

/** 30 ส.ค. 2026 เป็นวันอาทิตย์ · 31 ส.ค. เป็นวันจันทร์ */
const SUN = '2026-08-30'
const MON = '2026-08-31'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

// ---- addDays ----

test('addDays · บวกหนึ่งวัน', () => {
  assert.equal(addDays(SUN, 1), MON)
})

test('addDays · ลบวันได้', () => {
  assert.equal(addDays(SUN, -1), '2026-08-29')
})

test('addDays · ศูนย์คืนวันเดิม', () => {
  assert.equal(addDays(SUN, 0), SUN)
})

test('addDays · ข้ามเดือน', () => {
  assert.equal(addDays(MON, 1), '2026-09-01')
})

test('addDays · ข้ามปี', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
})

// ---- mondayOf ----

test('mondayOf · วันจันทร์อยู่ที่เดิม', () => {
  assert.equal(mondayOf('2026-08-24'), '2026-08-24')
})

test('mondayOf · วันพุธถอยไปต้นสัปดาห์', () => {
  assert.equal(mondayOf('2026-08-26'), '2026-08-24')
})

test('mondayOf · วันอาทิตย์อยู่ท้ายสัปดาห์ ไม่ใช่ต้นสัปดาห์ถัดไป', () => {
  // getUTCDay() ให้อาทิตย์ = 0 ถ้าไม่หมุนแกนก่อนจะกระโดดไปผิดสัปดาห์ทั้งหน้า
  assert.equal(mondayOf(SUN), '2026-08-24')
})

test('mondayOf · ข้ามเดือนถอยหลังได้', () => {
  assert.equal(mondayOf('2026-09-02'), MON)
})

// ---- addMonths ----

test('addMonths · เดือนถัดไป และปัดไปวันที่ 1 เสมอ', () => {
  // ตัวนี้ใช้กับหัวปฏิทินโหมดเดือน ซึ่งสนใจแค่ว่าเดือนไหน
  assert.equal(addMonths('2026-08-15', 1), '2026-09-01')
})

test('addMonths · ถอยเดือนได้', () => {
  assert.equal(addMonths('2026-08-15', -1), '2026-07-01')
})

test('addMonths · ข้ามปีทั้งสองทาง', () => {
  assert.equal(addMonths('2026-12-10', 1), '2027-01-01')
  assert.equal(addMonths('2026-01-10', -1), '2025-12-01')
})

// ---- ป้ายภาษาไทย ----

test('thaiDateLabel · วันอาทิตย์', () => {
  assert.equal(thaiDateLabel(SUN), 'อาทิตย์ 30 ส.ค.')
})

test('thaiDateLabel · วันจันทร์ข้ามเดือน', () => {
  assert.equal(thaiDateLabel('2026-09-01'), 'อังคาร 1 ก.ย.')
})

test('thaiMonthLabel · ใช้ พ.ศ. ไม่ใช่ ค.ศ.', () => {
  assert.equal(thaiMonthLabel('2026-08-01'), 'สิงหาคม 2569')
})

test('thaiRangeLabel · เดือนเดียวกันเขียนชื่อเดือนครั้งเดียว', () => {
  assert.equal(thaiRangeLabel('2026-08-17', '2026-08-23'), '17–23 ส.ค.')
})

test('thaiRangeLabel · คร่อมเดือนเขียนชื่อเดือนทั้งสองข้าง', () => {
  assert.equal(thaiRangeLabel('2026-08-31', '2026-09-06'), '31 ส.ค. – 6 ก.ย.')
})

test('clockLabel · ตัดวินาทีของ time เปล่าจาก project_schedules', () => {
  assert.equal(clockLabel('09:00:00'), '09:00')
})

test('hourOf · แปลงเป็นชั่วโมงทศนิยมสำหรับวางบล็อกบนแกนเวลา', () => {
  assert.equal(hourOf('09:00:00'), 9)
  assert.equal(hourOf('09:30:00'), 9.5)
})

test('hourOf · รับ 24:00:00 ของบล็อกที่ชนเที่ยงคืนได้', () => {
  assert.equal(hourOf('24:00:00'), 24)
})

// ---- bangkokTime ----

test('bangkokTime · แปลง UTC เป็นเวลาไทย', () => {
  assert.equal(bangkokTime('2026-08-30T02:00:00Z'), '09:00')
})

test('bangkokTime · หัวค่ำ UTC คือหลังเที่ยงคืนของวันไทยถัดไป', () => {
  assert.equal(bangkokTime('2026-08-30T17:30:00Z'), '00:30')
})

// ---- overdueLabel ----

test('overdueLabel · ยังไม่ถึงกำหนดได้ null (ป้ายโผล่เฉพาะตอนผิดปกติ)', () => {
  const now = Date.UTC(2026, 7, 30, 2, 0, 0)
  assert.equal(overdueLabel(new Date(now + HOUR).toISOString(), now), null)
})

test('overdueLabel · ถึงกำหนดพอดีถือว่าเลยแล้ว 0 นาที', () => {
  const now = Date.UTC(2026, 7, 30, 2, 0, 0)
  assert.equal(overdueLabel(new Date(now).toISOString(), now), 'เลย 0 นาที')
})

test('overdueLabel · นับเป็นนาทีเมื่อไม่ถึงชั่วโมง', () => {
  const now = Date.UTC(2026, 7, 30, 2, 0, 0)
  assert.equal(overdueLabel(new Date(now - 5 * MIN).toISOString(), now), 'เลย 5 นาที')
})

test('overdueLabel · 59 นาทียังเป็นนาที · 60 นาทีข้ามเป็นชั่วโมง', () => {
  const now = Date.UTC(2026, 7, 30, 2, 0, 0)
  assert.equal(overdueLabel(new Date(now - 59 * MIN).toISOString(), now), 'เลย 59 นาที')
  assert.equal(overdueLabel(new Date(now - 60 * MIN).toISOString(), now), 'เลย 1 ชม.')
})

test('overdueLabel · 23 ชม. ยังเป็นชั่วโมง · 24 ชม. ข้ามเป็นวัน', () => {
  const now = Date.UTC(2026, 7, 30, 2, 0, 0)
  assert.equal(overdueLabel(new Date(now - 23 * HOUR).toISOString(), now), 'เลย 23 ชม.')
  assert.equal(overdueLabel(new Date(now - 24 * HOUR).toISOString(), now), 'เลย 1 วัน')
})

test('overdueLabel · นับเป็นวันเมื่อเลยมานาน', () => {
  const now = Date.UTC(2026, 7, 30, 2, 0, 0)
  assert.equal(overdueLabel(new Date(now - 3 * DAY).toISOString(), now), 'เลย 3 วัน')
})

// ---- soonLabel ----

test('soonLabel · โผล่เมื่อเหลือน้อยกว่าหนึ่งชั่วโมง', () => {
  const now = Date.UTC(2026, 7, 30, 2, 0, 0)
  assert.equal(soonLabel(new Date(now + 40 * MIN).toISOString(), now), 'อีก 40 นาที')
})

test('soonLabel · 59 นาทียังโผล่', () => {
  const now = Date.UTC(2026, 7, 30, 2, 0, 0)
  assert.equal(soonLabel(new Date(now + 59 * MIN).toISOString(), now), 'อีก 59 นาที')
})

test('soonLabel · ครบหนึ่งชั่วโมงพอดีไม่โผล่', () => {
  const now = Date.UTC(2026, 7, 30, 2, 0, 0)
  assert.equal(soonLabel(new Date(now + 60 * MIN).toISOString(), now), null)
})

test('soonLabel · เลยเวลาไปแล้วไม่โผล่ (นั่นเป็นงานของ overdueLabel)', () => {
  const now = Date.UTC(2026, 7, 30, 2, 0, 0)
  assert.equal(soonLabel(new Date(now - MIN).toISOString(), now), null)
})

test('soonLabel · ถึงเวลาพอดียังโผล่เป็น "อีก 0 นาที"', () => {
  const now = Date.UTC(2026, 7, 30, 2, 0, 0)
  assert.equal(soonLabel(new Date(now).toISOString(), now), 'อีก 0 นาที')
})

// ---- dayAheadLabel ----

test('dayAheadLabel · วันเดียวกันได้ null เพื่อให้ hero นับถอยหลังเป็นนาทีแทน', () => {
  assert.equal(dayAheadLabel(SUN, SUN), null)
})

test('dayAheadLabel · พรุ่งนี้', () => {
  assert.equal(dayAheadLabel(SUN, MON), 'พรุ่งนี้')
})

test('dayAheadLabel · มะรืนนี้', () => {
  assert.equal(dayAheadLabel(SUN, '2026-09-01'), 'มะรืนนี้')
})

test('dayAheadLabel · ไกลกว่านั้นบอกชื่อวันตรง ๆ', () => {
  // hero มองไปข้างหน้า 14 วันเพื่อข้ามสัปดาห์สอบ ป้ายจึงต้องรับวันไกล ๆ ได้
  assert.equal(dayAheadLabel(SUN, '2026-09-02'), 'พุธ 2 ก.ย.')
})

test('dayAheadLabel · วันย้อนหลังก็บอกชื่อวัน ไม่ใช่ "พรุ่งนี้" กลับทาง', () => {
  assert.equal(dayAheadLabel(SUN, '2026-08-29'), 'เสาร์ 29 ส.ค.')
})

// ---- bangkokToday / bangkokNow (ต้องคุมนาฬิกา) ----

const at = (iso: string, fn: () => void) => {
  mock.timers.enable({ apis: ['Date'], now: new Date(iso).getTime() })
  try { fn() } finally { mock.timers.reset() }
}

test('bangkokToday · กลางวันไทย', () => {
  at('2026-08-30T02:00:00Z', () => {
    const t = bangkokToday()
    assert.equal(t.dateKey, SUN)
    assert.equal(t.start.toISOString(), '2026-08-29T17:00:00.000Z')
    assert.equal(t.end.toISOString(), '2026-08-30T17:00:00.000Z')
  })
})

test('bangkokToday · หลังห้าโมงเย็น UTC วันไทยเดินไปแล้ว', () => {
  // จุดที่พังเงียบที่สุด — ถ้าใช้วัน UTC ตรง ๆ หน้าวันนี้จะค้างอยู่ที่เมื่อวาน
  at('2026-08-30T17:30:00Z', () => {
    assert.equal(bangkokToday().dateKey, MON)
  })
})

test('bangkokToday · ก่อนห้าโมงเย็น UTC หนึ่งนาที ยังเป็นวันเดิม', () => {
  at('2026-08-30T16:59:00Z', () => {
    assert.equal(bangkokToday().dateKey, SUN)
  })
})

test('bangkokToday · ช่วงเวลาของวันยาว 24 ชม. พอดี', () => {
  at('2026-08-30T02:00:00Z', () => {
    const t = bangkokToday()
    assert.equal(t.end.getTime() - t.start.getTime(), DAY)
  })
})

test('bangkokNow · ชั่วโมงทศนิยมและวันในสัปดาห์ (0 = จันทร์)', () => {
  at('2026-08-30T02:30:00Z', () => {
    const n = bangkokNow()
    assert.equal(n.hour, 9.5)
    assert.equal(n.dow, 6) // อาทิตย์
    assert.equal(n.dateKey, SUN)
  })
})

test('bangkokNow · ข้ามเที่ยงคืนไทยแล้ววันในสัปดาห์ต้องเดินตาม', () => {
  at('2026-08-30T17:30:00Z', () => {
    const n = bangkokNow()
    assert.equal(n.hour, 0.5)
    assert.equal(n.dow, 0) // จันทร์
    assert.equal(n.dateKey, MON)
  })
})
