-- ล้างข้อมูลทดสอบออกจากชุดใช้งานจริง (บทที่ 32) — รันครั้งเดียวก่อนนำเข้าข้อมูลจริง
-- วิธีรัน: Supabase (โครงการใช้งานจริง) > SQL Editor > วางทั้งไฟล์ > Run
-- ก่อนรัน: สำรองข้อมูล 1 ครั้ง (GitHub > Actions > สำรองข้อมูลรายวัน > Run workflow) และรัน remove-test-data-preview.sql ดูรายการก่อน
--
-- สิ่งที่ลบ: บัญชีทดสอบ test.*@example.com ทั้งหมด, เขตปกครอง TEST-*, ข้อมูลงานทุกตาราง (บุคคล สถานที่ สนามสอบ คำขอ หนังสือ
--          งบประมาณ พัสดุ การสมัครสอบ แจ้งเตือน ข้อความติดต่อ ไฟล์แนบ ฯลฯ), ประเภทตำแหน่ง จศป. ที่ขึ้นต้น TEST-,
--          ประวัติการแก้ไขที่ไม่ใช่ของข้อมูลอ้างอิง และตัวนับเลขที่ทั้งหมด (เลขที่คำขอ หนังสือ ใบรับ เริ่มนับใหม่)
-- สิ่งที่เก็บไว้: ค่าตั้งและข้อมูลอ้างอิง (ตาราง keep ด้านล่าง) เช่น บทบาท เมนูตามบทบาท ประเภทตำแหน่ง ชนิดคำขอ แบบฟอร์ม ศ.
--          เขตการปกครองบ้านเมือง รายวิชา หน่วยการเรียน บทเรียน ข้อสอบ ปีการศึกษา หมวดงบ ข้อความนโยบายความเป็นส่วนตัว
--          และประวัติการแก้ไขของข้อมูลอ้างอิงที่ระบบบันทึก (ไม่มีผู้กระทำ) เช่น การโหลดเขตการปกครองบ้านเมือง
-- ด่านกันพลาด: ถ้าพบเขตปกครองที่ไม่ใช่ TEST หรือบัญชีที่ไม่ใช่บัญชีทดสอบ (แปลว่าเริ่มใช้งานจริงแล้ว) จะหยุดทันทีโดยไม่ลบอะไร
-- ทั้งหมดอยู่ในรายการเดียว (transaction) ผิดขั้นใด = ย้อนกลับทั้งหมด
-- หลังรัน: สร้างผู้ดูแลระบบคนแรกด้วย scripts/ops/create-admin.mjs (บัญชีทดสอบถูกลบหมดแล้ว)

do $$
declare
  keep text[] := array[
    'academic_years', 'app_settings', 'asset_types', 'budget_approval_limits', 'budget_categories', 'budget_sources',
    'civil_districts', 'civil_provinces', 'civil_subdistricts', 'contact_topics', 'contact_topic_recipients', 'courses',
    'data_retention_rules', 'doc_retention_rules', 'downloads', 'announcements', 'announcement_files', 'exam_calendar_events',
    'education_position_types', 'exam_result_forms', 'fiscal_years', 'form_templates', 'form_title_options',
    'inventory_categories', 'items', 'lessons', 'position_types', 'privacy_texts', 'questions', 'request_document_types',
    'request_types', 'role_menus', 'roles', 'site_contact', 'units', 'audit_logs'];
  test_users uuid[];
  r record;
  n bigint;
  total bigint := 0;
  report text := '';
begin
  -- ด่านกันพลาด
  if exists (select 1 from public.org_units where code not like 'TEST%') then
    raise exception 'หยุด: พบเขตปกครองที่ไม่ใช่ข้อมูลทดสอบ (ระบบเริ่มมีข้อมูลจริงแล้ว) ไม่ลบอะไร';
  end if;
  if exists (select 1 from auth.users where email not like 'test.%@example.com') then
    raise exception 'หยุด: พบบัญชีที่ไม่ใช่บัญชีทดสอบ (ระบบเริ่มมีผู้ใช้จริงแล้ว) ไม่ลบอะไร';
  end if;
  select coalesce(array_agg(id), '{}') into test_users from auth.users where email like 'test.%@example.com';

  -- 1) ตารางที่เก็บไว้: ล้างการอ้างถึงบัญชีทดสอบ (ผู้สร้าง ผู้แก้ไข ผู้เผยแพร่) ให้เป็นว่าง
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and cardinality(c.conkey) = 1
      and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and c.connamespace = 'public'::regnamespace
      and c.conrelid::regclass::text in (select 'public.' || unnest(keep) union select unnest(keep))
      and c.conrelid <> 'public.audit_logs'::regclass
  loop
    execute format('update %s set %I = null where %I = any($1)', r.tbl, r.col, r.col) using test_users;
  end loop;

  -- 2) ปิด trigger ชั่วคราว (ไม่สร้างประวัติการแก้ไขของข้อมูลทดสอบ และผ่านด่านห้ามลบของตารางที่แก้ไขไม่ได้)
  set local session_replication_role = replica;
  for r in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> all(keep)
    order by c.relname
  loop
    execute format('delete from public.%I', r.relname);
    get diagnostics n = row_count;
    if n > 0 then
      report := report || format('%s=%s ', r.relname, n);
      total := total + n;
    end if;
  end loop;
  delete from public.education_position_types where name like 'TEST-%';
  get diagnostics n = row_count; report := report || format('education_position_types(TEST)=%s ', n);
  delete from public.contact_topic_recipients where user_id = any(test_users);
  -- ประวัติการแก้ไข: เก็บเฉพาะของตารางที่เก็บไว้ ที่ระบบบันทึก (ไม่มีผู้กระทำ)
  delete from public.audit_logs where table_name <> all(keep) or actor_id is not null;
  get diagnostics n = row_count; report := report || format('audit_logs=%s ', n);
  delete from private.request_hits where true;
  delete from private.login_attempts where true;
  delete from private.ops_alerts where true;

  -- 3) ตรวจว่าตารางที่เก็บไว้ไม่มีค่าที่ชี้ไปยังข้อมูลที่ถูกลบ (ตรวจด้วยตนเองเพราะ trigger ของ foreign key ถูกปิดอยู่)
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col, c.confrelid::regclass::text as ref, fa.attname as refcol
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
    where c.contype = 'f' and cardinality(c.conkey) = 1 and c.connamespace = 'public'::regnamespace
  loop
    execute format('select count(*) from %s t where t.%I is not null and not exists (select 1 from %s x where x.%I = t.%I)',
                   r.tbl, r.col, r.ref, r.refcol, r.col) into n;
    if n > 0 then
      raise exception 'หยุด: ตาราง % คอลัมน์ % ยังชี้ไปยังข้อมูลที่ถูกลบ % แถว (ย้อนกลับทั้งหมดแล้ว)', r.tbl, r.col, n;
    end if;
  end loop;
  set local session_replication_role = origin;

  -- 4) ลบบัญชีทดสอบ (ข้อมูลเข้าสู่ระบบ ตัวยืนยัน 2 ขั้น รอบการใช้งาน ถูกลบตามไปด้วย)
  delete from auth.users where id = any(test_users);
  get diagnostics n = row_count; report := report || format('auth.users=%s ', n);

  -- 5) ตัวนับเลขที่แบบ sequence ของตารางงาน เริ่มใหม่ที่ 1
  for r in
    select s.relname from pg_class s
    where s.relkind = 'S' and s.relnamespace = 'public'::regnamespace
      and not exists (select 1 from pg_depend d join pg_class t on t.oid = d.refobjid
                      where d.objid = s.oid and d.deptype in ('a', 'i') and t.relname = any(keep))
  loop
    execute format('select setval(%L, 1, false)', 'public.' || r.relname);
  end loop;

  raise notice 'ล้างข้อมูลทดสอบเสร็จ: %', report;
end;
$$;

-- ผลหลังล้าง (ควรเป็น 0 ทุกแถว ยกเว้นข้อมูลอ้างอิง)
select 'บัญชีผู้ใช้' as รายการ, count(*) as จำนวน from auth.users
union all select 'เขตปกครอง', count(*) from public.org_units
union all select 'บุคคล', count(*) from public.persons
union all select 'สถานที่', count(*) from public.places
union all select 'หนังสือ', count(*) from public.documents
union all select 'คำขอ', count(*) from public.requests
union all select 'ประวัติการแก้ไขที่เหลือ (ข้อมูลอ้างอิง)', count(*) from public.audit_logs
union all select 'บทบาท (เก็บไว้)', count(*) from public.roles
union all select 'ตำบล (เก็บไว้)', count(*) from public.civil_subdistricts;
