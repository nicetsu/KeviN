-- =====================================================================
-- KeviN · ใครเป็นคนเก็บเข้าคลัง
--
-- หน้า "ของที่เก็บไว้" (/library/archive) ต้องแยกให้เห็นว่าของชิ้นนี้
-- **ระบบเก็บให้เอง** หรือ **ผู้ใช้กดเก็บเอง** เพราะสองอย่างนี้ต้องการ
-- ความสนใจไม่เท่ากันตอนตัดสินใจว่าจะกดคืนไหม —
-- ของที่ระบบเก็บให้คือของที่หมดอายุไปเอง ผู้ใช้อาจไม่เคยรู้ตัวว่ามันหายไป
-- ส่วนของที่กดเก็บเองคือของที่ตั้งใจทิ้งไปแล้ว
--
-- ⚠️ **ต้องเป็นคอลัมน์จริง ไม่ใช่การเดาจากเวลา** — cron รันตีสามทุกคืน
--    แต่ผู้ใช้ก็กดเก็บตอนตีสามได้ การเดาจากนาฬิกาจึงผิดได้โดยไม่มีอะไรฟ้อง
-- =====================================================================
alter table public.items  add column if not exists archived_auto boolean not null default false;
alter table public.events add column if not exists archived_auto boolean not null default false;

-- เก็บอัตโนมัติต้องปักธงไว้ด้วย · ฝั่งแอปปลดธงเมื่อผู้ใช้กดเก็บเอง
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
       set archived_at = stamp, archived_auto = true, updated_at = stamp
     where archived_at is null
       and type = 'reminder'
       and remind_at < day_start
    returning 1
  )
  select 'reminder ข้ามวัน'::text, count(*)::int from done;

  return query
  with done as (
    update public.items
       set archived_at = stamp, archived_auto = true, updated_at = stamp
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

-- ⚠️ security definer ต้อง revoke ทุกครั้งที่ create or replace (doc/TRAPS.md)
revoke all on function public.archive_stale() from public, anon, authenticated;
