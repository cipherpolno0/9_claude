# วิธีเพิ่มบทบาทและชนิดคำขอ

ทุกการเปลี่ยนโครงสร้างทำด้วยไฟล์ migration ใหม่ใน `supabase/migrations/` (ห้ามแก้ไฟล์ที่รันไปแล้ว) รันกับชุดทดสอบก่อน แล้วจึงชุดใช้งานจริง
อ่าน `CLAUDE.md` หมวดหมายเหตุทางเทคนิคก่อนเริ่ม

## 1. เพิ่มบทบาท

บทบาทอยู่ที่ตาราง `roles` (รหัส `key` เป็นอังกฤษ snake_case) สิทธิ์ของบทบาทมี 3 ส่วน: เมนูที่เห็น (`role_menus`), ขอบเขตต่อระบบ (คอลัมน์ `*_view` / `*_edit` ใน `roles`), และสิทธิ์พิเศษที่ฟังก์ชันตรวจด้วย `has_role('key')`

### ขั้นตอน

1. migration ใหม่:
   ```sql
   insert into public.roles (key, name, requires_org_unit, mfa_required, sort_order,
                             personnel_view, personnel_edit, places_view, places_edit, venues_view, venues_edit,
                             budget_view, budget_edit, inventory_view, inventory_edit, docs_view, docs_edit, docs_command)
   values ('exam_officer', 'เจ้าหน้าที่สอบ', true, false, 120,
           'none', 'none', 'subtree', 'none', 'subtree', 'none', 'none', 'none', 'none', 'none', 'none', 'none', false);
   -- เมนู: ต้องมีแถวครบทุกเมนูของพื้นที่ทำงาน (enabled = true เฉพาะที่ให้เห็น)
   insert into public.role_menus (role_key, menu_href, enabled)
   select 'exam_officer', m.menu_href, m.menu_href in ('/app/exams', '/app/places')
   from (select distinct menu_href from public.role_menus) m;
   ```
   ค่าขอบเขต: `none` ไม่ได้ / `own` หน่วยตน / `subtree` หน่วยตนและใต้สังกัด / `all` ทุกเขต (แก้ไขกว้างกว่าดูไม่ได้ ระบบตรวจด้วย check constraint) สารบรรณมีเพียง `none` / `own`
2. ถ้าให้ยื่นขอบัญชีเองได้: เพิ่มรหัสใน `REQUESTABLE_ROLES` (`src/lib/auth/config.ts`)
3. ถ้าบทบาทต้องได้สิทธิ์พิเศษ (เช่น จัดการรอบสอบ) แก้ฟังก์ชันตรวจสิทธิ์ในฐานข้อมูลด้วย `create or replace function` และค่าคงที่ฝั่งหน้าเว็บที่ต้องตรงกัน เช่น `can_manage_exam_rounds()` คู่กับ `EXAM_ROUND_MANAGER_ROLES`, `can_manage_quiz()` คู่กับ `QUIZ_MANAGER_ROLES`, `can_manage_site_content()` คู่กับ `SITE_CONTENT_ROLES`
4. ทดสอบ: สร้างบัญชีทดสอบบทบาทนี้ในชุดทดสอบ ตรวจเมนูที่เห็น และรัน `scripts/security/rls_matrix.py` + `rls_report.py` ต้องไม่พบการเห็นข้ามสาย
5. หลังรัน migration ผู้ดูแลระบบปรับเมนูและขอบเขตต่อได้เองที่ ผู้ดูแลระบบ > สิทธิ์ตามบทบาท โดยไม่ต้องแก้โค้ด

ห้าม: ตัดสินสิทธิ์ทะเบียนบุคคล สถานที่ สนามสอบ งบ พัสดุ ด้วยชื่อบทบาทตายตัว ให้ใช้ `can_view_*` / `can_edit_*` ที่อ่านขอบเขตจากตาราง `roles`

## 2. เพิ่มชนิดคำขอ

คำขอทุกชนิดใช้เครื่องอนุมัติกลางชุดเดียว (`requests`, `request_steps`, `request_events`) ชนิดคำขออยู่ที่ตาราง `request_types`

| คอลัมน์ | ความหมาย |
|---|---|
| `key` | รหัสอังกฤษ snake_case |
| `code` | ตัวอักษรนำหน้าเลขที่คำขอ เช่น `ESTAB` → ESTAB-2569-0001 (A-Z 0-9) |
| `name` | ชื่อที่แสดง |
| `route_levels` | ชั้นที่ต้องผ่านตามลำดับ จาก `subdistrict, district, province, region, central` |
| `start_at_own_unit` | เริ่มพิจารณาที่หน่วยของคำขอเอง (true) หรือหน่วยเหนือ 1 ชั้น (false) |
| `decider_roles` | บทบาทที่พิจารณาในชั้นตำบลถึงภาค เช่น `{chief,deputy_chief}` |
| `central_roles` | บทบาทที่พิจารณาชั้นส่วนกลาง เช่น `{central_staff}` |
| `max_steps` | จำกัดจำนวนขั้น (ว่าง = ตาม route_levels) |
| `is_personnel` | คำขอมีข้อมูลส่วนบุคคล = เห็นเฉพาะผู้ยื่น เจ้าของประวัติ และผู้มีสิทธิ์ดูทะเบียนบุคคลในเส้นทาง และไม่แสดงในหน้าสาธารณะ ติดตามคำขอ |

### แบบง่าย (ไม่มีข้อมูลเฉพาะที่ต้องตรวจในฐานข้อมูล)

1. migration: `insert into public.request_types (key, code, name, route_levels, start_at_own_unit, decider_roles, central_roles, is_personnel) values (...)`
2. หน้าเว็บเรียก `submitRequest` / `decideRequest` / `resubmitRequest` / `cancelRequest` จาก `src/lib/requests/actions.ts` ข้อมูลเฉพาะเก็บใน `requests.payload`
3. หน้ารายละเอียดใช้หน้ากลาง `/app/approvals/[id]` (เพิ่มส่วนแสดง payload ตาม `type_key` ถ้าต้องการ)

### แบบมีกติกาเฉพาะ (ตัวอย่างที่มีอยู่: คำขอจัดตั้งสำนัก บทที่ 15, คำขอใช้งบ บทที่ 23, ใบเบิก บทที่ 25)

1. เขียนฟังก์ชัน `submit_<ชนิด>` / `resubmit_<ชนิด>` แบบ security definer ที่ตรวจสิทธิ์ผู้ยื่นและข้อมูลเอง แล้วเรียก `private.create_request`
2. trigger กันการยื่นหรือแก้ payload จากฟังก์ชันกลาง (ดูตัวอย่าง `requests_guard_place_request` ที่ดูค่า `app.place_request`)
3. งานหลังอนุมัติใช้ trigger บน `requests` เมื่อ `status` เปลี่ยนเป็น `approved` (ตัวอย่าง `apply_place_request`)
4. ถ้าไม่ใช้ `can_access` เป็นเงื่อนไขการเห็น เพิ่มกรณีใน policy `requests_read` และ `private.request_visible` ให้ตรงกัน (ใช้ `alter policy` ไม่ใช้ drop)
5. ถ้าต้องอ้างอิงเลขหนังสือสารบรรณ เพิ่มชนิดใน `private.doc_linkable_request_type`
6. ถ้าต้องแนบเอกสารตามระเบียบ ผู้ดูแลระบบกำหนดรายการเองที่ ผู้ดูแลระบบ > รายการเอกสารของคำขอ (ห้ามเดาชื่อเอกสารใส่ในโค้ด)

### ทดสอบ

ยื่น > พิจารณาทีละชั้น (เห็นชอบ ส่งกลับ ส่งใหม่ ไม่เห็นชอบ) > ตรวจแจ้งเตือน เส้นเวลา ประวัติการแก้ไข และหน้า /track (ถ้าไม่ใช่คำขอส่วนบุคคล)
