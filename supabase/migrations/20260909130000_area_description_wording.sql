-- KeviN · แก้คำอธิบายของ Personal กับ General ให้ตรงกับที่เจ้าของใช้จริง
-- (9 ก.ย. 2026 · หลังเห็นของจริงบนจอ)
--
-- ⚠️ **สลับความหมายกัน ไม่ใช่แค่ขัดคำ** — ที่เขียนไว้ตอนเช้าสลับด้าน
--    · `General` = เรื่องส่วนตัวในชีวิตประจำวัน (สุขภาพ การเงิน นัดหมาย)
--    · `Personal` = โปรเจกต์ของตัวเอง งานอดิเรก การพัฒนาตัวเอง
--
--    ตรงกับประวัติของชื่อ Area พอดี — 31 ส.ค. 2026 เปลี่ยน `Personal`→`General`
--    และ `Financial`→`Personal` · ชื่อที่เจ้าของเรียกว่า "ส่วนตัว" มาตลอดคือใบที่
--    ตอนนี้ชื่อ `General` ต่างหาก
--
-- ⚠️ **General ต้องคง "ของที่ยังไม่รู้ว่าจะจัดไว้ตรงไหน" ไว้ด้วย** — โปรเจกต์
--    ตั้งต้น "ทั่วไป" ที่ `handle_new_user()` seed ให้ทุกคนอยู่ในกลุ่มนี้ · ถ้าไม่มี
--    กลุ่มไหนประกาศตัวว่าเป็นที่รองรับของที่ยังไม่รู้จะจัดตรงไหน โมเดลจะต้องเลือก
--    ยัดลงกลุ่มที่ไม่เกี่ยว หรือถามกลับทุกครั้ง ซึ่งแพงที่สุดในโหมดเสียง
--
-- ⚠️ **แก้ข้อความพวกนี้ = เปลี่ยนพฤติกรรมโมเดล** ต้องรันชุดวัดใน web/test/accuracy/
--    ก่อนและหลัง ไม่ต่างจากการแก้ prompt (ทำแล้วรอบนี้ · ผลอยู่ใน doc/HISTORY.md)

create or replace function public.handle_new_user()
returns trigger
language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');
  v_hit  text;
  v_general uuid;
begin
  update public.invite_codes
     set used_by = new.id, used_at = now()
   where code = v_code
     and used_by is null
     and (expires_at is null or expires_at > now())
  returning code into v_hit;

  if v_hit is null then
    raise exception 'invite_code_invalid' using errcode = '22023';
  end if;

  insert into public.areas (user_id, name, color, sort_order, description) values
    (new.id, 'Class',       'class', 0, 'วิชาที่ลงทะเบียนเรียนเทอมนี้ · การบ้าน รายงาน สอบ คาบเรียน'),
    (new.id, 'Competition', 'comp',  1, 'การแข่งขัน แฮกกาธอน ประกวด และงานที่สมัครเข้าร่วมเอง'),
    (new.id, 'Personal',    'pers',  2, 'โปรเจกต์ของตัวเอง งานอดิเรก และการพัฒนาตัวเอง');

  insert into public.areas (user_id, name, color, sort_order, description)
  values (new.id, 'General', 'gen', 3, 'เรื่องส่วนตัว สุขภาพ การเงิน นัดหมาย · และของที่ยังไม่รู้ว่าจะจัดไว้ตรงไหน')
  returning id into v_general;

  insert into public.projects (user_id, area_id, name, sort_order)
  values (new.id, v_general, 'ทั่วไป', 0);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- เปลี่ยนของผู้ใช้เดิม
--
-- ⚠️ เงื่อนไขคือ **ข้อความเดิมต้องตรงกับที่ seed ไว้เมื่อเช้าเป๊ะ** ไม่ใช่แค่
--    `description is null` เหมือนไฟล์ก่อนหน้า — ใครแก้คำอธิบายเองไปแล้วระหว่างวัน
--    ต้องไม่โดนทับ · เงื่อนไขนี้ทำให้ไฟล์รันซ้ำได้และไม่มีทางกลืนของที่คนเขียนเอง
update public.areas
   set description = 'โปรเจกต์ของตัวเอง งานอดิเรก และการพัฒนาตัวเอง'
 where name = 'Personal'
   and description = 'เรื่องส่วนตัว สุขภาพ การเงิน นัดหมาย';

update public.areas
   set description = 'เรื่องส่วนตัว สุขภาพ การเงิน นัดหมาย · และของที่ยังไม่รู้ว่าจะจัดไว้ตรงไหน'
 where name = 'General'
   and description = 'ของที่ยังไม่รู้ว่าจะจัดไว้ตรงไหน';
