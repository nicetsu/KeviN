-- KeviN · คำอธิบายของ Area (9 ก.ย. 2026)
--
-- ที่มา: เจ้าของขอ "เพิ่มคำอธิบายของแต่ละ area เวลาเพิ่ม project โมเดลจะได้เลือกถูก
-- ว่าจะใส่ใน area ไหน" · คู่กับ tool อ่าน `areas` และ `propose_add_project`
--
-- ⚠️ เพดาน 200 ตัวไม่ใช่ของประดับ — ค่านี้ถูกส่งเข้าโมเดล **ทุกครั้งที่เรียก tool
--    `areas`** ช่องที่ไม่มีเพดานคือช่องที่วันหนึ่งมีคนวางเรียงความลงไป แล้วจ่าย
--    โทเคนทุกคำขอตลอดไปโดยไม่มีอะไรฟ้อง

alter table public.areas add column if not exists description text;

alter table public.areas drop constraint if exists area_desc_len;
alter table public.areas add constraint area_desc_len
  check (description is null or char_length(description) <= 200);
