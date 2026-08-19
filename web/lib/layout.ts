/**
 * จัดวางบล็อกที่เวลาซ้อนกันในแถวของวันเดียวกัน
 *
 * ในปฏิทินแกนกลับด้าน (วัน = แกนตั้ง) บล็อกที่ชนกันต้อง **แบ่งความสูง**
 * ของแถววันนั้น ไม่ใช่แบ่งความกว้าง เพราะแกนนอนคือเวลา (doc/TRAPS.md)
 */
export type Span = { start: number; end: number }

export type Placed<T> = { item: T; lane: number; of: number }

export function layoutDay<T>(items: T[], span: (t: T) => Span): Placed<T>[] {
  const sorted = items
    .map((item) => ({ item, s: span(item) }))
    .sort((a, b) => a.s.start - b.s.start || a.s.end - b.s.end)

  const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end

  // กลุ่มที่ชนกันแบบต่อเนื่อง — A ชน B, B ชน C ให้ถือเป็นกลุ่มเดียวกัน
  // ไม่งั้น A กับ C จะได้ตำแหน่งทับกันทั้งที่อยู่คนละ lane
  const groups: (typeof sorted)[] = []
  for (const entry of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.some((e) => overlaps(e.s, entry.s))) last.push(entry)
    else groups.push([entry])
  }

  const out: Placed<T>[] = []
  for (const group of groups) {
    // จัดลง lane แบบ greedy · lane แรกที่ว่างพอ
    const lanes: Span[][] = []
    for (const entry of group) {
      let idx = lanes.findIndex((lane) => !lane.some((s) => overlaps(s, entry.s)))
      if (idx === -1) { lanes.push([]); idx = lanes.length - 1 }
      lanes[idx].push(entry.s)
      out.push({ item: entry.item, lane: idx, of: 0 })
    }
    // ทุกบล็อกในกลุ่มเดียวกันสูงเท่ากัน จะได้เรียงตรงกัน
    const depth = lanes.length
    for (let i = out.length - group.length; i < out.length; i++) out[i].of = depth
  }

  return out
}
