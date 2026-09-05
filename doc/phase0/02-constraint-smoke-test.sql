-- =====================================================================
-- เฟส 0 · ทดสอบว่า CHECK constraint ทำงานจริง
-- รันในหน้า SQL Editor ของ Supabase หลัง 01-verify.sql ผ่านหมด
--
-- ตอบข้อ "ทดสอบ CHECK constraint ว่าทำงานจริง" ของเฟส 0 (doc/HISTORY.md) แต่ทำครบทุกข้อ
-- ไม่ใช่เฉพาะ reminder ที่ไม่มี remind_at
--
-- ปลอดภัยกับข้อมูลจริง — สร้าง Area ชื่อ __smoke_test__ ขึ้นมาเอง
-- ทดสอบเสร็จลบทิ้งทั้งหมด ไม่แตะข้อมูลอื่น รันซ้ำได้
--
-- ทุกแถวต้องขึ้น PASS
-- =====================================================================

create or replace function pg_temp.try_reject(p_label text, p_want text, p_stmt text)
returns table (status text, test text, detail text)
language plpgsql as $fn$
begin
  execute p_stmt;
  return query select '>>> FAIL'::text, p_label, ('ใส่ผ่าน ทั้งที่ควรโดน ' || p_want || ' ปฏิเสธ')::text;
exception when others then
  -- ต้องโดนปฏิเสธด้วย constraint ที่ตั้งใจ ไม่ใช่ error อะไรก็ได้
  if position(p_want in sqlerrm) > 0 then
    return query select 'PASS'::text, p_label, p_want;
  else
    return query select '>>> FAIL'::text, p_label, ('โดนปฏิเสธผิดตัว อยากได้ ' || p_want || ' แต่ได้ ' || sqlerrm)::text;
  end if;
end $fn$;

create or replace function pg_temp.try_accept(p_label text, p_stmt text)
returns table (status text, test text, detail text)
language plpgsql as $fn$
begin
  execute p_stmt;
  return query select 'PASS'::text, p_label, 'ใส่ได้ตามคาด'::text;
exception when others then
  return query select '>>> FAIL'::text, p_label, ('ควรใส่ได้ แต่โดนปฏิเสธ: ' || sqlerrm)::text;
end $fn$;


create or replace function pg_temp.kevin_smoke_test()
returns table (status text, test text, detail text)
language plpgsql as $fn$
declare
  v_user uuid;
  v_area uuid := '00000000-dead-beef-0000-000000000001';
  v_proj uuid := '00000000-dead-beef-0000-000000000002';
  n_users int;
  u text; p text;
begin
  -- แอปนี้ผู้ใช้คนเดียว ถ้ามีมากกว่าหนึ่งแปลว่ามีอะไรผิด อย่าเดา
  select count(*) into strict n_users from auth.users;
  if n_users = 0 then
    raise exception 'ยังไม่มีผู้ใช้ใน auth.users — สร้างบัญชีก่อน (ขั้นที่ 2 ใน README.md)';
  elsif n_users > 1 then
    raise exception 'เจอผู้ใช้ % คน แต่ KeviN ออกแบบมาสำหรับคนเดียว — ตรวจดูก่อนว่าใครเข้ามา', n_users;
  end if;
  select id into v_user from auth.users;

  -- เผื่อรอบก่อนค้าง
  delete from public.areas where id = v_area;

  insert into public.areas    (id, user_id, name)                values (v_area, v_user, '__smoke_test__');
  insert into public.projects (id, user_id, area_id, name)       values (v_proj, v_user, v_area, '__smoke_test__');

  u := quote_literal(v_user);
  p := quote_literal(v_proj);

  return query select * from pg_temp.try_reject('reminder ที่ไม่มี remind_at','reminder_needs_time',
    'insert into public.items (user_id,project_id,type,title) values ('||u||','||p||',''reminder'',''x'')');
  return query select * from pg_temp.try_reject('reminder ที่มี due_at','reminder_no_due',
    'insert into public.items (user_id,project_id,type,title,remind_at,due_at) values ('||u||','||p||',''reminder'',''x'',now(),now())');
  return query select * from pg_temp.try_reject('task ที่มี remind_at','task_no_remind',
    'insert into public.items (user_id,project_id,type,title,remind_at) values ('||u||','||p||',''task'',''x'',now())');
  return query select * from pg_temp.try_reject('shortnote ที่มี due_at','shortnote_timeless',
    'insert into public.items (user_id,project_id,type,title,due_at) values ('||u||','||p||',''shortnote'',''x'',now())');
  return query select * from pg_temp.try_reject('shortnote ที่มี done_at','shortnote_timeless',
    'insert into public.items (user_id,project_id,type,title,done_at) values ('||u||','||p||',''shortnote'',''x'',now())');
  return query select * from pg_temp.try_reject('notified_at บน task','notified_reminder_only',
    'insert into public.items (user_id,project_id,type,title,notified_at) values ('||u||','||p||',''task'',''x'',now())');
  return query select * from pg_temp.try_reject('title ว่าง','items_title_check',
    'insert into public.items (user_id,project_id,type,title) values ('||u||','||p||',''task'','''')');
  return query select * from pg_temp.try_reject('priority เกินช่วง','items_priority_check',
    'insert into public.items (user_id,project_id,type,title,priority) values ('||u||','||p||',''task'',''x'',3)');

  return query select * from pg_temp.try_reject('end_time <= start_time','sched_time_order',
    'insert into public.project_schedules (user_id,project_id,day_of_week,start_time,end_time,start_date,week_offsets) values ('||u||','||p||',0,''11:00'',''09:00'',''2026-08-17'',''{0}'')');
  return query select * from pg_temp.try_reject('start_date ไม่ใช่วันจันทร์','sched_start_is_mon',
    'insert into public.project_schedules (user_id,project_id,day_of_week,start_time,end_time,start_date,week_offsets) values ('||u||','||p||',0,''09:00'',''11:00'',''2026-08-18'',''{0}'')');
  return query select * from pg_temp.try_reject('day_of_week = 7','project_schedules_day_of_week_check',
    'insert into public.project_schedules (user_id,project_id,day_of_week,start_time,end_time,start_date,week_offsets) values ('||u||','||p||',7,''09:00'',''11:00'',''2026-08-17'',''{0}'')');

  -- สามข้อนี้คือด่านที่เคยพัง ปล่อยผ่านแล้วคาบจะหายจากปฏิทินเงียบ ๆ
  return query select * from pg_temp.try_reject('week_offsets ว่าง','sched_weeks_present',
    'insert into public.project_schedules (user_id,project_id,day_of_week,start_time,end_time,start_date,week_offsets) values ('||u||','||p||',0,''09:00'',''11:00'',''2026-08-17'',''{}'')');
  return query select * from pg_temp.try_reject('week_offsets มี NULL','sched_weeks_valid',
    'insert into public.project_schedules (user_id,project_id,day_of_week,start_time,end_time,start_date,week_offsets) values ('||u||','||p||',0,''09:00'',''11:00'',''2026-08-17'',''{0,NULL}'')');
  return query select * from pg_temp.try_reject('week_offsets ติดลบ','sched_weeks_valid',
    'insert into public.project_schedules (user_id,project_id,day_of_week,start_time,end_time,start_date,week_offsets) values ('||u||','||p||',0,''09:00'',''11:00'',''2026-08-17'',''{-1}'')');

  -- ของถูกต้องยังต้องใส่ได้ ไม่ใช่กันจนใช้งานไม่ได้
  return query select * from pg_temp.try_accept('task ที่มี due_at',
    'insert into public.items (user_id,project_id,type,title,due_at) values ('||u||','||p||',''task'',''x'',now())');
  return query select * from pg_temp.try_accept('task ที่ไม่มี due_at',
    'insert into public.items (user_id,project_id,type,title) values ('||u||','||p||',''task'',''x'')');
  return query select * from pg_temp.try_accept('reminder ที่มี remind_at',
    'insert into public.items (user_id,project_id,type,title,remind_at) values ('||u||','||p||',''reminder'',''x'',now())');
  return query select * from pg_temp.try_accept('shortnote ไม่มีเวลา',
    'insert into public.items (user_id,project_id,type,title) values ('||u||','||p||',''shortnote'',''x'')');
  return query select * from pg_temp.try_accept('ช่วงเวลาประจำแบบเลือกสัปดาห์เอง',
    'insert into public.project_schedules (user_id,project_id,day_of_week,start_time,end_time,start_date,week_offsets) values ('||u||','||p||',2,''13:00'',''15:00'',''2026-08-17'',''{0,2,4}'')');

  -- เก็บกวาด · cascade ลบ project/items/schedules ที่สร้างไว้ทั้งหมด
  delete from public.areas where id = v_area;
  return;
end $fn$;


select * from pg_temp.kevin_smoke_test();
