-- ข้อมูลทดสอบของบทที่ 6: ประเภทตำแหน่ง จศป. (ชื่อขึ้นต้นด้วย TEST- ทั้งหมด)
-- รายชื่อจริงให้ผู้ดูแลระบบเพิ่มที่หน้า ผู้ดูแลระบบ > ประเภทตำแหน่ง จศป. แล้วปิดใช้งานรายการ TEST-
insert into public.education_position_types (track, name, sort_order) values
  ('dhamma',     'TEST-ตำแหน่ง ก (แผนกธรรม)', 10),
  ('dhamma',     'TEST-ตำแหน่ง ข (แผนกธรรม)', 20),
  ('pali',       'TEST-ตำแหน่ง ก (แผนกบาลี)', 10),
  ('pali',       'TEST-ตำแหน่ง ข (แผนกบาลี)', 20),
  ('general',    'TEST-ตำแหน่ง ก (แผนกสามัญ)', 10),
  ('general',    'TEST-ตำแหน่ง ข (แผนกสามัญ)', 20),
  ('supervisor', 'TEST-ตำแหน่ง ก (ปริยัตินิเทศก์)', 10),
  ('supervisor', 'TEST-ตำแหน่ง ข (ปริยัตินิเทศก์)', 20)
on conflict (track, name) do nothing;
