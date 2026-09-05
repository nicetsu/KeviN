# KeviN · เว็บแอป

Next.js 16 + Supabase · เฟส 2 ของ [doc/HISTORY.md](../doc/HISTORY.md)

## ตั้งค่าครั้งแรก

```bash
cd web
cp .env.local.example .env.local
```

เปิด `.env.local` แล้วเติม **anon key**

> Supabase Dashboard → Project Settings → API → Project API keys → `anon` `public`

⚠️ **ห้ามใส่ `service_role` key** ตัวแปรที่ขึ้นต้น `NEXT_PUBLIC_` ไปอยู่ใน bundle
ที่ใครเปิด DevTools ก็อ่านได้ · `service_role` ข้าม RLS ได้ทั้งหมด (ดู [TRAPS.md](../doc/TRAPS.md))

`.env.local` อยู่ใน `.gitignore` อยู่แล้ว ไม่หลุดขึ้น repo

## รัน

```bash
npm run dev
```

เปิด http://localhost:3000 — ถ้ายังไม่ล็อกอินจะเด้งไป `/login`
ใช้อีเมลกับรหัสผ่านเดียวกับที่สร้างไว้ใน Supabase (เฟส 0 ขั้น 2)

## โครงไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `app/globals.css` | design token จาก `doc/globals.css` + สไตล์ระดับแอป |
| `app/layout.tsx` | โหลดฟอนต์ Inter + Noto Sans Thai ผ่าน `next/font/google` |
| `app/page.tsx` | S1 · หน้าวันนี้ |
| `app/login/page.tsx` | ล็อกอินด้วยอีเมล + รหัสผ่าน |
| `proxy.ts` | ต่ออายุ session ทุก request + กันคนยังไม่ล็อกอิน |
| `lib/supabase/` | client ฝั่งเบราว์เซอร์และเซิร์ฟเวอร์ · anon key + RLS เท่านั้น |
| `lib/time.ts` | แปลง UTC เป็นเวลาไทยที่เดียว |

## ข้อควรรู้

- **เฟส 2 คือดูอย่างเดียว** ช่องติ๊กแสดงสถานะแต่ยังกดไม่ได้ การแก้ไขอยู่ในเฟส 4
- **ไม่มี session = ไม่เห็นข้อมูล** RLS ผูกกับ `auth.uid()` ถ้าหลุดล็อกอิน
  ทุก query จะคืนศูนย์แถวเงียบ ๆ ไม่มี error — `proxy.ts` มีไว้กันเคสนี้
- เวลาทั้งหมดเก็บเป็น UTC แปลงเป็น Asia/Bangkok ตอนแสดงผลเท่านั้น
