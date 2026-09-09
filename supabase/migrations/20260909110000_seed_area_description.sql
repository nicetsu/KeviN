-- KeviN · seed คำอธิบาย Area ให้ผู้ใช้ใหม่ + เติมย้อนหลังให้คนเดิม (9 ก.ย. 2026)
--
-- คู่กับ 20260909100000_area_description.sql
--
-- เขียนด้วย **คำที่คนไทยพูดจริง** ไม่ใช่คำแปลของชื่อ Area — หน้าที่ของมันคือเป็น
-- สะพานจากสิ่งที่ผู้ใช้พูดไปหากลุ่ม · ถ้าเขียนว่า "กลุ่มการเรียน" ก็แค่แปลคำว่า
-- Class ซึ่งไม่ได้เพิ่มสัญญาณให้โมเดลเลย
--
-- ⚠️ `create or replace function` **ไม่แตะ ACL เดิม** (doc/TRAPS.md) — ตัวนี้ถูก
--    revoke ไปแล้วเมื่อ 9 ก.ย. และจะยัง revoke อยู่หลัง replace · **แต่ต้องรัน
--    `get_advisors` ยืนยันอยู่ดี** เพราะข้อนี้เคยหลุดสายตามาแล้วด้วยกลไกนี้เป๊ะ

create or replace function public.handle_new_user()
returns trigger
language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');
  v_hit  text;
  v_general uuid;
begin
  -- อ้างสิทธิ์แบบ atomic เหมือน claim_due_reminders()
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
  -- แยก General เป็นคำสั่งที่สองเพื่อ `returning into` · ทั้งสองคำสั่งคือชุดเดียวกัน
  -- ⚠️ ห้ามแทรกครบสี่ใบแล้วค่อย select ด้วยชื่อ 'General' ทีหลัง — วันไหนแก้ชื่อ
  --    Area ตั้งต้น การค้นด้วยชื่อจะไม่เจอแบบเงียบ ๆ
  --
  -- ⚠️ `description` ที่เติมที่นี่คือสิ่งที่โมเดลใช้เลือกกลุ่มตอนสร้างโปรเจกต์ใหม่
  --    (tool `areas` + `propose_add_project`) · แก้ข้อความพวกนี้เมื่อไหร่
  --    **ต้องรันชุดวัดใน web/test/accuracy/ ก่อนและหลัง** เพราะมันเปลี่ยนพฤติกรรม
  --    ของโมเดลจริง ๆ ไม่ต่างจากการแก้ prompt
  insert into public.areas (user_id, name, color, sort_order, description) values
    (new.id, 'Class',       'class', 0, 'วิชาที่ลงทะเบียนเรียนเทอมนี้ · การบ้าน รายงาน สอบ คาบเรียน'),
    (new.id, 'Competition', 'comp',  1, 'การแข่งขัน แฮกกาธอน ประกวด และงานที่สมัครเข้าร่วมเอง'),
    (new.id, 'Personal',    'pers',  2, 'เรื่องส่วนตัว สุขภาพ การเงิน นัดหมาย');

  insert into public.areas (user_id, name, color, sort_order, description)
  values (new.id, 'General', 'gen', 3, 'ของที่ยังไม่รู้ว่าจะจัดไว้ตรงไหน')
  returning id into v_general;

  -- โปรเจกต์ตั้งต้นหนึ่งใบใน General · ผู้ช่วยเลือกโปรเจกต์ด้วยการเทียบชื่อล้วน ๆ
  -- ชื่อ "ทั่วไป" เป็นคำที่โมเดลเดาเองอยู่แล้วเวลาไม่มีวิชาที่ตรง
  -- description เว้นว่างโดยตั้งใจ — ช่องนั้นแสดงเป็น "รหัสวิชา" ทั้งบนจอและใน tool
  insert into public.projects (user_id, area_id, name, sort_order)
  values (new.id, v_general, 'ทั่วไป', 0);

  return new;
end;
$$;

-- ⚠️ revoke ซ้ำให้ชัด ไม่ใช่เพราะ replace ถอดให้ (มันไม่ถอด) แต่เพราะไฟล์นี้ต้อง
--    รันได้ด้วยตัวเองบน DB เปล่า และเพราะข้อนี้เคยลืมมาแล้วครั้งหนึ่ง
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- เติมย้อนหลังให้ผู้ใช้เดิม
--
-- **เงื่อนไขสองท่อนนี้คือตัวกันทั้งหมด**
--   · name = ชื่อ seed เดิม — ใครเปลี่ยนชื่อ Area เป็นคำของตัวเองไปแล้ว จะไม่โดน
--     ยัดคำอธิบายที่ไม่ตรงกับที่เขาใช้จริง
--   · description is null — ใครกรอกเองไว้แล้วไม่โดนทับ และไฟล์นี้รันซ้ำได้
update public.areas a
   set description = v.description
  from (values
    ('Class',       'วิชาที่ลงทะเบียนเรียนเทอมนี้ · การบ้าน รายงาน สอบ คาบเรียน'),
    ('Competition', 'การแข่งขัน แฮกกาธอน ประกวด และงานที่สมัครเข้าร่วมเอง'),
    ('Personal',    'เรื่องส่วนตัว สุขภาพ การเงิน นัดหมาย'),
    ('General',     'ของที่ยังไม่รู้ว่าจะจัดไว้ตรงไหน')
  ) as v(name, description)
 where a.name = v.name
   and a.description is null;
