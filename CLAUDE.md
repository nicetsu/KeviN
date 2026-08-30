# KeviN — คำแนะนำสำหรับ Claude

ผู้ช่วยส่วนตัวของเจ้าของโปรเจกต์ (นักศึกษา) เก็บข้อมูลบน Supabase
สั่งงานได้สองทาง — คุยกับ Claude ผ่าน MCP และเว็บแอป PWA

**สถานะปัจจุบัน: ใช้งานได้จริงครบวงแล้ว** — https://kevin-rose.vercel.app

| เฟส | สถานะ |
|---|---|
| 0 ฐานข้อมูล · 1 MCP · 2 เว็บ · 3 ปฏิทิน | เสร็จ |
| 4 จัดการบนเว็บ | เสร็จ · รวมลากจัดลำดับ |
| 5 PWA + แจ้งเตือน | เสร็จ · push ส่งออกจริงแล้ว |
| 6 Cowork | เสร็จ · สรุปเช้า 06:30 + สรุปรายสัปดาห์ อาทิตย์ 19:00 |
| กิจกรรม + ตัดทอนเวลา | เสร็จ · `events` · `event_agenda` · `time_offsets` |
| ประตูที่สาม (แชต + เสียงในเว็บ) | **เสร็จครบ 4 ขั้น · ขึ้น production แล้ว** · ดู [doc/CHAT.md](doc/CHAT.md) |

โค้ดอยู่ใน `web/` (Next.js 16) · Edge Function อยู่ใน `supabase/functions/send-reminders/`

**ตรรกะที่มีเทสต์ล้วนกำกับ — แก้แล้วรันเทสต์ด้วย** `npm test --prefix web` (220 เคส · อยู่ใน `web/test/`)
`web/lib/layout.ts` (คาบชนกัน) · `web/lib/weeks.ts` (การซ้ำ) · `web/lib/parse.ts` (ตีความภาษาไทย)
`web/lib/libraryOpen.ts` (สถานะกางของหน้าคลัง) · `web/lib/calendar.ts` + `web/lib/agenda.ts` (กิจกรรม)
`web/lib/time.ts` (เวลาไทย) · `web/lib/ai/*` (ชั้น tool + ตัวกรอง Area ของประตูที่สาม)

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

| ไฟล์ | เนื้อหา | ลิงก์ |
|---|---|---|
| `proposal.html` | ข้อเสนอโปรเจกต์ · สถาปัตยกรรม · แผน 6 เฟส | https://claude.ai/code/artifact/6f50ef21-9670-40e0-84dd-86b29852ec36 |
| `ux.html` | UX ทุกหน้าจอ S1–S9 · กฎการแสดงผล | https://claude.ai/code/artifact/06b0354f-7284-4f28-9b6a-c70b078855dc |
| `ui-kit.html` | ภาษาภาพ · design token · หน้าจอตัวอย่าง | https://claude.ai/code/artifact/2c6a95f6-e51a-4e9a-a80a-b398bdc43046 |

> ✅ `ux.html` ทาสีใหม่เป็น Nightfall แล้ว (18 ส.ค.) จานสีตรงกับ `ui-kit.html` และ `doc/DESIGN.md`
> ตอนนี้ทั้งสามไฟล์ใช้ภาษาภาพเดียวกัน · ดูสรุปสิ่งที่แก้ได้ท้าย `doc/DESIGN.md`

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

**สามตารางเวลา แยกหน้าที่กันชัด ๆ ห้ามให้พร่า**

- ซ้ำทุกสัปดาห์ → `project_schedules` · เกิดครั้งเดียว → `events` · รายละเอียดในงาน → `event_agenda`
- **"ไม่ไป" ไม่ใช่ "ไม่มีคาบ"** — ไม่ไปลง `time_offsets` · ไม่มีคาบลง `week_offsets`
  เอาไปปนกันจะทำลายข้อมูลถาวรโดยผลบนจอดูถูกต้อง (ดู `doc/TRAPS.md`)
- อยากรู้ว่าช่วงไหนติดอะไร ให้เรียก **`calendar_entries()`** ห้ามดึง `events` มาปนเองฝั่งเว็บ
  ไม่งั้นตรรกะหั่นงานข้ามคืนจะมีสองชุดที่ต้องดูแลให้ตรงกัน

## สิ่งที่ยังไม่ได้ทำ (งานค้างที่รู้แล้ว)

> รายการนี้ตรงกับ [ARCHITECTURE.md §10](ARCHITECTURE.md#10--สิ่งที่ยังไม่ได้ทำ) — แก้ที่ไหนต้องแก้อีกที่ด้วย

- **เวลางาน UniHack 2026** ที่เป็น onsite ตั้ง 09:00 ไว้ชั่วคราว รอเวลาจริง

> `npm run lint --prefix web` ตอนนี้สะอาด 0 error 0 warning — **ถ้าเพิ่มขึ้นมา ให้แก้ อย่าปล่อยสะสม**

## สภาพแวดล้อม

- Windows · เชลล์หลักเป็น PowerShell
- git remote `origin` → https://github.com/nicetsu/KeviN (private)
- `gh.exe` อยู่ที่ `C:\Users\LENOVO\AppData\Local\gh\` และอยู่ใน PATH ของผู้ใช้แล้ว
  git credential helper ชี้มาที่ไฟล์นี้ — **ถ้าไฟล์หาย `git push` จะพัง**
- `npm run dev --prefix web` เปิดที่ **พอร์ต 3001**
- deploy ต้องใส่ `--scope nicetsuuu` ทุกครั้ง ไม่งั้น Vercel CLI ตอบ `Not authorized`
  เพราะ scope เริ่มต้นเป็นบัญชีส่วนตัว แต่ project อยู่ใต้ team
