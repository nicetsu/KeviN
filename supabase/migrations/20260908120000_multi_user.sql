-- =====================================================================
-- KeviN · เปิดให้ใช้หลายคน
--
-- **กลับมติ "ผู้ใช้: คนเดียว"** (17 ส.ค. 2026) · แต่มติลูกของมันคือ
-- "ใส่ user_id ครบทุกตารางและเปิด RLS ตั้งแต่วันแรก เพราะเปิดทีหลัง
-- ตอนมีข้อมูลแล้วเจ็บกว่ามาก" ซึ่งจ่ายผลตรงนี้พอดี — **ไม่มีตารางข้อมูล
-- ไหนต้องแตะเลยสักตาราง** ทั้ง 11 ตารางมี user_id + policy own_rows อยู่แล้ว
--
-- ไฟล์นี้จึงมีแต่ของที่อยู่ *รอบ ๆ* ข้อมูล สี่กอง
--   1. รหัสเชิญ — ด่านสมัคร ที่บังคับใน DB ไม่ใช่ในแอป
--   2. seed สี่ Area ให้ผู้ใช้ใหม่อัตโนมัติ
--   3. การเตือนที่ตอนนี้ข้ามคน (บั๊กจริง)
--   4. push_subscriptions ที่ชนกันเมื่อสองบัญชีใช้เครื่องเดียว
-- =====================================================================


-- =====================================================================
-- 1 · รหัสเชิญ
--
-- ⚠️ **ด่านที่อยู่ในหน้าเว็บอย่างเดียวไม่ได้กันอะไรเลย** — anon key อยู่ใน
--    bundle ฝั่งเบราว์เซอร์ที่เปิดดูได้ ใครก็ยิง supabase.auth.signUp()
--    ตรงจากที่ไหนก็ได้โดยไม่ผ่านหน้าจอของเรา · ด่านจริงต้องอยู่ที่ DB
--    ตามหลักเดิมของโปรเจกต์ (ARCHITECTURE.md §2)
--
-- ใช้ครั้งเดียวต่อหนึ่งรหัส · "ถูกใช้แล้ว" = used_by ไม่เป็น null
--
-- ⚠️ used_by เป็น `on delete set null` โดยตั้งใจ — สมัครแล้วพิมพ์อีเมลผิด
--    (ซึ่งจะยืนยันไม่ได้ตลอดกาล) เจ้าของลบบัญชีนั้นทิ้งใน dashboard แล้ว
--    **รหัสกลับมาว่างเอง** ไม่ต้องมานั่งปลดด้วยมือ
-- =====================================================================
create table if not exists public.invite_codes (
  code       text primary key check (char_length(code) between 4 and 64),
  note       text,                                    -- "ให้เพื่อนคนนั้น" · ไว้ให้เจ้าของจำได้
  used_by    uuid references auth.users(id) on delete set null,
  used_at    timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;

-- ⚠️ **ไม่มี policy สักข้อโดยตั้งใจ** — RLS ที่เปิดแล้วไม่มี policy แปลว่า
--    ปิดสนิทสำหรับ anon และ authenticated · ตารางนี้ไม่ควรมีใครอ่านได้เลย
--    เพราะการอ่านได้คือการได้รหัสที่ยังไม่ถูกใช้ไปทั้งกอง
--    เจ้าของแจกรหัสผ่าน Supabase dashboard (ซึ่งใช้ service_role ข้าม RLS)

create index if not exists invite_codes_unused
  on public.invite_codes (created_at) where used_by is null;


-- =====================================================================
-- ตรวจว่ารหัสยังใช้ได้ไหม — **เพื่อข้อความสวย ๆ ไม่ใช่เพื่อกัน**
--
-- ตัวที่กันจริงคือ trigger ข้างล่าง · ฟังก์ชันนี้มีไว้ให้หน้าสมัครบอกได้ว่า
-- "รหัสนี้ใช้ไปแล้ว" ตั้งแต่ก่อนกดส่ง แทนที่จะปล่อยให้ trigger raise
-- แล้วผู้ใช้เจอ "Database error saving new user" ซึ่งอ่านไม่รู้เรื่อง
--
-- ⚠️ คืน **boolean เปล่า ๆ** เท่านั้น ห้ามคืนแถวหรือรายการรหัสเด็ดขาด
--    ไม่งั้นมันจะกลายเป็นเครื่องเดารหัสที่เรายื่นให้เอง
-- =====================================================================
create or replace function public.invite_code_valid(p_code text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invite_codes
     where code = p_code
       and used_by is null
       and (expires_at is null or expires_at > now())
  );
$$;

-- security definer ตัวใหม่ต้องถอนสิทธิ์ก่อนเสมอ แล้วค่อยแจกเท่าที่จำเป็น
-- (กฎเดิม · ARCHITECTURE.md §10) · ที่ให้ anon เพราะ **คนที่ยังไม่มีบัญชี
-- คือคนเดียวที่ต้องเรียกมัน**
revoke all on function public.invite_code_valid(text) from public, anon, authenticated;
grant execute on function public.invite_code_valid(text) to anon, authenticated;


-- =====================================================================
-- 2 · ผู้ใช้ใหม่ — ด่านรหัสเชิญ + seed สี่ Area
--
-- ทำใน trigger เดียวและเป็น **AFTER INSERT** เพราะ exception ที่โยนจาก
-- after trigger ยัง roll back การสร้างบัญชีทั้งใบอยู่ดี · ได้ทั้งการกัน
-- และการ seed ในธุรกรรมเดียว จะไม่มีทางเกิดบัญชีที่ไม่มี Area
--
-- ⚠️ **คีย์สีต้องเป็น class/comp/pers/gen** ให้ตรงกับ AREA_CLASS ใน
--    web/lib/areaColor.ts และ .acard--* ใน globals.css · คีย์ที่ไม่ตรง
--    ไม่ทำให้เกิด error มันแค่ได้การ์ดไม่มีสีเงียบ ๆ (doc/TRAPS.md)
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');
  v_hit  text;
begin
  -- อ้างสิทธิ์รหัสแบบ atomic — เขียน used_by ลงในคำสั่งเดียวกับที่เลือกแถว
  -- เหตุผลเดียวกับ claim_due_reminders() : สองคนกดสมัครด้วยรหัสเดียวกัน
  -- พร้อมกัน ถ้าแยกเป็น select แล้วค่อย update จะผ่านทั้งคู่
  update public.invite_codes
     set used_by = new.id, used_at = now()
   where code = v_code
     and used_by is null
     and (expires_at is null or expires_at > now())
  returning code into v_hit;

  if v_hit is null then
    raise exception 'invite_code_invalid' using errcode = '22023';
  end if;

  insert into public.areas (user_id, name, color, sort_order) values
    (new.id, 'Class',       'class', 0),
    (new.id, 'Competition', 'comp',  1),
    (new.id, 'Personal',    'pers',  2),
    (new.id, 'General',     'gen',   3);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =====================================================================
-- 3 · การเตือนที่ข้ามคน — **บั๊กจริง ไม่ใช่การปรับปรุง**
--
-- ของเดิม: Edge Function นับเครื่องที่สมัครรับ **แบบรวมทุกคน** แล้วถ้ามี
-- อย่างน้อยหนึ่งเครื่องก็เรียก claim_due_reminders() ซึ่งอ้างสิทธิ์
-- **ทุกแถวของทุกคน**
--
-- พอมีคนที่สอง: ถ้า B ลงเครื่องไว้แต่ A ไม่ได้ลง ด่านนั้นผ่าน แล้ว reminder
-- ของ A ถูกเซ็ต notified_at ทิ้งทั้งที่ไม่มีที่ส่ง — **หายถาวร ไม่มี error**
-- เป็นอาการเดียวกับที่ ARCHITECTURE.md §8 ข้อ 4 กันไว้ตั้งแต่ต้น
-- แค่รอบนี้มันข้ามคน
--
-- ⚠️ เงื่อนไขต้องอยู่ **ในคำสั่ง UPDATE เดียวกัน** ห้ามย้ายไปกรองที่
--    Edge Function เพราะนั่นเท่ากับ select แล้วค่อย update ซึ่งทำให้ cron
--    รอบที่ทับกันส่ง push ซ้ำ (doc/TRAPS.md)
-- =====================================================================
create or replace function public.claim_due_reminders()
returns setof public.items
language sql volatile security definer set search_path = public as $$
  update public.items i
     set notified_at = now()
   where i.type = 'reminder'
     and i.notified_at is null
     and i.archived_at is null
     and i.remind_at <= now()
     -- อ้างสิทธิ์เฉพาะของคนที่มีเครื่องรออยู่จริง · ของคนที่ยังไม่ได้ลงเครื่อง
     -- ต้องค้างไว้เฉย ๆ จนกว่าเขาจะลง ไม่ใช่ถูกทำเครื่องหมายว่าส่งแล้ว
     and exists (
       select 1 from public.push_subscriptions s
        where s.user_id = i.user_id and s.enabled
     )
  returning i.*;
$$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;


-- =====================================================================
-- 4 · เครื่องเดียว สองบัญชี
--
-- endpoint เคย unique ทั้งตาราง · ตอนมีคนเดียวถูกต้องเพราะหนึ่ง endpoint
-- คือหนึ่งเบราว์เซอร์ · พอมีสองบัญชีเปิดจากมือถือเครื่องเดียวกัน (ยืมกันดู)
-- คนที่สองกดเปิดแจ้งเตือนจะ upsert ไปชนแถวของคนแรก ซึ่ง RLS มองไม่เห็น
-- แล้วได้ error ที่อ่านไม่ออกว่าเกิดอะไรขึ้น
--
-- unique ที่ถูกคือ (user_id, endpoint) — เครื่องเดิมของ *คนเดิม* กดซ้ำ
-- ให้ทับของเดิม ส่วนคนละคนถือคนละแถวได้
-- =====================================================================
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_key;

create unique index if not exists push_subscriptions_owner_endpoint
  on public.push_subscriptions (user_id, endpoint);
