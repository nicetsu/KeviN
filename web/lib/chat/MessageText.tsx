import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { isRealRoute } from './links'
import { parseBlocks, type Token } from './markdown'

/**
 * เรนเดอร์คำตอบของผู้ช่วยที่เขียนมาเป็น markdown
 *
 * ตรรกะการแกะอยู่ใน `markdown.ts` ที่มีเทสต์กำกับ · ไฟล์นี้แค่แปลงเป็น element
 * (ที่ไม่ตั้งชื่อไฟล์นี้ว่า `markdown.tsx` เพราะจะชนกับ `markdown.ts`
 *  แล้ว `./markdown` จะกำกวมจนอาจ import ตัวเอง)
 *
 * ⚠️ **ไม่ใช้ `dangerouslySetInnerHTML` และไม่ลงไลบรารี markdown**
 *    คำตอบมาจากโมเดลซึ่งพิมพ์อะไรออกมาก็ได้ · การคืนค่าเป็น element
 *    ให้ React จัดการทำให้ทุกตัวอักษรถูก escape ปิดทาง XSS ตั้งแต่ต้นทาง
 *
 * ⚠️ **ใช้กับข้อความฝั่งผู้ช่วยเท่านั้น ห้ามใช้กับฝั่งผู้ใช้**
 *    ข้อความฝั่งผู้ใช้ไม่ใช่ markdown · และค่าที่โหมดโทรบันทึกไว้คือ `- voice -`
 *    ซึ่งถ้าเอามาแกะจะกลายเป็นรายการหัวข้อย่อยที่เขียนว่า "voice -"
 */

/**
 * ลิงก์หนึ่งอัน
 *
 * `href` ประกอบจากสิ่งที่ผ่าน `isRealRoute` หรือขึ้นต้นด้วย http/อีเมลเท่านั้น —
 * `javascript:` จึงเข้ามาไม่ได้
 *
 * ⚠️ **เส้นทางภายในที่ไม่มีจริงแสดงเป็นข้อความเฉย ๆ** ตัวกรองใน `links.ts`
 *    ตัดลิงก์ปลอมไปแล้วชั้นหนึ่ง ที่นี่เป็นชั้นที่สอง — ลิงก์ที่กดแล้วไป 404
 *    แย่กว่าข้อความที่กดไม่ได้
 */
function anchor(href: string, label: string, key: string): ReactNode {
  if (href.startsWith('/')) {
    return isRealRoute(href) ? (
      <Link key={key} className="alink" href={href}>
        {label}
      </Link>
    ) : (
      <Fragment key={key}>{label}</Fragment>
    )
  }

  if (/^https?:\/\//.test(href)) {
    return (
      <a key={key} className="alink" href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    )
  }

  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(href)) {
    return (
      <a key={key} className="alink" href={`mailto:${href}`}>
        {label}
      </a>
    )
  }

  return <Fragment key={key}>{label}</Fragment>
}

function render(tokens: readonly Token[], keyBase: string): ReactNode[] {
  return tokens.map((t, i) => {
    const key = `${keyBase}-${i}`
    switch (t.kind) {
      case 'text':
        return <Fragment key={key}>{t.text}</Fragment>
      case 'code':
        // ผู้ช่วยชอบครอบเส้นทางด้วย backtick แม้ prompt จะสั่งห้ามไว้แล้ว
        // ผลคือลิงก์ที่ผู้ใช้กดไม่ได้ ซึ่งคือปัญหาเดิมในรูปแบบใหม่ —
        // เส้นทางที่มีอยู่จริงจึงกลายเป็นลิงก์เสมอ ไม่ว่าจะเขียนมาแบบไหน
        return isRealRoute(t.text) ? (
          anchor(t.text, t.text, key)
        ) : (
          <code key={key} className="md__code">
            {t.text}
          </code>
        )
      case 'strong':
        return <strong key={key}>{render(t.children, key)}</strong>
      case 'em':
        return <em key={key}>{render(t.children, key)}</em>
      case 'link':
        return anchor(t.href, t.label, key)
    }
  })
}

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      {parseBlocks(text).map((b, i) => {
        if (b.kind === 'h') {
          const Tag = b.level === 2 ? 'h4' : 'h5'
          return (
            <Tag key={i} className="md__h">
              {render(b.tokens, `h${i}`)}
            </Tag>
          )
        }

        if (b.kind === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul'
          return (
            <Tag key={i} className="md__list">
              {b.items.map((item, j) => (
                <li key={j}>{render(item, `${i}-${j}`)}</li>
              ))}
            </Tag>
          )
        }

        return (
          <p key={i} className="md__p">
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {render(line, `${i}-${j}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
