-- ข้อมูลทดสอบของบทที่ 2  *** ไม่ใช่ข้อมูลจริง ***
-- ทุกหน่วยมีชื่อขึ้นต้นด้วย "(ทดสอบ)" และรหัสขึ้นต้นด้วย "TEST-"
-- รันหลัง migration ทั้ง 3 ไฟล์ รันซ้ำได้โดยไม่เกิดข้อมูลซ้ำ
-- ลบข้อมูลทดสอบทั้งหมด: ดูคำสั่งท้ายไฟล์

select public.import_org_units($json$
[
  {"code":"TEST-C","name":"(ทดสอบ) ส่วนกลาง","level":"central","sect":"","parent_code":""},

  {"code":"TEST-M-R1","name":"(ทดสอบ) ภาค 1 มหานิกาย","level":"region","sect":"mahanikaya","parent_code":"TEST-C"},
  {"code":"TEST-M-R1-P1","name":"(ทดสอบ) จังหวัด ก มหานิกาย","level":"province","sect":"mahanikaya","parent_code":"TEST-M-R1"},
  {"code":"TEST-M-R1-P2","name":"(ทดสอบ) จังหวัด ข มหานิกาย","level":"province","sect":"mahanikaya","parent_code":"TEST-M-R1"},
  {"code":"TEST-M-R1-P1-D1","name":"(ทดสอบ) อำเภอ ก1 มหานิกาย","level":"district","sect":"mahanikaya","parent_code":"TEST-M-R1-P1"},
  {"code":"TEST-M-R1-P1-D2","name":"(ทดสอบ) อำเภอ ก2 มหานิกาย","level":"district","sect":"mahanikaya","parent_code":"TEST-M-R1-P1"},
  {"code":"TEST-M-R1-P2-D1","name":"(ทดสอบ) อำเภอ ข1 มหานิกาย","level":"district","sect":"mahanikaya","parent_code":"TEST-M-R1-P2"},
  {"code":"TEST-M-R1-P2-D2","name":"(ทดสอบ) อำเภอ ข2 มหานิกาย","level":"district","sect":"mahanikaya","parent_code":"TEST-M-R1-P2"},
  {"code":"TEST-M-R1-P1-D1-S1","name":"(ทดสอบ) ตำบล ก1-1 มหานิกาย","level":"subdistrict","sect":"mahanikaya","parent_code":"TEST-M-R1-P1-D1"},
  {"code":"TEST-M-R1-P1-D1-S2","name":"(ทดสอบ) ตำบล ก1-2 มหานิกาย","level":"subdistrict","sect":"mahanikaya","parent_code":"TEST-M-R1-P1-D1"},
  {"code":"TEST-M-R1-P1-D2-S1","name":"(ทดสอบ) ตำบล ก2-1 มหานิกาย","level":"subdistrict","sect":"mahanikaya","parent_code":"TEST-M-R1-P1-D2"},
  {"code":"TEST-M-R1-P1-D2-S2","name":"(ทดสอบ) ตำบล ก2-2 มหานิกาย","level":"subdistrict","sect":"mahanikaya","parent_code":"TEST-M-R1-P1-D2"},
  {"code":"TEST-M-R1-P2-D1-S1","name":"(ทดสอบ) ตำบล ข1-1 มหานิกาย","level":"subdistrict","sect":"mahanikaya","parent_code":"TEST-M-R1-P2-D1"},
  {"code":"TEST-M-R1-P2-D1-S2","name":"(ทดสอบ) ตำบล ข1-2 มหานิกาย","level":"subdistrict","sect":"mahanikaya","parent_code":"TEST-M-R1-P2-D1"},
  {"code":"TEST-M-R1-P2-D2-S1","name":"(ทดสอบ) ตำบล ข2-1 มหานิกาย","level":"subdistrict","sect":"mahanikaya","parent_code":"TEST-M-R1-P2-D2"},
  {"code":"TEST-M-R1-P2-D2-S2","name":"(ทดสอบ) ตำบล ข2-2 มหานิกาย","level":"subdistrict","sect":"mahanikaya","parent_code":"TEST-M-R1-P2-D2"},

  {"code":"TEST-D-R1","name":"(ทดสอบ) ภาค 1 ธรรมยุต","level":"region","sect":"dhammayut","parent_code":"TEST-C"},
  {"code":"TEST-D-R1-P1","name":"(ทดสอบ) จังหวัด ก ธรรมยุต","level":"province","sect":"dhammayut","parent_code":"TEST-D-R1"},
  {"code":"TEST-D-R1-P2","name":"(ทดสอบ) จังหวัด ข ธรรมยุต","level":"province","sect":"dhammayut","parent_code":"TEST-D-R1"},
  {"code":"TEST-D-R1-P1-D1","name":"(ทดสอบ) อำเภอ ก1 ธรรมยุต","level":"district","sect":"dhammayut","parent_code":"TEST-D-R1-P1"},
  {"code":"TEST-D-R1-P1-D2","name":"(ทดสอบ) อำเภอ ก2 ธรรมยุต","level":"district","sect":"dhammayut","parent_code":"TEST-D-R1-P1"},
  {"code":"TEST-D-R1-P2-D1","name":"(ทดสอบ) อำเภอ ข1 ธรรมยุต","level":"district","sect":"dhammayut","parent_code":"TEST-D-R1-P2"},
  {"code":"TEST-D-R1-P2-D2","name":"(ทดสอบ) อำเภอ ข2 ธรรมยุต","level":"district","sect":"dhammayut","parent_code":"TEST-D-R1-P2"},
  {"code":"TEST-D-R1-P1-D1-S1","name":"(ทดสอบ) ตำบล ก1-1 ธรรมยุต","level":"subdistrict","sect":"dhammayut","parent_code":"TEST-D-R1-P1-D1"},
  {"code":"TEST-D-R1-P1-D1-S2","name":"(ทดสอบ) ตำบล ก1-2 ธรรมยุต","level":"subdistrict","sect":"dhammayut","parent_code":"TEST-D-R1-P1-D1"},
  {"code":"TEST-D-R1-P1-D2-S1","name":"(ทดสอบ) ตำบล ก2-1 ธรรมยุต","level":"subdistrict","sect":"dhammayut","parent_code":"TEST-D-R1-P1-D2"},
  {"code":"TEST-D-R1-P1-D2-S2","name":"(ทดสอบ) ตำบล ก2-2 ธรรมยุต","level":"subdistrict","sect":"dhammayut","parent_code":"TEST-D-R1-P1-D2"},
  {"code":"TEST-D-R1-P2-D1-S1","name":"(ทดสอบ) ตำบล ข1-1 ธรรมยุต","level":"subdistrict","sect":"dhammayut","parent_code":"TEST-D-R1-P2-D1"},
  {"code":"TEST-D-R1-P2-D1-S2","name":"(ทดสอบ) ตำบล ข1-2 ธรรมยุต","level":"subdistrict","sect":"dhammayut","parent_code":"TEST-D-R1-P2-D1"},
  {"code":"TEST-D-R1-P2-D2-S1","name":"(ทดสอบ) ตำบล ข2-1 ธรรมยุต","level":"subdistrict","sect":"dhammayut","parent_code":"TEST-D-R1-P2-D2"},
  {"code":"TEST-D-R1-P2-D2-S2","name":"(ทดสอบ) ตำบล ข2-2 ธรรมยุต","level":"subdistrict","sect":"dhammayut","parent_code":"TEST-D-R1-P2-D2"}
]
$json$::jsonb) as inserted_org_units;

-- ปีการศึกษาทดสอบ (วันเริ่มและวันสิ้นสุดเป็นค่าสมมติ)
insert into public.academic_years (year_be, starts_on, ends_on, is_current)
values (2569, date '2026-05-16', date '2027-05-15', true)
on conflict (year_be) do nothing;

-- ---------------------------------------------------------------
-- เมื่อต้องการล้างข้อมูลทดสอบ (ก่อนใช้งานจริง) ให้รันคำสั่งนี้แยกต่างหาก:
--   delete from public.org_units where code like 'TEST-%';
--   delete from public.academic_years where year_be = 2569;
-- (เป็นการลบข้อมูลทดสอบเท่านั้น ข้อมูลจริงให้ใช้การปิดใช้งาน ห้ามลบ)
-- ---------------------------------------------------------------
