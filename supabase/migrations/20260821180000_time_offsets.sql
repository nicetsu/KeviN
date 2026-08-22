-- =====================================================================
-- KeviN · time_offsets — "วันนั้นวันเดียว ฉันอยู่ถึงกี่โมง หรือไม่ไปเลย"
--
-- แยกจากเวลาจริงโดยสิ้นเชิง:
--   project_schedules.start_time  = เวลาที่มหาลัยกำหนด
--   events.starts_at              = เวลาที่ผู้จัดประกาศ
--   time_offsets                  = สิ่งที่ "ฉัน" ตัดสินใจ เฉพาะวันนั้น
--
-- ทำไมต้องแยก: คาบเรียนซ้ำทุกสัปดาห์ ถ้าไปแก้เวลาในตารางเรียนตรง ๆ เพื่อเลี่ยง
-- การชนกันของวันเดียว มันจะเปลี่ยนทั้งเทอม · และการลบเลขสัปดาห์ออกจาก
-- week_offsets เพื่อแทนความหมาย "ไม่ไป" ทำลายข้อมูลถาวร เพราะย้อนดูแล้ว
-- แยกไม่ออกว่ามหาลัยหยุดหรือเราโดด (doc/TRAPS.md)
--
-- คืนค่า = ลบแถวทิ้ง เวลาจริงไม่เคยถูกแตะเลยตั้งแต่ต้น
-- =====================================================================

create table public.time_offsets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- ⚠️ สองคอลัมน์แยก ไม่ใช่ source_id ตัวเดียวที่ชี้ได้ทั้งสองแบบ
  --    ถ้าใช้คอลัมน์เดียวจะทำ foreign key ไม่ได้ แปลว่าลบคาบหรือกิจกรรมทิ้งแล้ว
  --    แถวตัดทอนค้างเป็นขยะถาวรโดยไม่มีอะไรเตือน (กับดักเดียวกับ items.event_id)
  event_id    uuid references public.events(id) on delete cascade,
  schedule_id uuid references public.project_schedules(id) on delete cascade,

  -- วันที่ถูกตัด · เป็น "วันเดียว" เสมอ ไม่มีการตัดเป็นช่วง
  occurs_on   date not null,

  -- null = ตามเวลาจริง · ใส่ค่าเพื่อบอกว่าจะเข้าช้าลง หรือออกก่อน
  attend_from time,
  attend_to   time,

  -- ไม่ไปเลย · ยังแสดงในปฏิทินแบบจาง ไม่หายไป (หลัก UX ข้อ 5)
  skipped     boolean not null default false,

  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- ชี้ได้ทีละอันเท่านั้น · num_nonnulls เป็น IMMUTABLE จึงใช้ใน CHECK ได้
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

-- หนึ่งคาบ/หนึ่งกิจกรรม ต่อหนึ่งวัน มีคำตัดสินได้ครั้งเดียว
-- (partial unique index เพราะอีกคอลัมน์เป็น null เสมอ)
create unique index time_offsets_one_per_class on public.time_offsets (schedule_id, occurs_on)
  where schedule_id is not null;
create unique index time_offsets_one_per_event on public.time_offsets (event_id, occurs_on)
  where event_id is not null;

create index time_offsets_by_day on public.time_offsets (user_id, occurs_on);

create trigger time_offsets_touch before update on public.time_offsets
  for each row execute function public.touch_updated_at();

alter table public.time_offsets enable row level security;

create policy own_rows on public.time_offsets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- calendar_entries() รอบสอง — เอาการตัดทอนมาใช้
--
-- เพิ่มสองคอลัมน์: `skipped` (ไม่ไปเลย) และ `trimmed` (เวลาถูกตัด)
-- ฝั่งเว็บใช้สองค่านี้ทำให้บล็อกจางลงและติดป้าย ไม่ใช่ซ่อนทิ้ง
--
-- ⚠️ การตัดจะถูกใช้ก็ต่อเมื่อเวลาที่ระบุ **ตกอยู่ในบล็อกจริง** เท่านั้น
--    ถ้าใส่เวลาที่อยู่นอกช่วง (เช่นพิมพ์ผิด) ระบบจะไม่สนใจแล้วใช้เวลาเดิม
--    ดีกว่าปล่อยให้ได้บล็อกยาวศูนย์หรือกลับหัว ซึ่งจะทำให้คาบหายจากปฏิทินเงียบ ๆ
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
