-- =====================================================================
-- KeviN · events + event_agenda
--
-- เส้นแบ่งสามเส้น ที่ห้ามให้พร่า ไม่งั้นสองตารางจะทำงานทับกัน
-- แล้วจะไม่มีใครรู้ว่าของชิ้นหนึ่งควรเขียนลงตัวไหน:
--
--   ซ้ำทุกสัปดาห์                    -> project_schedules (start_date + week_offsets)
--   เกิดครั้งเดียว ต้องขึ้นปฏิทิน      -> events            (starts_at + ends_at)
--   เป็นรายละเอียดภายใน event เดียว  -> event_agenda      (ไม่ขึ้นปฏิทิน)
--
-- ห้ามใส่ week_offsets ลง events · ห้ามให้ event_agenda ขึ้นปฏิทิน
-- =====================================================================

-- =====================================================================
-- 1 · EVENTS
-- =====================================================================
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,

  -- event มีชื่อของตัวเอง — ต่างจาก project_schedules ที่ปฏิทินต้องยืมชื่อ project มาใช้
  title       text not null check (char_length(title) between 1 and 200),
  body        text,

  -- timestamptz ไม่ใช่ `time` เปล่า
  -- ข้อยกเว้นใน doc/TRAPS.md มีที่เดียวคือ project_schedules เพราะ "09:00 ทุกวันจันทร์"
  -- เป็นเวลาท้องถิ่นที่ซ้ำ · ส่วน event เป็นจุดเวลาจุดเดียวจริง ๆ จึงกลับเข้ากฎหลัก
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,

  location    text,
  label       text,                    -- "onsite" / "ออนไลน์" / "รอบชิง"

  -- ไม่มี sort_order โดยตั้งใจ · events เรียงตาม starts_at เสมอ
  -- ถ้าใส่ไว้ ที่จับลากจะโผล่ในที่ที่ลากแล้วเด้งกลับตอนโหลดใหม่ (ARCHITECTURE.md §5)
  --
  -- ไม่มี remind_at โดยตั้งใจ · คงกฎเดียวกับ task_no_remind ไว้ทั้งระบบ:
  -- มีที่เดียวที่ยิง push คือ items.type='reminder' — อยากเตือนก่อนงานให้สร้าง reminder แยก
  -- ผลคือ claim_due_reminders() · Edge Function · pg_cron ไม่ต้องแตะสักบรรทัด
  --
  -- ไม่มี done_at โดยตั้งใจ · เวลาที่ผ่านไปบอกเองว่าจบแล้ว ติ๊กเป็นงานเปล่า

  archived_at timestamptz,             -- "ลบ" = เก็บเข้าคลัง ไม่ใช่ DELETE (doc/DECISIONS.md)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint event_time_order check (ends_at > starts_at),

  -- กันพิมพ์ปีผิดแล้ว calendar_entries() หั่นออกมาเป็นล้านแถว
  --
  -- ⚠️ ที่ไม่เขียนเป็น "ห้ามข้ามเที่ยงคืน" เพราะ CHECK ของ Postgres รับได้เฉพาะ
  --    ฟังก์ชัน IMMUTABLE ส่วน `at time zone` เป็น STABLE จึงใส่ไม่ได้
  --    (เจ้าของเคาะแล้วว่าข้ามคืนได้ · ตัวหั่นอยู่ใน calendar_entries ข้างล่าง)
  constraint event_span_sane  check (ends_at <= starts_at + interval '30 days'),

  -- ไม่ได้ซ้ำซ้อนกับ primary key — มีไว้ให้ items อ้างด้วย foreign key สองคอลัมน์
  -- เพื่อบังคับที่ระดับ DB ว่างานกับ event ต้องอยู่ project เดียวกัน (ดูข้อ 3)
  unique (id, project_id)
);

create index events_by_span    on public.events (user_id, starts_at) where archived_at is null;
create index events_by_project on public.events (project_id);

create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- 2 · EVENT_AGENDA  (กำหนดการภายใน event · ไม่ขึ้นปฏิทิน)
--
-- ปฏิทินวาด "ตัว event" ใบเดียว ไม่วาดรายบรรทัด — เพราะกำหนดการจริงมีบรรทัด
-- สั้นระดับ 10 นาที ถ้าวาดทุกบรรทัดลงปฏิทินรายสัปดาห์ วันนั้นจะมีบล็อกจิ๋ว
-- เรียงกันจนอ่านไม่ออกสักใบบนจอ 375px (ปัญหาตระกูลเดียวกับ doc/TRAPS.md
-- หัวข้อ "7 คอลัมน์บนจอ 375px อ่านไม่ออก")
--
-- เวลาจึงเป็น `time` เปล่า ไม่ใช่ timestamptz — มันเป็นรายการที่อ่าน ไม่ใช่วัตถุบนปฏิทิน
-- =====================================================================
create table public.event_agenda (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  event_id   uuid not null references public.events(id) on delete cascade,

  -- 0 = วันแรกของ event · งานวันเดียวเป็น 0 เสมอ ผู้ใช้ไม่เห็นช่องนี้
  -- ที่ไม่ใช้ `date` เพราะถ้าเลื่อนวันจัดงาน กำหนดการต้องเลื่อนตาม ไม่ค้างอยู่วันเดิม
  day_offset smallint not null default 0 check (day_offset >= 0),

  start_time time not null,

  -- ไม่บังคับ · ถ้าเว้นว่าง ถือว่ายาวถึงเวลาเริ่มของบรรทัดถัดไป
  -- (บรรทัดสุดท้าย = เวลาจบของ event) — ได้พฤติกรรม "กรอกแค่เวลาเริ่ม" เป็นค่าเริ่มต้นฟรี
  -- แต่พอเจอช่องว่างจริง (พักเที่ยงที่ไม่ได้อยู่ในกำหนดการ) ก็ใส่เวลาจบลงไปได้เลย
  -- โดยไม่ต้องแอบใส่บรรทัด "พัก" ปลอมเข้าไปในข้อมูล
  end_time   time,

  title      text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ไม่มี sort_order โดยตั้งใจ · start_time บังคับ จึงเรียงตามเวลาได้เสมอ
  -- และเมื่อไม่มี sort_order ก็ไม่มีที่จับลาก = ไม่มีทางลากแล้วเด้งกลับ

  constraint agenda_time_order check (end_time is null or end_time > start_time)
);

create index agenda_by_event on public.event_agenda (event_id, day_offset, start_time);

create trigger event_agenda_touch before update on public.event_agenda
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- 3 · ITEMS.EVENT_ID  (ผูก task/reminder/shortnote เข้ากับ event ได้)
--
-- nullable · ผูกได้จากหน้า event ที่เดียว · เพิ่มเร็ว (QuickAdd) และการสั่งผ่าน
-- Claude ไม่ถามเรื่อง event เลย เพื่อไม่ให้เสียหลัก UX ข้อ 3
-- "งานที่ทำบ่อยต้องกดน้อยที่สุด"
-- =====================================================================
alter table public.items add column event_id uuid;

-- ⚠️ FK สองคอลัมน์ ไม่ใช่คอลัมน์เดียว — Postgres บังคับให้เองว่า event ที่อ้าง
--    ต้องอยู่ project เดียวกับ item · ถ้าอ้างแค่ event_id จะเอางานของวิชา A
--    ไปผูกกับ event ของวิชา B ได้ แล้วต้องไปเขียน trigger กันเอง
--
-- ⚠️ `set null (event_id)` ระบุคอลัมน์ไว้ด้วยโดยตั้งใจ (Postgres 15 ขึ้นไป)
--    ถ้าเขียน `set null` เปล่า ๆ Postgres จะพยายามเซ็ต project_id เป็น null ด้วย
--    ซึ่งชน NOT NULL แล้วการลบ event จะล้มเหลวทั้งคำสั่ง
--
--    เลือก set null ไม่ใช่ cascade เพราะลบ event ทิ้งแล้วงานที่ทำไว้ไม่ควรหายตาม
--    แค่หลุดออกมาอยู่ที่หน้าวิชาเฉย ๆ
alter table public.items
  add constraint items_event_same_project
  foreign key (event_id, project_id) references public.events(id, project_id)
  on delete set null (event_id);

create index items_by_event on public.items (event_id) where event_id is not null;

-- =====================================================================
-- 4 · ROW LEVEL SECURITY  (เปิดตั้งแต่วันแรก แม้ใช้คนเดียว)
-- =====================================================================
alter table public.events       enable row level security;
alter table public.event_agenda enable row level security;

create policy own_rows on public.events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.event_agenda
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- 5 · calendar_entries()  — คาบเรียน + event รวมเป็นรูปเดียว
--
-- ทำไมรวมที่ DB ไม่ใช่ที่ TypeScript: มีสามที่ที่กินข้อมูลชุดนี้ (hero หน้าแรก ·
-- ปฏิทินเดือน · ปฏิทินสัปดาห์) ถ้ารวมฝั่งเว็บต้องเขียนตรรกะเดียวกันสามรอบ
-- และ lib/layout.ts ต้องการอินพุตรูปเดียวอยู่แล้ว
--
-- event ที่ข้ามเที่ยงคืนถูกหั่นเป็นบล็อกรายวัน เพราะปฏิทินสัปดาห์วางบล็อกด้วย
-- grid-row = วัน บล็อกใบหนึ่งจึงอยู่ได้วันเดียว:
--   ศ 20:00 -> ส 09:00   กลายเป็น   ศ 20:00–24:00  +  ส 00:00–09:00
--
-- ⚠️ security invoker เท่านั้น ต้องเคารพ RLS เหมือน schedule_occurrences()
--    ถ้าเผลอเขียน definer แล้วไม่ revoke จะซ้ำรอย claim_due_reminders()
--    ที่เปิดให้ใครก็ตามที่ถือ anon key อ่านข้อมูลทุกแถวได้ (ท้าย doc/SCHEMA.sql)
-- =====================================================================
create or replace function public.calendar_entries(p_from date, p_to date)
returns table (
  kind         text,      -- 'class' | 'event'
  source_id    uuid,      -- schedule_id หรือ event id
  project_id   uuid,
  project_name text,
  area_name    text,
  title        text,      -- คาบเรียนใช้ชื่อ project · event ใช้ชื่อของตัวเอง
  occurs_on    date,
  start_time   time,
  end_time     time,      -- เป็น '24:00' ได้ เมื่อบล็อกวิ่งชนเที่ยงคืน
  location     text,
  label        text
)
language sql stable security invoker as $$
  select 'class'::text, o.schedule_id, o.project_id, o.project_name, o.area_name,
         o.project_name,
         o.occurs_on, o.start_time, o.end_time, o.location, o.label
  from public.schedule_occurrences(p_from, p_to) o

  union all

  select 'event'::text, e.id, e.project_id, p.name, a.name,
         e.title,
         d::date,
         -- วันแรกเริ่มตามเวลาจริง · วันถัด ๆ ไปเริ่มเที่ยงคืน
         case when d::date = s.local_start::date then s.local_start::time
              else time '00:00' end,
         -- วันสุดท้ายจบตามเวลาจริง · วันก่อนหน้าวิ่งชนเที่ยงคืน
         case when d::date = s.local_end::date   then s.local_end::time
              else time '24:00' end,
         e.location, e.label
  from public.events e
  join public.projects p on p.id = e.project_id
  join public.areas    a on a.id = p.area_id
  cross join lateral (
    select (e.starts_at at time zone 'Asia/Bangkok') as local_start,
           (e.ends_at   at time zone 'Asia/Bangkok') as local_end
  ) s
  cross join lateral generate_series(
    s.local_start::date::timestamp,
    s.local_end::date::timestamp,
    interval '1 day'
  ) d
  where e.archived_at is null
    and p.status = 'active'            -- ตรงกับที่ schedule_occurrences() ทำ
    and d::date between p_from and p_to
    -- event ที่จบเที่ยงคืนพอดี วันสุดท้ายจะได้บล็อก 00:00–00:00 ที่ยาวศูนย์ ตัดทิ้ง
    -- (วันก่อนหน้ามีบล็อกที่จบ 24:00 อยู่แล้ว จึงไม่มีอะไรหาย)
    and not (d::date = s.local_end::date and s.local_end::time = time '00:00')

  order by 7, 8;
$$;
