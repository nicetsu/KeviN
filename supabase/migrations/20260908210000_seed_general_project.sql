-- =====================================================================
-- KeviN · seed โปรเจกต์ "ทั่วไป" ให้ผู้ใช้ใหม่
--
-- **ปัญหาที่แก้: ผู้ใช้ใหม่มี 4 Area แต่มี 0 โปรเจกต์**
--
-- `projects.area_id` เป็น `not null` และผู้ช่วยใน `/kevin` **สร้างโปรเจกต์ไม่ได้**
-- (ไม่มี `propose_add_project` ในชุด tool โดยตั้งใจ) · คนที่เพิ่งสมัครแล้วพิมพ์
-- ประโยคแรกว่า "เพิ่มงานส่งรายงาน" จึงชน `ยังไม่มีวิชาให้เลือกเลย` จาก
-- `findProject()` แล้วจบทางตัน — **เป็นประสบการณ์นาทีแรกของผู้ใช้ใหม่ทุกคน**
--
-- ทางเลือกที่ชั่งกัน (เจ้าของเคาะ 8 ก.ย. 2026)
--   ก. เพิ่มกฎใน prompt ให้มันบอกว่ายังไม่มีวิชา แล้วชี้ไป /library
--      → แตะ `prompt.ts` = ต้องรันชุดวัดทั้งสองฝั่งก่อนและหลัง
--        และ**ผู้ใช้ยังต้องออกจากบทสนทนาไปสร้างเองอยู่ดี**
--   ข. **seed โปรเจกต์ให้เลย** ← เลือกอันนี้
--      → แก้ที่ trigger ที่เดียว ไม่แตะ prompt ไม่ต้องวัดอะไรเลย
--        และประโยคแรกของผู้ใช้ใหม่มีที่ลงเสมอ
--      → ราคาที่จ่าย: ทุกคนได้โปรเจกต์มาหนึ่งใบที่อาจไม่ได้ใช้ ซึ่งลบทิ้งได้
--
-- ⚠️ **ไม่ได้แก้ schema เลยสักคอลัมน์** — เปลี่ยนแค่ตัว trigger
-- =====================================================================


-- =====================================================================
-- 1 · trigger ตอนสมัคร — เพิ่มโปรเจกต์ "ทั่วไป" ต่อจาก seed สี่ Area
--
-- ⚠️ **ยังต้องเป็น AFTER INSERT เหมือนเดิม** — exception จาก after trigger
--    ยัง roll back ทั้งใบอยู่ดี จึงได้ทั้งด่านรหัสเชิญและการ seed พร้อมกัน
--    **ไม่มีทางเกิดบัญชีที่ผ่านด่านแล้วแต่ไม่มี Area/โปรเจกต์**
--
-- ⚠️ คว้า id ของ General ด้วย `returning ... into` ตอนแทรก **ห้ามแทรกครบสี่ใบ
--    แล้วค่อย `select ... where name = 'General'` ทีหลัง** — วันไหนมีคนแก้ชื่อ
--    Area ตั้งต้นในไฟล์นี้ การค้นด้วยชื่อจะไม่เจอแบบเงียบ ๆ แล้วผู้ใช้ใหม่
--    ไม่ได้โปรเจกต์โดยไม่มี error เลย
--    (กับดักตระกูล "ค่าคงที่ที่ผูกกับชื่อที่แก้ได้" — doc/TRAPS.md)
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');
  v_hit  text;
  v_general uuid;
begin
  -- อ้างสิทธิ์แบบ atomic เหมือน claim_due_reminders() — สองคนกดสมัครด้วยรหัสเดียวกัน
  -- พร้อมกัน ถ้าแยกเป็น select แล้วค่อย update จะผ่านทั้งคู่
  update public.invite_codes
     set used_by = new.id, used_at = now()
   where code = v_code
     and used_by is null
     and (expires_at is null or expires_at > now())
  returning code into v_hit;

  if v_hit is null then
    raise exception 'invite_code_invalid' using errcode = '22023';
  end if;

  -- ⚠️ คีย์สีต้องตรงกับ AREA_CLASS ใน web/lib/areaColor.ts และ .acard--* ใน globals.css
  --    คีย์ที่ไม่ตรงไม่เกิด error มันแค่ได้การ์ดไม่มีสีเงียบ ๆ
  --
  -- สี่ Area ตั้งต้น · แยก General ออกมาเป็นคำสั่งที่สองเพื่อ `returning into`
  -- **ทั้งสองคำสั่งคือชุดเดียวกัน** แก้ชุดนี้เมื่อไหร่ต้องดูทั้งสองที่
  insert into public.areas (user_id, name, color, sort_order) values
    (new.id, 'Class',       'class', 0),
    (new.id, 'Competition', 'comp',  1),
    (new.id, 'Personal',    'pers',  2);

  insert into public.areas (user_id, name, color, sort_order)
  values (new.id, 'General', 'gen', 3)
  returning id into v_general;

  /*
   * โปรเจกต์ตั้งต้นหนึ่งใบ ใน General
   *
   * มีไว้ให้ "งานที่ยังไม่รู้จะลงวิชาไหน" มีที่ลงตั้งแต่วินาทีแรก · ผู้ช่วยเลือก
   * โปรเจกต์ด้วยการเทียบ**ชื่อ** ล้วน ๆ (`findProject()`) ชื่อ "ทั่วไป" จึงเป็น
   * คำที่ผู้ใช้พูดถึงได้ตรง ๆ และเป็นคำที่โมเดลเดาเองอยู่แล้วเวลาไม่มีวิชาที่ตรง
   * (เห็นจากชุดวัด 8 ก.ย. 2026 — มันส่ง project="ทั่วไป" มาเองทั้งที่ตอนนั้นไม่มี)
   *
   * `description` เว้นว่าง **โดยตั้งใจ** — ช่องนั้นแสดงเป็น "รหัสวิชา" ทั้งบนจอ
   * และในผลของ tool `projects` · ใส่คำอธิบายลงไปจะกลายเป็นรหัสวิชาปลอม
   */
  insert into public.projects (user_id, area_id, name, sort_order)
  values (new.id, v_general, 'ทั่วไป', 0);

  return new;
end;
$$;


-- =====================================================================
-- 2 · ผู้ใช้ที่สมัครไปแล้วก่อนไฟล์นี้
--
-- คนที่สมัครระหว่าง 8 ก.ย. (เปิดหลายคน) ถึงวันนี้ ได้ Area ครบแต่ไม่มีโปรเจกต์
-- จึงเจอทางตันเดียวกัน · เติมให้ **เฉพาะคนที่ยังไม่มีโปรเจกต์สักใบ**
--
-- ⚠️ `not exists` ไม่ใช่ `on conflict` — คนที่สร้างวิชาของตัวเองไปแล้วต้องไม่
--    ได้ "ทั่วไป" งอกมาเฉย ๆ ในคลัง · และรันไฟล์นี้ซ้ำต้องไม่เพิ่มซ้ำ
--    (`projects` ไม่มี unique บน name จึงกันซ้ำเองไม่ได้)
-- =====================================================================
insert into public.projects (user_id, area_id, name, sort_order)
select a.user_id, a.id, 'ทั่วไป', 0
  from public.areas a
 where a.name = 'General'
   and a.archived_at is null
   and not exists (
     select 1 from public.projects p where p.user_id = a.user_id
   );
