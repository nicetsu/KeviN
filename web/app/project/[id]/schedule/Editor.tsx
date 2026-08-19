'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { expand, rangeOffsets, snapToMonday, clashes, sharedWeeks } from '@/lib/weeks'
import { thaiDateLabel } from '@/lib/time'
import { saveSchedules, type SlotInput } from './actions'

const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์']
const MAX_WEEKS = 24

export type Slot = {
  key: string
  day_of_week: number
  start_time: string
  end_time: string
  location: string
  label: string
  mode: 'range' | 'pick'
  weeks: number
  picked: number[]
}

export type OtherSlot = {
  project_name: string
  day_of_week: number
  start_time: string
  end_time: string
  start_date: string
  week_offsets: number[]
}

const uid = () => Math.random().toString(36).slice(2, 9)

export function newSlot(): Slot {
  return {
    key: uid(),
    day_of_week: 0,
    start_time: '09:00',
    end_time: '11:00',
    location: '',
    label: '',
    mode: 'range',
    weeks: 17,
    picked: rangeOffsets(17),
  }
}

const offsetsOf = (s: Slot) =>
  s.mode === 'range' ? rangeOffsets(s.weeks) : [...s.picked].sort((a, b) => a - b)

export default function Editor({
  projectId,
  projectName,
  initialStart,
  initialSlots,
  others,
}: {
  projectId: string
  projectName: string
  initialStart: string
  initialSlots: Slot[]
  others: OtherSlot[]
}) {
  const router = useRouter()
  const [start, setStart] = useState(initialStart)
  const [slots, setSlots] = useState<Slot[]>(initialSlots.length ? initialSlots : [newSlot()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monday = snapToMonday(start)

  const patch = (key: string, p: Partial<Slot>) =>
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, ...p } : s)))

  // ตัวอย่างผลลัพธ์ · คำนวณสดทุกครั้งที่พิมพ์ ไม่ต้องรอเซิร์ฟเวอร์
  // ตรรกะเดียวกับ schedule_occurrences() ใน DB และมีเทสต์เทียบไว้แล้ว
  const preview = useMemo(() => {
    const all = slots.flatMap((s) => expand(monday, s.day_of_week, offsetsOf(s)))
    const uniq = Array.from(new Set(all)).sort()
    return { first: uniq.slice(0, 6), last: uniq[uniq.length - 1], total: all.length }
  }, [slots, monday])

  // ชนกับ project อื่นไหม — เตือนแต่ไม่ห้าม เพราะชีวิตจริงมันชนกันได้
  const warnings = useMemo(() => {
    const out: string[] = []
    for (const s of slots) {
      const mine = { day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time }
      for (const o of others) {
        if (!clashes(mine, o)) continue
        if (!sharedWeeks(monday, offsetsOf(s), o.start_date, o.week_offsets)) continue
        out.push(`${DAYS[s.day_of_week]} ${s.start_time}–${s.end_time} ชนกับ ${o.project_name}`)
      }
    }
    return Array.from(new Set(out))
  }, [slots, others, monday])

  async function onSave() {
    setError(null)
    setBusy(true)
    const payload: SlotInput[] = slots.map((s) => ({
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      location: s.location || null,
      label: s.label || null,
      week_offsets: offsetsOf(s),
    }))
    const res = await saveSchedules(projectId, monday, payload)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    router.push(`/project/${projectId}`)
    router.refresh()
  }

  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 'var(--s-1)' }}>ช่วงเวลาประจำ — {projectName}</h1>
      </div>

      <label className="field">
        <span>เริ่มสัปดาห์แรกของเทอม</span>
        <input
          className="input"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        {monday !== start && (
          <small className="hint">ปัดเป็นวันจันทร์ให้แล้ว → {monday}</small>
        )}
      </label>

      {slots.map((s, i) => (
        <section key={s.key} className="slot">
          <div className="slot__head">
            <strong>ช่วงที่ {i + 1}</strong>
            {slots.length > 1 && (
              <button
                type="button"
                className="linkbtn"
                onClick={() => setSlots((p) => p.filter((x) => x.key !== s.key))}
              >
                ลบ
              </button>
            )}
          </div>

          <div className="slot__row">
            <select
              className="input"
              value={s.day_of_week}
              onChange={(e) => patch(s.key, { day_of_week: Number(e.target.value) })}
              aria-label="วัน"
            >
              {DAYS.map((d, n) => (
                <option key={d} value={n}>{d}</option>
              ))}
            </select>
            <input
              className="input"
              type="time"
              value={s.start_time}
              onChange={(e) => patch(s.key, { start_time: e.target.value })}
              aria-label="เวลาเริ่ม"
            />
            <span className="dash">–</span>
            <input
              className="input"
              type="time"
              value={s.end_time}
              onChange={(e) => patch(s.key, { end_time: e.target.value })}
              aria-label="เวลาเลิก"
            />
          </div>

          <div className="slot__row">
            <input
              className="input"
              placeholder="ห้อง"
              value={s.location}
              onChange={(e) => patch(s.key, { location: e.target.value })}
            />
            <input
              className="input"
              placeholder="บรรยาย / ปฏิบัติ / ติว"
              value={s.label}
              onChange={(e) => patch(s.key, { label: e.target.value })}
            />
          </div>

          <div className="seg seg--btn">
            <button
              type="button"
              data-on={s.mode === 'range'}
              onClick={() => {
                if (
                  s.mode === 'pick' &&
                  !window.confirm('กลับไปโหมดซ้ำทุกสัปดาห์ สัปดาห์ที่ติ๊กไว้จะหาย ยืนยันไหม')
                )
                  return
                patch(s.key, { mode: 'range' })
              }}
            >
              ซ้ำทุกสัปดาห์
            </button>
            <button
              type="button"
              data-on={s.mode === 'pick'}
              onClick={() => patch(s.key, { mode: 'pick', picked: offsetsOf(s) })}
            >
              เลือกสัปดาห์เอง
            </button>
          </div>

          {s.mode === 'range' ? (
            <div className="slot__row slot__row--mid">
              <span className="muted">ต่อไปอีก</span>
              <input
                className="input input--n"
                type="number"
                min={1}
                max={MAX_WEEKS}
                value={s.weeks}
                onChange={(e) =>
                  patch(s.key, {
                    weeks: Math.max(1, Math.min(MAX_WEEKS, Number(e.target.value) || 1)),
                  })
                }
              />
              <span className="muted">สัปดาห์</span>
            </div>
          ) : (
            <div className="weeks">
              {Array.from({ length: MAX_WEEKS }, (_, n) => {
                const on = s.picked.includes(n)
                return (
                  <button
                    key={n}
                    type="button"
                    className="weeks__b"
                    data-on={on}
                    aria-pressed={on}
                    title={`สัปดาห์ที่ ${n + 1}`}
                    onClick={() =>
                      patch(s.key, {
                        picked: on ? s.picked.filter((x) => x !== n) : [...s.picked, n],
                      })
                    }
                  >
                    {n + 1}
                  </button>
                )
              })}
            </div>
          )}
        </section>
      ))}

      <button
        type="button"
        className="btn btn--ghost add-slot"
        onClick={() => setSlots((p) => [...p, newSlot()])}
      >
        + เพิ่มช่วงเวลา
      </button>

      <div className="sec sec--gap"><span>ตัวอย่างผลลัพธ์</span></div>

      {preview.total === 0 ? (
        <p className="alert">ยังไม่มีคาบเลย — เลือกสัปดาห์อย่างน้อยหนึ่งช่อง</p>
      ) : (
        <div className="sched-strip">
          <div>
            {preview.first
              .map((d) => thaiDateLabel(d).split(' ').slice(1).join(' '))
              .join(' · ')}
            {preview.total > 6 ? ' · …' : ''}
          </div>
          <div className="strong">
            รวม {preview.total} คาบ ถึง {preview.last ? thaiDateLabel(preview.last) : '—'}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="alert alert--gap">
          {warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
          <div className="muted">บันทึกได้ตามปกติ แค่เตือนให้รู้</div>
        </div>
      )}

      {error && (
        <p className="alert alert--gap" role="alert">{error}</p>
      )}

      <div className="actions">
        <button type="button" className="btn" disabled={busy} onClick={onSave}>
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        <button type="button" className="btn btn--quiet" onClick={() => router.back()}>
          ยกเลิก
        </button>
      </div>
    </>
  )
}
