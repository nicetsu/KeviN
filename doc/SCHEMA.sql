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
-- 4 · ITEMS  (task / reminder / shortnote อยู่รวมกันที่นี่)
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
    check (notified_at is null or type = 'reminder')
);

-- =====================================================================
-- 5 · PUSH_SUBSCRIPTIONS  (หนึ่งแถวต่อหนึ่งเครื่องที่กดอนุญาต)
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
-- INDEXES
-- =====================================================================
create index items_due_open on public.items (user_id, due_at)
  where done_at is null and archived_at is null;

create index items_pending_reminders on public.items (remind_at)
  where type = 'reminder' and notified_at is null and archived_at is null;

create index items_by_project     on public.items (project_id);
create index projects_by_area     on public.projects (area_id);
create index schedules_by_project on public.project_schedules (project_id);

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

-- =====================================================================
-- ROW LEVEL SECURITY  (เปิดตั้งแต่วันแรก แม้ใช้คนเดียว)
-- =====================================================================
alter table public.areas              enable row level security;
alter table public.projects           enable row level security;
alter table public.project_schedules  enable row level security;
alter table public.items              enable row level security;
alter table public.push_subscriptions enable row level security;

create policy own_rows on public.areas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.project_schedules
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
