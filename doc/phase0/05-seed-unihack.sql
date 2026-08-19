-- =====================================================================
-- UniHack 2026 · project ใน Area Hackathon
-- รันในหน้า SQL Editor ของ Supabase หลัง 03-seed-areas.sql เสร็จ
--
-- ⚠️ ประกาศบอกแต่ "วันที่" ไม่ได้บอกเวลา
--    · เดดไลน์ส่งงาน  ตั้งไว้ 23:59 (ตีความว่าหมดเขตสิ้นวัน)
--    · งาน onsite     ตั้งไว้ 09:00 เป็นค่าชั่วคราว — พอรู้เวลาจริงให้แก้
--    ทุกค่าเขียนเป็น +07 ชัดเจน Postgres เก็บเป็น UTC ให้เอง ตาม TRAPS.md
--
-- รันซ้ำได้ · ไม่สร้างของซ้ำ
-- =====================================================================

do $$
declare n int;
begin
  select count(*) into n from auth.users;
  if n <> 1 then
    raise exception 'ต้องมีผู้ใช้ 1 คนพอดี แต่เจอ % — ดู README.md ขั้นที่ 2', n;
  end if;
  if not exists (select 1 from public.areas where name = 'Hackathon') then
    raise exception 'ยังไม่มี Area ชื่อ Hackathon — รัน 03-seed-areas.sql ก่อน';
  end if;
end $$;


-- =====================================================================
-- project
-- =====================================================================
insert into public.projects (user_id, area_id, name, description, sort_order)
select (select id from auth.users),
       (select id from public.areas where name = 'Hackathon'),
       'UniHack 2026',
       'Hackathon · จัดโดย Chulalongkorn School of Integrated Innovation (CSII)'
       || ' · เงินรางวัลรวมกว่า 30,000 บาท · ทีม 1-4 คน'
       || ' · เปิดให้ ม.ปลาย และนิสิต-นักศึกษาทุกชั้นปีทั่วประเทศ'
       || ' · https://www.contester.life/contest/unihack2026',
       0
where not exists (
  select 1 from public.projects
  where name = 'UniHack 2026'
    and area_id = (select id from public.areas where name = 'Hackathon')
);


-- =====================================================================
-- TASK · ไทม์ไลน์ทั้ง 8 หมุด
-- task ห้ามมี remind_at (constraint task_no_remind) จึงแยก reminder ไว้ด้านล่าง
-- =====================================================================
insert into public.items (user_id, project_id, type, title, body, due_at, done_at, priority, sort_order)
select (select id from auth.users), p.id, 'task', v.title, v.body, v.due_at, v.done_at, v.prio, v.ord
from (values
  ('สมัคร UniHack 2026',
   'Registration 10-21 ส.ค. · สมัครแล้ว',
   timestamptz '2026-08-21 23:59+07', timestamptz '2026-08-18 00:00+07', 1, 0),

  ('เข้า Orientation Day + รับ Booklet รอบแรก',
   'ประกาศบอกแค่วันที่ 22 ส.ค. ยังไม่รู้เวลา',
   timestamptz '2026-08-22 09:00+07', null, 2, 1),

  ('ส่งผลงานรอบแรก',
   'หน้าต่างส่ง 22-24 ส.ค. · ตั้งเดดไลน์ไว้สิ้นวันที่ 24',
   timestamptz '2026-08-24 23:59+07', null, 2, 2),

  ('ดูประกาศผลผู้เข้ารอบ',
   'Finalists Announcement 26 ส.ค.',
   timestamptz '2026-08-26 09:00+07', null, 1, 3),

  ('รับ Booklet รอบชิง (onsite)',
   'Final Round Booklet Launch 28 ส.ค. · เข้าเฉพาะทีมที่ผ่านรอบแรก',
   timestamptz '2026-08-28 09:00+07', null, 1, 4),

  ('เข้า Mentoring Session (onsite)',
   '29 ส.ค. · ให้คำแนะนำ 1-on-1 จากเมนเทอร์',
   timestamptz '2026-08-29 09:00+07', null, 2, 5),

  ('Final Round Pitching Day (onsite)',
   '30 ส.ค. · วันตัดสิน',
   timestamptz '2026-08-30 09:00+07', null, 2, 6)
) as v(title, body, due_at, done_at, prio, ord)
join public.projects p
  on p.name = 'UniHack 2026'
 and p.area_id = (select id from public.areas where name = 'Hackathon')
where not exists (
  select 1 from public.items i where i.project_id = p.id and i.title = v.title
);


-- =====================================================================
-- REMINDER · เฉพาะหมุดที่พลาดไม่ได้ (เตือนครั้งเดียว ตาม DECISIONS.md)
-- reminder ห้ามมี due_at (constraint reminder_no_due)
-- =====================================================================
insert into public.items (user_id, project_id, type, title, body, remind_at, priority, sort_order)
select (select id from auth.users), p.id, 'reminder', v.title, v.body, v.remind_at, v.prio, v.ord
from (values
  ('พรุ่งนี้ Orientation UniHack',
   'เช็กเวลาและสถานที่ให้แน่ก่อนนอน',
   timestamptz '2026-08-21 19:00+07', 2, 10),

  ('วันนี้เดดไลน์ส่งรอบแรก UniHack 23:59',
   'เหลือทั้งวัน อย่าไปส่งเอานาทีสุดท้าย',
   timestamptz '2026-08-24 09:00+07', 2, 11),

  ('พรุ่งนี้ Pitching Day UniHack',
   'onsite · เตรียมสไลด์ อุปกรณ์ และเผื่อเวลาเดินทาง',
   timestamptz '2026-08-29 19:00+07', 2, 12)
) as v(title, body, remind_at, prio, ord)
join public.projects p
  on p.name = 'UniHack 2026'
 and p.area_id = (select id from public.areas where name = 'Hackathon')
where not exists (
  select 1 from public.items i where i.project_id = p.id and i.title = v.title
);


-- =====================================================================
-- ตรวจผล
-- =====================================================================
select i.type as "ชนิด",
       i.title as "หัวข้อ",
       to_char(coalesce(i.due_at, i.remind_at) at time zone 'Asia/Bangkok',
               'DD Mon HH24:MI') as "เมื่อไหร่",
       case when i.done_at is not null then 'เสร็จแล้ว' else '' end as "สถานะ"
from public.items i
join public.projects p on p.id = i.project_id
where p.name = 'UniHack 2026'
order by i.type desc, coalesce(i.due_at, i.remind_at);
