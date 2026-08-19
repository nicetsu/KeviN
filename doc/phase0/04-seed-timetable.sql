-- =====================================================================
-- เฟส 0 · วิชาและตารางเรียนจริง ภาคเรียนปัจจุบัน
-- รันในหน้า SQL Editor ของ Supabase หลัง 03-seed-areas.sql เสร็จ
--
-- กรอกจากตารางเรียนจริงแล้ว — 8 วิชา 11 คาบ
--
-- ตั้งค่าตามปฏิทินการศึกษา ป.ตรี มก. ปีการศึกษา 2569 (ภาคต้น) แล้ว
--    · term_start = 2026-08-03  (First Day of Classes · เป็นวันจันทร์พอดี)
--    · weeks      = 17          (คลุมถึง Last day of classes ภาคพิเศษ 29 พ.ย. 2026)
--
--    ตรวจแล้วว่าสอดคล้องกัน: สัปดาห์ปัจจุบัน (17 ส.ค.) = offset 2 = สัปดาห์ที่ 3
--
-- 📌 สัปดาห์สอบกลางภาค 19-27 ก.ย. ตรงกับ week_offset 7 (21-27 ก.ย.)
--    ปฏิทินไม่ได้ประกาศงดคาบ จึงใส่ครบ 17 สัปดาห์ต่อเนื่องไว้ก่อน
--    ถ้าวิชาไหนไม่มีคาบสัปดาห์นั้นจริง ค่อยติ๊กออกทีหลังในหน้า S6 (เฟส 3)
--    หรือแก้ทันทีด้วยคำสั่งท้ายไฟล์
--
-- รันซ้ำได้ · วิชาเดิมไม่สร้างซ้ำ แต่ "คาบ" จะเพิ่มทุกรอบ
--   ถ้ารันไปแล้วอยากแก้ ให้ล้างคาบก่อน — ดูคำสั่งท้ายไฟล์
-- =====================================================================

-- กันพลาด
do $$
declare n int;
begin
  select count(*) into n from auth.users;
  if n <> 1 then
    raise exception 'ต้องมีผู้ใช้ 1 คนพอดี แต่เจอ % — ดู README.md ขั้นที่ 2', n;
  end if;
  if not exists (select 1 from public.areas where name = 'Class') then
    raise exception 'ยังไม่มี Area ชื่อ Class — รัน 03-seed-areas.sql ก่อน';
  end if;
end $$;


-- =====================================================================
-- บล็อก A · วิชาที่เรียนเทอมนี้
-- name = ชื่อไทย · description = รหัสวิชา + ชื่ออังกฤษ (ไว้ให้ค้นเจอทั้งสองทาง)
-- =====================================================================
insert into public.projects (user_id, area_id, name, description, sort_order)
select (select id from auth.users),
       (select id from public.areas where name = 'Class'),
       v.name, v.descr, v.ord
from (values
  ('คณิตศาสตร์เต็มหน่วยและพีชคณิตเชิงเส้น',
   '01219118-65 · Discrete Mathematics and Linear Algebra · ธนะ วัฒนวารุณ, จิตร์ทัศน์ ฝักเจริญผล', 0),
  ('สถาปัตยกรรมเครือข่ายคอมพิวเตอร์และการโปรแกรม',
   '01219224-65 · Computer Network Architecture and Programming · อนันต์ ผลเพิ่ม, อภิรักษ์ จันทร์สร้าง', 1),
  ('กระบวนการพัฒนาซอฟต์แวร์เชิงเดี่ยว',
   '01219241-65 · Individual Software Development Process · กัญจนสิทธ ทองเล็ก, สุวิจักขณ์ ฟังประเสริฐกุล', 2),
  ('สื่อสารสนเทศเพื่อการเรียนรู้',
   '01371111-67 · Information Media for Learning · นัดดาวดี นุ่มนาค', 3),
  ('วิวัฒนาการเพลงลูกทุ่ง',
   '01385223-65 · Evolution of Thai Country Songs · พจี บำรุงสุข', 4),
  ('คณิตศาสตร์วิศวกรรม II',
   '01417168-65 · Engineering Mathematics II · กันย์ สุ่นยี่ขัน, ลัญจกร กิตติรัตนวศิน', 5),
  ('สุขภาพเพื่อชีวิต',
   '01999012-67 · Health for Life · นุสบา สมพานิช และคณะ', 6),
  ('เกษตรศาสตร์สร้างศาสตร์แห่งแผ่นดิน',
   '01999111-68 · Kasetsart Creating Knowledge of the Land · อัญชสา ประมวลเจริญกิจ', 7)
) as v(name, descr, ord)
where not exists (
  select 1 from public.projects p
  where p.name = v.name
    and p.area_id = (select id from public.areas where name = 'Class')
);


-- =====================================================================
-- บล็อก B · คาบเรียน 11 คาบ
-- dow: 0=จันทร์ 1=อังคาร 2=พุธ 3=พฤหัส 4=ศุกร์
-- =====================================================================
insert into public.project_schedules
  (user_id, project_id, day_of_week, start_time, end_time, location, label, start_date, week_offsets)
select
  (select id from auth.users),
  p.id, v.dow, v.starts, v.ends, v.room, v.kind,
  date_trunc('week', v.term_start)::date,
  (select array_agg(g) from generate_series(0, v.weeks - 1) g)
from (values
  -- ── จันทร์ ────────────────────────────────────────────────────────
  ('สื่อสารสนเทศเพื่อการเรียนรู้',
     0, time '10:00', time '12:00', 'E 17501',            'บรรยาย', date '2026-08-03', 17),
  ('กระบวนการพัฒนาซอฟต์แวร์เชิงเดี่ยว',
     0, time '13:00', time '15:00', 'E11-S603',           'บรรยาย', date '2026-08-03', 17),
  ('คณิตศาสตร์วิศวกรรม II',
     0, time '16:00', time '17:30', 'ติดต่อโครงการ IUP',    'บรรยาย', date '2026-08-03', 17),

  -- ── อังคาร ───────────────────────────────────────────────────────
  ('กระบวนการพัฒนาซอฟต์แวร์เชิงเดี่ยว',
     1, time '09:00', time '12:00', 'E11-S601',           'ปฏิบัติ',  date '2026-08-03', 17),
  ('คณิตศาสตร์เต็มหน่วยและพีชคณิตเชิงเส้น',
     1, time '13:00', time '15:00', 'E11-S603',           'บรรยาย', date '2026-08-03', 17),

  -- ── พุธ ──────────────────────────────────────────────────────────
  ('สถาปัตยกรรมเครือข่ายคอมพิวเตอร์และการโปรแกรม',
     2, time '09:00', time '12:00', 'E11-S604',           'บรรยาย', date '2026-08-03', 17),
  ('เกษตรศาสตร์สร้างศาสตร์แห่งแผ่นดิน',
     2, time '15:00', time '17:00', 'ONLINE',             'บรรยาย', date '2026-08-03', 17),

  -- ── พฤหัส ────────────────────────────────────────────────────────
  ('คณิตศาสตร์เต็มหน่วยและพีชคณิตเชิงเส้น',
     3, time '09:00', time '11:00', 'E11-S603',           'บรรยาย', date '2026-08-03', 17),
  ('วิวัฒนาการเพลงลูกทุ่ง',
     3, time '13:00', time '16:00', 'ติดต่อ IUP',           'บรรยาย', date '2026-08-03', 17),
  ('สุขภาพเพื่อชีวิต',
     3, time '16:30', time '19:30', 'E17201',             'บรรยาย', date '2026-08-03', 17),

  -- ── ศุกร์ ─────────────────────────────────────────────────────────
  ('คณิตศาสตร์วิศวกรรม II',
     4, time '16:00', time '17:30', 'ติดต่อโครงการ IUP',    'บรรยาย', date '2026-08-03', 17)
) as v(subject, dow, starts, ends, room, kind, term_start, weeks)
join public.projects p
  on p.name = v.subject
 and p.area_id = (select id from public.areas where name = 'Class');


-- =====================================================================
-- ตรวจผล · เกณฑ์ "เสร็จ" ของเฟส 0
-- =====================================================================
select project_name as "วิชา",
       occurs_on    as "วันที่",
       case extract(isodow from occurs_on)
         when 1 then 'จันทร์' when 2 then 'อังคาร' when 3 then 'พุธ' when 4 then 'พฤหัส'
         when 5 then 'ศุกร์'  when 6 then 'เสาร์'  else 'อาทิตย์' end as "วัน",
       start_time   as "เริ่ม",
       end_time     as "เลิก",
       location     as "ห้อง",
       label        as "ประเภท"
from public.schedule_occurrences(current_date, current_date + 7)
order by occurs_on, start_time;


-- =====================================================================
-- ของแถม (คอมเมนต์ไว้ ไม่ทำงานตอนรัน)
-- =====================================================================

-- ล้างคาบทั้งหมดก่อนกรอกใหม่ (วิชาและงานยังอยู่ครบ)
-- delete from public.project_schedules;

-- ดูทั้งเทอมว่ากรอกครบไหม — ควรได้ 11 คาบ x 17 สัปดาห์ = 187
-- select project_name, count(*) as จำนวนคาบ, min(occurs_on) as คาบแรก, max(occurs_on) as คาบสุดท้าย
--   from public.schedule_occurrences(current_date - 365, current_date + 365)
--  group by project_name order by project_name;

-- ตัดสัปดาห์สอบกลางภาค (offset 7) ออกจากทุกคาบ ถ้าปรากฏว่าไม่มีเรียนจริง
-- update public.project_schedules
--    set week_offsets = array_remove(week_offsets, 7);

-- วิชาไหนเรียนเว้นสัปดาห์ ให้ใส่ week_offsets เองแทน generate_series เช่น '{0,2,4,6}'::int[]
