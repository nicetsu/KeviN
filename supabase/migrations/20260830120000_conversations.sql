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
