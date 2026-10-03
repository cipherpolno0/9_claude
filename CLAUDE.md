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
- บทบาท (roles.key): chief, deputy_chief, secretary, central_staff, admin, education_staff, school_officer, finance_officer, supplies_officer, saraban_officer, quiz_manager, learner เมนูต่อบทบาทอยู่ที่ ROLE_MENUS ใน src/lib/auth/config.ts
- ฟอร์มใช้ชิ้นส่วนจาก src/components/form.tsx (useServerForm, Field, SubmitButton) ข้อความผิดพลาดแปลงด้วย explainError จาก src/lib/errors.ts ตัวเลือกเขตปกครองใช้ src/components/org-unit-picker.tsx
- เมื่อมีตัวเชื่อมต่อ Supabase ในการสนทนา ให้รัน migration ด้วย apply_migration แล้วตรวจ get_advisors (security) ทุกครั้ง และเก็บไฟล์ SQL เดียวกันไว้ใน supabase/migrations/
- ชิ้นส่วนกลาง (เพิ่มในบทที่ 4) ต้องใช้ซ้ำ ห้ามสร้างใหม่: ตาราง = DataTable (src/components/data-table.tsx) คู่กับ parseTableParams และ xlsxResponse (src/lib/data-table.ts); เขตปกครอง = OrgUnitPicker คู่กับ fetchAccessibleUnits(); ไฟล์แนบ = <Attachments entityTable entityId orgUnitId />; แจ้งเตือน = ฟังก์ชันฐานข้อมูล notify_user() (เรียกจากฟังก์ชัน security definer เท่านั้น); ประวัติ = <RecordHistory table rowId />; หน้าพิมพ์ = PrintPage กับ <D> และ useDigits(); วันที่ = thaiDate, thaiDateTime (src/lib/thai.ts)
- คำขอทุกชนิดของทุกระบบใช้เครื่องอนุมัติกลาง: เพิ่มแถวใน request_types (key, code, name, route_levels, start_at_own_unit, decider_roles, central_roles) แล้วเรียก submitRequest / decideRequest / resubmitRequest / cancelRequest จาก src/lib/requests/actions.ts ข้อมูลเฉพาะของคำขอเก็บใน requests.payload หน้ารายละเอียดกลางคือ /app/approvals/[id] เส้นเวลาใช้ RequestTimeline (แบบสาธารณะใช้ข้อมูลจาก public_request_status ซึ่งไม่มีชื่อบุคคลและความเห็น)
- เลขที่คำขอ: [code]-[ปี พ.ศ.]-[ลำดับ 4 หลัก] ออกโดย submit_request เท่านั้น
- ชื่อบุคคลที่เกี่ยวกับคำขอให้อ่านผ่าน request_people(request_id) ห้ามเปิด RLS ของ profiles เพิ่ม (กันอีเมลและเบอร์ติดต่อรั่ว)
- ตาราง audit_logs อ่านได้เฉพาะผู้ดูแลระบบ ตารางใหม่ทุกตารางที่เก็บข้อมูลงานต้องผูก trigger audit_row_change()
- เครื่องของผู้สั่งงานใช้พอร์ต 3001 (กำหนดใน package.json: npm run dev) ที่อยู่ทดสอบคือ http://localhost:3001 และต้องตรงกับ URL Configuration ใน Supabase

@AGENTS.md
