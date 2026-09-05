-- =====================================================================
-- เฟส 0 · ใส่ Area ทั้งสี่
-- รันในหน้า SQL Editor ของ Supabase หลัง 02 ผ่านหมด
--
-- ชื่อและคีย์สีมาจาก DECISIONS.md และ ARCHITECTURE.md §9 — อย่าเปลี่ยนเอง
-- ชื่อที่สี่คือ Personal ไม่ใช่ Project (จะกำกวมกับ project ชั้นที่ 2)
--
-- รันซ้ำได้ · มีอยู่แล้วจะข้าม ไม่เขียนทับ ไม่สร้างซ้ำ
-- =====================================================================

-- กันพลาด: แอปนี้ผู้ใช้คนเดียว ถ้าไม่ใช่ ให้หยุดก่อน อย่าเดาว่าจะใส่ให้ใคร
do $$
declare n int;
begin
  select count(*) into n from auth.users;
  if n = 0 then
    raise exception 'ยังไม่มีผู้ใช้ใน auth.users — สร้างบัญชีก่อน (ขั้นที่ 2 ใน README.md)';
  elsif n > 1 then
    raise exception 'เจอผู้ใช้ % คน แต่ KeviN ออกแบบมาสำหรับคนเดียว — ตรวจก่อนว่าใครเข้ามา', n;
  end if;
end $$;

insert into public.areas (user_id, name, color, sort_order)
select (select id from auth.users), v.name, v.color, v.sort_order
from (values
  ('Class',     'class', 0),
  ('Hackathon', 'hack',  1),
  ('Financial', 'fin',   2),
  ('Personal',  'pers',  3)
) as v(name, color, sort_order)
on conflict (user_id, name) do nothing;

select name as "Area", color as "คีย์สี", sort_order as "ลำดับ"
from public.areas
order by sort_order;
