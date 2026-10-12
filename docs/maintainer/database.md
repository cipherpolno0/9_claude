# โครงสร้างฐานข้อมูล

สร้างอัตโนมัติด้วย `scripts/ops/db-doc.py` จากฐานข้อมูล (อย่าแก้ไฟล์นี้เอง ให้แก้คำอธิบายใน migration ด้วย `comment on` แล้วสร้างใหม่)

ตารางใน schema public 96 ตาราง · เปิด RLS 96 ตาราง · ฟังก์ชัน (public + private) 509 ฟังก์ชัน

หลักที่ใช้ทั้งระบบ: ทุกตารางเปิด RLS สิทธิ์ = บทบาท + เขตปกครอง / ทุกการเพิ่ม แก้ไข ลบ บันทึกใน `audit_logs` ด้วย trigger `audit_row_change` / ไม่ลบข้อมูลจริง ใช้ `is_active = false` / ข้อมูลที่มีกติกาซับซ้อนเขียนผ่านฟังก์ชัน security definer เท่านั้น / เลขประจำตัวประชาชนเก็บแบบเข้ารหัส (`national_id_enc`) และแฮช (`national_id_hash`) ด้วยกุญแจ Vault `national_id_key`

## สารบัญ

- แกนกลาง: ผู้ใช้ สิทธิ์ เขตปกครอง: `profiles`, `roles`, `user_roles`, `role_menus`, `org_units`, `account_requests`, `access_review_rounds`, `access_review_decisions`, `app_settings`, `audit_logs`, `notifications`, `attachments`
- เครื่องอนุมัติกลาง (คำขอทุกชนิด): `request_types`, `requests`, `request_steps`, `request_events`, `request_counters`, `request_document_types`
- ระบบที่ 1 ทะเบียนบุคคล: `persons`, `position_types`, `appointments`, `status_changes`, `education_position_types`, `education_staff`
- ระบบที่ 2 ทะเบียนสถานที่และสนามสอบ: `civil_provinces`, `civil_districts`, `civil_subdistricts`, `places`, `exam_venues`, `venue_officers`, `exam_venue_changes`
- ระบบที่ 3 คลังข้อสอบและการเรียน: `courses`, `units`, `questions`, `lessons`, `quiz_attempts`
- ระบบที่ 5 และ 9 สมัครสอบ ผลสอบ: `academic_years`, `form_templates`, `form_title_options`, `exam_rounds`, `registration_batches`, `registration_files`, `candidates`, `candidate_code_counters`, `registration_changes`, `exam_results`, `exam_result_changes`, `exam_pass_history`, `exam_result_forms`
- ระบบที่ 6 งบประมาณ: `fiscal_years`, `budget_sources`, `budget_categories`, `budget_items`, `budget_allocations`, `budget_transfers`, `budget_item_changes`, `budget_approval_limits`, `budget_use_requests`, `budget_disbursements`, `budget_year_closings`, `budget_alerts`
- ระบบที่ 7 พัสดุ ครุภัณฑ์: `inventory_categories`, `items`, `warehouses`, `stock_receipts`, `stock_transfers`, `requisitions`, `stock_moves`, `asset_types`, `assets`, `asset_transfers`, `asset_loans`, `asset_repairs`, `asset_counts`, `asset_count_items`
- ระบบที่ 8 สารบรรณ: `documents`, `document_viewers`, `document_deliveries`, `document_routes`, `doc_counters`, `doc_unit_settings`, `document_close_events`, `doc_retention_rules`, `document_request_links`
- หน้าสาธารณะ ติดต่อเรา ข้อมูลส่วนบุคคล ติดตามระบบ: `announcements`, `announcement_files`, `downloads`, `exam_calendar_events`, `site_contact`, `contact_topics`, `contact_topic_recipients`, `contact_messages`, `privacy_texts`, `person_access_logs`, `data_retention_rules`, `app_error_logs`

## แกนกลาง: ผู้ใช้ สิทธิ์ เขตปกครอง

### `profiles`

ข้อมูลผู้ใช้ สถานะ: pending รออนุมัติ / active ใช้งาน / suspended ระงับ / rejected ไม่อนุมัติ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `title_prefix` | text |  |  |
| `first_name` | text |  |  |
| `monastic_name` | text |  |  |
| `last_name` | text |  |  |
| `phone` | text |  |  |
| `email` | text |  |  |
| `status` | text |  |  |
| `status_reason` | text | ได้ |  |
| `activated_at` | timestamp with time zone | ได้ |  |
| `last_seen_at` | timestamp with time zone | ได้ |  |
| `password_changed_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `id` → `auth.users`
RLS: เปิด · policy: profiles_read (SELECT), profiles_read_requesters (SELECT)
trigger: profiles_audit, profiles_set_updated_at

### `roles`

บทบาทของผู้ใช้ เจ้าคณะ รองเจ้าคณะ เลขานุการ ใช้คู่กับระดับของหน่วยที่ผูก

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `key` | text |  |  |
| `name` | text |  |  |
| `requires_org_unit` | boolean |  |  |
| `mfa_required` | boolean |  |  |
| `sort_order` | integer |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `personnel_view` | text |  | ขอบเขตการดูทะเบียนบุคคล: none / own / subtree / all |
| `personnel_edit` | text |  | ขอบเขตการแก้ไขทะเบียนบุคคล: none / own / subtree / all (ไม่กว้างกว่า personnel_view) |
| `places_view` | text |  | ขอบเขตการดูทะเบียนสถานที่: none / own / subtree / all |
| `places_edit` | text |  | ขอบเขตการแก้ไขทะเบียนสถานที่: none / own / subtree / all (ไม่กว้างกว่า places_view) |
| `venues_view` | text |  | ขอบเขตการดูทะเบียนสนามสอบ: none / own / subtree / all |
| `venues_edit` | text |  | ขอบเขตการแก้ไขทะเบียนสนามสอบ: none / own / subtree / all (ไม่กว้างกว่า venues_view) |
| `budget_view` | text |  | ขอบเขตการดูงบประมาณ: none / own / subtree / all |
| `budget_edit` | text |  | ขอบเขตการแก้ไขงบประมาณ: none / own / subtree / all (ไม่กว้างกว่า budget_view) |
| `inventory_view` | text |  | ขอบเขตการดูคลังวัสดุและยื่นใบเบิก: none / own / subtree / all |
| `inventory_edit` | text |  | ขอบเขตการรับเข้า จ่าย โอน ปรับยอด: none / own / subtree / all (ไม่กว้างกว่า inventory_view) |
| `docs_view` | text |  | สารบรรณ: ดูทะเบียนหนังสือของหน่วยตน none / own |
| `docs_edit` | text |  | สารบรรณ: ลงรับ ร่าง ออกเลข ส่ง ยกเลิก ของหน่วยตน none / own (ไม่กว้างกว่า docs_view) |
| `docs_command` | boolean |  | สารบรรณ: สั่งการและมอบหมายผู้ดำเนินการบนหนังสือของหน่วยตน (ต้องดูสารบรรณได้) |

RLS: เปิด · policy: roles_admin_update (UPDATE), roles_read_all (SELECT)
trigger: roles_audit, roles_set_updated_at

### `user_roles`

บทบาทของผู้ใช้ ผูกกับเขตปกครองและช่วงวันที่

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `user_id` | uuid |  |  |
| `role_key` | text |  |  |
| `org_unit_id` | uuid | ได้ |  |
| `starts_on` | date |  |  |
| `ends_on` | date | ได้ |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `org_unit_id` → `org_units`; `role_key` → `roles`; `user_id` → `profiles`
RLS: เปิด · policy: user_roles_read (SELECT)
trigger: user_roles_audit, user_roles_org_unit, user_roles_set_updated_at

### `role_menus`

เมนูพื้นที่ทำงานที่แต่ละบทบาทใช้ได้ (หนึ่งแถว = บทบาท + เมนู) แก้ที่หน้า สิทธิ์ตามบทบาท

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `role_key` | text |  |  |
| `menu_href` | text |  |  |
| `enabled` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `role_key` → `roles`
RLS: เปิด · policy: role_menus_admin_update (UPDATE), role_menus_read (SELECT)
trigger: role_menus_audit, role_menus_set_updated_at

### `org_units`

เขตปกครอง: ส่วนกลาง > ภาค > จังหวัด > อำเภอ > ตำบล แยกนิกาย

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `parent_id` | uuid | ได้ |  |
| `level` | org_level |  |  |
| `sect` | sect | ได้ |  |
| `name` | text |  |  |
| `code` | text |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `parent_id` → `org_units`
RLS: เปิด · policy: org_units_admin_insert (INSERT), org_units_admin_update (UPDATE), org_units_read_all (SELECT)
trigger: org_units_audit, org_units_children, org_units_hierarchy, org_units_set_updated_at

### `account_requests`

คำขอบัญชีผู้ใช้ใหม่ และคำขอเปิดใช้บัญชีที่ถูกระงับ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `kind` | text |  |  |
| `user_id` | uuid |  |  |
| `position_text` | text |  |  |
| `requested_role_key` | text | ได้ |  |
| `org_unit_id` | uuid | ได้ |  |
| `letter_path` | text | ได้ |  |
| `note` | text |  |  |
| `status` | text |  |  |
| `decided_by` | uuid | ได้ |  |
| `decided_at` | timestamp with time zone | ได้ |  |
| `decision_note` | text | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `decided_by` → `profiles`; `org_unit_id` → `org_units`; `requested_role_key` → `roles`; `user_id` → `profiles`
RLS: เปิด · policy: account_requests_read (SELECT)
trigger: account_requests_audit, account_requests_set_updated_at

### `access_review_rounds`

รอบทบทวนสิทธิ์ผู้ใช้ประจำปี

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `year_be` | integer |  |  |
| `opened_at` | timestamp with time zone |  |  |
| `due_on` | date |  |  |
| `closed_at` | timestamp with time zone | ได้ |  |
| `opened_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `opened_by` → `profiles`
RLS: เปิด · policy: access_review_rounds_read (SELECT)
trigger: access_review_rounds_audit, access_review_rounds_set_updated_at

### `access_review_decisions`

ผลยืนยันบัญชีในรอบทบทวน: keep คงไว้ / suspend ระงับ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `round_id` | uuid |  |  |
| `user_id` | uuid |  |  |
| `decision` | text |  |  |
| `decided_by` | uuid | ได้ |  |
| `decided_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `decided_by` → `profiles`; `round_id` → `access_review_rounds`; `user_id` → `profiles`
RLS: เปิด · policy: access_review_decisions_read (SELECT)
trigger: access_review_decisions_audit

### `app_settings`

ค่าตั้งของระบบที่ผู้ดูแลปรับได้

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `key` | text |  |  |
| `value_int` | integer |  |  |
| `description` | text |  |  |
| `updated_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: app_settings_admin_update (UPDATE), app_settings_read_all (SELECT)
trigger: app_settings_audit, app_settings_set_updated_at

### `audit_logs`

ประวัติการเพิ่ม แก้ไข ลบ ของทุกตาราง

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | bigint |  |  |
| `actor_id` | uuid | ได้ |  |
| `action` | text |  |  |
| `table_name` | text |  |  |
| `row_id` | text |  |  |
| `old_data` | jsonb | ได้ |  |
| `new_data` | jsonb | ได้ |  |
| `created_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: audit_logs_admin_read (SELECT)

### `notifications`

แจ้งเตือนในระบบของผู้ใช้แต่ละคน

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `user_id` | uuid |  |  |
| `title` | text |  |  |
| `body` | text |  |  |
| `link` | text | ได้ |  |
| `read_at` | timestamp with time zone | ได้ |  |
| `created_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `user_id` → `profiles`
RLS: เปิด · policy: notifications_mark_own (UPDATE), notifications_read_own (SELECT)

### `attachments`

ไฟล์แนบกลาง: PDF รูปภาพ Excel Word ไม่เกิน 10 MB

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `entity_table` | text |  |  |
| `entity_id` | text |  |  |
| `org_unit_id` | uuid | ได้ |  |
| `storage_path` | text |  |  |
| `file_name` | text |  |  |
| `mime_type` | text |  |  |
| `size_bytes` | bigint |  |  |
| `uploaded_by` | uuid |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `doc_type_id` | uuid | ได้ | รายการเอกสารของคำขอที่ไฟล์นี้แนบให้ (ว่าง = ไฟล์แนบทั่วไป) |

ความสัมพันธ์: `doc_type_id` → `request_document_types`; `org_unit_id` → `org_units`; `uploaded_by` → `profiles`
RLS: เปิด · policy: attachments_insert (INSERT), attachments_read (SELECT), attachments_update (UPDATE)
trigger: attachments_audit, attachments_doc_type_check, attachments_personnel_unit, attachments_set_updated_at

## เครื่องอนุมัติกลาง (คำขอทุกชนิด)

### `request_types`

ชนิดคำขอและเส้นทางอนุมัติ ค่าเริ่มต้น: ตำบล > อำเภอ > จังหวัด > ภาค > ส่วนกลาง

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `key` | text |  |  |
| `code` | text |  |  |
| `name` | text |  |  |
| `route_levels` | org_level[] |  |  |
| `start_at_own_unit` | boolean |  |  |
| `decider_roles` | text[] |  |  |
| `central_roles` | text[] |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `max_steps` | integer | ได้ | จำนวนขั้นพิจารณาสูงสุด นับจากขั้นแรก (ว่าง = ทุกระดับในเส้นทาง) |
| `is_personnel` | boolean |  | คำขอที่มีข้อมูลส่วนบุคคล: เห็นได้เฉพาะผู้ยื่น เจ้าของประวัติ และผู้มีสิทธิ์ดูทะเบียนบุคคลของหน่วยในเส้นทาง |

RLS: เปิด · policy: request_types_admin_update (UPDATE), request_types_read (SELECT)
trigger: request_types_audit, request_types_set_updated_at

### `requests`

คำขอ: pending รอพิจารณา / returned ส่งกลับแก้ไข / approved อนุมัติ / rejected ไม่อนุมัติ / cancelled ยกเลิก

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `type_key` | text |  |  |
| `request_no` | text |  |  |
| `requester_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `title` | text |  |  |
| `payload` | jsonb |  |  |
| `status` | text |  |  |
| `current_step` | integer | ได้ |  |
| `submitted_at` | timestamp with time zone |  |  |
| `decided_at` | timestamp with time zone | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `org_unit_id` → `org_units`; `requester_id` → `profiles`; `type_key` → `request_types`
RLS: เปิด · policy: requests_read (SELECT)
trigger: requests_apply_place_request, requests_apply_profile_edit, requests_apply_status_request, requests_apply_venue_request, requests_audit, requests_guard_asset_disposal, requests_guard_budget_transfer, requests_guard_budget_use, requests_guard_exam_registration, requests_guard_place_request, requests_guard_requisition, requests_lock_status_payload, requests_notify_place_applied, requests_result_notice_draft, requests_set_updated_at, requests_sync_asset_disposal, requests_sync_budget_transfer, requests_sync_budget_use, requests_sync_registration, requests_sync_requisition

### `request_steps`

ขั้นพิจารณา: waiting ยังไม่ถึง / pending รอพิจารณา / approved เห็นชอบ / rejected ไม่เห็นชอบ / returned ส่งกลับแก้ไข

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `request_id` | uuid |  |  |
| `step_no` | integer |  |  |
| `org_unit_id` | uuid |  |  |
| `level` | org_level |  |  |
| `status` | text |  |  |
| `decided_by` | uuid | ได้ |  |
| `comment` | text | ได้ |  |
| `decided_at` | timestamp with time zone | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `pending_since` | timestamp with time zone | ได้ | เวลาที่ขั้นนี้เริ่มรอพิจารณา (ระบบตั้งให้ทุกครั้งที่สถานะเปลี่ยนเป็น pending) |
| `overdue_notified_at` | timestamp with time zone | ได้ | เวลาที่แจ้งเตือนผู้พิจารณาว่าเกินกำหนดครั้งล่าสุด |

ความสัมพันธ์: `decided_by` → `profiles`; `org_unit_id` → `org_units`; `request_id` → `requests`
RLS: เปิด · policy: request_steps_read (SELECT)
trigger: request_steps_audit, request_steps_budget_use_limit, request_steps_mark_pending, request_steps_require_documents, request_steps_set_updated_at

### `request_events`

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | bigint |  |  |
| `request_id` | uuid |  |  |
| `step_no` | integer | ได้ |  |
| `actor_id` | uuid | ได้ |  |
| `action` | text |  |  |
| `comment` | text | ได้ |  |
| `created_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `actor_id` → `profiles`; `request_id` → `requests`
RLS: เปิด · policy: request_events_read (SELECT)

### `request_counters`

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `type_key` | text |  |  |
| `year_be` | integer |  |  |
| `last_no` | integer |  |  |

ความสัมพันธ์: `type_key` → `request_types`
RLS: เปิด · policy: ไม่มี (เขียนผ่านฟังก์ชันเท่านั้น)

### `request_document_types`

รายการเอกสารแนบของแต่ละชนิดคำขอ ผู้ดูแลระบบเพิ่มและแก้ไขได้ รายการที่บังคับต้องแนบก่อนผู้พิจารณาจึงเห็นชอบได้

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `type_key` | text |  |  |
| `name` | text |  |  |
| `is_required` | boolean |  |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `type_key` → `request_types`
RLS: เปิด · policy: request_document_types_admin_insert (INSERT), request_document_types_admin_update (UPDATE), request_document_types_read (SELECT)
trigger: request_document_types_audit, request_document_types_set_updated_at

## ระบบที่ 1 ทะเบียนบุคคล

### `persons`

ทะเบียนบุคคล: บรรพชิตและคฤหัสถ์ สถานะ: active ปฏิบัติหน้าที่ / transfer_pending อยู่ระหว่างขอย้าย / transferred ย้ายแล้ว / resigned ลาออก / deceased มรณภาพหรือตาย / disrobed ลาสิกขา / removed_other พ้นตำแหน่งด้วยเหตุอื่น

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `person_type` | text |  |  |
| `title` | text |  |  |
| `first_name` | text |  |  |
| `monastic_name` | text |  |  |
| `last_name` | text |  |  |
| `birth_date` | date | ได้ |  |
| `national_id_enc` | bytea | ได้ |  |
| `national_id_last4` | text | ได้ |  |
| `national_id_hash` | text | ได้ |  |
| `ordination_date` | date | ได้ |  |
| `nak_tham` | text |  |  |
| `pali_grade` | text |  |  |
| `general_education` | text |  |  |
| `temple_name` | text |  |  |
| `org_unit_id` | uuid |  |  |
| `phone` | text |  |  |
| `status` | text |  |  |
| `note` | text |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `user_id` | uuid | ได้ | บัญชีผู้ใช้ที่ผูกกับบุคคลนี้ (หนึ่งบัญชีต่อหนึ่งบุคคล) |

ความสัมพันธ์: `created_by` → `profiles`; `org_unit_id` → `org_units`; `user_id` → `profiles`
RLS: เปิด · policy: persons_read (SELECT)
trigger: persons_audit, persons_deactivate, persons_move_attachments, persons_notify_venue_officers, persons_set_updated_at

### `position_types`

ประเภทตำแหน่งปกครอง max_per_unit ว่าง = ไม่จำกัดจำนวนต่อหน่วย

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `key` | text |  |  |
| `name` | text |  |  |
| `kind` | text |  |  |
| `level` | org_level |  |  |
| `max_per_unit` | integer | ได้ |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: position_types_admin_update (UPDATE), position_types_read (SELECT)
trigger: position_types_audit, position_types_set_updated_at

### `appointments`

ประวัติการดำรงตำแหน่งปกครอง เก็บทุกวาระ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `person_id` | uuid |  |  |
| `position_type_key` | text |  |  |
| `org_unit_id` | uuid |  |  |
| `appointed_on` | date |  |  |
| `order_no` | text |  |  |
| `ended_on` | date | ได้ |  |
| `end_reason` | text | ได้ |  |
| `end_note` | text |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `org_unit_id` → `org_units`; `person_id` → `persons`; `position_type_key` → `position_types`
RLS: เปิด · policy: appointments_insert (INSERT), appointments_read (SELECT), appointments_update (UPDATE)
trigger: appointments_audit, appointments_rules, appointments_set_updated_at

### `status_changes`

เส้นเวลาสถานะของบุคคล บันทึกโดยระบบเมื่อคำขออนุมัติหรือการแจ้งได้รับทราบ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `person_id` | uuid |  |  |
| `change_type` | text |  |  |
| `effective_on` | date |  |  |
| `reason` | text |  |  |
| `request_id` | uuid | ได้ |  |
| `from_org_unit_id` | uuid | ได้ |  |
| `to_org_unit_id` | uuid | ได้ |  |
| `from_place` | text |  |  |
| `to_place` | text |  |  |
| `status_before` | text |  |  |
| `status_after` | text |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `from_org_unit_id` → `org_units`; `person_id` → `persons`; `request_id` → `requests`; `to_org_unit_id` → `org_units`
RLS: เปิด · policy: status_changes_read (SELECT)
trigger: status_changes_audit, status_changes_set_updated_at

### `education_position_types`

ประเภทตำแหน่งของ จศป. แยกตามแท่ง ผู้ดูแลระบบเพิ่มและแก้ไขได้

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `track` | text |  |  |
| `name` | text |  |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: education_position_types_admin_insert (INSERT), education_position_types_admin_update (UPDATE), education_position_types_read (SELECT)
trigger: education_position_types_audit, education_position_types_set_updated_at

### `education_staff`

ทะเบียน จศป. ทุกแท่ง ผูกกับ persons

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `person_id` | uuid |  |  |
| `track` | text |  |  |
| `position_type_id` | uuid |  |  |
| `school_name` | text |  |  |
| `school_type` | text |  |  |
| `org_unit_id` | uuid |  |  |
| `started_on` | date | ได้ |  |
| `order_no` | text |  |  |
| `subjects` | text |  |  |
| `status` | text |  |  |
| `ended_on` | date | ได้ |  |
| `note` | text |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `org_unit_id` → `org_units`; `person_id` → `persons`; `position_type_id` → `education_position_types`
RLS: เปิด · policy: education_staff_insert (INSERT), education_staff_read (SELECT), education_staff_update (UPDATE)
trigger: education_staff_audit, education_staff_rules, education_staff_set_updated_at

## ระบบที่ 2 ทะเบียนสถานที่และสนามสอบ

### `civil_provinces`

จังหวัด (เขตการปกครองบ้านเมือง) code = รหัส 2 หลัก

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `code` | integer |  |  |
| `name` | text |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: civil_provinces_read_all (SELECT)
trigger: civil_provinces_audit, civil_provinces_set_updated_at

### `civil_districts`

อำเภอและเขต code = รหัส 4 หลัก (2 หลักแรก = รหัสจังหวัด)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `code` | integer |  |  |
| `province_code` | integer |  |  |
| `name` | text |  |  |
| `prefix` | text |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `province_code` → `civil_provinces`
RLS: เปิด · policy: civil_districts_read_all (SELECT)
trigger: civil_districts_audit, civil_districts_set_updated_at

### `civil_subdistricts`

ตำบลและแขวง พร้อมรหัสไปรษณีย์ code = รหัส 6 หลัก (4 หลักแรก = รหัสอำเภอ)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `code` | integer |  |  |
| `district_code` | integer |  |  |
| `name` | text |  |  |
| `prefix` | text |  |  |
| `postal_code` | text |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `district_code` → `civil_districts`
RLS: เปิด · policy: civil_subdistricts_read_all (SELECT)
trigger: civil_subdistricts_audit, civil_subdistricts_set_updated_at

### `places`

ทะเบียนสถานที่: วัด สำนักเรียน สำนักศาสนศึกษา สถานศึกษา องค์กร สำนักเรียนและสำนักศาสนศึกษาผูกกับวัดที่ตั้งด้วย parent_place_id

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `place_type` | text |  |  |
| `code` | text |  |  |
| `name` | text |  |  |
| `sect` | sect | ได้ |  |
| `house_no` | text |  |  |
| `road` | text |  |  |
| `subdistrict_code` | integer | ได้ |  |
| `district_code` | integer | ได้ |  |
| `province_code` | integer | ได้ |  |
| `postal_code` | text |  |  |
| `org_unit_id` | uuid |  |  |
| `latitude` | numeric(9,6) | ได้ |  |
| `longitude` | numeric(9,6) | ได้ |  |
| `office_phone` | text |  |  |
| `email` | text |  |  |
| `responsible_person_id` | uuid | ได้ |  |
| `status` | text |  |  |
| `established_on` | date | ได้ |  |
| `parent_place_id` | uuid | ได้ |  |
| `note` | text |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `district_code` → `civil_districts`; `org_unit_id` → `org_units`; `parent_place_id` → `places`; `province_code` → `civil_provinces`; `responsible_person_id` → `persons`; `subdistrict_code` → `civil_subdistricts`
RLS: เปิด · policy: places_insert (INSERT), places_read (SELECT), places_update (UPDATE)
trigger: places_audit, places_dissolve_guard, places_rules, places_set_updated_at

### `exam_venues`

ทะเบียนสนามสอบ นักธรรม และ ธรรมศึกษา ตั้งอยู่ที่สถานที่ในทะเบียน places

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `code` | text |  |  |
| `name` | text |  |  |
| `venue_type` | text |  |  |
| `place_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `levels` | text[] |  |  |
| `capacity` | integer | ได้ |  |
| `status` | text |  |  |
| `moved_to_venue_id` | uuid | ได้ |  |
| `start_year_be` | integer | ได้ |  |
| `note` | text |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `moved_to_venue_id` → `exam_venues`; `org_unit_id` → `org_units`; `place_id` → `places`
RLS: เปิด · policy: exam_venues_insert (INSERT), exam_venues_read (SELECT), exam_venues_update (UPDATE)
trigger: exam_venues_audit, exam_venues_rules, exam_venues_set_updated_at

### `venue_officers`

ประธานสนามสอบและผู้รับข้อสอบ ของสนามสอบแต่ละแห่งในแต่ละปีการศึกษา ที่อยู่จัดส่งและเบอร์ติดต่อไม่เผยแพร่ต่อสาธารณะ เว้นแต่ is_public

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `venue_id` | uuid |  |  |
| `academic_year_id` | uuid |  |  |
| `role` | text |  |  |
| `person_id` | uuid |  |  |
| `delivery_address` | text |  |  |
| `contact_phone` | text |  |  |
| `is_public` | boolean |  |  |
| `note` | text |  |  |
| `is_active` | boolean |  |  |
| `copied_from_id` | uuid | ได้ |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `is_phone_public` | boolean |  | ยินยอมให้เผยแพร่เบอร์ติดต่อต่อสาธารณะ (ค่าเริ่มต้น ไม่เผยแพร่ และต้องยินยอมเผยแพร่ชื่อด้วย) |

ความสัมพันธ์: `academic_year_id` → `academic_years`; `copied_from_id` → `venue_officers`; `created_by` → `profiles`; `person_id` → `persons`; `venue_id` → `exam_venues`
RLS: เปิด · policy: venue_officers_insert (INSERT), venue_officers_read (SELECT), venue_officers_update (UPDATE)
trigger: venue_officers_audit, venue_officers_rules, venue_officers_set_updated_at

### `exam_venue_changes`

ประวัติการเปิด ปิด ย้ายสถานที่ตั้งของสนามสอบ บันทึกโดยระบบเมื่อคำขอได้รับอนุมัติขั้นสุดท้าย

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `venue_id` | uuid |  |  |
| `change_type` | text |  |  |
| `request_id` | uuid | ได้ |  |
| `from_place_id` | uuid | ได้ |  |
| `from_place_name` | text |  |  |
| `to_place_id` | uuid | ได้ |  |
| `to_place_name` | text |  |  |
| `replacement_venue_id` | uuid | ได้ |  |
| `effective_year_be` | integer | ได้ |  |
| `reason` | text |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `from_place_id` → `places`; `replacement_venue_id` → `exam_venues`; `request_id` → `requests`; `to_place_id` → `places`; `venue_id` → `exam_venues`
RLS: เปิด · policy: exam_venue_changes_read (SELECT)
trigger: exam_venue_changes_audit, exam_venue_changes_set_updated_at

## ระบบที่ 3 คลังข้อสอบและการเรียน

### `courses`

รายวิชาธรรมศึกษา: ชั้น x ช่วงชั้น x วิชา (27 รายวิชาปรนัย + 9 รายวิชากระทู้ธรรมซึ่งไม่มีข้อสอบปรนัย)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `code` | text |  |  |
| `name` | text |  |  |
| `level` | text |  |  |
| `stage` | text |  |  |
| `subject` | text |  |  |
| `has_mcq` | boolean | ได้ |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: courses_read (SELECT), courses_update (UPDATE)
trigger: courses_audit, courses_rules, courses_set_updated_at

### `units`

หน่วยการเรียนของรายวิชา (ชื่อหน่วย ลำดับ)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `course_id` | uuid |  |  |
| `name` | text |  |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `course_id` → `courses`; `created_by` → `profiles`
RLS: เปิด · policy: units_insert (INSERT), units_read (SELECT), units_update (UPDATE)
trigger: units_audit, units_rules, units_set_updated_at

### `questions`

คลังข้อสอบปรนัย มีข้อถูกและคำอธิบายเฉลย อ่านได้เฉพาะผู้จัดการคลังข้อสอบ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `course_id` | uuid |  |  |
| `unit_id` | uuid |  |  |
| `question_text` | text |  |  |
| `choice_a` | text |  |  |
| `choice_b` | text |  |  |
| `choice_c` | text |  |  |
| `choice_d` | text |  |  |
| `correct_choice` | text |  |  |
| `explanation` | text |  |  |
| `source_year_be` | integer | ได้ |  |
| `difficulty` | text |  |  |
| `status` | text |  |  |
| `published_at` | timestamp with time zone | ได้ |  |
| `published_by` | uuid | ได้ |  |
| `dup_key` | text |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `lesson_id` | uuid | ได้ | บทเรียนที่เกี่ยวข้อง (ไม่บังคับ) ต้องอยู่ในหน่วยเดียวกับข้อสอบ |

ความสัมพันธ์: `course_id` → `courses`; `created_by` → `profiles`; `lesson_id` → `lessons`; `published_by` → `profiles`; `unit_id` → `units`
RLS: เปิด · policy: questions_insert (INSERT), questions_read (SELECT), questions_update (UPDATE)
trigger: questions_audit, questions_rules, questions_set_updated_at

### `lessons`

บทเรียนของหน่วยการเรียน (หัวข้อ เนื้อหาเป็นชิ้น ลำดับ) แก้ไขได้เฉพาะผู้จัดการคลังข้อสอบ ผู้เรียนอ่านผ่านฟังก์ชัน quiz_unit_lessons

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `unit_id` | uuid |  |  |
| `title` | text |  |  |
| `blocks` | jsonb |  |  |
| `sort_order` | integer |  |  |
| `status` | text |  |  |
| `published_at` | timestamp with time zone | ได้ |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `unit_id` → `units`
RLS: เปิด · policy: lessons_insert (INSERT), lessons_read (SELECT), lessons_update (UPDATE)
trigger: lessons_audit, lessons_rules, lessons_set_updated_at

### `quiz_attempts`

การทำแบบทดสอบ (ก่อนเรียน หลังเรียน ทดสอบรวม) ของผู้ใช้หรือของอุปกรณ์ที่ไม่ล็อกอิน เขียนผ่านฟังก์ชัน quiz_... เท่านั้น

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `user_id` | uuid | ได้ |  |
| `device_id` | uuid | ได้ |  |
| `course_id` | uuid |  |  |
| `unit_id` | uuid | ได้ |  |
| `kind` | text |  |  |
| `question_ids` | uuid[] |  |  |
| `answers` | jsonb |  |  |
| `total` | integer |  |  |
| `score` | integer | ได้ |  |
| `started_at` | timestamp with time zone |  |  |
| `expires_at` | timestamp with time zone | ได้ |  |
| `submitted_at` | timestamp with time zone | ได้ |  |
| `duration_seconds` | integer | ได้ |  |
| `lessons_opened_at` | timestamp with time zone | ได้ |  |

ความสัมพันธ์: `course_id` → `courses`; `unit_id` → `units`; `user_id` → `profiles`
RLS: เปิด · policy: quiz_attempts_read (SELECT)
trigger: quiz_attempts_audit

## ระบบที่ 5 และ 9 สมัครสอบ ผลสอบ

### `academic_years`

ปีการศึกษา (พ.ศ.) มีปีปัจจุบันได้ปีเดียว

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `year_be` | integer |  |  |
| `starts_on` | date |  |  |
| `ends_on` | date |  |  |
| `is_current` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `request_deadline` | date | ได้ | วันสุดท้ายที่รับคำขอเปิด ปิด ย้ายสนามสอบของปีการศึกษานี้ (ว่าง = ไม่กำหนด) |

RLS: เปิด · policy: academic_years_admin_insert (INSERT), academic_years_admin_update (UPDATE), academic_years_read_all (SELECT)
trigger: academic_years_audit, academic_years_set_updated_at

### `form_templates`

แบบฟอร์มบัญชี ศ. ของการสมัครสอบ (หัวแฟ้ม คอลัมน์ ชนิดข้อมูล บังคับกรอก กฎตรวจ) ใช้สร้างแม่แบบ Excel ผู้ดูแลระบบแก้ที่ /app/admin/form-templates

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `code` | text |  |  |
| `exam_type` | text |  |  |
| `level` | text |  |  |
| `sheet_name` | text |  |  |
| `marker_code` | text |  |  |
| `marker_no` | integer | ได้ |  |
| `version` | text |  |  |
| `notice` | text |  |  |
| `title` | text |  |  |
| `header_cells` | jsonb |  |  |
| `columns` | jsonb |  |  |
| `layout` | jsonb |  |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `signatures` | jsonb |  | ช่องลงนามท้ายบัญชีที่พิมพ์ [{text}] ผู้ดูแลระบบตั้งเอง (ไม่มีค่าตั้งต้น) |

RLS: เปิด · policy: form_templates_admin_insert (INSERT), form_templates_admin_update (UPDATE), form_templates_read (SELECT)
trigger: form_templates_audit, form_templates_check, form_templates_set_updated_at, form_templates_signatures_check

### `form_title_options`

คำนำหน้าชื่อที่ให้เลือกในแม่แบบ Excel ของบัญชี ศ. แยกตามประเภทการสอบ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `exam_type` | text |  |  |
| `name` | text |  |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: form_title_options_admin_insert (INSERT), form_title_options_admin_update (UPDATE), form_title_options_read (SELECT)
trigger: form_title_options_audit, form_title_options_set_updated_at

### `exam_rounds`

รอบสมัครสอบ นักธรรม / ธรรมศึกษา ต่อปีการศึกษาและชั้น ส่วนกลางสร้าง เปิด ปิด ที่ /app/exams/rounds

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `academic_year_id` | uuid |  |  |
| `exam_type` | text |  |  |
| `level` | text |  |  |
| `opens_on` | date |  |  |
| `closes_on` | date |  |  |
| `exam_starts_on` | date |  |  |
| `exam_ends_on` | date | ได้ |  |
| `status` | text |  |  |
| `note` | text |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `result_status` | text |  | สถานะผลสอบของรอบ: draft ร่าง (ยังไม่เปิดเผย) / published ประกาศแล้ว |
| `results_published_at` | timestamp with time zone | ได้ |  |
| `results_published_by` | uuid | ได้ |  |
| `results_announced_on` | date | ได้ | วันที่ประกาศผลสอบ (พิมพ์ท้ายบัญชีผู้สอบได้) |

ความสัมพันธ์: `academic_year_id` → `academic_years`; `created_by` → `profiles`; `results_published_by` → `profiles`
RLS: เปิด · policy: exam_rounds_manage_insert (INSERT), exam_rounds_manage_update (UPDATE), exam_rounds_read (SELECT)
trigger: exam_rounds_audit, exam_rounds_check, exam_rounds_result_guard, exam_rounds_set_updated_at

### `registration_batches`

ชุดรายชื่อผู้สมัครสอบที่อัปโหลดจากไฟล์ Excel บัญชี ศ. (หนึ่งชุด = หนึ่งไฟล์ = รอบ + สำนัก + สนามสอบ)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `round_id` | uuid |  |  |
| `template_id` | uuid |  |  |
| `place_id` | uuid |  |  |
| `venue_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `uploaded_by` | uuid |  |  |
| `file_name` | text |  |  |
| `file_path` | text |  |  |
| `file_size` | integer |  |  |
| `row_count` | integer |  |  |
| `ok_count` | integer |  |  |
| `error_count` | integer |  |  |
| `saved_count` | integer |  |  |
| `status` | text |  |  |
| `confirmed_at` | timestamp with time zone | ได้ |  |
| `confirmed_by` | uuid | ได้ |  |
| `withdrawn_at` | timestamp with time zone | ได้ |  |
| `withdrawn_by` | uuid | ได้ |  |
| `withdraw_reason` | text |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `request_id` | uuid | ได้ |  |
| `submitted_at` | timestamp with time zone | ได้ |  |
| `submitted_by` | uuid | ได้ |  |
| `certified_at` | timestamp with time zone | ได้ |  |

ความสัมพันธ์: `confirmed_by` → `profiles`; `org_unit_id` → `org_units`; `place_id` → `places`; `request_id` → `requests`; `round_id` → `exam_rounds`; `submitted_by` → `profiles`; `template_id` → `form_templates`; `uploaded_by` → `profiles`; `venue_id` → `exam_venues`; `withdrawn_by` → `profiles`
RLS: เปิด · policy: registration_batches_read (SELECT)
trigger: registration_batches_audit, registration_batches_set_updated_at

### `registration_files`

ไฟล์ Excel ที่อัปโหลดเพิ่มเติมเข้าบัญชีผู้สมัครเดิม (ระบบเขียนเท่านั้น)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `batch_id` | uuid |  |  |
| `file_no` | integer |  |  |
| `file_name` | text |  |  |
| `file_path` | text |  |  |
| `file_size` | integer |  |  |
| `row_count` | integer |  |  |
| `uploaded_by` | uuid |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `batch_id` → `registration_batches`; `uploaded_by` → `profiles`
RLS: เปิด · policy: registration_files_read (SELECT)
trigger: registration_files_audit, registration_files_set_updated_at

### `candidates`

ผู้สมัครสอบจากไฟล์ที่อัปโหลด (เขียนผ่านฟังก์ชันของชุดเท่านั้น) เลขประจำตัวเข้ารหัส แสดงได้เฉพาะ 4 ตัวท้าย

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `batch_id` | uuid |  |  |
| `round_id` | uuid |  |  |
| `row_no` | integer |  |  |
| `seq` | integer | ได้ |  |
| `candidate_code` | text | ได้ |  |
| `person_kind` | text |  |  |
| `title` | text |  |  |
| `first_name` | text |  |  |
| `monastic_name` | text |  |  |
| `last_name` | text |  |  |
| `birth_date` | date | ได้ |  |
| `ordination_date` | date | ได้ |  |
| `age` | integer | ได้ |  |
| `phansa` | integer | ได้ |  |
| `national_id_enc` | bytea | ได้ |  |
| `national_id_last4` | text | ได้ |  |
| `national_id_hash` | text | ได้ |  |
| `id_kind` | text |  |  |
| `person_key` | text |  |  |
| `school_name` | text |  |  |
| `level` | text |  |  |
| `stage` | text |  |  |
| `extra` | jsonb |  |  |
| `errors` | jsonb |  |  |
| `status` | text |  |  |
| `counted` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `file_no` | integer |  |  |
| `withdrawn_at` | timestamp with time zone | ได้ |  |
| `withdraw_reason` | text |  |  |

ความสัมพันธ์: `batch_id` → `registration_batches`; `round_id` → `exam_rounds`
RLS: เปิด · policy: candidates_read (SELECT)
trigger: candidates_audit, candidates_set_updated_at

### `candidate_code_counters`

ลำดับล่าสุดของรหัสผู้สมัคร ต่อปีและแบบ ศ. (ศ.๒ ชั้นโทและเอกใช้ลำดับร่วมกัน)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `year_be` | integer |  |  |
| `form_key` | text |  |  |
| `last_no` | integer |  |  |

RLS: เปิด · policy: ไม่มี (เขียนผ่านฟังก์ชันเท่านั้น)

### `registration_changes`

ประวัติการแก้ไข เพิ่ม ถอน ส่ง และผลรับรองของบัญชีผู้สมัครสอบ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | bigint |  |  |
| `batch_id` | uuid |  |  |
| `candidate_id` | uuid | ได้ |  |
| `action` | text |  |  |
| `reason` | text |  |  |
| `after_close` | boolean |  |  |
| `detail` | jsonb |  |  |
| `actor_id` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `actor_id` → `profiles`; `batch_id` → `registration_batches`; `candidate_id` → `candidates`
RLS: เปิด · policy: registration_changes_read (SELECT)
trigger: registration_changes_audit

### `exam_results`

ผลสอบของผู้สมัคร (นำเข้าและแก้ไขโดยส่วนกลางผ่านฟังก์ชัน) เปิดเผยเมื่อรอบประกาศผลแล้ว

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `candidate_id` | uuid |  |  |
| `round_id` | uuid |  |  |
| `result` | text |  |  |
| `scores` | jsonb |  |  |
| `certificate_no` | text |  |  |
| `note` | text |  |  |
| `announced_on` | date | ได้ |  |
| `created_by` | uuid | ได้ |  |
| `updated_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `candidate_id` → `candidates`; `created_by` → `profiles`; `round_id` → `exam_rounds`; `updated_by` → `profiles`
RLS: เปิด · policy: exam_results_read (SELECT)
trigger: exam_results_audit, exam_results_set_updated_at

### `exam_result_changes`

ประวัติผลสอบ: นำเข้า แก้ไข (หลังประกาศต้องมีเหตุผล) และประกาศผล

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `round_id` | uuid |  |  |
| `candidate_id` | uuid | ได้ |  |
| `action` | text |  |  |
| `before_data` | jsonb | ได้ |  |
| `after_data` | jsonb | ได้ |  |
| `reason` | text |  |  |
| `after_publish` | boolean |  |  |
| `actor_id` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `actor_id` → `profiles`; `candidate_id` → `candidates`; `round_id` → `exam_rounds`
RLS: เปิด · policy: exam_result_changes_read (SELECT)
trigger: exam_result_changes_audit

### `exam_pass_history`

ผลสอบได้ย้อนหลังที่ส่วนกลางนำเข้า (ก่อนมีระบบ) เลขประจำตัวเข้ารหัส แสดงได้เฉพาะ 4 ตัวท้าย

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `exam_type` | text |  |  |
| `level` | text |  |  |
| `year_be` | integer |  |  |
| `title` | text |  |  |
| `first_name` | text |  |  |
| `monastic_name` | text |  |  |
| `last_name` | text |  |  |
| `birth_date` | date | ได้ |  |
| `national_id_enc` | bytea | ได้ |  |
| `national_id_hash` | text | ได้ |  |
| `national_id_last4` | text | ได้ |  |
| `person_key` | text |  |  |
| `certificate_no` | text |  |  |
| `place_name` | text |  |  |
| `note` | text |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`
RLS: เปิด · policy: exam_pass_history_read (SELECT)
trigger: exam_pass_history_audit, exam_pass_history_set_updated_at

### `exam_result_forms`

แบบบัญชีรายชื่อผู้สอบได้ ต่อประเภทการสอบ (ศ.๔ นักธรรม, ศ.๘ ธรรมศึกษา)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `exam_type` | text |  |  |
| `code` | text |  |  |
| `certify_text` | text |  |  |
| `signatures` | jsonb |  |  |
| `updated_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: exam_result_forms_admin_update (UPDATE), exam_result_forms_read (SELECT)
trigger: exam_result_forms_audit, exam_result_forms_check, exam_result_forms_set_updated_at

## ระบบที่ 6 งบประมาณ

### `fiscal_years`

ปีงบประมาณ (1 ต.ค. ถึง 30 ก.ย.) สถานะ open เปิด / closed ปิด

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `year_be` | integer |  |  |
| `starts_on` | date |  |  |
| `ends_on` | date |  |  |
| `status` | text |  |  |
| `note` | text |  |  |
| `closed_at` | timestamp with time zone | ได้ |  |
| `closed_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `target_q1` | numeric(5,2) | ได้ | เป้าเบิกจ่ายสะสม (ร้อยละ) สิ้นไตรมาส 1 (ธ.ค.) ว่าง = ไม่ตั้งเป้า |
| `target_q2` | numeric(5,2) | ได้ |  |
| `target_q3` | numeric(5,2) | ได้ |  |
| `target_q4` | numeric(5,2) | ได้ |  |
| `year_end_closed_at` | timestamp with time zone | ได้ |  |
| `year_end_closed_by` | uuid | ได้ |  |
| `year_end_note` | text |  |  |

ความสัมพันธ์: `closed_by` → `profiles`; `year_end_closed_by` → `profiles`
RLS: เปิด · policy: fiscal_years_admin_insert (INSERT), fiscal_years_admin_update (UPDATE), fiscal_years_read (SELECT)
trigger: fiscal_years_audit, fiscal_years_fill, fiscal_years_set_updated_at, fiscal_years_year_end_guard

### `budget_sources`

แหล่งเงินของรายการงบประมาณ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `name` | text |  |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: budget_sources_admin_insert (INSERT), budget_sources_admin_update (UPDATE), budget_sources_read (SELECT)
trigger: budget_sources_audit, budget_sources_set_updated_at

### `budget_categories`

หมวดรายจ่าย (ชั้นล่างสุดของรายการงบประมาณ)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `name` | text |  |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: budget_categories_admin_insert (INSERT), budget_categories_admin_update (UPDATE), budget_categories_read (SELECT)
trigger: budget_categories_audit, budget_categories_set_updated_at

### `budget_items`

รายการงบประมาณ: program แผนงาน > project โครงการ/กิจกรรม > category หมวดรายจ่าย (มีวงเงินและแหล่งเงิน)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `fiscal_year_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `parent_id` | uuid | ได้ |  |
| `kind` | text |  |  |
| `name` | text |  |  |
| `code` | text |  |  |
| `category_id` | uuid | ได้ |  |
| `source_id` | uuid | ได้ |  |
| `amount` | numeric(14,2) | ได้ |  |
| `note` | text |  |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `updated_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `carried_from_year` | integer | ได้ | รายการกันเงินเหลื่อมปีที่ระบบสร้างตอนปิดปี (ปี พ.ศ. ต้นทาง) |

ความสัมพันธ์: `category_id` → `budget_categories`; `created_by` → `profiles`; `fiscal_year_id` → `fiscal_years`; `org_unit_id` → `org_units`; `parent_id` → `budget_items`; `source_id` → `budget_sources`; `updated_by` → `profiles`
RLS: เปิด · policy: budget_items_read (SELECT)
trigger: budget_items_audit, budget_items_rules, budget_items_set_updated_at

### `budget_allocations`

การจัดสรรงบประมาณจากหน่วยเหนือสู่หน่วยล่างหรือสำนัก (ติดลบ = ปรับลด) ยกเลิก = is_active false

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `item_id` | uuid |  |  |
| `fiscal_year_id` | uuid |  |  |
| `from_unit_id` | uuid |  |  |
| `to_unit_id` | uuid | ได้ |  |
| `to_place_id` | uuid | ได้ |  |
| `to_org_unit_id` | uuid |  |  |
| `round_no` | integer |  |  |
| `allocated_on` | date |  |  |
| `amount` | numeric(14,2) |  |  |
| `reference_no` | text |  |  |
| `note` | text |  |  |
| `is_active` | boolean |  |  |
| `cancel_reason` | text |  |  |
| `cancelled_at` | timestamp with time zone | ได้ |  |
| `cancelled_by` | uuid | ได้ |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `cancelled_by` → `profiles`; `created_by` → `profiles`; `fiscal_year_id` → `fiscal_years`; `from_unit_id` → `org_units`; `item_id` → `budget_items`; `to_org_unit_id` → `org_units`; `to_place_id` → `places`; `to_unit_id` → `org_units`
RLS: เปิด · policy: budget_allocations_read (SELECT)
trigger: budget_allocations_audit, budget_allocations_set_updated_at

### `budget_transfers`

คำขอโอนเปลี่ยนแปลงวงเงินระหว่างรายการ สถานะตามคำขอในเครื่องอนุมัติกลาง

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `fiscal_year_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `from_item_id` | uuid |  |  |
| `to_item_id` | uuid |  |  |
| `amount` | numeric(14,2) |  |  |
| `reason` | text |  |  |
| `status` | text |  |  |
| `request_id` | uuid | ได้ |  |
| `applied_at` | timestamp with time zone | ได้ |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `fiscal_year_id` → `fiscal_years`; `from_item_id` → `budget_items`; `org_unit_id` → `org_units`; `request_id` → `requests`; `to_item_id` → `budget_items`
RLS: เปิด · policy: budget_transfers_read (SELECT)
trigger: budget_transfers_audit, budget_transfers_set_updated_at

### `budget_item_changes`

ประวัติรายการงบประมาณ (สร้าง แก้ไข นำเข้า โอน ปิดใช้งาน) ระบบเขียนเท่านั้น

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `item_id` | uuid |  |  |
| `action` | text |  |  |
| `amount_before` | numeric(14,2) | ได้ |  |
| `amount_after` | numeric(14,2) | ได้ |  |
| `detail` | jsonb |  |  |
| `reason` | text |  |  |
| `transfer_id` | uuid | ได้ |  |
| `actor_id` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `actor_id` → `profiles`; `item_id` → `budget_items`; `transfer_id` → `budget_transfers`
RLS: เปิด · policy: budget_item_changes_read (SELECT)
trigger: budget_item_changes_audit

### `budget_approval_limits`

วงเงินที่เจ้าคณะ/รองเจ้าคณะแต่ละชั้นอนุมัติคำขอใช้งบได้ ว่าง = อนุมัติไม่ได้ ส่งต่อชั้นถัดไป

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `level` | org_level |  |  |
| `role_key` | text |  |  |
| `max_amount` | numeric(14,2) | ได้ |  |
| `updated_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `role_key` → `roles`; `updated_by` → `profiles`
RLS: เปิด · policy: budget_approval_limits_admin_update (UPDATE), budget_approval_limits_read (SELECT)
trigger: budget_approval_limits_audit, budget_approval_limits_set_updated_at, budget_approval_limits_stamp

### `budget_use_requests`

คำขอใช้งบประมาณ อนุมัติแล้วผูกพันเงิน (committed_amount) คืนเงินเหลือจ่าย = released_amount แล้วปิด

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `fiscal_year_id` | uuid |  |  |
| `item_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `purpose` | text |  |  |
| `lines` | jsonb |  |  |
| `amount` | numeric(14,2) |  |  |
| `status` | text |  |  |
| `request_id` | uuid | ได้ |  |
| `committed_amount` | numeric(14,2) |  |  |
| `approved_at` | timestamp with time zone | ได้ |  |
| `released_amount` | numeric(14,2) |  |  |
| `released_at` | timestamp with time zone | ได้ |  |
| `released_by` | uuid | ได้ |  |
| `release_reason` | text |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `carried_amount` | numeric(14,2) |  |  |
| `carried_at` | timestamp with time zone | ได้ |  |
| `carried_to_id` | uuid | ได้ |  |
| `carried_from_id` | uuid | ได้ |  |

ความสัมพันธ์: `carried_from_id` → `budget_use_requests`; `carried_to_id` → `budget_use_requests`; `created_by` → `profiles`; `fiscal_year_id` → `fiscal_years`; `item_id` → `budget_items`; `org_unit_id` → `org_units`; `released_by` → `profiles`; `request_id` → `requests`
RLS: เปิด · policy: budget_use_requests_read (SELECT)
trigger: budget_use_requests_audit, budget_use_requests_set_updated_at

### `budget_disbursements`

เบิกจ่ายจริงตามคำขอใช้งบที่อนุมัติ (หลายงวด) แก้ไขไม่ได้ ใช้รายการปรับปรุง (adjustment) พร้อมเหตุผลแทน

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `use_request_id` | uuid |  |  |
| `fiscal_year_id` | uuid |  |  |
| `item_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `kind` | text |  |  |
| `installment_no` | integer |  |  |
| `adjusts_id` | uuid | ได้ |  |
| `paid_on` | date |  |  |
| `payee` | text |  |  |
| `amount` | numeric(14,2) |  |  |
| `voucher_no` | text |  |  |
| `note` | text |  |  |
| `reason` | text |  |  |
| `asset_receipt_ref` | uuid | ได้ | เผื่ออ้างอิงรายการรับเข้าพัสดุ (ระบบที่ 7) ยังไม่ผูก foreign key |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `adjusts_id` → `budget_disbursements`; `created_by` → `profiles`; `fiscal_year_id` → `fiscal_years`; `item_id` → `budget_items`; `org_unit_id` → `org_units`; `use_request_id` → `budget_use_requests`
RLS: เปิด · policy: budget_disbursements_read (SELECT)
trigger: budget_disbursements_audit, budget_disbursements_immutable

### `budget_year_closings`

สรุปยอดงบประมาณตอนปิดสิ้นปี (ระบบเขียนเท่านั้น)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `fiscal_year_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `item_id` | uuid |  |  |
| `received` | numeric(14,2) |  |  |
| `allocated` | numeric(14,2) |  |  |
| `committed` | numeric(14,2) |  |  |
| `disbursed` | numeric(14,2) |  |  |
| `released` | numeric(14,2) |  |  |
| `carried` | numeric(14,2) |  |  |
| `remaining` | numeric(14,2) |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `fiscal_year_id` → `fiscal_years`; `item_id` → `budget_items`; `org_unit_id` → `org_units`
RLS: เปิด · policy: budget_year_closings_read (SELECT)
trigger: budget_year_closings_audit

### `budget_alerts`

บันทึกการแจ้งเตือนงบเหลือน้อย (กันแจ้งซ้ำ)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `fiscal_year_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `item_id` | uuid |  |  |
| `kind` | text |  |  |
| `percent_left` | numeric(6,2) |  |  |
| `created_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `fiscal_year_id` → `fiscal_years`; `item_id` → `budget_items`; `org_unit_id` → `org_units`
RLS: เปิด · policy: budget_alerts_read (SELECT)
trigger: budget_alerts_audit

## ระบบที่ 7 พัสดุ ครุภัณฑ์

### `inventory_categories`

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `name` | text |  |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: inventory_categories_admin_insert (INSERT), inventory_categories_admin_update (UPDATE), inventory_categories_read (SELECT)
trigger: inventory_categories_audit, inventory_categories_set_updated_at

### `items`

ทะเบียนวัสดุกลาง: รหัส ชื่อ หมวด หน่วยนับ จุดสั่งซื้อขั้นต่ำ (รูป = ไฟล์แนบ entity_table items)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `code` | text |  |  |
| `name` | text |  |  |
| `category_id` | uuid | ได้ |  |
| `unit` | text |  |  |
| `reorder_point` | numeric(12,2) |  |  |
| `note` | text |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `updated_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `category_id` → `inventory_categories`; `created_by` → `profiles`; `updated_by` → `profiles`
RLS: เปิด · policy: items_insert (INSERT), items_read (SELECT), items_update (UPDATE)
trigger: items_audit, items_rules, items_set_updated_at

### `warehouses`

คลังวัสดุ: main = คลังกลางของหน่วย, sub = คลังย่อยของหน่วยในสังกัด (parent_id = คลังกลาง)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `kind` | text |  |  |
| `parent_id` | uuid | ได้ |  |
| `code` | text |  |  |
| `name` | text |  |  |
| `note` | text |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `updated_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `org_unit_id` → `org_units`; `parent_id` → `warehouses`; `updated_by` → `profiles`
RLS: เปิด · policy: warehouses_insert (INSERT), warehouses_read (SELECT), warehouses_update (UPDATE)
trigger: warehouses_audit, warehouses_rules, warehouses_set_updated_at

### `stock_receipts`

เอกสารรับวัสดุเข้าคลัง (รายการวัสดุอยู่ใน stock_moves ชนิด receive) แก้ไขไม่ได้

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `receipt_no` | text |  |  |
| `warehouse_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `source` | text |  |  |
| `received_on` | date |  |  |
| `document_no` | text |  |  |
| `supplier` | text |  |  |
| `disbursement_id` | uuid | ได้ |  |
| `note` | text |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `disbursement_id` → `budget_disbursements`; `org_unit_id` → `org_units`; `warehouse_id` → `warehouses`
RLS: เปิด · policy: stock_receipts_read (SELECT)
trigger: stock_receipts_audit, stock_receipts_immutable

### `stock_transfers`

ใบโอนวัสดุจากคลังกลางไปคลังย่อย (รายการอยู่ใน stock_moves ชนิด transfer_out / transfer_in)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `transfer_no` | text |  |  |
| `from_warehouse_id` | uuid |  |  |
| `to_warehouse_id` | uuid |  |  |
| `from_unit_id` | uuid |  |  |
| `to_unit_id` | uuid |  |  |
| `status` | text |  |  |
| `sent_on` | date |  |  |
| `received_on` | date | ได้ |  |
| `note` | text |  |  |
| `cancel_reason` | text |  |  |
| `created_by` | uuid | ได้ |  |
| `received_by` | uuid | ได้ |  |
| `received_at` | timestamp with time zone | ได้ |  |
| `cancelled_by` | uuid | ได้ |  |
| `cancelled_at` | timestamp with time zone | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `cancelled_by` → `profiles`; `created_by` → `profiles`; `from_unit_id` → `org_units`; `from_warehouse_id` → `warehouses`; `received_by` → `profiles`; `to_unit_id` → `org_units`; `to_warehouse_id` → `warehouses`
RLS: เปิด · policy: stock_transfers_read (SELECT)
trigger: stock_transfers_audit, stock_transfers_set_updated_at

### `requisitions`

ใบเบิกวัสดุ (ชนิดคำขอ requisition ในเครื่องอนุมัติกลาง) ตัดสต็อกเมื่อจ่ายของ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `warehouse_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `purpose` | text |  |  |
| `lines` | jsonb |  |  |
| `status` | text |  |  |
| `request_id` | uuid | ได้ |  |
| `approved_at` | timestamp with time zone | ได้ |  |
| `issued_on` | date | ได้ |  |
| `issued_by` | uuid | ได้ |  |
| `issued_at` | timestamp with time zone | ได้ |  |
| `issue_note` | text |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `issued_by` → `profiles`; `org_unit_id` → `org_units`; `request_id` → `requests`; `warehouse_id` → `warehouses`
RLS: เปิด · policy: requisitions_read (SELECT)
trigger: requisitions_audit, requisitions_set_updated_at

### `stock_moves`

ความเคลื่อนไหวของวัสดุ ยอดคงเหลือ = ผลรวม quantity ต่อคลังต่อวัสดุ (ห้ามเก็บยอดแยก) แก้ไขหรือลบไม่ได้

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `warehouse_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `item_id` | uuid |  |  |
| `kind` | text |  |  |
| `quantity` | numeric(12,2) |  |  |
| `unit_price` | numeric(14,2) | ได้ |  |
| `moved_on` | date |  |  |
| `reference_no` | text |  |  |
| `note` | text |  |  |
| `receipt_id` | uuid | ได้ |  |
| `requisition_id` | uuid | ได้ |  |
| `transfer_id` | uuid | ได้ |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `item_id` → `items`; `org_unit_id` → `org_units`; `receipt_id` → `stock_receipts`; `requisition_id` → `requisitions`; `transfer_id` → `stock_transfers`; `warehouse_id` → `warehouses`
RLS: เปิด · policy: stock_moves_read (SELECT)
trigger: stock_moves_audit, stock_moves_immutable

### `asset_types`

ประเภทครุภัณฑ์ และอายุการใช้งาน (ปี) ที่ใช้คิดค่าเสื่อมราคา

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `name` | text |  |  |
| `useful_life_years` | integer |  |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: asset_types_admin_insert (INSERT), asset_types_admin_update (UPDATE), asset_types_read (SELECT)
trigger: asset_types_audit, asset_types_set_updated_at

### `assets`

ทะเบียนครุภัณฑ์: อายุการใช้งานว่าง = ตามประเภท ค่าเสื่อมคำนวณด้วย private.asset_acc_dep

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `asset_no` | text |  |  |
| `name` | text |  |  |
| `type_id` | uuid |  |  |
| `brand` | text |  |  |
| `model` | text |  |  |
| `serial_no` | text |  |  |
| `acquired_on` | date |  |  |
| `acquire_method` | text |  |  |
| `price` | numeric(14,2) |  |  |
| `source_id` | uuid | ได้ |  |
| `useful_life_years` | integer | ได้ | อายุการใช้งาน (ปี) เฉพาะรายการ ว่าง = ใช้ค่าของประเภท |
| `org_unit_id` | uuid |  |  |
| `location` | text |  |  |
| `custodian` | text |  |  |
| `condition` | text |  |  |
| `disposed_on` | date | ได้ |  |
| `disposal_request_id` | uuid | ได้ |  |
| `note` | text |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `updated_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `disposal_request_id` → `requests`; `org_unit_id` → `org_units`; `source_id` → `budget_sources`; `type_id` → `asset_types`; `updated_by` → `profiles`
RLS: เปิด · policy: assets_insert (INSERT), assets_read (SELECT), assets_update (UPDATE)
trigger: assets_audit, assets_rules, assets_set_updated_at

### `asset_transfers`

โอนครุภัณฑ์ข้ามหน่วย: ต้นทางส่ง (sent รอรับ) ปลายทางกดรับจึงเปลี่ยนหน่วยที่ครอบครอง

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `asset_id` | uuid |  |  |
| `from_unit_id` | uuid |  |  |
| `to_unit_id` | uuid |  |  |
| `status` | text |  |  |
| `sent_on` | date |  |  |
| `received_on` | date | ได้ |  |
| `note` | text |  |  |
| `cancel_reason` | text |  |  |
| `created_by` | uuid | ได้ |  |
| `received_by` | uuid | ได้ |  |
| `received_at` | timestamp with time zone | ได้ |  |
| `cancelled_by` | uuid | ได้ |  |
| `cancelled_at` | timestamp with time zone | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `asset_id` → `assets`; `cancelled_by` → `profiles`; `created_by` → `profiles`; `from_unit_id` → `org_units`; `received_by` → `profiles`; `to_unit_id` → `org_units`
RLS: เปิด · policy: asset_transfers_read (SELECT)
trigger: asset_transfers_audit, asset_transfers_set_updated_at

### `asset_loans`

ยืม-คืนครุภัณฑ์ (returned_on ว่าง = ยังไม่คืน) ยืมได้ครั้งละ 1 รายการต่อครุภัณฑ์

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `asset_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `borrower` | text |  |  |
| `loaned_on` | date |  |  |
| `due_on` | date | ได้ |  |
| `returned_on` | date | ได้ |  |
| `note` | text |  |  |
| `return_note` | text |  |  |
| `created_by` | uuid | ได้ |  |
| `returned_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `asset_id` → `assets`; `created_by` → `profiles`; `org_unit_id` → `org_units`; `returned_by` → `profiles`
RLS: เปิด · policy: asset_loans_read (SELECT)
trigger: asset_loans_audit, asset_loans_set_updated_at

### `asset_repairs`

ซ่อมบำรุงครุภัณฑ์ (วันที่ รายการ ค่าใช้จ่าย) บันทึกผิดให้ยกเลิก (is_active false) พร้อมเหตุผล

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `asset_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `repaired_on` | date |  |  |
| `description` | text |  |  |
| `cost` | numeric(14,2) |  |  |
| `vendor` | text |  |  |
| `is_active` | boolean |  |  |
| `cancel_reason` | text |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `asset_id` → `assets`; `created_by` → `profiles`; `org_unit_id` → `org_units`
RLS: เปิด · policy: asset_repairs_read (SELECT)
trigger: asset_repairs_audit, asset_repairs_set_updated_at

### `asset_counts`

รอบตรวจนับครุภัณฑ์ของหน่วย (รวมหน่วยใต้สังกัดเมื่อ include_sub) เปิดได้ครั้งละ 1 รอบต่อหน่วย

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `title` | text |  |  |
| `include_sub` | boolean |  |  |
| `started_on` | date |  |  |
| `status` | text |  |  |
| `note` | text |  |  |
| `closed_at` | timestamp with time zone | ได้ |  |
| `closed_by` | uuid | ได้ |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `closed_by` → `profiles`; `created_by` → `profiles`; `org_unit_id` → `org_units`
RLS: เปิด · policy: asset_counts_read (SELECT)
trigger: asset_counts_audit, asset_counts_set_updated_at

### `asset_count_items`

รายการที่ต้องตรวจในรอบ (สร้างตอนเปิดรอบ) result: found พบ / damaged ชำรุด / missing ไม่พบ (ระบบตั้งตอนปิดรอบ)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `count_id` | uuid |  |  |
| `asset_id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `expected_condition` | text |  |  |
| `result` | text | ได้ |  |
| `note` | text |  |  |
| `checked_at` | timestamp with time zone | ได้ |  |
| `checked_by` | uuid | ได้ |  |

ความสัมพันธ์: `asset_id` → `assets`; `checked_by` → `profiles`; `count_id` → `asset_counts`; `org_unit_id` → `org_units`
RLS: เปิด · policy: asset_count_items_read (SELECT)
trigger: asset_count_items_audit

## ระบบที่ 8 สารบรรณ

### `documents`

ทะเบียนหนังสือรับ-ส่ง: direction receive/send, kind external/internal/order/announcement/circular, status draft/issued/sent/received/cancelled (เขียนผ่านฟังก์ชันเท่านั้น)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `direction` | text |  |  |
| `kind` | text |  |  |
| `status` | text |  |  |
| `series` | text | ได้ |  |
| `number_year` | integer | ได้ |  |
| `seq_no` | integer | ได้ | เลขทะเบียนรับ (receive) หรือเลขลำดับของเลขที่หนังสือส่ง ต่อหน่วย ต่อชุด ต่อปี พ.ศ. |
| `doc_no` | text |  | เลขที่หนังสือ: หนังสือส่ง = ระบบออกให้ / หนังสือรับ = เลขที่ของต้นทาง |
| `doc_date` | date | ได้ |  |
| `from_text` | text |  |  |
| `to_text` | text |  |  |
| `to_unit_ids` | uuid[] |  | หน่วยในระบบที่ส่งถึง (เมื่อกดส่ง ระบบสร้าง document_deliveries ให้ปลายทางลงรับ) |
| `subject` | text |  |  |
| `urgency` | text |  |  |
| `classification` | text |  |  |
| `salutation` | text |  |  |
| `body` | text |  |  |
| `closing` | text |  |  |
| `signer_name` | text |  |  |
| `signer_position` | text |  |  |
| `note` | text |  |  |
| `received_at` | timestamp with time zone | ได้ |  |
| `source_document_id` | uuid | ได้ |  |
| `registered_by` | uuid | ได้ |  |
| `issued_by` | uuid | ได้ |  |
| `issued_at` | timestamp with time zone | ได้ |  |
| `sent_by` | uuid | ได้ |  |
| `sent_at` | timestamp with time zone | ได้ |  |
| `cancel_reason` | text | ได้ |  |
| `cancelled_by` | uuid | ได้ |  |
| `cancelled_at` | timestamp with time zone | ได้ |  |
| `is_active` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `reply_required` | boolean |  | หนังสือส่งที่ต้องการคำตอบจากหน่วยผู้รับ (ตอบใน document_routes.reply_text) |
| `reply_due_on` | date | ได้ |  |
| `closed_at` | timestamp with time zone | ได้ | ปิดเรื่องแล้ว = อยู่ในคลังเก็บ (ไม่แสดงในแท็บทะเบียนรับ/ส่ง แก้ไขหรือสั่งการไม่ได้จนกว่าจะเปิดเรื่องใหม่) |
| `closed_by` | uuid | ได้ |  |
| `close_note` | text | ได้ |  |

ความสัมพันธ์: `cancelled_by` → `profiles`; `closed_by` → `profiles`; `issued_by` → `profiles`; `org_unit_id` → `org_units`; `registered_by` → `profiles`; `sent_by` → `profiles`; `source_document_id` → `documents`
RLS: เปิด · policy: documents_read (SELECT)
trigger: documents_audit, documents_set_updated_at

### `document_viewers`

รายชื่อผู้มีสิทธิ์เห็นหนังสือลับ (นอกจากผู้ลงทะเบียน) เขียนผ่านฟังก์ชันเท่านั้น

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `document_id` | uuid |  |  |
| `user_id` | uuid |  |  |
| `is_active` | boolean |  |  |
| `added_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `added_by` → `profiles`; `document_id` → `documents`; `user_id` → `profiles`
RLS: เปิด · policy: document_viewers_read (SELECT)
trigger: document_viewers_audit, document_viewers_set_updated_at

### `document_deliveries`

เลิกใช้ตั้งแต่บทที่ 28 ข้อมูลย้ายไป document_routes (รหัสเดิม) ห้ามเขียนเพิ่ม

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `document_id` | uuid |  |  |
| `to_unit_id` | uuid |  |  |
| `status` | text |  |  |
| `received_document_id` | uuid | ได้ |  |
| `received_by` | uuid | ได้ |  |
| `received_at` | timestamp with time zone | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `document_id` → `documents`; `received_by` → `profiles`; `received_document_id` → `documents`; `to_unit_id` → `org_units`
RLS: เปิด · policy: document_deliveries_read (SELECT)
trigger: document_deliveries_audit, document_deliveries_set_updated_at

### `document_routes`

เส้นทางหนังสือ: forward ส่งถึงหน่วย / propose เสนอ / order สั่งการ / act มอบหมายผู้ดำเนินการ / inform แจ้งเพื่อทราบ (เขียนผ่านฟังก์ชันเท่านั้น)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `document_id` | uuid |  |  |
| `action` | text |  |  |
| `from_user_id` | uuid | ได้ |  |
| `from_unit_id` | uuid |  |  |
| `to_unit_id` | uuid | ได้ |  |
| `to_user_id` | uuid | ได้ |  |
| `message` | text |  |  |
| `due_on` | date | ได้ |  |
| `parent_route_id` | uuid | ได้ |  |
| `status` | text |  |  |
| `sent_at` | timestamp with time zone |  |  |
| `read_at` | timestamp with time zone | ได้ |  |
| `read_by` | uuid | ได้ |  |
| `received_at` | timestamp with time zone | ได้ |  |
| `received_by` | uuid | ได้ |  |
| `received_document_id` | uuid | ได้ |  |
| `reply_text` | text | ได้ |  |
| `replied_at` | timestamp with time zone | ได้ |  |
| `replied_by` | uuid | ได้ |  |
| `done_note` | text | ได้ |  |
| `done_at` | timestamp with time zone | ได้ |  |
| `done_by` | uuid | ได้ |  |
| `last_reminded_at` | timestamp with time zone | ได้ |  |
| `due_soon_notified_at` | timestamp with time zone | ได้ |  |
| `overdue_notified_at` | timestamp with time zone | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `document_id` → `documents`; `done_by` → `profiles`; `from_unit_id` → `org_units`; `from_user_id` → `profiles`; `parent_route_id` → `document_routes`; `read_by` → `profiles`; `received_by` → `profiles`; `received_document_id` → `documents`; `replied_by` → `profiles`; `to_unit_id` → `org_units`; `to_user_id` → `profiles`
RLS: เปิด · policy: document_routes_read (SELECT)
trigger: document_routes_audit, document_routes_set_updated_at

### `doc_counters`

ตัวนับเลขทะเบียนรับและเลขที่หนังสือส่ง ต่อหน่วย ต่อชุด ต่อปี พ.ศ. (เพิ่มได้ทีละ 1 ผ่านฟังก์ชันออกเลขเท่านั้น)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `org_unit_id` | uuid |  |  |
| `series` | text |  |  |
| `year_be` | integer |  |  |
| `last_no` | integer |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `org_unit_id` → `org_units`
RLS: เปิด · policy: ไม่มี (เขียนผ่านฟังก์ชันเท่านั้น)
trigger: doc_counters_audit, doc_counters_set_updated_at

### `doc_unit_settings`

หัวหนังสือของหน่วย: รหัสหนังสือ (เช่น พศ 0001) ชื่อส่วนงาน ที่อยู่ (ตรา = ไฟล์แนบ entity_table doc_unit_settings)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `org_unit_id` | uuid |  |  |
| `code_prefix` | text |  |  |
| `agency_name` | text |  |  |
| `address` | text |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `org_unit_id` → `org_units`
RLS: เปิด · policy: doc_unit_settings_insert (INSERT), doc_unit_settings_read (SELECT), doc_unit_settings_update (UPDATE)
trigger: doc_unit_settings_audit, doc_unit_settings_set_updated_at

### `document_close_events`

ประวัติปิดเรื่องและเปิดเรื่องใหม่ของหนังสือ (ระบบเขียนเท่านั้น)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `document_id` | uuid |  |  |
| `action` | text |  |  |
| `note` | text |  |  |
| `actor_id` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `actor_id` → `profiles`; `document_id` → `documents`
RLS: เปิด · policy: document_close_events_read (SELECT)
trigger: document_close_events_audit, document_close_events_set_updated_at

### `doc_retention_rules`

อายุการเก็บหนังสือตามชนิด (ปี นับจากวันปิดเรื่อง ว่าง = ไม่กำหนด) ผู้ดูแลระบบกรอกตามระเบียบ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `kind` | text |  |  |
| `years` | integer | ได้ |  |
| `note` | text |  |  |
| `updated_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `updated_by` → `profiles`
RLS: เปิด · policy: doc_retention_rules_insert (INSERT), doc_retention_rules_read (SELECT), doc_retention_rules_update (UPDATE)
trigger: doc_retention_rules_audit, doc_retention_rules_set_updated_at

### `document_request_links`

หนังสืออ้างอิงของคำขอ (ระบบที่ 1, 4, 6, 7) source auto = ร่างแจ้งผลที่ระบบสร้าง ยกเลิกการอ้างอิง = is_active false (เขียนผ่านฟังก์ชันเท่านั้น)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `document_id` | uuid |  |  |
| `request_id` | uuid |  |  |
| `source` | text |  |  |
| `created_by` | uuid | ได้ |  |
| `is_active` | boolean |  |  |
| `removed_by` | uuid | ได้ |  |
| `removed_at` | timestamp with time zone | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `document_id` → `documents`; `removed_by` → `profiles`; `request_id` → `requests`
RLS: เปิด · policy: document_request_links_read (SELECT)
trigger: document_request_links_audit, document_request_links_set_updated_at

## หน้าสาธารณะ ติดต่อเรา ข้อมูลส่วนบุคคล ติดตามระบบ

### `announcements`

ข่าวประกาศของเว็บ (หน้าแรก) แสดงเมื่อใช้งาน ถึงวันเผยแพร่ และยังไม่หมดอายุ ปิดใช้งานแทนการลบ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `title` | text |  |  |
| `body` | text |  |  |
| `is_pinned` | boolean |  |  |
| `published_on` | date |  |  |
| `expires_on` | date | ได้ |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `updated_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `updated_by` → `profiles`
RLS: เปิด · policy: announcements_insert (INSERT), announcements_read (SELECT), announcements_update (UPDATE)
trigger: announcements_audit, announcements_set_updated_at

### `announcement_files`

ไฟล์แนบของข่าวประกาศ (ที่เก็บสาธารณะ site-files ห้ามมีข้อมูลส่วนบุคคล) นำออก = ปิดใช้งาน

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `announcement_id` | uuid |  |  |
| `storage_path` | text |  |  |
| `file_name` | text |  |  |
| `mime_type` | text |  |  |
| `size_bytes` | integer |  |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `announcement_id` → `announcements`; `created_by` → `profiles`
RLS: เปิด · policy: announcement_files_insert (INSERT), announcement_files_read (SELECT), announcement_files_update (UPDATE)
trigger: announcement_files_audit, announcement_files_set_updated_at

### `downloads`

รายการหน้าดาวน์โหลด: form แบบฟอร์ม / template แม่แบบ Excel / manual คู่มือ / calendar ปฏิทิน / regulation ระเบียบและประกาศ (ไฟล์ในที่เก็บสาธารณะ หรือลิงก์ภายนอก)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `category` | text |  |  |
| `title` | text |  |  |
| `description` | text |  |  |
| `storage_path` | text | ได้ |  |
| `file_name` | text | ได้ |  |
| `mime_type` | text | ได้ |  |
| `size_bytes` | integer | ได้ |  |
| `url` | text | ได้ |  |
| `sort_order` | integer |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `updated_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `updated_by` → `profiles`
RLS: เปิด · policy: downloads_insert (INSERT), downloads_read (SELECT), downloads_update (UPDATE)
trigger: downloads_audit, downloads_set_updated_at

### `exam_calendar_events`

รายการปฏิทินงานสอบที่เพิ่มเอง (นอกเหนือจากวันในรอบสมัครสอบ) ปิดใช้งานแทนการลบ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `academic_year_id` | uuid |  |  |
| `starts_on` | date |  |  |
| `ends_on` | date | ได้ |  |
| `title` | text |  |  |
| `note` | text |  |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `academic_year_id` → `academic_years`; `created_by` → `profiles`
RLS: เปิด · policy: exam_calendar_events_insert (INSERT), exam_calendar_events_read (SELECT), exam_calendar_events_update (UPDATE)
trigger: exam_calendar_events_audit, exam_calendar_events_set_updated_at

### `site_contact`

ข้อมูลติดต่อของหน่วยงาน (หน้า ติดต่อเรา และส่วนท้ายเว็บ) แถวเดียว ผู้ดูแลระบบแก้

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | integer |  |  |
| `agency_name` | text |  |  |
| `address` | text |  |  |
| `phone` | text |  |  |
| `email` | text |  |  |
| `office_hours` | text |  |  |
| `latitude` | numeric(9,6) | ได้ |  |
| `longitude` | numeric(9,6) | ได้ |  |
| `map_note` | text |  |  |
| `updated_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `updated_by` → `profiles`
RLS: เปิด · policy: site_contact_read (SELECT), site_contact_update (UPDATE)
trigger: site_contact_audit, site_contact_set_updated_at

### `contact_topics`

หัวข้อของแบบฟอร์มติดต่อเรา (ตามระบบ กำหนดในคำสั่งบทที่ 30)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `key` | text |  |  |
| `name` | text |  |  |
| `sort_order` | integer |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

RLS: เปิด · policy: contact_topics_read (SELECT)
trigger: contact_topics_audit, contact_topics_set_updated_at

### `contact_topic_recipients`

ผู้รับข้อความติดต่อต่อหัวข้อ: บทบาท (ทุกคนที่มีบทบาทนั้น) หรือผู้ใช้รายคน หัวข้อที่ไม่กำหนด = ผู้ดูแลระบบ นำออก = ปิดใช้งาน

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `topic_key` | text |  |  |
| `role_key` | text | ได้ |  |
| `user_id` | uuid | ได้ |  |
| `is_active` | boolean |  |  |
| `created_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `created_by` → `profiles`; `role_key` → `roles`; `topic_key` → `contact_topics`; `user_id` → `profiles`
RLS: เปิด · policy: contact_topic_recipients_insert (INSERT), contact_topic_recipients_read (SELECT), contact_topic_recipients_update (UPDATE)
trigger: contact_topic_recipients_audit, contact_topic_recipients_set_updated_at

### `contact_messages`

ข้อความจากแบบฟอร์มติดต่อเรา (มีชื่อ อีเมล เบอร์ของผู้ส่ง เห็นเฉพาะผู้รับของหัวข้อและผู้ดูแลระบบ) เขียนผ่านฟังก์ชันเท่านั้น

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | uuid |  |  |
| `topic_key` | text |  |  |
| `sender_name` | text |  |  |
| `sender_email` | text |  |  |
| `sender_phone` | text |  |  |
| `subject` | text |  |  |
| `message` | text |  |  |
| `status` | text |  |  |
| `staff_note` | text |  |  |
| `read_at` | timestamp with time zone | ได้ |  |
| `read_by` | uuid | ได้ |  |
| `handled_at` | timestamp with time zone | ได้ |  |
| `handled_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `handled_by` → `profiles`; `read_by` → `profiles`; `topic_key` → `contact_topics`
RLS: เปิด · policy: contact_messages_read (SELECT)
trigger: contact_messages_audit, contact_messages_set_updated_at

### `privacy_texts`

นโยบายความเป็นส่วนตัว (kind policy = หัวข้อของหน้า /privacy) และข้อความแจ้งวัตถุประสงค์บนแบบฟอร์มที่เก็บข้อมูล (kind notice) เนื้อความผู้ดูแลระบบกรอกเอง ว่าง = ยังไม่ได้ระบุ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `key` | text |  |  |
| `kind` | text |  |  |
| `title` | text |  |  |
| `body` | text |  |  |
| `sort_order` | integer |  |  |
| `updated_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `updated_by` → `profiles`
RLS: เปิด · policy: privacy_texts_read (SELECT), privacy_texts_update (UPDATE)
trigger: privacy_texts_audit, privacy_texts_set_updated_at

### `person_access_logs`

บันทึกการเข้าดูข้อมูลบุคคล (ใครดูของใครเมื่อใด) เขียนผ่าน log_person_access เท่านั้น อ่านได้เฉพาะผู้ดูแลระบบ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | bigint |  |  |
| `viewer_id` | uuid |  |  |
| `subject_type` | text |  |  |
| `subject_id` | text |  |  |
| `action` | text |  |  |
| `detail` | text |  |  |
| `created_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `viewer_id` → `profiles`
RLS: เปิด · policy: person_access_logs_read (SELECT)

### `data_retention_rules`

อายุการเก็บข้อมูลส่วนบุคคลต่อชนิดข้อมูล (ว่าง = ไม่กำหนด) ระบบรายงานรายการที่ครบอายุให้ผู้ดูแลระบบตรวจ ไม่ลบเอง (อายุการเก็บหนังสือราชการอยู่ที่ doc_retention_rules)

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `data_key` | text |  |  |
| `label` | text |  |  |
| `basis` | text |  |  |
| `years` | integer | ได้ |  |
| `note` | text |  |  |
| `sort_order` | integer |  |  |
| `updated_by` | uuid | ได้ |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |

ความสัมพันธ์: `updated_by` → `profiles`
RLS: เปิด · policy: data_retention_rules_read (SELECT), data_retention_rules_update (UPDATE)
trigger: data_retention_rules_audit, data_retention_rules_set_updated_at

### `app_error_logs`

ข้อผิดพลาดของเว็บ (ฝั่งเซิร์ฟเวอร์จาก onRequestError และฝั่งเบราว์เซอร์จากหน้าแสดงข้อผิดพลาด) path ไม่มีส่วน ?query เพื่อไม่เก็บคำค้นหรือข้อมูลบุคคล อ่านได้เฉพาะผู้ดูแลระบบ

| คอลัมน์ | ชนิด | ว่างได้ | คำอธิบาย |
|---|---|---|---|
| `id` | bigint |  |  |
| `occurred_at` | timestamp with time zone |  |  |
| `source` | text |  |  |
| `route_type` | text |  |  |
| `path` | text |  |  |
| `digest` | text |  |  |
| `message` | text |  |  |
| `environment` | text |  |  |
| `user_id` | uuid | ได้ |  |

ความสัมพันธ์: `user_id` → `profiles`
RLS: เปิด · policy: app_error_logs_read (SELECT)
