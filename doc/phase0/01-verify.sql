-- =====================================================================
-- เฟส 0 · ตรวจว่า SCHEMA.sql ลงครบและถูกต้อง
-- รันในหน้า SQL Editor ของ Supabase หลังรัน SCHEMA.sql เสร็จ
-- อ่านอย่างเดียว ไม่แก้ข้อมูลอะไร รันซ้ำได้ไม่จำกัด
--
-- ทุกแถวต้องขึ้น PASS ถ้ามี FAIL แม้แถวเดียว อย่าเพิ่งไปเฟส 1
-- =====================================================================

with

-- 1 · ตารางครบ 5 ตาราง
t_tables as (
  select 'ตารางครบ 5 ตาราง' as label,
         count(*)::text || ' / 5' as detail,
         count(*) = 5 as ok
  from pg_tables
  where schemaname = 'public'
    and tablename in ('areas','projects','project_schedules','items','push_subscriptions')
),

-- 2 · เกณฑ์ตรงจากเฟส 0 (doc/HISTORY.md) — ต้องไม่มีตารางไหนที่ RLS ปิด
t_rls as (
  select 'RLS เปิดครบทุกตาราง',
         coalesce(string_agg(tablename, ', '), 'ไม่มีตารางที่ปิด'),
         count(*) = 0
  from pg_tables
  where schemaname = 'public' and rowsecurity = false
),

-- 3 · RLS เปิดแต่ไม่มี policy = ตารางที่อ่านไม่ออกทั้งใบ ต้องไม่มี
t_policies as (
  select 'ทุกตารางมี policy',
         coalesce(string_agg(relname, ', '), 'มีครบทุกตาราง'),
         count(*) = 0
  from (
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
    group by c.relname
    having count(p.polname) = 0
  ) x
),

-- 4 · CHECK constraint ที่เป็นหัวใจของ schema ต้องอยู่ครบ
t_checks as (
  select 'CHECK constraint ครบ 9 ข้อ',
         count(*)::text || ' / 9',
         count(*) = 9
  from pg_constraint
  where conrelid in ('public.items'::regclass, 'public.project_schedules'::regclass)
    and contype = 'c'
    and conname in ('reminder_needs_time','reminder_no_due','task_no_remind',
                    'shortnote_timeless','notified_reminder_only','sched_time_order',
                    'sched_start_is_mon','sched_weeks_present','sched_weeks_valid')
),

-- 5 · ด่าน week_offsets ต้องเป็นเวอร์ชันที่แก้แล้ว
--     เวอร์ชันเก่าปล่อยอาเรย์ว่างกับ NULL ผ่าน เพราะ CHECK ที่ได้ผลเป็น NULL
--     ถือว่า "ผ่าน" ใน Postgres
t_weeks_fixed as (
  select 'ด่าน week_offsets เป็นเวอร์ชันที่แก้แล้ว',
         case when count(*) = 2 then 'แก้แล้ว'
              else 'ยังเป็นเวอร์ชันเก่า — ใช้ SCHEMA.sql ฉบับล่าสุด' end,
         count(*) = 2
  from pg_constraint
  where conrelid = 'public.project_schedules'::regclass
    and (   (conname = 'sched_weeks_present' and pg_get_constraintdef(oid) ilike '%coalesce%')
         or (conname = 'sched_weeks_valid'   and pg_get_constraintdef(oid) ilike '%array_position%'))
),

-- 6 · claim_due_reminders() ข้าม RLS ได้ ห้ามให้ anon/authenticated เรียก
--     anon key อยู่ใน bundle ฝั่งเบราว์เซอร์ ใครเปิดดูก็ได้
t_rpc_locked as (
  select 'claim_due_reminders ปิดจาก anon/authenticated',
         case when has_function_privilege('anon','public.claim_due_reminders()','execute')
                or has_function_privilege('authenticated','public.claim_due_reminders()','execute')
              then 'ยังเปิดอยู่ — อันตราย'
              else 'ปิดแล้ว' end,
         not (has_function_privilege('anon','public.claim_due_reminders()','execute')
              or has_function_privilege('authenticated','public.claim_due_reminders()','execute'))
),

-- 7 · แต่ Edge Function (service_role) ต้องยังเรียกได้ ไม่งั้นเฟส 5 พัง
t_rpc_service as (
  select 'claim_due_reminders ยังเปิดให้ service_role',
         case when has_function_privilege('service_role','public.claim_due_reminders()','execute')
              then 'เรียกได้' else 'เรียกไม่ได้ — เฟส 5 จะส่ง push ไม่ได้' end,
         has_function_privilege('service_role','public.claim_due_reminders()','execute')
),

-- 8 · ฟังก์ชันที่เฟสหลังต้องใช้
t_funcs as (
  select 'ฟังก์ชันครบ 2 ตัว',
         count(*)::text || ' / 2',
         count(*) = 2
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('schedule_occurrences','claim_due_reminders')
)

select case when ok then 'PASS' else '>>> FAIL' end as status,
       label as "ตรวจอะไร",
       detail as "ได้อะไร"
from (
  select * from t_tables      union all
  select * from t_rls         union all
  select * from t_policies    union all
  select * from t_checks      union all
  select * from t_weeks_fixed union all
  select * from t_rpc_locked  union all
  select * from t_rpc_service union all
  select * from t_funcs
) r
order by ok, label;
