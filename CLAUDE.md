# โครงการ: เว็บไซต์กองบริหารทะเบียนและวัดผล
เว็บรวม 9 ระบบงานการศึกษาและการปกครองคณะสงฆ์ไว้ในเว็บเดียว
ผู้สั่งงานไม่ใช่โปรแกรมเมอร์ ให้อธิบายด้วยภาษาง่าย

## เทคโนโลยี
- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui ฟอนต์ Sarabun
- Supabase: PostgreSQL, Auth, Storage, Row Level Security (RLS)
- ExcelJS สำหรับอ่านและสร้างไฟล์ Excel
- เอกสารพิมพ์ใช้หน้า HTML แบบ print แล้วบันทึกเป็น PDF จากเบราว์เซอร์
- Deploy บน Vercel

## โครงสร้างเว็บ
- โซนสาธารณะ: เส้นทาง /... ไม่ต้องล็อกอิน
- โซนพื้นที่ทำงาน: เส้นทาง /app/... ต้องล็อกอิน
- เมนูสาธารณะ 7 เมนู: หน้าแรก, ทะเบียน, สอบธรรมสนามหลวง, ติดตามคำขอ, คลังข้อสอบ, ดาวน์โหลด, ติดต่อเรา
- เมนูพื้นที่ทำงาน 9 เมนู: แดชบอร์ด, บุคลากร, ทะเบียนสถานที่, สมัครสอบและผลสอบ, คำขอ, คลังข้อสอบ, สารบรรณ, งบประมาณ, พัสดุ-ครุภัณฑ์
- แถบข้างของพื้นที่ทำงานจัดเมนูเป็น 3 กลุ่ม: บุคคลและทะเบียน (บุคลากร, ทะเบียนสถานที่, คำขอ) / การสอบและการเรียน (สมัครสอบและผลสอบ, คลังข้อสอบ) / งานสำนักงาน (สารบรรณ, งบประมาณ, พัสดุ-ครุภัณฑ์)
- เมนู ผู้ดูแลระบบ แสดงเฉพาะผู้ดูแล ที่ /app/admin
- ติดต่อเรา ดาวน์โหลด ข่าวประกาศ เข้าสู่ระบบ แจ้งเตือน มีที่เดียวทั้งเว็บ ห้ามสร้างซ้ำในแต่ละระบบ

## กติกาการทำงาน
1. ทำเฉพาะบทเรียนที่สั่ง ห้ามทำล่วงหน้า
2. ก่อนเขียนโค้ด สรุปแผนเป็นภาษาไทยไม่เกิน 10 บรรทัด แล้วรอคำว่า "ตกลง"
3. ถ้าข้อมูลไม่พอ ให้ถาม ห้ามเดาชื่อแบบฟอร์ม ชื่อตำแหน่ง หรือระเบียบ
4. ข้อความบนหน้าเว็บเป็นภาษาไทยทั้งหมด วันที่แสดงเป็น พ.ศ. ชื่อตารางและคอลัมน์เป็นอังกฤษ snake_case
5. ทุกตารางเปิด RLS สิทธิ์ = บทบาท + เขตปกครอง (เห็นหน่วยตนและหน่วยใต้สังกัด ไม่เห็นข้ามสาย)
6. หน้าสาธารณะห้ามแสดงเลขประจำตัวประชาชน วันเกิด ที่อยู่ส่วนตัว และเบอร์ส่วนตัว
7. เปลี่ยนโครงสร้างฐานข้อมูลด้วยไฟล์ migration เท่านั้น
8. ใช้ชิ้นส่วนกลางที่มีอยู่ ห้ามสร้างตารางข้อมูล ฟอร์ม หรือระบบอนุมัติซ้ำ
9. ทุกการเพิ่ม แก้ไข ลบ ต้องบันทึกใน audit_logs
10. ห้ามลบข้อมูลจริง ให้ปิดใช้งานแทน (soft delete)
11. จบบท: สรุปสิ่งที่ทำ รายชื่อไฟล์ที่เปลี่ยน วิธีทดสอบทีละขั้น แล้ว commit ด้วยข้อความ "บทที่ N: ..."

## หมายเหตุทางเทคนิค (เพิ่มในบทที่ 1)
- โครงการใช้ Next.js 16 ซึ่งต่างจากรุ่นก่อน ให้อ่านกติกาใน AGENTS.md ก่อนเขียนโค้ดทุกครั้ง
- ฟอนต์ Sarabun ติดตั้งผ่านแพ็กเกจ @fontsource/sarabun (เก็บไฟล์ฟอนต์ไว้ในโครงการ ไม่ดึงจากภายนอก)
- รายการเมนูทั้งหมดอยู่ที่ src/lib/site.ts ที่เดียว โทนสีอยู่ที่ src/app/globals.css ที่เดียว
- ฐานข้อมูล (เพิ่มในบทที่ 2): migration อยู่ที่ supabase/migrations/ ตั้งชื่อ YYYYMMDDHHMMSS_ชื่อ.sql ผู้สั่งงานรันเองใน SQL Editor ของ Supabase ตามลำดับ ห้ามแก้ไฟล์ที่รันไปแล้ว ให้เพิ่มไฟล์ใหม่
- ตารางใหม่ทุกตารางให้ผูก trigger audit_row_change() และ set_updated_at() ที่มีอยู่แล้ว
- org_units: ระดับ central > region > province > district > subdistrict, sect = mahanikaya / dhammayut (ส่วนกลางไม่มีนิกาย) ใช้ฟังก์ชัน descendants_of(id) หาหน่วยใต้สังกัด
- สิทธิ์ (เพิ่มในบทที่ 3): ทุกหน้าใน /app ต้องเรียกด่านตรวจจาก src/lib/auth/guards.ts เป็นบรรทัดแรก (requireMenu, requireAdmin, requireAccountManager หรือ requireWorkspace) เพราะ layout ไม่ถูกเรียกซ้ำเมื่อเปลี่ยนหน้า
- อ่านเขียนข้อมูลด้วย createClient() จาก src/lib/supabase/server.ts (ทำงานในนามผู้ใช้ อยู่ใต้ RLS) ห้ามใช้ createAdminClient() (secret key) ยกเว้นงานที่ทำในนามผู้ใช้ไม่ได้ และต้องเขียนเหตุผลกำกับ
- RLS ของตารางใหม่ให้ใช้ฟังก์ชัน can_access(org_unit_id) และ has_role('ชื่อบทบาท') การเขียนที่มีกติกาซับซ้อนให้ทำเป็นฟังก์ชันฐานข้อมูลแบบ security definer ที่ตรวจสิทธิ์ภายใน และ revoke execute จาก public, anon
- บทบาท (roles.key): chief, deputy_chief, secretary, central_staff, admin, education_staff, school_officer, finance_officer, supplies_officer, saraban_officer, quiz_manager, learner เมนูต่อบทบาทอยู่ในตาราง role_menus (ดูหัวข้อ สิทธิ์ตามบทบาท ด้านล่าง)
- ฟอร์มใช้ชิ้นส่วนจาก src/components/form.tsx (useServerForm, Field, SubmitButton) ข้อความผิดพลาดแปลงด้วย explainError จาก src/lib/errors.ts ตัวเลือกเขตปกครองใช้ src/components/org-unit-picker.tsx
- เมื่อมีตัวเชื่อมต่อ Supabase ในการสนทนา ให้รัน migration ด้วย apply_migration แล้วตรวจ get_advisors (security) ทุกครั้ง และเก็บไฟล์ SQL เดียวกันไว้ใน supabase/migrations/
- ชิ้นส่วนกลาง (เพิ่มในบทที่ 4) ต้องใช้ซ้ำ ห้ามสร้างใหม่: ตาราง = DataTable (src/components/data-table.tsx) คู่กับ parseTableParams และ xlsxResponse (src/lib/data-table.ts); เขตปกครอง = OrgUnitPicker คู่กับ fetchAccessibleUnits(); ไฟล์แนบ = <Attachments entityTable entityId orgUnitId />; แจ้งเตือน = ฟังก์ชันฐานข้อมูล notify_user() (เรียกจากฟังก์ชัน security definer เท่านั้น); ประวัติ = <RecordHistory table rowId />; หน้าพิมพ์ = PrintPage กับ <D> และ useDigits(); วันที่ = thaiDate, thaiDateTime (src/lib/thai.ts)
- คำขอทุกชนิดของทุกระบบใช้เครื่องอนุมัติกลาง: เพิ่มแถวใน request_types (key, code, name, route_levels, start_at_own_unit, decider_roles, central_roles) แล้วเรียก submitRequest / decideRequest / resubmitRequest / cancelRequest จาก src/lib/requests/actions.ts ข้อมูลเฉพาะของคำขอเก็บใน requests.payload หน้ารายละเอียดกลางคือ /app/approvals/[id] เส้นเวลาใช้ RequestTimeline (แบบสาธารณะใช้ข้อมูลจาก public_request_status ซึ่งไม่มีชื่อบุคคลและความเห็น)
- เลขที่คำขอ: [code]-[ปี พ.ศ.]-[ลำดับ 4 หลัก] ออกโดย submit_request เท่านั้น
- ชื่อบุคคลที่เกี่ยวกับคำขอให้อ่านผ่าน request_people(request_id) ห้ามเปิด RLS ของ profiles เพิ่ม (กันอีเมลและเบอร์ติดต่อรั่ว)
- ตาราง audit_logs อ่านได้เฉพาะผู้ดูแลระบบ ตารางใหม่ทุกตารางที่เก็บข้อมูลงานต้องผูก trigger audit_row_change()
- ทะเบียนบุคคล (เพิ่มในบทที่ 5): ตาราง persons, position_types, appointments  สิทธิ์ใช้ can_view_personnel(org_unit_id) / can_edit_personnel(org_unit_id) / can_view_person(person_id) (ขอบเขตตามค่าตั้งของแต่ละบทบาท ดูหัวข้อ สิทธิ์ตามบทบาท) ห้ามใช้ can_access กับข้อมูลบุคคล
- persons เขียนผ่านฟังก์ชัน save_person / set_person_active / import_persons เท่านั้น อ่านต้องระบุคอลัมน์ด้วย PERSON_COLUMNS (src/lib/persons.ts) ห้าม select * เพราะคอลัมน์ national_id_enc และ national_id_hash ไม่เปิดให้อ่าน
- เลขประจำตัวประชาชน: เข้ารหัสด้วย pgcrypto กุญแจอยู่ใน Supabase Vault ชื่อ national_id_key (ห้ามลบหรือเปลี่ยน) หน้าเว็บ ไฟล์ส่งออก และประวัติการแก้ไข แสดงได้เฉพาะ 4 ตัวท้าย ยังไม่มีฟังก์ชันถอดรหัสให้เรียกผ่าน API
- appointments: หนึ่งแถว = หนึ่งวาระ ห้ามแก้บุคคล ตำแหน่ง หรือหน่วยของแถวเดิม พ้นตำแหน่งให้ใส่ ended_on + end_reason บันทึกผิดให้ปิด is_active  กติกาจำนวนต่อหน่วยอยู่ใน trigger appointments_check และ position_types.max_per_unit (ว่าง = ไม่จำกัด แก้ที่หน้า บทบาทและค่าตั้ง)
- พรรษา อายุ ไม่เก็บในฐานข้อมูล คำนวณด้วย phansaOf / ageOf ใน src/lib/persons.ts (พรรษานับโดยประมาณ: อุปสมบทก่อน 1 ส.ค. และพ้น 31 ต.ค. ของปีนั้น)
- ชิ้นส่วนกลางที่เพิ่มในบทที่ 5 ต้องใช้ซ้ำ: ช่องวันที่ พ.ศ. = ThaiDateInput (src/components/thai-date-input.tsx); นำเข้า Excel = ImportDialog (src/components/import-dialog.tsx) คู่กับ readUploadedSheet และ workbookResponse (src/lib/excel.ts); ประวัติของผู้ใช้ที่ไม่ใช่ผู้ดูแลระบบ = ฟังก์ชันฐานข้อมูลที่ตรวจสิทธิ์เอง + <HistoryList logs labels format />
- ไฟล์แนบของข้อมูลบุคคลใช้ entity_table = persons / person_photos / appointments / education_staff เขตปกครองของไฟล์ถูกกำหนดจากรายการที่แนบโดย trigger
- apply_migration ของตัวเชื่อมต่อ Supabase เคยหมดเวลา 2 ครั้งกับไฟล์ที่มี drop policy และผ่านเมื่อเปลี่ยนเป็น alter policy (คาดว่าคำสั่ง drop ต้องรอผู้ใช้ยืนยัน) การแก้ policy จึงให้ใช้ alter policy
- ทะเบียน จศป. (เพิ่มในบทที่ 6): ตาราง education_position_types (ตั้งค่าที่ /app/admin/education-positions) และ education_staff (หนึ่งแถว = บุคคล + แท่ง + สำนัก; แท่ง = dhamma, pali, general, supervisor; ป้ายชื่ออยู่ที่ src/lib/education.ts) สิทธิ์ใช้ชุดเดียวกับทะเบียนบุคคล ห้ามแก้ person_id และ track ของแถวเดิม บันทึกผิดให้ปิด is_active
- persons.user_id ผูกบัญชีผู้ใช้กับบุคคล (ฟังก์ชัน link_person_user) เจ้าของบัญชีเห็นประวัติของตนเองได้ผ่าน can_view_person และหน้า /app/me (ลิงก์อยู่บนแถบบน) แต่แก้ไขเองไม่ได้ ต้องยื่นคำขอ
- คำขอแก้ไขประวัติ = ชนิดคำขอ profile_edit (เลขที่ EDIT-ปี-ลำดับ) ยื่นด้วยฟังก์ชัน submit_profile_edit เท่านั้น พิจารณาขั้นเดียวที่เขตปกครองของบุคคล โดย secretary / chief / deputy_chief ของเขตนั้น เมื่ออนุมัติ trigger apply_profile_edit แก้ persons ให้อัตโนมัติ ช่องที่ขอแก้ได้อยู่ที่ PROFILE_EDIT_FIELDS (src/lib/persons.ts) และต้องตรงกับ private.clean_profile_changes ในฐานข้อมูล
- เครื่องอนุมัติกลาง (ขยายในบทที่ 6): request_types.max_steps จำกัดจำนวนขั้น; ระบบที่ต้องตรวจสิทธิ์ผู้ยื่นเอง (ไม่ใช้ can_access) ให้เขียนฟังก์ชัน security definer ของตนแล้วเรียก private.create_request; คำขอที่มีข้อมูลส่วนบุคคลต้องเพิ่มเงื่อนไขใน policy requests_read (ดูตัวอย่าง profile_edit); การทำงานหลังอนุมัติให้ใช้ trigger บน requests เมื่อ status เปลี่ยนเป็น approved; หน้า /app/approvals/[id] แสดงส่วนเฉพาะชนิดคำขอตาม type_key และส่ง extraPayload ให้ RequesterActions เพื่อไม่ให้ข้อมูลหายเมื่อส่งใหม่
- ไฟล์แนบ: ชื่อตารางข้อมูลบุคคลรวมอยู่ที่ฟังก์ชัน is_personnel_entity() (เพิ่มตารางใหม่ให้ create or replace ฟังก์ชันนี้และ attachments_personnel_unit) ไฟล์แนบของคำขอ (entity_table = requests) เห็นได้เมื่อเห็นคำขอนั้น และแนบได้เฉพาะผู้ยื่น
- บัญชีทดสอบมี 6 บัญชี (เพิ่ม test.jsp@example.com บทบาท education_staff ที่ตำบล ก1-1) ข้อมูลทดสอบประเภทตำแหน่ง จศป. อยู่ที่ supabase/seed_test_education.sql (ชื่อขึ้นต้นด้วย TEST-)
- ช่องฟอร์มที่มีหลายชุดในหน้าเดียวให้ส่ง id ให้ Field (เช่น id={`e${item.id}-subjects`}) รหัสต้องไม่ขึ้นต้นด้วยตัวเลข
- สถานะบุคคล (บทที่ 7): persons.status = active ปฏิบัติหน้าที่ / transfer_pending อยู่ระหว่างขอย้าย / transferred ย้ายแล้ว / resigned ลาออก / deceased มรณภาพ (บรรพชิต) หรือ ตาย (คฤหัสถ์) / disrobed ลาสิกขา / removed_other พ้นตำแหน่งด้วยเหตุอื่น แสดงผลด้วย personStatusLabel(status, person_type) สถานะของบุคคลที่มีอยู่แล้วเปลี่ยนผ่านคำขอหรือการแจ้งเท่านั้น (save_person ยอมให้เฉพาะผู้ดูแลระบบแก้ตรง)
- คำขอเปลี่ยนสถานะ (บทที่ 7): ชนิดคำขอ transfer (MOVE), resign (RESIGN), death_notice (DEATH), disrobe_notice (DISROBE), other_exit_notice (EXIT) ยื่นด้วยฟังก์ชัน submit_status_request(person_id, type, data) เท่านั้น ป้ายชื่ออยู่ที่ src/lib/status.ts ฟอร์มกลางคือ StatusRequestForm (src/app/app/personnel/status-request-form.tsx) ใช้ทั้งแท็บ สถานะ และหน้า /app/me
- เส้นทาง: ขอย้าย = สายต้นทางขึ้นถึงหน่วยร่วม แล้วลงสายปลายทาง (ห้ามข้ามนิกาย เจ้าคณะหรือรองเจ้าคณะพิจารณา); ลาออก = ต้นสังกัดขึ้นไปถึงภาค; การแจ้ง 3 ชนิด = ขั้นเดียวที่หน่วยเหนือ 1 ชั้น (เจ้าคณะ รองเจ้าคณะ เลขานุการ กด "รับทราบ" ถ้าหน่วยเหนือคือส่วนกลาง = central_staff) และต้องมีไฟล์แนบจึงรับทราบได้
- เมื่ออนุมัติหรือรับทราบ trigger apply_status_request ปิดวาระใน appointments และ education_staff (วันที่มีผลล่วงหน้าได้) เปลี่ยนสถานะ เพิ่มแถวใน status_changes (ตารางนี้ระบบเขียนเท่านั้น) และแจ้งเตือน chief / deputy_chief / secretary ของหน่วยที่ตำแหน่งว่างและหน่วยเหนือ 1 ชั้น ย้ายสำเร็จแล้วบุคคลไปสังกัดหน่วยปลายทางและสถานะกลับเป็น active
- เครื่องอนุมัติกลาง (ขยายในบทที่ 7): request_types.is_personnel = คำขอที่มีข้อมูลส่วนบุคคล (policy requests_read ให้เห็นเฉพาะผู้ยื่น เจ้าของประวัติ และผู้มีสิทธิ์ดูทะเบียนบุคคลของหน่วยในเส้นทาง); private.create_request มีแบบ 5 ค่า รับเส้นทางกำหนดเอง (uuid[]); ผู้ที่เป็นเจ้าของประวัติของคำขอ (payload.person_id) พิจารณาคำขอนั้นไม่ได้; คำขอเรื่องสถานะแก้ payload ได้เฉพาะ detail เมื่อส่งใหม่; หน้า /app/approvals/[id] ใช้ approveLabel / allowReject ของ DecisionForm และ approvedLabel ของ RequestTimeline สำหรับการแจ้ง
- OrgUnitPicker มี autoSelect (ค่าเริ่มต้น true) ให้ปิดเมื่อผู้ใช้ต้องตั้งใจเลือกหน่วยเอง เช่น หน่วยปลายทางของคำขอย้าย รายการเขตปกครองทั้งนิกายใช้ fetchUnitsOfSect() (src/lib/status-server.ts)
- alter table ... drop constraint ผ่าน apply_migration ได้ตามปกติ (ที่เคยค้างคือ drop policy)
- apply_migration ค้างเช่นกันเมื่อ SQL มีคำว่า drop table หรือสร้างตารางชั่วคราว แม้อยู่ในตัวฟังก์ชัน (บทที่ 9) จึงให้เขียนฟังก์ชันโดยไม่ใช้ตารางชั่วคราว เช่นอ่านจาก jsonb_to_recordset โดยตรง
- ข้อมูลเขตการปกครองบ้านเมืองชุดแรก (77 จังหวัด 928 อำเภอ 7,436 ตำบล) โหลดเข้า Supabase จริงแล้วด้วย private.load_civil_areas จาก supabase/seed_civil_areas.sql และตรวจ checksum รายจังหวัดตรงกับต้นทางครบ การโหลดครั้งนั้นสร้าง audit_logs 8,441 แถวที่ไม่มีผู้กระทำ (ระบบ)
- ข้อมูลวัด 2,300 แห่งและองค์กรจากไฟล์ thai-vrp-backup ยังไม่นำเข้า รอให้มีเขตปกครองคณะสงฆ์จริงและนิกายก่อน ผู้ใช้กำหนดว่า: นำเข้าทุกรายการรวมที่ถูกติดธง (ใส่หมายเหตุ) มหาวิทยาลัยสงฆ์เป็นสถานศึกษา สำนักงานพระพุทธศาสนาเป็นองค์กร ไม่เอาศาลากลาง
- ช่องของ DataTable (cells) ที่เป็น JSX ต้องใส่ key ทุกตัว และห้ามใช้ <>...</> (ใส่ key ไม่ได้) ให้ใช้ <div key="..."> แทน มิฉะนั้นโหมด npm run dev จะขึ้นคำเตือน Each child in a list should have a unique "key" prop
- สิทธิ์ตามบทบาท (เพิ่มก่อนบทที่ 8): ผู้ดูแลระบบตั้งเองได้ที่ /app/admin/permissions  เมนู = ตาราง role_menus (role_key, menu_href, enabled); ขอบเขตทะเบียนบุคคล = roles.personnel_view / roles.personnel_edit ค่า none ไม่ได้ / own เฉพาะหน่วยตน / subtree หน่วยตนและใต้สังกัด / all ทุกเขต (แก้ไขกว้างกว่าดูไม่ได้ ผู้ดูแลระบบได้เต็มเสมอ บังคับด้วย check constraint)
- ห้ามเขียนชื่อบทบาทตายตัวเพื่อตัดสินสิทธิ์ของทะเบียนบุคคล ทั้งในฐานข้อมูลและหน้าเว็บ ให้ใช้ can_view_personnel / can_edit_personnel / can_edit_any_personnel() และ ctx.canEditPersonnel, ctx.canViewAllPersonnel (src/lib/auth/session.ts) ระบบใหม่ที่ต้องการขอบเขตแบบเดียวกันให้เพิ่มคอลัมน์ขอบเขตของตนใน roles และเพิ่มช่องในหน้า สิทธิ์ตามบทบาท
- เมนูใหม่ของพื้นที่ทำงานต้องเพิ่มแถวใน role_menus ให้ครบทุกบทบาทด้วย migration (หน้า สิทธิ์ตามบทบาท อ่านรายการเมนูจาก workspaceMenu ใน src/lib/site.ts)
- บทที่ 8 (ตรวจสอบ ผัง ทำเนียบสาธารณะ รายงาน): ไม่มีตารางใหม่ มีแต่ฟังก์ชันอ่าน หน้าใหม่ /app/personnel/lookup, /chart, /reports (+ /export, /print), แดชบอร์ดบนหน้า /app/personnel และหน้าสาธารณะ /directory/officers (ลิงก์จาก /registry)
- เขตที่ผู้ใช้ดูทะเบียนบุคคลได้ = viewable_personnel_units(); หน่วยบนสุดสำหรับตัวเลือกเริ่มต้น = personnel_view_roots() (เห็นทุกเขต = รายชื่อภาค) รายงานและผังรับ p_unit แล้วกรองด้วยชุดนี้เสมอ (ฟังก์ชัน security definer: governance_slots, report_directory, report_education_staff, report_status_summary, personnel_counts) ห้ามเขียนฟังก์ชันรายงานที่ไม่กรองด้วย viewable_personnel_units()
- ตำแหน่งที่ "ดำรงอยู่วันนี้" = is_active และ appointed_on <= วันนี้ และ (ended_on ว่าง หรือ > วันนี้) และบุคคล is_active  ตำแหน่งว่าง = เจ้าคณะไม่มีผู้ดำรง / รองเจ้าคณะและเลขานุการ ไม่มีผู้ดำรง หรือมีน้อยกว่า max_per_unit (คำนวณใน governance_slots.missing)
- รายงานใช้ตารางกลาง ReportTable (src/lib/reports.ts) สร้างด้วย buildReport() ใน src/lib/reports-server.ts ชุดเดียว แล้วแสดงบนจอ (ReportView) ส่งออก Excel (xlsxResponse) และหน้าพิมพ์ (ReportPrintSheet บน PrintPage) รายงานใหม่ของระบบอื่นให้ทำแบบเดียวกัน
- ปีงบประมาณ: ปีงบ 2570 = 1 ต.ค. 2569 – 30 ก.ย. 2570 ใช้ fiscal_year_be(date) ในฐานข้อมูล และ fiscalYearOf / fiscalYearRange ใน src/lib/reports.ts เท่านั้น (รายงานรายปีทุกระบบนับตามปีงบประมาณ)
- ป้ายสีสถานะบุคคลใช้ <StatusBadge status personType /> (src/components/status-badge.tsx) UnitFilter รับ param / currentName / applyLabel / allowClear ใช้เลือกเขตของผังและรายงานได้
- หน้าสาธารณะที่มีชื่อบุคคลต้องอ่านผ่านฟังก์ชัน security definer เฉพาะที่ grant ให้ anon และคืนเฉพาะคอลัมน์ที่เปิดเผยได้ (ตัวอย่าง public_officers: ชื่อ-ฉายา ตำแหน่ง สังกัด สถานะ ไม่มีรหัสบุคคล นามสกุล วันเกิด เบอร์ รูป หมายเหตุ; สถานะ transfer_pending แสดงเป็น active; จำกัด 50 แถวต่อครั้ง) ห้ามเปิด RLS ของ persons / appointments ให้ anon
- PrintPage แปลงเลขในชื่อเอกสาร (title) ตามแบบตัวเลขที่เลือกด้วยแล้ว
- บทที่ 9 (ทะเบียนสถานที่ ระบบที่ 2): ตาราง places (place_type = temple วัด / samnak_rian สำนักเรียน / samnak_sasanasuksa สำนักศาสนศึกษา / school สถานศึกษา / organization องค์กร; status = open เปิดดำเนินการ / dissolved ยุบ / suspended ระงับ; ป้ายชื่ออยู่ที่ src/lib/places.ts) หน้า /app/places (?type=), /new, /[id] (?tab=general|children|files|history), /[id]/edit, /export, /template
- places เขียนตรงผ่าน RLS (insert / update ไม่มี delete) กติกาทั้งหมดอยู่ใน trigger places_rules: ประเภทแก้ไม่ได้; สำนักเรียนและสำนักศาสนศึกษาต้องมี parent_place_id ชี้ไปวัด และใช้นิกายของวัด; วัดและสำนักต้องมีนิกาย; นิกายต้องตรงกับเขตคณะสงฆ์ (org_unit_id บังคับกรอกทุกประเภท); ชื่อซ้ำในอำเภอเดียวกันของประเภทเดียวกันไม่ได้; วัดที่ยังมีสำนักใช้งานอยู่ปิดใช้งานไม่ได้; เลือกตำบลแล้ว อำเภอ จังหวัด รหัสไปรษณีย์ ถูกกำหนดให้
- สิทธิ์ทะเบียนสถานที่: roles.places_view / places_edit (ตั้งที่หน้า สิทธิ์ตามบทบาท) ใช้ can_view_places / can_edit_places / can_edit_any_places() และ ctx.canEditPlaces ค่าเริ่มต้น: admin และ central_staff ทุกเขต/ทุกเขต; secretary ดูและแก้ไขหน่วยตนและใต้สังกัด; chief, deputy_chief, education_staff, school_officer ดูหน่วยตนและใต้สังกัด แก้ไขไม่ได้  หน้า สิทธิ์ตามบทบาท ใช้ setRoleScope(role, area, view, edit) และรายการ AREAS (ปัจจุบัน personnel, places, venues) (เพิ่มระบบใหม่ = เพิ่มคอลัมน์ <area>_view / <area>_edit ใน roles แล้วเพิ่มใน AREAS และ SCOPE_AREAS)
- ชื่อผู้รับผิดชอบของสถานที่อ่านผ่าน place_responsible_name(place_id) (ผู้ดูสถานที่อาจไม่มีสิทธิ์ดูทะเบียนบุคคล) ประวัติการแก้ไขของสถานที่อ่านผ่าน place_history(place_id) ไฟล์แนบใช้ entity_table = places (สิทธิ์ทะเบียนสถานที่ เขตของไฟล์กำหนดโดย trigger)
- เขตการปกครองบ้านเมือง: ตาราง civil_provinces (code 2 หลัก), civil_districts (4 หลัก), civil_subdistricts (6 หลัก + postal_code) ทุกคนอ่านได้ ผู้ดูแลระบบนำเข้าและส่งออกที่ /app/admin/civil-areas (ฟังก์ชัน import_civil_areas) ชุดตั้งต้น 77 / 928 / 7,436 อยู่ที่ supabase/seed_civil_areas.sql (โหลดด้วย private.load_civil_areas) เป็นคนละชุดกับ org_units ของคณะสงฆ์ ห้ามใช้แทนกัน
- ชิ้นส่วนกลางที่เพิ่มในบทที่ 9 ต้องใช้ซ้ำ: ที่อยู่ = <CivilAreaPicker provinces initial /> (ส่ง province_code, district_code, subdistrict_code, postal_code) คู่กับ fetchCivilProvinces(), loadCivilDistricts(), loadCivilSubdistricts(); เลือกรายการด้วยการค้นหา (บุคคล วัด) = <SearchPicker name label search /> ; ป้ายสถานะสถานที่ = <PlaceStatusBadge />; ที่ตั้งแบบข้อความ = placeAddress()
- นำเข้า Excel ของสถานที่: ทีละประเภท หัวคอลัมน์จาก placeImportHeaders(type) ตรวจรูปแบบใน validatePlaceImportRows แล้วตรวจต่อในฐานข้อมูลด้วย check_places_import / import_places (ผิดแถวเดียวไม่บันทึกทั้งชุด; รหัส+ชื่อ+ประเภทตรงกับของเดิม = ข้าม) Server Action ที่ต้องรับค่าเพิ่มให้ใช้ action.bind(null, ค่า) ส่งเข้า ImportDialog
- PostgREST: ความสัมพันธ์ที่ชี้เข้าตารางตัวเองให้เขียน ชื่อเล่น:คอลัมน์(…) เช่น parent:parent_place_id(name, code) (เขียนแบบ places!ชื่อ fk จะไม่พบ)
- แม่แบบ Excel: อย่าตั้งรูปแบบให้คอลัมน์ที่เกินจำนวนหัวคอลัมน์ มิฉะนั้นแถวหัวจะมีช่องว่างเกินและตรวจหัวคอลัมน์ไม่ผ่าน
- สถานะ ยุบ / ระงับ ของสถานที่ยังแก้ตรงในฟอร์มได้ (คำขอจัดตั้งและยุบสำนักเรียนเป็นระบบที่ 4 ในบทหลัง) และยังไม่มีหน้าสาธารณะของทะเบียนสถานที่
- บทที่ 10 (ทะเบียนสนามสอบ ระบบที่ 2): ตาราง exam_venues (venue_type = nak_tham นักธรรม / tham_sueksa ธรรมศึกษา; levels = tri, tho, ek; status = open เปิด / closed ปิด / moved ย้าย + moved_to_venue_id; place_id ชี้ไป places บังคับ) และ venue_officers (ต่อสนามต่อปีการศึกษา role = chair ประธานสนามสอบ / receiver ผู้รับข้อสอบ อย่างละ 1 ด้วย unique index; is_public ค่าเริ่มต้น false; นำออก = ปิด is_active) ป้ายชื่ออยู่ที่ src/lib/venues.ts หน้า /app/places/venues (?year= &f_type= &f_unit= &f_province= &f_status= &f_alert=missing|changed), /new, /[id] (?tab=general|officers|history &year=), /[id]/edit, /report (+ /export, /print) อยู่ในเมนู ทะเบียนสถานที่ (ไม่มีแถว role_menus ใหม่)
- สิทธิ์ทะเบียนสนามสอบแยกจากทะเบียนสถานที่: roles.venues_view / venues_edit ใช้ can_view_venues / can_edit_venues / can_edit_any_venues() และ ctx.canViewVenues, ctx.canEditVenues ค่าเริ่มต้น: admin และ central_staff ทุกเขต/ทุกเขต; secretary ดูและแก้ไขหน่วยตนและใต้สังกัด; chief, deputy_chief ดูหน่วยตนและใต้สังกัด แก้ไขไม่ได้; บทบาทอื่นไม่ได้
- ฟังก์ชันอ่านของสนามสอบเป็น security definer ที่กรองด้วย can_view_venues เอง (ผู้ดูสนามสอบอาจไม่มีสิทธิ์ดูทะเบียนสถานที่หรือทะเบียนบุคคล): list_venues, venue_alerts, venue_detail, venue_officer_rows, venue_history, report_venues คืนเฉพาะชื่อและสถานะของบุคคล ห้ามเขียนฟังก์ชันอ่านสนามสอบที่ไม่กรองด้วย can_view_venues ที่อยู่จัดส่งข้อสอบและเบอร์ติดต่อเป็นข้อมูลภายใน ห้ามแสดงในหน้าสาธารณะ (is_public อนุญาตเฉพาะชื่อ และบทนี้ยังไม่มีหน้าสาธารณะของสนามสอบ)
- เลือกบุคคลเป็นประธานหรือผู้รับข้อสอบได้เฉพาะคนที่ผู้บันทึกมีสิทธิ์ดูในทะเบียนบุคคล (trigger venue_officers_rules; ยกเว้นแถวที่คัดลอกจากปีก่อนซึ่งใช้บุคคลเดิม) เลือกสถานที่ตั้งต้องมีสิทธิ์ดูทะเบียนสถานที่
- คัดลอกจากปีก่อน = copy_venue_officers(p_to_year, p_unit, p_dry_run): ปีก่อน = ปีการศึกษาที่มี year_be มากที่สุดที่น้อยกว่าปีที่เลือก; คัดลอกเฉพาะสนามที่เปิดอยู่และผู้เรียกแก้ไขได้; ไม่เขียนทับบทบาทที่ปีใหม่มีรายชื่อแล้ว; ข้ามบุคคลที่ไม่ใช่ active / transfer_pending หรือถูกปิดใช้งาน; หน้าเว็บเรียกแบบ dry run ให้ดูจำนวนก่อนยืนยัน
- เมื่อ persons เปลี่ยน status, org_unit_id หรือ is_active trigger persons_notify_venue_officers แจ้งเตือนผู้ใช้บทบาท central_staff ทุกคน (ผู้สั่งงานกำหนดว่าแจ้งเฉพาะส่วนกลาง) เฉพาะบุคคลที่เป็นประธานหรือผู้รับข้อสอบของปีการศึกษาปัจจุบันเป็นต้นไป ลิงก์ไปแท็บ officers ของสนามสอบ
- ปีการศึกษา: ผู้ดูแลระบบเพิ่มปีและตั้งปีปัจจุบันที่หน้า บทบาทและค่าตั้ง (/app/admin/settings) ตั้งปีปัจจุบันด้วย set_current_academic_year(id) เท่านั้น (มีปีปัจจุบันได้ปีเดียว) อ่านด้วย fetchAcademicYears() และ pickYear() ใน src/lib/venues-server.ts ระบบสอบในบทหลังให้ใช้ชุดเดียวกัน
- ReportTable มี groupColumn (ลำดับคอลัมน์ที่ใช้แบ่งกลุ่ม เช่น จังหวัด): ReportView และ ReportPrintSheet แสดงเป็นหัวกลุ่ม ส่วน Excel ยังเป็นคอลัมน์ปกติ; kind เป็นข้อความอิสระสำหรับรายงานของระบบอื่น รายงานบัญชีสนามสอบสร้างด้วย buildVenueReport() (เฉพาะสนามที่เปิดอยู่ จังหวัด = จังหวัดบ้านเมืองของสถานที่ตั้ง ที่อยู่จัดส่ง = ของผู้รับข้อสอบ ถ้าว่างใช้ของประธาน)
- ในการทดสอบหน้าเว็บ: Next.js มี <div role="alert" id="__next-route-announcer__"> เสมอ ให้เลือกข้อความผิดพลาดด้วย p[role="alert"]; กล่อง Dialog มีปุ่ม ปิด ของตัวเองอยู่แล้ว 1 ปุ่ม
- เครื่องของผู้สั่งงานใช้พอร์ต 3002 (กำหนดใน package.json: npm run dev) ที่อยู่ทดสอบคือ http://localhost:3002 และต้องตรงกับ URL Configuration ใน Supabase

@AGENTS.md
