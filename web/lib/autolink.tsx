import { Fragment, type ReactNode } from 'react'

/**
 * แปลง URL และอีเมลในข้อความธรรมดาให้กดได้
 *
 * ใช้กับ `body` ของ event และ item — อีเมลประกาศงานมักมีลิงก์ลงทะเบียน
 * ลิงก์กลุ่ม และอีเมลติดต่อปนมาในเนื้อความ ถ้าปล่อยเป็นข้อความล้วน
 * ต้องลากคลุมคัดลอกเอง ซึ่งบนมือถือทรมาน
 *
 * ⚠️ ที่ไม่ใช้ `dangerouslySetInnerHTML` โดยตั้งใจ — ข้อความพวกนี้มาจากอีเมล
 * ที่ copy มาวาง และ **Claude เขียนลง DB ได้ผ่าน MCP** จึงไม่ใช่ข้อความที่
 * เจ้าของพิมพ์เองเสมอไป · การคืนค่าเป็น element ให้ React จัดการทำให้
 * ข้อความทุกตัวถูก escape โดยอัตโนมัติ ปิดทาง XSS ตั้งแต่ต้นทาง
 *
 * และ `href` ประกอบจากสิ่งที่ผ่าน PATTERN เท่านั้น ซึ่งบังคับให้ขึ้นต้นด้วย
 * http/https หรือเป็นรูปอีเมล — `javascript:` จึงเข้ามาไม่ได้
 */
const PATTERN = /(https?:\/\/[^\s<>"']+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g

/** วรรคตอนท้ายลิงก์ที่คนเขียนติดมา ไม่ใช่ส่วนหนึ่งของ URL */
const TRAILING = /[.,;:!?)\]}]+$/

export default function Autolink({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {linkify(line)}
        </Fragment>
      ))}
    </>
  )
}

function linkify(line: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0

  for (const m of line.matchAll(PATTERN)) {
    const raw = m[0]
    const at = m.index ?? 0

    // "ดูที่ https://x.com/a." — จุดท้ายเป็นของประโยค ไม่ใช่ของลิงก์
    const trail = raw.match(TRAILING)?.[0] ?? ''
    const url = trail ? raw.slice(0, -trail.length) : raw
    if (!url) continue

    if (at > last) out.push(line.slice(last, at))

    const isMail = !url.startsWith('http')
    out.push(
      <a
        key={at}
        className="alink"
        href={isMail ? `mailto:${url}` : url}
        target={isMail ? undefined : '_blank'}
        rel={isMail ? undefined : 'noopener noreferrer'}
      >
        {url}
      </a>
    )

    if (trail) out.push(trail)
    last = at + raw.length
  }

  if (last < line.length) out.push(line.slice(last))
  return out
}
