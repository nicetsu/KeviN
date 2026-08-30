-- =====================================================================
-- KeviN · schema v1
-- Postgres / Supabase · รันทั้งไฟล์ใน SQL Editor ได้เลย
--
-- หลักการ: กติกาทั้งหมดบังคับที่ระดับฐานข้อมูล เพื่อให้ Claude
-- ใส่ข้อมูลผิดรูปไม่ได้ ต่อให้ prompt หลุด
-- =====================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- =====================================================================
-- 1 · AREAS  (ชั้นบนสุด · ปกติมีไม่เกิน 5–8 อัน)
-- =====================================================================
create table public.areas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  color       text,                                  -- คีย์ gradient ใน DESIGN.md
  sort_order  int  not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- =====================================================================
-- 2 · PROJECTS  (รายวิชา / โปรเจกต์)
-- =====================================================================
create type public.project_status as enum ('active', 'done', 'archived');

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  area_id     uuid not null references public.areas(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  description text,
  status      public.project_status not null default 'active',
  sort_order  int  not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =====================================================================
-- 3 · PROJECT_SCHEDULES  (ช่วงเวลาประจำ · หนึ่ง project มีได้หลายแถว)
--
-- การซ้ำเก็บเป็นรูปแบบเดียว: start_date + week_offsets
--   start_date   = วันจันทร์ของสัปดาห์ที่ 0  (บังคับให้เป็นวันจันทร์)
--   week_offsets = [0,1,2,...] สัปดาห์ที่มีคาบนี้ นับจาก start_date
--
-- UI มีสองโหมดกรอก แต่ลงมาที่รูปแบบนี้ทั้งคู่:
--   "ซ้ำอีก 16 สัปดาห์"  -> [0,1,...,15]
--   "เลือกสัปดาห์เอง"     -> ติ๊กเอา เช่น [0,2,4,6]
--
-- start_time / end_time เป็น `time` เปล่า (ไม่ใช่ timestamptz) โดยตั้งใจ
-- เพราะ "09:00 ทุกวันจันทร์" คือเวลาท้องถิ่น ไม่ใช่จุดเวลาจุดเดียว
-- =====================================================================
create table public.project_schedules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  day_of_week  smallint not null check (day_of_week between 0 and 6),  -- 0 = จันทร์
  start_time   time not null,
  end_time     time not null,
  location     text,
  label        text,                                  -- "บรรยาย" / "ปฏิบัติ" / "ติว"
  start_date   date not null,
  week_offsets int[] not null,
  created_at   timestamptz not null default now(),

  -- ⚠️ ทั้งสองข้อล่างต้องเขียนแบบนี้ ห้ามย่อกลับ — CHECK ที่ได้ผลเป็น NULL
  --    ถือว่า "ผ่าน" ใน Postgres จึงกลายเป็นด่านที่ไม่กันอะไรเลย
  --    · array_length('{}', 1) คืน NULL ไม่ใช่ 0  -> ต้อง coalesce
  --    · 0 <= all('{0,NULL}') คืน NULL           -> ต้องกัน NULL แยก
  constraint sched_time_order    check (end_time > start_time),
  constraint sched_start_is_mon  check (extract(isodow from start_date) = 1),
  constraint sched_weeks_present check (coalesce(array_length(week_offsets, 1), 0) >= 1),
  constraint sched_weeks_valid   check (array_position(week_offsets, null) is null
                                        and 0 <= all(week_offsets))
);

-- =====================================================================
-- 4 · EVENTS  (ช่วงเวลาที่เกิดครั้งเดียว · มีชื่อของตัวเอง)
--
-- เส้นแบ่งกับ project_schedules คือ "ซ้ำหรือไม่ซ้ำ"
--   ซ้ำทุกสัปดาห์   -> project_schedules (start_date + week_offsets)
--   เกิดครั้งเดียว  -> events            (starts_at + ends_at)
-- ห้ามใส่ week_offsets ลงตารางนี้ ไม่งั้นสองตารางทำงานทับกัน
-- แล้วจะไม่มีใครรู้ว่าของชิ้นหนึ่งควรเขียนลงตัวไหน
--
-- starts_at/ends_at เป็น timestamptz ไม่ใช่ `time` เปล่า — ข้อยกเว้นของกฎ
-- "เก็บ UTC เสมอ" มีที่เดียวคือ project_schedules เพราะ "09:00 ทุกวันจันทร์"
-- เป็นเวลาท้องถิ่นที่ซ้ำ · ส่วน event เป็นจุดเวลาจุดเดียวจริง ๆ
-- =====================================================================
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  body        text,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  location    text,
  label       text,                                  -- "onsite" / "ออนไลน์" / "รอบชิง"
  archived_at timestamptz,                           -- "ลบ" = เก็บเข้าคลัง ไม่ใช่ DELETE
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- สามอย่างที่จงใจไม่มี:
  --   sort_order  · เรียงตาม starts_at เสมอ ถ้าใส่ไว้ที่จับลากจะโผล่ในที่ที่ลากแล้วเด้งกลับ
  --   remind_at   · มีที่เดียวที่ยิง push คือ items.type='reminder' อยากเตือนให้สร้าง reminder แยก
  --   done_at     · เวลาที่ผ่านไปบอกเองว่าจบแล้ว ติ๊กเป็นงานเปล่า

  constraint event_time_order check (ends_at > starts_at),

  -- กันพิมพ์ปีผิดแล้ว calendar_entries() หั่นออกมาเป็นล้านแถว
  -- ⚠️ ที่ไม่เขียนเป็น "ห้ามข้ามเที่ยงคืน" เพราะ CHECK รับได้เฉพาะฟังก์ชัน IMMUTABLE
  --    แต่ `at time zone` เป็น STABLE · event ข้ามคืนได้โดยตั้งใจ ตัวหั่นอยู่ใน calendar_entries
  constraint event_span_sane  check (ends_at <= starts_at + interval '30 days'),

  -- ไม่ซ้ำซ้อนกับ primary key — มีไว้ให้ items อ้างด้วย foreign key สองคอลัมน์
  -- เพื่อบังคับที่ระดับ DB ว่างานกับ event ต้องอยู่ project เดียวกัน (ดูข้อ 6)
  unique (id, project_id)
);

-- =====================================================================
-- 5 · EVENT_AGENDA  (กำหนดการภายใน event · ไม่ขึ้นปฏิทิน)
--
-- ปฏิทินวาด "ตัว event" ใบเดียว ไม่วาดรายบรรทัด — กำหนดการจริงมีบรรทัดสั้น
-- ระดับ 10 นาที ถ้าวาดทุกบรรทัดลงปฏิทินรายสัปดาห์ วันนั้นจะมีบล็อกจิ๋วเรียงกัน
-- จนอ่านไม่ออกสักใบบนจอ 375px (ปัญหาตระกูลเดียวกับ doc/TRAPS.md "7 คอลัมน์")
-- =====================================================================
create table public.event_agenda (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  event_id   uuid not null references public.events(id) on delete cascade,

  -- 0 = วันแรกของ event · ที่ไม่ใช้ `date` เพราะถ้าเลื่อนวันจัดงาน
  -- กำหนดการต้องเลื่อนตาม ไม่ค้างอยู่วันเดิม
  day_offset smallint not null default 0 check (day_offset >= 0),

  start_time time not null,

  -- ไม่บังคับ · เว้นว่าง = ยาวถึงเวลาเริ่มของบรรทัดถัดไป (บรรทัดสุดท้าย = ends_at ของ event)
  -- ได้พฤติกรรม "กรอกแค่เวลาเริ่ม" ฟรี แต่พอเจอช่องว่างจริงก็ใส่เวลาจบได้
  -- โดยไม่ต้องแอบใส่บรรทัด "พัก" ปลอมลงในข้อมูล
  end_time   time,

  title      text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ไม่มี sort_order โดยตั้งใจ · start_time บังคับ จึงเรียงตามเวลาได้เสมอ
  -- และเมื่อไม่มี sort_order ก็ไม่มีที่จับลาก = ไม่มีทางลากแล้วเด้งกลับ

  constraint agenda_time_order check (end_time is null or end_time > start_time)
);

-- =====================================================================
-- 6 · ITEMS  (task / reminder / shortnote อยู่รวมกันที่นี่)
--
-- CHECK constraint ด้านล่างคือหัวใจของ schema นี้ — มันบังคับความหมาย
-- ของแต่ละ type ไว้ที่ระดับ DB ห้ามถอดออก
-- =====================================================================
create type public.item_type as enum ('task', 'reminder', 'shortnote');

create table public.items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  type        public.item_type not null,
  title       text not null check (char_length(title) between 1 and 200),
  body        text,
  due_at      timestamptz,
  remind_at   timestamptz,
  done_at     timestamptz,
  notified_at timestamptz,                            -- กัน push ซ้ำ
  priority    smallint not null default 1 check (priority between 0 and 2),
  sort_order  int not null default 0,

  -- ผูกกับ event ได้ · ไม่บังคับ · ผูกได้จากหน้า event ที่เดียว
  -- เพิ่มเร็ว (QuickAdd) และการสั่งผ่าน Claude ไม่ถามเรื่อง event เลย
  -- เพื่อไม่ให้เสียหลัก UX ข้อ 3 "งานที่ทำบ่อยต้องกดน้อยที่สุด"
  event_id    uuid,

  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- reminder ต้องมีเวลาเตือน และไม่มีวันส่ง
  constraint reminder_needs_time
    check (type <> 'reminder' or remind_at is not null),
  constraint reminder_no_due
    check (type <> 'reminder' or due_at is null),

  -- task ไม่ใช้ remind_at (ถ้าอยากเตือน ให้สร้าง reminder แยก)
  constraint task_no_remind
    check (type <> 'task' or remind_at is null),

  -- shortnote ไม่มีเวลาและไม่มีสถานะเสร็จ
  constraint shortnote_timeless
    check (type <> 'shortnote' or (due_at is null and remind_at is null and done_at is null)),

  -- notified_at ใช้กับ reminder เท่านั้น
  constraint notified_reminder_only
    check (notified_at is null or type = 'reminder'),

  -- ⚠️ FK สองคอลัมน์ ไม่ใช่คอลัมน์เดียว — Postgres บังคับให้เองว่า event ที่อ้าง
  --    ต้องอยู่ project เดียวกับ item · ถ้าอ้างแค่ event_id จะเอางานของวิชา A
  --    ไปผูกกับ event ของวิชา B ได้ แล้วต้องไปเขียน trigger กันเอง
  --
  -- ⚠️ `set null (event_id)` ต้องระบุคอลัมน์ไว้ด้วย (Postgres 15 ขึ้นไป)
  --    ถ้าเขียน `set null` เปล่า ๆ Postgres จะพยายามเซ็ต project_id เป็น null ด้วย
  --    ซึ่งชน NOT NULL แล้วการลบ event จะล้มทั้งคำสั่ง
  --
  --    เลือก set null ไม่ใช่ cascade เพราะลบ event ทิ้งแล้วงานที่ทำไว้ไม่ควรหายตาม
  --    แค่หลุดออกมาอยู่ที่หน้าวิชาเฉย ๆ
  constraint items_event_same_project
    foreign key (event_id, project_id) references public.events(id, project_id)
    on delete set null (event_id)
);

-- =====================================================================
-- 7 · PUSH_SUBSCRIPTIONS  (หนึ่งแถวต่อหนึ่งเครื่องที่กดอนุญาต)
-- =====================================================================
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  device_label text,
  enabled      boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);

-- =====================================================================
-- 8 · TIME_OFFSETS  ("วันนั้นวันเดียว ฉันอยู่ถึงกี่โมง หรือไม่ไปเลย")
--
-- แยกจากเวลาจริงโดยสิ้นเชิง:
--   project_schedules.start_time = เวลาที่มหาลัยกำหนด
--   events.starts_at             = เวลาที่ผู้จัดประกาศ
--   time_offsets                 = สิ่งที่ "ฉัน" ตัดสินใจ เฉพาะวันนั้น
--
-- ทำไมต้องแยก: คาบเรียนซ้ำทุกสัปดาห์ ถ้าไปแก้เวลาในตารางเรียนตรง ๆ เพื่อเลี่ยง
-- การชนกันของวันเดียว จะเปลี่ยนทั้งเทอม · และการลบเลขสัปดาห์ออกจาก week_offsets
-- เพื่อแทนความหมาย "ไม่ไป" ทำลายข้อมูลถาวร เพราะย้อนดูแล้วแยกไม่ออกว่ามหาลัย
-- หยุดหรือเราโดด (doc/TRAPS.md)
--
-- คืนค่า = ลบแถวทิ้ง · เวลาจริงไม่เคยถูกแตะเลยตั้งแต่ต้น
-- =====================================================================
create table public.time_offsets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- ⚠️ สองคอลัมน์แยก ไม่ใช่ source_id ตัวเดียวที่ชี้ได้ทั้งสองแบบ
  --    ถ้าใช้คอลัมน์เดียวจะทำ foreign key ไม่ได้ แปลว่าลบคาบหรือกิจกรรมทิ้งแล้ว
  --    แถวตัดทอนค้างเป็นขยะถาวรโดยไม่มีอะไรเตือน
  event_id    uuid references public.events(id) on delete cascade,
  schedule_id uuid references public.project_schedules(id) on delete cascade,

  occurs_on   date not null,                          -- ตัดเฉพาะวันนี้ ไม่กระทบสัปดาห์อื่น
  attend_from time,                                   -- null = ตามเวลาจริง
  attend_to   time,
  skipped     boolean not null default false,         -- ไม่ไปเลย · ยังแสดงในปฏิทินแบบจาง
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- num_nonnulls เป็น IMMUTABLE จึงใช้ใน CHECK ได้
  constraint offset_one_target check (num_nonnulls(event_id, schedule_id) = 1),
  constraint offset_time_order
    check (attend_from is null or attend_to is null or attend_to > attend_from),
  -- ไม่ไปเลยแล้วยังบอกว่าอยู่ถึงกี่โมง คือคำสั่งที่ขัดกันเอง
  constraint offset_skip_clean
    check (not skipped or (attend_from is null and attend_to is null)),
  -- ตัดเปล่า ๆ โดยไม่บอกอะไรเลย ไม่มีความหมาย — กันแถวขยะ
  constraint offset_says_something
    check (skipped or attend_from is not null or attend_to is not null)
);

-- =====================================================================
-- INDEXES
-- =====================================================================
create index items_due_open on public.items (user_id, due_at)
  where done_at is null and archived_at is null;

create index items_pending_reminders on public.items (remind_at)
  where type = 'reminder' and notified_at is null and archived_at is null;

create index items_by_project     on public.items (project_id);
create index projects_by_area     on public.projects (area_id);
create index schedules_by_project on public.project_schedules (project_id);

create index items_by_event    on public.items (event_id) where event_id is not null;
create index events_by_span    on public.events (user_id, starts_at) where archived_at is null;
create index events_by_project on public.events (project_id);
create index agenda_by_event   on public.event_agenda (event_id, day_offset, start_time);

-- หนึ่งคาบ/หนึ่งกิจกรรม ต่อหนึ่งวัน มีคำตัดสินได้ครั้งเดียว
-- (partial เพราะอีกคอลัมน์เป็น null เสมอ)
create unique index time_offsets_one_per_class on public.time_offsets (schedule_id, occurs_on)
  where schedule_id is not null;
create unique index time_offsets_one_per_event on public.time_offsets (event_id, occurs_on)
  where event_id is not null;
create index time_offsets_by_day on public.time_offsets (user_id, occurs_on);

-- =====================================================================
-- updated_at trigger
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();
create trigger event_agenda_touch before update on public.event_agenda
  for each row execute function public.touch_updated_at();
create trigger time_offsets_touch before update on public.time_offsets
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY  (เปิดตั้งแต่วันแรก แม้ใช้คนเดียว)
-- =====================================================================
alter table public.areas              enable row level security;
alter table public.projects           enable row level security;
alter table public.project_schedules  enable row level security;
alter table public.events             enable row level security;
alter table public.event_agenda       enable row level security;
alter table public.time_offsets       enable row level security;
alter table public.items              enable row level security;
alter table public.push_subscriptions enable row level security;

create policy own_rows on public.areas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.project_schedules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.event_agenda
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.time_offsets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- ฟังก์ชัน: คลี่ช่วงเวลาประจำออกเป็นวันที่จริง
-- ใช้ทั้งในเว็บ (วาดปฏิทิน) และให้ Claude เรียกเพื่อตอบว่า "คาบหน้าคือเมื่อไหร่"
-- =====================================================================
create or replace function public.schedule_occurrences(p_from date, p_to date)
returns table (
  schedule_id  uuid,
  project_id   uuid,
  project_name text,
  area_name    text,
  occurs_on    date,
  start_time   time,
  end_time     time,
  location     text,
  label        text
)
language sql stable security invoker as $$
  select s.id, s.project_id, p.name, a.name,
         (s.start_date + (off * 7) + s.day_of_week)::date,
         s.start_time, s.end_time, s.location, s.label
  from public.project_schedules s
  join public.projects p on p.id = s.project_id
  join public.areas    a on a.id = p.area_id
  cross join lateral unnest(s.week_offsets) as off
  where p.status = 'active'
    and (s.start_date + (off * 7) + s.day_of_week)::date between p_from and p_to
  order by 5, 6;
$$;

-- =====================================================================
-- ฟังก์ชัน: คาบเรียน + event รวมเป็นรูปเดียว
--
-- ทำไมรวมที่ DB ไม่ใช่ที่ TypeScript: มีสามที่ที่กินข้อมูลชุดนี้ (hero หน้าแรก ·
-- ปฏิทินเดือน · ปฏิทินสัปดาห์) ถ้ารวมฝั่งเว็บต้องเขียนตรรกะเดียวกันสามรอบ
-- และ web/lib/layout.ts ต้องการอินพุตรูปเดียวอยู่แล้ว
--
-- event ที่ข้ามเที่ยงคืนถูกหั่นเป็นบล็อกรายวัน เพราะปฏิทินสัปดาห์วางบล็อกด้วย
-- grid-row = วัน บล็อกใบหนึ่งจึงอยู่ได้วันเดียว:
--   ศ 20:00 -> ส 09:00   กลายเป็น   ศ 20:00–24:00  +  ส 00:00–09:00
--
-- ⚠️ security invoker เท่านั้น ต้องเคารพ RLS เหมือน schedule_occurrences()
--    ถ้าเผลอเขียน definer แล้วไม่ revoke จะซ้ำรอย claim_due_reminders() ข้างล่าง
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
  start_time   time,      -- ตัดแล้วถ้ามีการตัด
  end_time     time,      -- เป็น '24:00' ได้ เมื่อบล็อกวิ่งชนเที่ยงคืน
  location     text,
  label        text,
  skipped      boolean,   -- ตั้งใจไม่ไป · ยังแสดงอยู่แต่จาง
  trimmed      boolean    -- เวลาถูกตัดจากของจริง
)
language sql stable security invoker as $$
  with raw as (
    select 'class'::text as kind, o.schedule_id as source_id, o.project_id,
           o.project_name, o.area_name, o.project_name as title,
           o.occurs_on, o.start_time, o.end_time, o.location, o.label
    from public.schedule_occurrences(p_from, p_to) o

    union all

    select 'event'::text, e.id, e.project_id, p.name, a.name, e.title,
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
      and p.status = 'active'
      and d::date between p_from and p_to
      and not (d::date = s.local_end::date and s.local_end::time = time '00:00')
  ),
  applied as (
    select r.*,
           -- เงื่อนไขที่เป็น null (ไม่มีการตัด) ทำให้ CASE ตกไป else เอง
           (t.attend_from > r.start_time and t.attend_from < r.end_time) as cut_start,
           (t.attend_to   > r.start_time and t.attend_to   < r.end_time) as cut_end,
           t.attend_from, t.attend_to,
           coalesce(t.skipped, false) as is_skipped
    from raw r
    left join public.time_offsets t
      on t.occurs_on = r.occurs_on
     and ((r.kind = 'class' and t.schedule_id = r.source_id)
       or (r.kind = 'event' and t.event_id    = r.source_id))
  )
  select kind, source_id, project_id, project_name, area_name, title, occurs_on,
         case when cut_start then attend_from else start_time end,
         case when cut_end   then attend_to   else end_time   end,
         location, label,
         is_skipped,
         coalesce(cut_start, false) or coalesce(cut_end, false)
  from applied
  order by 7, 8;
$$;

-- =====================================================================
-- ฟังก์ชัน: อ้างสิทธิ์ reminder ที่ถึงเวลาแล้ว แบบ atomic
--
-- pg_cron รันทุกนาที ถ้ารอบก่อนยังไม่จบจะเตือนซ้ำ — การเขียน notified_at
-- ลงไปในคำสั่งเดียวกับที่เลือกแถว (UPDATE ... RETURNING) ทำให้อ้างสิทธิ์
-- ได้แค่รอบเดียว ห้ามแยกเป็น SELECT แล้วค่อย UPDATE
-- =====================================================================
create or replace function public.claim_due_reminders()
returns setof public.items
language sql volatile security definer set search_path = public as $$
  update public.items
     set notified_at = now()
   where type = 'reminder'
     and notified_at is null
     and archived_at is null
     and remind_at <= now()
  returning *;
$$;

-- ⚠️ ฟังก์ชันนี้เป็น security definer จึงข้าม RLS ได้
--    ค่าเริ่มต้นของ Postgres คือ PUBLIC เรียกได้ ซึ่งแปลว่าใครก็ตามที่ถือ
--    anon key (ซึ่งอยู่ใน bundle ฝั่งเบราว์เซอร์ เปิดดูได้) จะยิง
--    POST /rest/v1/rpc/claim_due_reminders แล้ว
--      1. อ่าน reminder ทุกแถวของทุกคน
--      2. เซ็ต notified_at ทิ้ง ทำให้ cron ตัวจริงไม่เจอ push เลยไม่เด้ง
--    ต้องถอนสิทธิ์ทิ้งให้เหลือแค่ service_role ที่ Edge Function ใช้
revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;

-- =====================================================================
-- SEED · Area ทั้งสี่
-- แทน <YOUR_USER_ID> ด้วย uuid ของบัญชีตัวเอง (จาก auth.users)
-- =====================================================================
-- insert into public.areas (user_id, name, color, sort_order) values
--   ('<YOUR_USER_ID>', 'Class',     'class', 0),
--   ('<YOUR_USER_ID>', 'Hackathon', 'hack',  1),
--   ('<YOUR_USER_ID>', 'Financial', 'fin',   2),
--   ('<YOUR_USER_ID>', 'Personal',  'pers',  3);


-- =====================================================================
-- KeviN · บทสนทนากับผู้ช่วยในแอป (ประตูที่สาม)
--
-- สามตารางสำหรับประตูที่อ่านอย่างเดียว — ไม่มีตารางไหนที่ผู้ช่วยเขียนเองได้
-- ผู้ช่วยอ่านข้อมูลผ่าน lib/ai/tools.ts เท่านั้น · ส่วนสามตารางนี้เขียนโดย
-- เซิร์ฟเวอร์ของแอปเอง ไม่ใช่โดยโมเดล (doc/CHAT.md §9)
-- =====================================================================

create type public.talk_channel as enum ('chat', 'voice');

-- =====================================================================
-- 1 · CONVERSATIONS
-- =====================================================================
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- ช่องทางที่ "เริ่ม" คุย · ไม่ใช่ช่องทางของทั้งบทสนทนา
  -- วางสายแล้วพิมพ์ต่อได้ในบทสนทนาเดิม ช่องทางรายข้อความอยู่ที่ messages.via
  started_via public.talk_channel not null,

  -- สรุปสั้น ๆ ไว้โชว์ในรายการ · เติมทีหลังได้ จึงไม่บังคับ
  title       text check (title is null or char_length(title) between 1 and 120),

  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint conversation_time_order
    check (ended_at is null or ended_at >= started_at)
);

create index conversations_recent
  on public.conversations (user_id, started_at desc)
  where archived_at is null;

create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

alter table public.conversations enable row level security;

create policy own_rows on public.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- 2 · MESSAGES
--
-- ข้อความไม่เคยถูกแก้หลังบันทึก จึง **ไม่มี updated_at** โดยตั้งใจ
-- ถ้าวันหนึ่งอยากให้แก้ได้ ให้เพิ่มแถวใหม่แล้วอ้างของเดิม อย่าเขียนทับ
-- =====================================================================
create type public.message_role as enum ('user', 'assistant');

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,

  role            public.message_role not null,
  content         text not null check (char_length(content) between 1 and 20000),

  -- ข้อความนี้เกิดจากช่องทางไหน · สายเดียวกันสลับโหมดกลางทางได้
  -- ใช้แสดงรอยต่อบนจอ ("↩ ต่อจากสายเมื่อ 2 นาทีที่แล้ว")
  via             public.talk_channel not null,

  created_at      timestamptz not null default now()
);

create index messages_in_conversation
  on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create policy own_rows on public.messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- 3 · TOOL_CALLS — ผู้ช่วยไปอ่านอะไรมาบ้าง
--
-- ⚠️ **เก็บอินพุตแต่ไม่เก็บผลลัพธ์** โดยตั้งใจ
--    ผลลัพธ์คือข้อมูลที่อยู่ในตารางอื่นของระบบอยู่แล้ว การเก็บซ้ำได้สำเนาชุดที่สอง
--    ที่เก่าลงเรื่อย ๆ และขยายพื้นที่ที่ข้อมูลส่วนตัวไปโผล่ได้โดยไม่ได้อะไรกลับมา
--    สิ่งที่ต้องตอบได้คือ "ผู้ช่วยไปดูอะไร ตอนไหน สำเร็จไหม" ซึ่งเก็บแค่นี้ก็พอ
--
-- ⚠️ อ้าง conversation_id **ไม่ใช่ message_id**
--    tool ถูกเรียกระหว่างกำลังสร้างคำตอบ ซึ่งเป็นตอนที่ข้อความยังไม่มีตัวตน
--    ถ้าอ้าง message_id จะต้องสร้างข้อความเปล่าไว้ก่อนแล้วค่อยเติม ซึ่งเพิ่ม
--    สถานะกลางทางที่พังได้ · เรียงตาม created_at ก็รู้ว่าอยู่กับคำตอบไหน
-- =====================================================================
create table public.tool_calls (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,

  name            text  not null check (char_length(name) between 1 and 60),
  input           jsonb not null default '{}'::jsonb,

  ok              boolean not null,
  -- จำนวนแถวที่ปล่อยออกไป และจำนวนที่ตัวกรอง Area ตัดทิ้ง
  rows_out        int not null default 0 check (rows_out >= 0),
  rows_hidden     int not null default 0 check (rows_hidden >= 0),
  -- ข้อความ error เมื่อ ok = false · ต้องมีเสมอเมื่อล้มเหลว ไม่งั้นย้อนดูไม่รู้เรื่อง
  error           text,

  created_at      timestamptz not null default now(),

  constraint tool_call_error_when_failed
    check (ok or error is not null)
);

create index tool_calls_in_conversation
  on public.tool_calls (conversation_id, created_at);

alter table public.tool_calls enable row level security;

create policy own_rows on public.tool_calls
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- pg_cron  (ทำในเฟส 5 · ยังไม่ต้องรันตอนนี้)
-- =====================================================================
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- ⚠️ อย่าฝัง service_role key เป็น literal ในคำสั่ง cron
--    ให้เก็บใน Supabase Vault แล้วอ่านจาก vault.decrypted_secrets
--
-- select cron.schedule('kevin-reminders', '* * * * *', $CRON$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object(
--                  'Content-Type', 'application/json',
--                  'Authorization', 'Bearer ' || (
--                    select decrypted_secret from vault.decrypted_secrets
--                     where name = 'kevin_cron_token'
--                  ))
--   );
-- $CRON$);
