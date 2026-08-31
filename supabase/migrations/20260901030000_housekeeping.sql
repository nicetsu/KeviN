-- =====================================================================
-- KeviN · เก็บกวาดของที่ผ่านไปแล้ว
--
-- ก่อนหน้านี้ไม่มีอะไรพาของเก่าออกจากระบบเลย — งานที่เลยกำหนดค้างอยู่หน้าแรก
-- ตลอดไป และของที่ "ลบ" ไปแล้วก็นอนอยู่ใน DB ตลอดกาล (เจ้าของถาม 1 ก.ย. 2026
-- ว่างานที่ผ่านไปแล้วเก็บไว้ไหน คำตอบตอนนั้นคือ "ไม่ไปไหนเลย")
--
-- สายพานมีสองช่วง เรียงต่อกัน:
--   ผ่านไปแล้ว ──(archive_stale)──> archived ──(purge_archived)──> ลบถาวร
--
-- ⚠️ **ช่วงที่สองลบจริง ไม่ใช่ soft delete** ซึ่งกลับมติเดิมใน doc/DECISIONS.md
--    ที่ว่า "ลบ = เก็บเข้าคลัง ไม่ใช่ DELETE" · เจ้าของเคาะเอง 1 ก.ย. 2026
--    หลังเห็นผลกระทบครบแล้ว รวมถึงข้อที่ว่า reminder ที่พลาดจะหายถาวรใน 8 วัน
-- =====================================================================

-- =====================================================================
-- ต้นวันนี้ตามเวลาไทย
--
-- "ข้ามวันแล้ว" ต้องวัดด้วยวันของคนใช้ ไม่ใช่วัน UTC — ไม่งั้นของที่เตือน
-- ตอนสี่ทุ่มจะยังไม่ถือว่าข้ามวันจนกว่าจะถึงเจ็ดโมงเช้าวันรุ่งขึ้น
--
-- ⚠️ STABLE ไม่ใช่ IMMUTABLE เพราะอิงกับ now() — ใส่ใน CHECK หรือ index
--    ไม่ได้ (doc/TRAPS.md) ใช้ได้แต่ในฟังก์ชันที่รันตอนนั้น
-- =====================================================================
create or replace function public.bangkok_day_start()
returns timestamptz
language sql stable set search_path = public as $$
  select date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
$$;

-- =====================================================================
-- ช่วงที่ 1 · ของที่ผ่านไปแล้ว → เก็บเข้าคลัง
--
-- เก็บเฉพาะของที่ "จบแล้วจริง" เท่านั้น:
--   reminder ที่ข้ามวันแล้ว — push ส่งไปแล้วหรือไม่ก็ตาม มันหมดหน้าที่ไปแล้ว
--   task ที่ติ๊กเสร็จ **และ** เลยวันส่ง — ต้องครบทั้งสองข้อ
--
-- ⚠️ **task ที่ติ๊กเสร็จแต่ไม่เคยตั้งวันส่งจะไม่ถูกเก็บ** เพราะไม่มี "วันส่ง"
--    ให้เลย · เจ้าของรับทราบและเลือกแบบนี้เอง ไม่ใช่ของที่หลุด
--
-- ⚠️ **ไม่แตะ task ที่เลยกำหนดแต่ยังไม่เสร็จ** — ของพวกนั้นต้องค้างอยู่
--    หน้าแรกต่อไปจนกว่าจะถูกจัดการ นั่นคือหน้าที่ของมัน
-- =====================================================================
create or replace function public.archive_stale()
returns table (kind text, n int)
language plpgsql volatile security definer set search_path = public as $$
declare
  day_start constant timestamptz := public.bangkok_day_start();
  stamp     constant timestamptz := now();
begin
  return query
  with done as (
    update public.items
       set archived_at = stamp, updated_at = stamp
     where archived_at is null
       and type = 'reminder'
       and remind_at < day_start
    returning 1
  )
  select 'reminder ข้ามวัน'::text, count(*)::int from done;

  return query
  with done as (
    update public.items
       set archived_at = stamp, updated_at = stamp
     where archived_at is null
       and type = 'task'
       and done_at is not null
       and due_at is not null
       and due_at < day_start
    returning 1
  )
  select 'task เสร็จแล้วและเลยวันส่ง'::text, count(*)::int from done;
end;
$$;

-- =====================================================================
-- ช่วงที่ 2 · อยู่ในคลังครบ 7 วัน → ลบถาวร
--
-- ⚠️ **ลบ project แล้วงานข้างในหายตามทั้งหมด** เพราะ items.project_id เป็น
--    `on delete cascade` — รวมงานที่ยังไม่ได้ archive ด้วย
--    เจ้าของเลือกให้ครอบคลุม project เอง 1 ก.ย. 2026 หลังเห็นข้อนี้แล้ว
--    ฟังก์ชันจึงนับของที่จะหายตามไว้ก่อน แล้วรายงานออกมาเป็นแถวของตัวเอง
--    จะได้ไม่ใช่การหายเงียบ ๆ
--
-- ⚠️ **ไม่แตะ area** ถึงจะ cascade เหมือนกัน เพราะเจ้าของระบุแค่ project
--    ลบ area หนึ่งใบเท่ากับล้างทั้งด้านซึ่งคนละขนาดกัน
--
-- ⚠️ project ที่ `status = 'archived'` แต่ `archived_at` ยังว่างจะไม่ถูกลบ —
--    ไม่มีเวลาให้เริ่มนับเจ็ดวัน · ของแบบนั้นต้องไปกดเก็บใหม่ให้ลงเวลา
--
-- event ปลอดภัยกว่า เพราะ items.event_id เป็น `set null` งานที่ผูกไว้
-- จะหลุดสายแต่ไม่หายตาม (doc/SCHEMA.sql)
-- =====================================================================
create or replace function public.purge_archived()
returns table (kind text, n int)
language plpgsql volatile security definer set search_path = public as $$
declare
  cutoff constant timestamptz := now() - interval '7 days';
  doomed int;
begin
  -- นับก่อนลบ · หลังจากนี้แถวพวกนั้นไม่มีให้ถามแล้ว
  select count(*) into doomed
    from public.items i
    join public.projects p on p.id = i.project_id
   where p.archived_at < cutoff
     and i.archived_at is null;

  return query
  with gone as (
    delete from public.items where archived_at < cutoff returning 1
  )
  select 'items ที่เก็บไว้ครบ 7 วัน'::text, count(*)::int from gone;

  return query
  with gone as (
    delete from public.events where archived_at < cutoff returning 1
  )
  select 'events ที่เก็บไว้ครบ 7 วัน'::text, count(*)::int from gone;

  return query
  with gone as (
    delete from public.projects where archived_at < cutoff returning 1
  )
  select 'projects ที่เก็บไว้ครบ 7 วัน'::text, count(*)::int from gone;

  return query select 'งานที่หายตาม project ไปด้วย'::text, doomed;
end;
$$;

-- =====================================================================
-- ตัวที่ cron เรียก · เรียงลำดับให้ถูก
--
-- archive ต้องมาก่อน purge เสมอ แต่ของที่เพิ่ง archive วันนี้ยังไม่ถึงคิวลบ
-- เพราะ cutoff เป็น 7 วัน — สองช่วงจึงไม่ชนกันแม้รันติดกันในทรานแซกชันเดียว
-- =====================================================================
create or replace function public.housekeeping()
returns table (kind text, n int)
language sql volatile security definer set search_path = public as $$
  select * from public.archive_stale()
  union all
  select * from public.purge_archived();
$$;

-- =====================================================================
-- ⚠️ สามฟังก์ชันนี้เป็น security definer จึงข้าม RLS ได้
--
-- ค่าเริ่มต้นของ Postgres คือ PUBLIC เรียกได้ ซึ่งแปลว่าใครก็ตามที่ถือ
-- anon key (อยู่ใน bundle ฝั่งเบราว์เซอร์ เปิด DevTools ก็เห็น) จะยิง
-- POST /rest/v1/rpc/purge_archived แล้ว **ลบข้อมูลของทุกคนทิ้งได้ทันที**
--
-- เป็นกับดักตัวเดียวกับที่เคยเจอกับ claim_due_reminders() แต่รอบนี้แพงกว่ามาก
-- เพราะอันนั้นแค่ทำให้ push ไม่เด้ง อันนี้ลบข้อมูลถาวร
-- **ถ้าเผลอ grant กลับ ช่องนี้เปิดใหม่ทันที**
-- =====================================================================
revoke all on function public.bangkok_day_start()  from public, anon, authenticated;
revoke all on function public.archive_stale()      from public, anon, authenticated;
revoke all on function public.purge_archived()     from public, anon, authenticated;
revoke all on function public.housekeeping()       from public, anon, authenticated;

grant execute on function public.housekeeping() to service_role;

-- =====================================================================
-- pg_cron · วันละครั้ง
--
-- 20:00 UTC = ตีสามของวันถัดไปตามเวลาไทย — ช่วงที่แน่ใจว่าข้ามวันไปแล้วจริง
-- และไม่ชนกับสรุปเช้า 06:30 ที่ต้องเห็นของครบก่อนถูกเก็บ
--
-- เรียก select ตรง ๆ ไม่ผ่าน Edge Function เพราะงานนี้ไม่ต้องออกไปข้างนอก
-- ไม่ต้องถือ secret และผลลัพธ์ถูกเก็บใน cron.job_run_details ให้ย้อนดูได้เอง
-- =====================================================================
select cron.schedule('kevin-housekeeping', '0 20 * * *', $CRON$
  select * from public.housekeeping();
$CRON$);
