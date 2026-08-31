# KeviN — คำแนะนำสำหรับ Claude

ผู้ช่วยส่วนตัวของเจ้าของโปรเจกต์ (นักศึกษา) เก็บข้อมูลบน Supabase
สั่งงานได้สามทาง — คุยกับ Claude ผ่าน MCP · เว็บแอป PWA · และแท็บ **KeviN** ในเว็บที่คุยได้ทั้งพิมพ์และพูด (อ่านอย่างเดียว)

**สถานะปัจจุบัน: ใช้งานได้จริงครบวงแล้ว** — https://kevin-rose.vercel.app

| เฟส | สถานะ |
|---|---|
| 0 ฐานข้อมูล · 1 MCP · 2 เว็บ · 3 ปฏิทิน | เสร็จ |
| 4 จัดการบนเว็บ | เสร็จ · รวมลากจัดลำดับ |
| 5 PWA + แจ้งเตือน | เสร็จ · push ส่งออกจริงแล้ว |
| 6 Cowork | เสร็จ · สรุปเช้า 06:30 + สรุปรายสัปดาห์ อาทิตย์ 19:00 |
| กิจกรรม + ตัดทอนเวลา | เสร็จ · `events` · `event_agenda` · `time_offsets` |
| ประตูที่สาม (แชต + เสียงในเว็บ) | **เสร็จ · ใช้งานจริงบนมือถือแล้ว** · ดู [doc/CHAT.md](doc/CHAT.md) |

โค้ดอยู่ใน `web/` (Next.js 16) · Edge Function อยู่ใน `supabase/functions/send-reminders/`

**ตรรกะที่มีเทสต์ล้วนกำกับ — แก้แล้วรันเทสต์ด้วย** `npm test --prefix web` (290 เคส · อยู่ใน `web/test/`)
`web/lib/layout.ts` (คาบชนกัน) · `web/lib/weeks.ts` (การซ้ำ) · `web/lib/parse.ts` (ตีความภาษาไทย)
`web/lib/libraryOpen.ts` (สถานะกางของหน้าคลัง) · `web/lib/calendar.ts` + `web/lib/agenda.ts` (กิจกรรม)
`web/lib/time.ts` (เวลาไทย) · `web/lib/ai/*` (tool · ตัวกรอง Area · ภาษา · เสียง)
`web/lib/chat/links.ts` (กันลิงก์ปลอม) · `web/lib/chat/markdown.ts` (แกะ markdown ของผู้ช่วย)
`web/lib/voice/transcript.ts` (ไม่บันทึกเสียงที่พูด) · `web/lib/eventOrder.ts` (ลำดับกิจกรรม) · `web/lib/voice/mic.ts` (เลือกไมค์) · `web/lib/archive.ts` (ของที่รอถูกลบ)

**ความลับเก็บที่ไหน**
VAPID private key → Supabase secrets · VAPID public key → Vercel env (`NEXT_PUBLIC_`)
service_role key → Supabase Vault ชื่อ `kevin_cron_token` (ห้ามฝังใน cron เป็น literal)
สำเนา VAPID อยู่ที่ `web/.vapid-backup.json` ซึ่ง gitignore ไว้แล้ว — **ห้าม regenerate**

---

## อ่านตามลำดับนี้ก่อนแตะอะไร

0. **[ARCHITECTURE.md](ARCHITECTURE.md)** — ระบบทำงานยังไงทั้งหมด อ่านอันนี้ก่อนถ้าเพิ่งเปิดโปรเจกต์ครั้งแรก
   (ฉบับภาพอยู่ที่ [SYSTEM.html](SYSTEM.html) และ [UXUI.html](UXUI.html))

1. **[PLAN.md](PLAN.md)** — แผนงานรายเฟส สถานะล่าสุด
2. **[doc/DECISIONS.md](doc/DECISIONS.md)** — ทุกข้อที่เคาะไปแล้วพร้อมเหตุผล **อย่าเปลี่ยนโดยไม่ถามเจ้าของก่อน**
3. **[doc/TRAPS.md](doc/TRAPS.md)** — กับดักที่รู้ล่วงหน้า อ่านก่อนเขียนโค้ดส่วนที่เกี่ยว
4. **[doc/SCHEMA.sql](doc/SCHEMA.sql)** — schema จริงที่จะ deploy
5. **[doc/CHAT.md](doc/CHAT.md)** — ประตูที่สาม (แชต + เสียง) · ดีไซน์ + สถานะจริง

เอกสารออกแบบเป็น HTML เปิดดูได้ (เป็นทั้งไฟล์ในเครื่องและ artifact บนคลาวด์):

**ฉบับปัจจุบัน — ตรงกับของจริง ดูอันนี้**

| ไฟล์ | เนื้อหา |
|---|---|
| `SYSTEM.html` | ระบบทำงานยังไง 10 หัวข้อ · รวมประตูที่สาม |
| `UXUI.html` | ภาษาภาพ · หน้าจอ · แท็บ KeviN · หลักการห้าข้อ |

**ฉบับภาพของประตูที่สาม (artifact บนคลาวด์)**

| หัวข้อ | ลิงก์ |
|---|---|
| pipeline · เส้นทางข้อมูล · โควตา · สิ่งที่ร่างเดาไม่ถูก | https://claude.ai/code/artifact/0453a1ca-a08e-4c7f-b845-314aba3d26a9 |
| UX/UI ของแท็บ KeviN · ที่ต่างจากร่างหลังใช้จริง | https://claude.ai/code/artifact/0106dd44-993c-48fc-ad90-513c7fcae7b6 |

**ฉบับเก่า อยู่ใน `archive/` — เก็บไว้อ้างอิงเฉย ๆ อย่าใช้ตัดสินใจ**

| ไฟล์ | เนื้อหา | ลิงก์ |
|---|---|---|
| `archive/proposal.html` | ข้อเสนอโปรเจกต์ · แผน 6 เฟส | https://claude.ai/code/artifact/6f50ef21-9670-40e0-84dd-86b29852ec36 |
| `archive/ux.html` | UX หน้าจอ S1–S9 ฉบับก่อน | https://claude.ai/code/artifact/06b0354f-7284-4f28-9b6a-c70b078855dc |
| `archive/ui-kit.html` | ภาษาภาพ · design token | https://claude.ai/code/artifact/2c6a95f6-e51a-4e9a-a80a-b398bdc43046 |

---

## กติกาการทำงานกับโปรเจกต์นี้

- **ภาษา** — คุยกับเจ้าของเป็นภาษาไทย · โค้ด ตัวแปร และ schema เป็นอังกฤษ · UI เป็นไทย
- **อย่าเปลี่ยนสิ่งที่ตัดสินใจไปแล้ว** โดยไม่ถาม ทุกข้อใน `doc/DECISIONS.md` ผ่านการถกมาแล้ว ถ้าเจอเหตุผลที่ควรเปลี่ยน ให้เสนอ อย่าเปลี่ยนเงียบ ๆ
- **ทำทีละเฟส** อย่ากระโดดข้าม แต่ละเฟสมีเกณฑ์ "เสร็จ" ชัดเจนใน PLAN.md
- **ปฏิทินสัปดาห์กลับแกน** — วัน = แกนตั้ง, เวลา = แกนนอน ไม่ใช่แบบ Google Calendar อย่าเผลอทำกลับ
- **timestamptz เสมอ** ยกเว้น `project_schedules.start_time/end_time` ที่เป็น `time` เปล่า

**สามข้อล่างนี้ถ้ารื้อจะพังแบบเงียบ ๆ** รายละเอียดอยู่ใน ARCHITECTURE.md หัวข้อ "ความเร็ว"

- **ห้ามลบ `web/vercel.json`** — มันตรึงให้ฟังก์ชันรันที่โตเกียว region เดียวกับ Supabase
  ถ้าหาย Vercel จะกลับไปใช้ค่าเริ่มต้นที่เวอร์จิเนีย แล้วทุก query ข้ามแปซิฟิกไปกลับ
- **ใน server action ใช้ `currentUserId()` ไม่ใช่ `getUser()`** — `getUser()` ยิงเน็ตทุกครั้ง
  และ `proxy.ts` ยืนยันตัวตนให้แล้วทุก request (แต่ `proxy.ts` เองยังต้องใช้ `getUser()` ต่อไป)
- **เขียนข้อมูลต้องมี `.select()` แล้วนับแถวเสมอ** — `update` ที่ไม่โดนสักแถวรายงานว่าสำเร็จ
  เคยทำให้ลากจัดลำดับดูเหมือนได้แต่ไม่ได้เขียนอะไรลง DB เลย (ดู `doc/TRAPS.md`)

**หน้าจอ — สิ่งที่ต้องรู้ก่อนแตะ**

- **`components/Reveal.tsx`** ครอบทุก `page.tsx` และ `loading.tsx` — โครงร่างกลายเป็นเนื้อจริง
  ถ้าเพิ่มหน้าใหม่ ต้องครอบทั้งคู่ ไม่งั้นหน้านั้นจะกระพริบต่างจากที่อื่น
- **`lib/useFlip.ts`** ทำให้แถวที่ย้ายตำแหน่งเดินทาง — `ItemList` ใช้อยู่แล้ว
  แถวใหม่ต้องมี `data-flip` ที่เป็นตัวตนคงที่
- **`lib/haptic.ts`** สั่นตอนติ๊กเสร็จ (`tap`) และตอนของหายจากจอ (`away`)
  **การสั่นห้ามพาการกระทำหลักล้มตาม** — iOS ไม่รองรับเลย
- **`components/Odometer.tsx`** ตัวเลขไหลทีละหลัก · แถบ 0-9 อยู่ใน DOM เสมอ
  จึง `aria-hidden` ทั้งก้อนแล้วใส่ค่าจริงใน `aria-label` ไม่งั้นอ่านออกมาเป็น "0123456789"
- **token จังหวะ** `--t-fast` 140ms · `--t-base` 220ms · `--t-slow` 320ms · `--ease`
  **ห้ามตั้งค่าใหม่เอง** ใช้ค่าพวกนี้เสมอ (doc/DESIGN.md)
- **ทุก `@keyframes` และ `transition` ใหม่ต้องมี `prefers-reduced-motion` คุม** —
  ของเดิมทำครบทุกตัว อย่าให้ของใหม่เป็นตัวแรกที่ทำพัง
- **`/library/archive`** คือหน้าที่มองเห็นของที่รอถูกลบ · `KEEP_DAYS` ใน `lib/archive.ts`
  **ต้องตรงกับ `interval '7 days'` ใน `purge_archived()`** แก้ที่เดียวแล้วอีกที่จะนับผิดเงียบ ๆ

**เก็บกวาดอัตโนมัติ — `housekeeping()` รันวันละครั้ง 20:00 UTC (ตีสามไทย)**

- reminder ข้ามวัน · task ที่ติ๊กเสร็จ**และ**เลยวันส่ง → `archived_at` อัตโนมัติ
- ของในคลังครบ **7 วัน → `DELETE` จริง** ครอบคลุม `items` · `events` · **และ `projects`**
- **ลบ project แล้ว items ข้างในหายตามทั้งกอง** (`on delete cascade`) — ตั้งใจ เจ้าของเคาะเอง
- เพิ่มฟังก์ชัน `security definer` ใหม่เมื่อไหร่ **ต้อง revoke จาก public/anon/authenticated ทุกครั้ง**
  ไม่งั้นใครถือ anon key ก็ยิง `rpc/purge_archived` ลบข้อมูลทิ้งได้

**สามตารางเวลา แยกหน้าที่กันชัด ๆ ห้ามให้พร่า**

- ซ้ำทุกสัปดาห์ → `project_schedules` · เกิดครั้งเดียว → `events` · รายละเอียดในงาน → `event_agenda`
- **"ไม่ไป" ไม่ใช่ "ไม่มีคาบ"** — ไม่ไปลง `time_offsets` · ไม่มีคาบลง `week_offsets`
  เอาไปปนกันจะทำลายข้อมูลถาวรโดยผลบนจอดูถูกต้อง (ดู `doc/TRAPS.md`)
- อยากรู้ว่าช่วงไหนติดอะไร ให้เรียก **`calendar_entries()`** ห้ามดึง `events` มาปนเองฝั่งเว็บ
  ไม่งั้นตรรกะหั่นงานข้ามคืนจะมีสองชุดที่ต้องดูแลให้ตรงกัน

**ประตูที่สาม (`/kevin`) — สามข้อที่ห้ามพลาด**

- **ผู้ช่วยในแอปเขียนข้อมูลไม่ได้เลย** ชั้น tool ไม่มี tool ที่เขียน · `lib/ai/db.ts` ไม่มีเมธอดเขียน
  · `test/guard.test.ts` อ่านซอร์สแล้วพังถ้ามีทางเขียนโผล่เข้ามา — **ประตู MCP ยังเขียนได้เหมือนเดิม**
- **`VISIBLE_AREAS` ผูกกับชื่อ Area ไม่ใช่ id** เปลี่ยนชื่อใน DB แล้วลืมแก้ = ผู้ช่วยมองไม่เห็น
  Area นั้นทันทีโดยไม่มี error
- **`doc/CLAUDE-PROJECT-PROMPT.md` กับ `doc/SCHEMA.sql` ต้องเอาไปวางใน Claude Project ด้วยมือ**
  แก้ไฟล์แล้วของจริงบน claude.ai ยังไม่เปลี่ยนจนกว่าจะไปวางเอง

## สิ่งที่ยังไม่ได้ทำ (งานค้างที่รู้แล้ว)

> รายการนี้ตรงกับ [ARCHITECTURE.md §11](ARCHITECTURE.md#11--สิ่งที่ยังไม่ได้ทำ) — แก้ที่ไหนต้องแก้อีกที่ด้วย

- **เวลางาน UniHack 2026** ที่เป็น onsite ตั้ง 09:00 ไว้ชั่วคราว รอเวลาจริง

> `npm run lint --prefix web` ตอนนี้สะอาด 0 error 0 warning — **ถ้าเพิ่มขึ้นมา ให้แก้ อย่าปล่อยสะสม**

## สภาพแวดล้อม

- Windows · เชลล์หลักเป็น PowerShell
- git remote `origin` → https://github.com/nicetsu/KeviN (private)
- `gh.exe` อยู่ที่ `C:\Users\LENOVO\AppData\Local\gh\` และอยู่ใน PATH ของผู้ใช้แล้ว
  git credential helper ชี้มาที่ไฟล์นี้ — **ถ้าไฟล์หาย `git push` จะพัง**
- `npm run dev --prefix web` เปิดที่ **พอร์ต 3000**
- ความลับเพิ่มบน Vercel: `GEMINI_API_KEY` (Secret) — **ห้ามมี `NEXT_PUBLIC_` นำหน้า**
- deploy ต้องใส่ `--scope nicetsuuu` ทุกครั้ง ไม่งั้น Vercel CLI ตอบ `Not authorized`
  เพราะ scope เริ่มต้นเป็นบัญชีส่วนตัว แต่ project อยู่ใต้ team
