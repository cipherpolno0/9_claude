-- บทที่ 31: ตรวจสิทธิ์ ความปลอดภัย และข้อมูลส่วนบุคคล
-- 1) ปิดสิทธิ์ TRUNCATE / TRIGGER / REFERENCES ที่ค้างมาจากค่าเริ่มต้นของตารางรุ่นแรก (TRUNCATE ข้าม RLS ได้)
-- 2) บังคับยืนยันตัวตน 2 ขั้น: ผู้ดูแลระบบและเจ้าหน้าที่ส่วนกลาง (ปิดไม่ได้)
-- 3) จำกัดการล็อกอินผิด (บัญชี+เครื่อง 5 ครั้ง / เครื่อง 30 ครั้ง ใน 15 นาที แล้วระงับ 15 นาที) และตัวนับการค้นหาสาธารณะ
-- 4) นโยบายความเป็นส่วนตัวและข้อความแจ้งวัตถุประสงค์ (privacy_texts: หัวข้อตั้งต้น เนื้อความผู้ดูแลระบบกรอกเอง เริ่มว่าง)
-- 5) บันทึกการเข้าดูข้อมูลบุคคล (person_access_logs อ่านได้เฉพาะผู้ดูแลระบบ)
-- 6) อายุการเก็บข้อมูลส่วนบุคคล (data_retention_rules ผู้ดูแลระบบกรอกเอง เริ่มว่าง ระบบรายงานรายการที่ครบอายุ ไม่ลบเอง)
-- 7) หัวข้อติดต่อ "ข้อมูลส่วนบุคคล" สำหรับขอแก้ไขหรือลบข้อมูล
-- ผู้สั่งงานเลือก: นโยบาย อายุการเก็บ ผู้ดูแลระบบกรอกเอง / คำขอแก้ไขลบผ่านแบบฟอร์มติดต่อเรา / บันทึกการเข้าดูเห็นเฉพาะผู้ดูแลระบบ

-- ---------------------------------------------------------------
-- 1) สิทธิ์ตารางที่เกินจำเป็น
-- ---------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm') loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', r.relname);
  end loop;
end;
$$;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- ---------------------------------------------------------------
-- 2) ยืนยันตัวตน 2 ขั้น
-- ---------------------------------------------------------------
update public.roles set mfa_required = true where key in ('admin', 'central_staff') and not mfa_required;
alter table public.roles add constraint roles_mfa_core check (key not in ('admin', 'central_staff') or mfa_required);

-- ---------------------------------------------------------------
-- 3) จำกัดการล็อกอินผิด และตัวนับการค้นหาสาธารณะ (เรียกได้เฉพาะเซิร์ฟเวอร์ของเว็บ = service_role)
-- ---------------------------------------------------------------
create table private.login_attempts (
  key_hash      text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  failures      integer not null default 0,
  window_start  timestamptz not null default now(),
  locked_until  timestamptz
);
comment on table private.login_attempts is 'ตัวนับล็อกอินผิดต่อ (บัญชี+เครื่อง) และต่อเครื่อง เก็บเฉพาะรหัสแฮช ไม่เก็บอีเมลหรือที่อยู่ IP';
alter table private.login_attempts enable row level security;

-- คืนเวลาที่ถูกระงับถึง (ว่าง = ล็อกอินได้)
create function public.login_attempt_status(p_account_key text, p_device_key text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(a.locked_until) from private.login_attempts a
  where a.key_hash in (p_account_key, p_device_key) and a.locked_until > now();
$$;

-- บันทึกล็อกอินผิด: บัญชี+เครื่อง ครบ 5 ครั้ง หรือ เครื่อง ครบ 30 ครั้ง ใน 15 นาที = ระงับ 15 นาที
create function public.login_attempt_failed(p_account_key text, p_device_key text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  lim integer;
  v_until timestamptz;
begin
  foreach k in array array[p_account_key, p_device_key] loop
    if coalesce(k, '') !~ '^[0-9a-f]{64}$' then
      raise exception 'รหัสไม่ถูกต้อง' using errcode = 'P0001';
    end if;
    lim := case when k = p_account_key then 5 else 30 end;
    insert into private.login_attempts as a (key_hash, failures, window_start)
    values (k, 1, now())
    on conflict (key_hash) do update
      set failures = case when a.window_start < now() - interval '15 minutes' then 1 else a.failures + 1 end,
          window_start = case when a.window_start < now() - interval '15 minutes' then now() else a.window_start end;
    update private.login_attempts a
       set locked_until = now() + interval '15 minutes', failures = 0, window_start = now()
     where a.key_hash = k and a.failures >= lim;
  end loop;
  select public.login_attempt_status(p_account_key, p_device_key) into v_until;
  return v_until;
end;
$$;

create function public.login_attempt_succeeded(p_account_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update private.login_attempts set failures = 0, locked_until = null, window_start = now()
  where key_hash = p_account_key and (failures > 0 or locked_until is not null);
$$;

-- ตัวนับทั่วไปของหน้าสาธารณะ (ค้นหา ขอบัญชี ลืมรหัสผ่าน) ใช้ private.rate_limit_window ชุดเดิม
create function public.public_rate_hit(p_bucket text, p_client text, p_limit integer, p_unit text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_bucket, '') !~ '^[a-z_]{3,40}$' or p_limit not between 1 and 10000 then
    raise exception 'ค่าตัวนับไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  return private.rate_limit_window(p_bucket, p_client, p_limit, p_unit);
end;
$$;

-- ---------------------------------------------------------------
-- 4) นโยบายความเป็นส่วนตัว และข้อความแจ้งวัตถุประสงค์
-- ---------------------------------------------------------------
create table public.privacy_texts (
  key         text primary key check (key ~ '^[a-z_]+$'),
  kind        text not null check (kind in ('policy', 'notice')),
  title       text not null check (btrim(title) <> '' and length(title) <= 200),
  body        text not null default '' check (length(body) <= 20000),
  sort_order  integer not null default 0,
  updated_by  uuid default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.privacy_texts is 'นโยบายความเป็นส่วนตัว (kind policy = หัวข้อของหน้า /privacy) และข้อความแจ้งวัตถุประสงค์บนแบบฟอร์มที่เก็บข้อมูล (kind notice) เนื้อความผู้ดูแลระบบกรอกเอง ว่าง = ยังไม่ได้ระบุ';
insert into public.privacy_texts (key, kind, title, sort_order) values
  ('controller', 'policy', 'ผู้ควบคุมข้อมูลส่วนบุคคลและช่องทางติดต่อ', 10),
  ('collected', 'policy', 'ข้อมูลส่วนบุคคลที่เก็บรวบรวม', 20),
  ('purposes', 'policy', 'วัตถุประสงค์และฐานในการประมวลผล', 30),
  ('retention', 'policy', 'ระยะเวลาการเก็บรักษา', 40),
  ('disclosure', 'policy', 'การเปิดเผยข้อมูลแก่บุคคลหรือหน่วยงานอื่น', 50),
  ('security', 'policy', 'การรักษาความมั่นคงปลอดภัยของข้อมูล', 60),
  ('rights', 'policy', 'สิทธิของเจ้าของข้อมูลส่วนบุคคล', 70),
  ('changes', 'policy', 'การเปลี่ยนแปลงนโยบาย', 80),
  ('notice_contact', 'notice', 'แบบฟอร์มติดต่อเรา', 110),
  ('notice_account', 'notice', 'แบบฟอร์มขอบัญชีผู้ใช้', 120),
  ('notice_personnel', 'notice', 'ทะเบียนบุคลากรและ จศป.', 130),
  ('notice_registration', 'notice', 'บัญชีผู้สมัครสอบ', 140),
  ('notice_quiz', 'notice', 'คลังข้อสอบและผลการเรียน', 150);
create trigger privacy_texts_set_updated_at before update on public.privacy_texts
  for each row execute function public.set_updated_at();
create trigger privacy_texts_audit after insert or update or delete on public.privacy_texts
  for each row execute function public.audit_row_change();
alter table public.privacy_texts enable row level security;
create policy privacy_texts_read on public.privacy_texts for select to authenticated using (true);
create policy privacy_texts_update on public.privacy_texts for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.privacy_texts from anon;
revoke insert, delete, truncate on public.privacy_texts from authenticated;
grant select, update on public.privacy_texts to authenticated;

create function public.public_privacy()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'policy', coalesce((select jsonb_agg(jsonb_build_object('key', p.key, 'title', p.title, 'body', p.body) order by p.sort_order)
                        from public.privacy_texts p where p.kind = 'policy'), '[]'::jsonb),
    'notices', coalesce((select jsonb_object_agg(p.key, jsonb_build_object('title', p.title, 'body', p.body))
                         from public.privacy_texts p where p.kind = 'notice'), '{}'::jsonb),
    'updated_at', (select max(p.updated_at) from public.privacy_texts p));
$$;

-- ---------------------------------------------------------------
-- 5) บันทึกการเข้าดูข้อมูลบุคคล (ระบบเขียนเท่านั้น ไม่ผูก audit เพราะเป็นบันทึกอยู่แล้ว)
-- ---------------------------------------------------------------
create table public.person_access_logs (
  id            bigint generated always as identity primary key,
  viewer_id     uuid not null references public.profiles (id),
  subject_type  text not null check (subject_type in ('person', 'education_staff', 'candidate', 'registration_batch',
                                                     'registration_list', 'person_search', 'personnel_export',
                                                     'personnel_report', 'pass_list', 'result_list', 'contact_message')),
  subject_id    text not null default '' check (length(subject_id) <= 100),
  action        text not null check (action in ('view', 'export', 'print', 'search')),
  detail        text not null default '' check (length(detail) <= 300),
  created_at    timestamptz not null default now()
);
comment on table public.person_access_logs is 'บันทึกการเข้าดูข้อมูลบุคคล (ใครดูของใครเมื่อใด) เขียนผ่าน log_person_access เท่านั้น อ่านได้เฉพาะผู้ดูแลระบบ';
create index person_access_logs_time_idx on public.person_access_logs (created_at desc);
create index person_access_logs_viewer_idx on public.person_access_logs (viewer_id, created_at desc);
create index person_access_logs_subject_idx on public.person_access_logs (subject_type, subject_id, created_at desc);
alter table public.person_access_logs enable row level security;
create policy person_access_logs_read on public.person_access_logs for select to authenticated using (public.has_role('admin'));
revoke all on public.person_access_logs from anon;
revoke insert, update, delete, truncate on public.person_access_logs from authenticated;
grant select on public.person_access_logs to authenticated;

-- บันทึกหนึ่งครั้ง (เปิดหน้าเดิมซ้ำภายใน 1 นาทีไม่บันทึกซ้ำ)
create function public.log_person_access(p_type text, p_subject text, p_action text, p_detail text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_subject text := left(coalesce(p_subject, ''), 100);
begin
  if v_uid is null then
    return;
  end if;
  if exists (select 1 from public.person_access_logs l
             where l.viewer_id = v_uid and l.subject_type = p_type and l.subject_id = v_subject and l.action = p_action
               and l.created_at > now() - interval '1 minute') then
    return;
  end if;
  insert into public.person_access_logs (viewer_id, subject_type, subject_id, action, detail)
  values (v_uid, p_type, v_subject, p_action, left(coalesce(p_detail, ''), 300));
end;
$$;

-- รายการบันทึก (ผู้ดูแลระบบ) พร้อมชื่อผู้ดูและชื่อเจ้าของข้อมูล (ถ้าเป็นรายบุคคล)
create function public.person_access_log_rows(p_viewer uuid, p_type text, p_subject text, p_from date, p_to date, p_limit integer, p_offset integer)
returns table (id bigint, created_at timestamptz, viewer_id uuid, viewer_name text, viewer_email text, subject_type text,
               subject_id text, subject_name text, action text, detail text, total_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    return;
  end if;
  return query
  select l.id, l.created_at, l.viewer_id,
         btrim(concat_ws(' ', nullif(pr.title_prefix, ''), pr.first_name, nullif(pr.monastic_name, ''), nullif(pr.last_name, ''))),
         pr.email, l.subject_type, l.subject_id,
         case l.subject_type
           when 'person' then (select btrim(concat_ws(' ', nullif(p.title, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, '')))
                               from public.persons p where p.id::text = l.subject_id)
           when 'education_staff' then (select btrim(concat_ws(' ', p.first_name, nullif(p.last_name, '')))
                                        from public.education_staff e join public.persons p on p.id = e.person_id where e.id::text = l.subject_id)
           when 'candidate' then (select btrim(concat_ws(' ', nullif(c.title, ''), c.first_name, nullif(c.monastic_name, ''), nullif(c.last_name, '')))
                                  from public.candidates c where c.id::text = l.subject_id)
           when 'registration_batch' then (select pl.name from public.registration_batches b join public.places pl on pl.id = b.place_id
                                           where b.id::text = l.subject_id)
           else ''
         end,
         l.action, l.detail, count(*) over ()
  from public.person_access_logs l
  join public.profiles pr on pr.id = l.viewer_id
  where (p_viewer is null or l.viewer_id = p_viewer)
    and (coalesce(p_type, '') = '' or l.subject_type = p_type)
    and (coalesce(p_subject, '') = '' or l.subject_id = p_subject)
    and (p_from is null or l.created_at >= (p_from::timestamp at time zone 'Asia/Bangkok'))
    and (p_to is null or l.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Bangkok'))
  order by l.created_at desc, l.id desc
  limit greatest(least(coalesce(p_limit, 100), 5000), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------
-- 6) อายุการเก็บข้อมูลส่วนบุคคล (ผู้ดูแลระบบกรอกเอง เริ่มว่าง)
-- ---------------------------------------------------------------
create table public.data_retention_rules (
  data_key    text primary key check (data_key ~ '^[a-z_]+$'),
  label       text not null,
  basis       text not null,
  years       integer check (years is null or years between 1 and 100),
  note        text not null default '' check (length(note) <= 500),
  sort_order  integer not null default 0,
  updated_by  uuid default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.data_retention_rules is 'อายุการเก็บข้อมูลส่วนบุคคลต่อชนิดข้อมูล (ว่าง = ไม่กำหนด) ระบบรายงานรายการที่ครบอายุให้ผู้ดูแลระบบตรวจ ไม่ลบเอง (อายุการเก็บหนังสือราชการอยู่ที่ doc_retention_rules)';
insert into public.data_retention_rules (data_key, label, basis, sort_order) values
  ('persons_inactive', 'ประวัติบุคลากรที่ปิดใช้งานหรือพ้นสถานะ', 'นับจากวันที่แก้ไขครั้งล่าสุด', 10),
  ('candidates', 'ข้อมูลผู้สมัครสอบ', 'นับจากวันที่บันทึกผู้สมัคร', 20),
  ('exam_results', 'ผลสอบรายบุคคล', 'นับจากวันที่บันทึกผล', 30),
  ('account_requests', 'คำขอบัญชีผู้ใช้และหนังสือรับรอง', 'นับจากวันที่ยื่นคำขอ', 40),
  ('contact_messages', 'ข้อความจากแบบฟอร์มติดต่อเรา', 'นับจากวันที่ส่งข้อความ', 50),
  ('quiz_attempts', 'ประวัติการทำแบบทดสอบ', 'นับจากวันที่เริ่มทำ', 60),
  ('notifications', 'แจ้งเตือนในระบบ', 'นับจากวันที่แจ้ง', 70),
  ('person_access_logs', 'บันทึกการเข้าดูข้อมูลบุคคล', 'นับจากวันที่บันทึก', 80),
  ('audit_logs', 'ประวัติการแก้ไขข้อมูล (audit)', 'นับจากวันที่บันทึก', 90);
create trigger data_retention_rules_set_updated_at before update on public.data_retention_rules
  for each row execute function public.set_updated_at();
create trigger data_retention_rules_audit after insert or update or delete on public.data_retention_rules
  for each row execute function public.audit_row_change();
alter table public.data_retention_rules enable row level security;
create policy data_retention_rules_read on public.data_retention_rules for select to authenticated using (public.has_role('admin'));
create policy data_retention_rules_update on public.data_retention_rules for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.data_retention_rules from anon;
revoke insert, delete, truncate on public.data_retention_rules from authenticated;
grant select, update on public.data_retention_rules to authenticated;

-- จำนวนรายการที่ครบอายุการเก็บแล้ว (ผู้ดูแลระบบ)
create function public.retention_due_summary()
returns table (data_key text, label text, basis text, years integer, note text, due_count bigint, oldest timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.data_retention_rules%rowtype;
  v_cut timestamptz;
  v_count bigint;
  v_oldest timestamptz;
begin
  if not public.has_role('admin') then
    return;
  end if;
  for r in select * from public.data_retention_rules order by sort_order loop
    v_count := null;
    v_oldest := null;
    if r.years is not null then
      v_cut := now() - make_interval(years => r.years);
      if r.data_key = 'persons_inactive' then
        select count(*), min(p.updated_at) into v_count, v_oldest from public.persons p
        where (not p.is_active or p.status in ('transferred', 'resigned', 'deceased', 'disrobed', 'removed_other')) and p.updated_at < v_cut;
      elsif r.data_key = 'candidates' then
        select count(*), min(c.created_at) into v_count, v_oldest from public.candidates c where c.created_at < v_cut;
      elsif r.data_key = 'exam_results' then
        select count(*), min(e.created_at) into v_count, v_oldest from public.exam_results e where e.created_at < v_cut;
      elsif r.data_key = 'account_requests' then
        select count(*), min(a.created_at) into v_count, v_oldest from public.account_requests a where a.created_at < v_cut;
      elsif r.data_key = 'contact_messages' then
        select count(*), min(m.created_at) into v_count, v_oldest from public.contact_messages m where m.created_at < v_cut;
      elsif r.data_key = 'quiz_attempts' then
        select count(*), min(q.started_at) into v_count, v_oldest from public.quiz_attempts q where q.started_at < v_cut;
      elsif r.data_key = 'notifications' then
        select count(*), min(n.created_at) into v_count, v_oldest from public.notifications n where n.created_at < v_cut;
      elsif r.data_key = 'person_access_logs' then
        select count(*), min(l.created_at) into v_count, v_oldest from public.person_access_logs l where l.created_at < v_cut;
      elsif r.data_key = 'audit_logs' then
        select count(*), min(a.created_at) into v_count, v_oldest from public.audit_logs a where a.created_at < v_cut;
      end if;
    end if;
    data_key := r.data_key; label := r.label; basis := r.basis; years := r.years; note := r.note;
    due_count := v_count; oldest := v_oldest;
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- 7) หัวข้อติดต่อ ข้อมูลส่วนบุคคล (ขอแก้ไขหรือลบข้อมูล)
-- ---------------------------------------------------------------
alter table public.contact_topics drop constraint contact_topics_key_check;
alter table public.contact_topics add constraint contact_topics_key_check
  check (key in ('registry', 'exams', 'results', 'requests', 'quiz', 'system', 'privacy'));
insert into public.contact_topics (key, name, sort_order) values ('privacy', 'ข้อมูลส่วนบุคคล (ขอแก้ไขหรือลบ)', 70);

-- ---------------------------------------------------------------
-- 8) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke execute on function public.login_attempt_status(text, text) from public, anon, authenticated;
revoke execute on function public.login_attempt_failed(text, text) from public, anon, authenticated;
revoke execute on function public.login_attempt_succeeded(text) from public, anon, authenticated;
revoke execute on function public.public_rate_hit(text, text, integer, text) from public, anon, authenticated;
revoke execute on function public.public_privacy() from public;
revoke execute on function public.log_person_access(text, text, text, text) from public, anon;
revoke execute on function public.person_access_log_rows(uuid, text, text, date, date, integer, integer) from public, anon;
revoke execute on function public.retention_due_summary() from public, anon;

grant execute on function public.login_attempt_status(text, text) to service_role;
grant execute on function public.login_attempt_failed(text, text) to service_role;
grant execute on function public.login_attempt_succeeded(text) to service_role;
grant execute on function public.public_rate_hit(text, text, integer, text) to service_role;
grant execute on function public.public_privacy() to anon, authenticated;
grant execute on function public.log_person_access(text, text, text, text) to authenticated;
grant execute on function public.person_access_log_rows(uuid, text, text, date, date, integer, integer) to authenticated;
grant execute on function public.retention_due_summary() to authenticated;
