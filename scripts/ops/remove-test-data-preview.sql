-- ดูรายการที่จะถูกลบก่อนล้างข้อมูลทดสอบ (บทที่ 32) อ่านอย่างเดียว ไม่เปลี่ยนข้อมูล
-- วิธีรัน: Supabase (โครงการใช้งานจริง) > SQL Editor > วางทั้งไฟล์ > Run  แล้วจึงรัน remove-test-data.sql
with keep(t) as (
  select unnest(array[
    'academic_years', 'app_settings', 'asset_types', 'budget_approval_limits', 'budget_categories', 'budget_sources',
    'civil_districts', 'civil_provinces', 'civil_subdistricts', 'contact_topics', 'contact_topic_recipients', 'courses',
    'data_retention_rules', 'doc_retention_rules', 'downloads', 'announcements', 'announcement_files', 'exam_calendar_events',
    'education_position_types', 'exam_result_forms', 'fiscal_years', 'form_templates', 'form_title_options',
    'inventory_categories', 'items', 'lessons', 'position_types', 'privacy_texts', 'questions', 'request_document_types',
    'request_types', 'role_menus', 'roles', 'site_contact', 'units', 'audit_logs'])
),
counts as (
  select c.relname as t,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint as n
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
)
select 'ด่านกันพลาด' as หมวด, 'เขตปกครองที่ไม่ใช่ TEST (ต้องเป็น 0)' as รายการ, count(*)::bigint as จำนวน from public.org_units where code not like 'TEST%'
union all select 'ด่านกันพลาด', 'บัญชีที่ไม่ใช่บัญชีทดสอบ (ต้องเป็น 0)', count(*) from auth.users where email not like 'test.%@example.com'
union all select 'จะลบ', 'บัญชีทดสอบ', count(*) from auth.users where email like 'test.%@example.com'
union all select 'จะลบ', t, n from counts where n > 0 and t not in (select t from keep)
union all select 'จะลบ', 'education_position_types (ชื่อขึ้นต้น TEST-)', count(*) from public.education_position_types where name like 'TEST-%'
union all select 'จะลบ', 'audit_logs (ประวัติของข้อมูลทดสอบ)', count(*) from public.audit_logs a
  where a.table_name not in (select t from keep) or a.actor_id is not null
union all select 'เก็บไว้', t, n from counts where n > 0 and t in (select t from keep) and t <> 'audit_logs'
order by 1, 2;
