-- บทที่ 19 (1/2): แก้ไข ถอน ส่งบัญชี และสถิติสมัครสอบ (ระบบที่ 9)
--   บัญชี = ชุดรายชื่อเดิมของบทที่ 18 (หนึ่งบัญชีต่อ รอบ + สำนัก + สนามสอบ ที่ยังไม่ถอน) อัปโหลดไฟล์เพิ่มเติมต่อท้ายบัญชีเดิม
--   ก่อนปิดรับสมัคร: ผู้อัปโหลด (หรือส่วนกลาง) แก้ไขรายคน เพิ่มทีละคน ถอนรายชื่อ อัปโหลดเพิ่มได้ เมื่อบัญชียังไม่ส่ง
--   ส่งบัญชี: ล็อกรายชื่อ ออกเลขที่รับ REG-ปี-ลำดับ (เลขที่คำขอ) ส่งเข้าเครื่องอนุมัติกลาง
--     ผู้สั่งงานกำหนด: รับรอง 2 ชั้น อำเภอ > จังหวัด ของเขตสำนัก โดยเจ้าคณะหรือรองเจ้าคณะ
--   หลังปิดรับสมัคร หรือบัญชีที่ส่งแล้ว: แก้ไขได้เฉพาะส่วนกลางและผู้ดูแลระบบ ต้องระบุเหตุผล
--   สถานะบัญชี: draft ร่าง / confirmed ยืนยันแล้ว / submitted ส่งแล้ว รอรับรอง / returned ถูกส่งกลับแก้ไข
--              certified รับรองแล้ว / withdrawn ถอน

-- ---------------------------------------------------------------
-- 1) ชนิดคำขอ
-- ---------------------------------------------------------------
insert into public.request_types (key, code, name, route_levels, start_at_own_unit, decider_roles, central_roles)
values ('exam_registration', 'REG', 'ส่งบัญชีผู้สมัครสอบ', '{district,province}', true, '{chief,deputy_chief}', '{central_staff}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- 2) ปรับตารางของบทที่ 18
-- ---------------------------------------------------------------
alter table public.registration_batches drop constraint registration_batches_status_check;
alter table public.registration_batches add constraint registration_batches_status_check
  check (status in ('draft', 'confirmed', 'submitted', 'returned', 'certified', 'withdrawn'));
alter table public.registration_batches
  add column request_id   uuid references public.requests (id),        -- คำขอรับรองล่าสุด (เลขที่รับ)
  add column submitted_at timestamptz,
  add column submitted_by uuid references public.profiles (id),
  add column certified_at timestamptz;
-- หนึ่งบัญชีต่อ รอบ + สำนัก + สนามสอบ (ไม่นับที่ถอนแล้ว)
create unique index registration_batches_active_unique on public.registration_batches (round_id, place_id, venue_id)
  where status <> 'withdrawn';
create index registration_batches_request_idx on public.registration_batches (request_id);

-- withdrawn = ถอนรายชื่อ (ไม่นับ ไม่ลบ) / file_no: 1 = ไฟล์แรก, 2.. = ไฟล์เพิ่มเติม, 0 = เพิ่มทีละคนบนหน้าจอ
alter table public.candidates drop constraint candidates_status_check;
alter table public.candidates add constraint candidates_status_check
  check (status in ('ok', 'error', 'excluded', 'withdrawn'));
alter table public.candidates
  add column file_no         integer not null default 1 check (file_no >= 0),
  add column withdrawn_at    timestamptz,
  add column withdraw_reason text not null default '' check (length(withdraw_reason) <= 500);
alter table public.candidates drop constraint candidates_row_unique;
alter table public.candidates add constraint candidates_row_unique unique (batch_id, file_no, row_no);
grant select (file_no, withdrawn_at, withdraw_reason) on public.candidates to authenticated;

-- ไฟล์เพิ่มเติมของบัญชี (ไฟล์แรกอยู่ที่ registration_batches.file_*)
create table public.registration_files (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references public.registration_batches (id),
  file_no      integer not null check (file_no >= 2),
  file_name    text not null default '' check (length(file_name) <= 200),
  file_path    text not null default '',
  file_size    integer not null default 0 check (file_size >= 0),
  row_count    integer not null default 0 check (row_count >= 0),
  uploaded_by  uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (batch_id, file_no)
);
comment on table public.registration_files is 'ไฟล์ Excel ที่อัปโหลดเพิ่มเติมเข้าบัญชีผู้สมัครเดิม (ระบบเขียนเท่านั้น)';

-- ประวัติการแก้ไขบัญชี (ระบบเขียนเท่านั้น) เก็บเหตุผลและผู้ทำ แสดงในหน้าบัญชี
create table public.registration_changes (
  id            bigint generated always as identity primary key,
  batch_id      uuid not null references public.registration_batches (id),
  candidate_id  uuid references public.candidates (id),
  action        text not null check (action in ('add', 'edit', 'withdraw', 'append_file', 'confirm', 'submit', 'resubmit',
                                                 'returned', 'certified', 'rejected', 'cancelled', 'withdraw_batch')),
  reason        text not null default '' check (length(reason) <= 500),
  after_close   boolean not null default false,       -- ทำหลังปิดรับสมัครหรือหลังส่ง (ส่วนกลางแก้แทน)
  detail        jsonb not null default '{}'::jsonb,    -- ชื่อผู้สมัคร ช่องที่เปลี่ยน จำนวนแถว เลขที่รับ (ไม่มีเลขประจำตัว)
  actor_id      uuid references public.profiles (id) default auth.uid(),
  created_at    timestamptz not null default now()
);
comment on table public.registration_changes is 'ประวัติการแก้ไข เพิ่ม ถอน ส่ง และผลรับรองของบัญชีผู้สมัครสอบ';
create index registration_changes_batch_idx on public.registration_changes (batch_id, created_at);

create trigger registration_files_set_updated_at before update on public.registration_files
  for each row execute function public.set_updated_at();
create trigger registration_files_audit after insert or update or delete on public.registration_files
  for each row execute function public.audit_row_change();
create trigger registration_changes_audit after insert or update or delete on public.registration_changes
  for each row execute function public.audit_row_change();

alter table public.registration_files enable row level security;
alter table public.registration_changes enable row level security;
revoke all on public.registration_files, public.registration_changes from anon;
revoke insert, update, delete, truncate on public.registration_files, public.registration_changes from authenticated;
create policy registration_files_read on public.registration_files for select to authenticated
  using (exists (
    select 1 from public.registration_batches b
    where b.id = batch_id and public.can_view_registration(b.org_unit_id, b.uploaded_by)
  ));
create policy registration_changes_read on public.registration_changes for select to authenticated
  using (exists (
    select 1 from public.registration_batches b
    where b.id = batch_id and public.can_view_registration(b.org_unit_id, b.uploaded_by)
  ));

-- ---------------------------------------------------------------
-- 3) ตัวช่วย
-- ---------------------------------------------------------------
-- ชื่อการสอบ เช่น นักธรรมชั้นตรี
create function private.exam_name(p_type text, p_level text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (case p_type when 'nak_tham' then 'นักธรรม' when 'tham_sueksa' then 'ธรรมศึกษา' else p_type end)
      || (case p_level when 'tri' then 'ชั้นตรี' when 'tho' then 'ชั้นโท' when 'ek' then 'ชั้นเอก' else p_level end);
$$;
revoke all on function private.exam_name(text, text) from public, anon, authenticated;

-- ตรวจค่าของผู้สมัคร 1 คนตามแบบ ศ. (กติกาเดียวกับบทที่ 18: ช่องบังคับ ชนิด ช่วงค่า รายการ สูตร เลขประจำตัว
-- อุปสมบทก่อนเกิด ประโยคเดิมของชั้นโท เอก) ยังไม่รวมการตรวจซ้ำ  p_errs = ข้อผิดพลาดจากการอ่านไฟล์
create function private.registration_validate(
  p_template public.form_templates, p_round public.exam_rounds, p_year integer, p_vals jsonb, p_errs jsonb,
  out errs jsonb, out nid text, out hash text, out birth date, out ord date, out pkey text)
returns record
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_col jsonb;
  v_ckey text;
  v_type text;
  v_val text;
  v_note text;
  v_ref date := p_round.exam_starts_on;
begin
  errs := coalesce(p_errs, '[]'::jsonb);
  for v_col in select value from jsonb_array_elements(p_template.columns) loop
    v_ckey := v_col ->> 'key';
    v_type := v_col ->> 'type';
    v_val := btrim(coalesce(p_vals ->> v_ckey, ''));
    if errs @> jsonb_build_array(jsonb_build_object('field', v_ckey)) then
      continue;
    end if;
    if v_val = '' then
      if (v_col ->> 'required')::boolean and v_type <> 'id' then
        errs := errs || jsonb_build_object('field', v_ckey, 'message', 'ต้องกรอก');
      end if;
      continue;
    end if;
    if length(v_val) > 200 then
      errs := errs || jsonb_build_object('field', v_ckey, 'message', 'ยาวเกิน 200 ตัวอักษร');
    elsif v_type in ('number', 'year') then
      if v_val !~ '^\d{1,10}$' then
        errs := errs || jsonb_build_object('field', v_ckey, 'message', 'ต้องเป็นตัวเลขอารบิก');
      elsif v_val::bigint not between (v_col ->> 'min')::bigint and (v_col ->> 'max')::bigint then
        errs := errs || jsonb_build_object('field', v_ckey,
          'message', format('ต้องอยู่ระหว่าง %s ถึง %s', v_col ->> 'min', v_col ->> 'max'));
      end if;
    elsif v_type = 'list' then
      if not (v_col -> 'options') ? v_val then
        errs := errs || jsonb_build_object('field', v_ckey,
          'message', 'เลือกได้เฉพาะ ' || (select string_agg(o, ' / ') from jsonb_array_elements_text(v_col -> 'options') o));
      end if;
    elsif v_type = 'date' then
      if private.iso_date_or_null(v_val) is null then
        errs := errs || jsonb_build_object('field', v_ckey, 'message', 'วันที่ไม่ถูกต้อง พิมพ์แบบ วัน/เดือน/ปี พ.ศ. เช่น 1/1/2540');
      elsif private.iso_date_or_null(v_val) > v_ref then
        errs := errs || jsonb_build_object('field', v_ckey, 'message', 'วันที่อยู่หลังวันสอบ');
      end if;
    elsif v_type = 'text' and left(v_val, 1) = '=' then
      errs := errs || jsonb_build_object('field', v_ckey, 'message', 'ห้ามใช้สูตร');
    end if;
  end loop;

  -- เลขประจำตัว: 13 หลักต้องผ่านเลขตรวจสอบ / เลขอื่นหรือไม่มี ต้องระบุเหตุในช่องหมายเหตุ (ผู้สั่งงานกำหนด)
  nid := upper(regexp_replace(coalesce(p_vals ->> 'national_id', ''), '[\s-]', '', 'g'));
  v_note := btrim(coalesce(p_vals ->> 'note', ''));
  hash := null;
  if not errs @> '[{"field":"national_id"}]'::jsonb then
    if nid ~ '^\d{13}$' then
      if not public.valid_national_id(nid) then
        errs := errs || '{"field":"national_id","message":"เลขประจำตัวประชาชนไม่ถูกต้อง (เลขตรวจสอบไม่ตรง)"}'::jsonb;
      end if;
    elsif nid = '' then
      if exists (select 1 from jsonb_array_elements(p_template.columns) c where c ->> 'key' = 'national_id' and (c ->> 'required')::boolean) then
        errs := errs || '{"field":"national_id","message":"ต้องกรอก"}'::jsonb;
      elsif v_note = '' then
        errs := errs || '{"field":"national_id","message":"ไม่มีเลขประจำตัว ต้องระบุเหตุในช่องหมายเหตุ"}'::jsonb;
      end if;
    elsif nid !~ '^[0-9A-Z]{5,20}$' then
      errs := errs || '{"field":"national_id","message":"เลขประจำตัวมีอักขระที่ใช้ไม่ได้"}'::jsonb;
    elsif v_note = '' then
      errs := errs || '{"field":"national_id","message":"ไม่ใช่เลข 13 หลัก ต้องระบุเหตุในช่องหมายเหตุ เช่น ต่างชาติ"}'::jsonb;
    end if;
  end if;
  if nid <> '' then
    hash := encode(extensions.hmac(convert_to(nid, 'utf8'), convert_to(private.national_id_key(), 'utf8'), 'sha256'), 'hex');
  end if;

  birth := private.iso_date_or_null(p_vals ->> 'birth_date');
  ord := private.iso_date_or_null(p_vals ->> 'ordination_date');
  if birth is not null and ord is not null and ord < birth then
    errs := errs || '{"field":"ordination_date","message":"วันอุปสมบทอยู่ก่อนวันเกิด"}'::jsonb;
  end if;

  -- คุณสมบัติตามชั้น (ตรวจเท่าที่ไฟล์บอกได้): ชั้นโท เอก ปีที่สอบได้ชั้นก่อนหน้าต้องก่อนปีที่สมัคร
  if p_round.level in ('tho', 'ek') and (p_vals ->> 'prev_year') ~ '^\d{4}$'
     and (p_vals ->> 'prev_year')::integer >= p_year
     and not errs @> '[{"field":"prev_year"}]'::jsonb then
    errs := errs || jsonb_build_object('field', 'prev_year',
      'message', format('ปีที่สอบได้ชั้นก่อนหน้าต้องก่อนปีที่สมัคร (%s)', p_year));
  end if;

  pkey := private.person_key(p_vals ->> 'first_name', p_vals ->> 'last_name', birth);
end;
$$;
revoke all on function private.registration_validate(public.form_templates, public.exam_rounds, integer, jsonb, jsonb) from public, anon, authenticated;

-- ใส่ชื่อช่องให้ข้อผิดพลาดทุกข้อ
create function private.registration_label_errors(p_template public.form_templates, p_errs jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(e || jsonb_build_object('label', coalesce(
           (select c ->> 'label' from jsonb_array_elements(p_template.columns) c where c ->> 'key' = e ->> 'field' limit 1),
           e ->> 'field'))), '[]'::jsonb)
  from jsonb_array_elements(p_errs) e;
$$;
revoke all on function private.registration_label_errors(public.form_templates, jsonb) from public, anon, authenticated;

-- คอลัมน์อื่นตามแบบ (เก็บใน candidates.extra)
create function private.registration_extra(p_template public.form_templates, p_vals jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
  from jsonb_each_text(p_vals) as x(k, v)
  where k <> all (array['seq', 'national_id', 'title', 'first_name', 'monastic_name', 'last_name', 'birth_date',
                        'ordination_date', 'stage'])
    and v <> ''
    and exists (select 1 from jsonb_array_elements(p_template.columns) c where c ->> 'key' = k);
$$;
revoke all on function private.registration_extra(public.form_templates, jsonb) from public, anon, authenticated;

-- ค่าเดิมของผู้สมัครเป็น {คีย์คอลัมน์: ข้อความ} (ไม่รวมเลขประจำตัว)
create function private.candidate_values(p_c public.candidates)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'seq', p_c.seq::text, 'title', nullif(p_c.title, ''), 'first_name', nullif(p_c.first_name, ''),
    'monastic_name', nullif(p_c.monastic_name, ''), 'last_name', nullif(p_c.last_name, ''),
    'birth_date', p_c.birth_date::text, 'ordination_date', p_c.ordination_date::text, 'stage', nullif(p_c.stage, '')))
    || coalesce(p_c.extra, '{}'::jsonb);
$$;
revoke all on function private.candidate_values(public.candidates) from public, anon, authenticated;

-- ซ้ำกับผู้สมัครที่นับแล้วในรอบเดียวกันทั่วประเทศ (ไม่รวมบัญชีของตนเอง) คืนข้อความ หรือ null
create function private.registration_dup(p_round uuid, p_batch uuid, p_hash text, p_birth date, p_pkey text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select format('สมัครในรอบนี้แล้ว (รหัส %s %s)', c.candidate_code, p.name)
  from public.candidates c
  join public.registration_batches b on b.id = c.batch_id
  join public.places p on p.id = b.place_id
  where c.round_id = p_round and c.counted and c.batch_id <> p_batch
    and ((p_hash is not null and c.national_id_hash = p_hash)
         or (p_hash is null and p_birth is not null and c.person_key = p_pkey))
  limit 1;
$$;
revoke all on function private.registration_dup(uuid, uuid, text, date, text) from public, anon, authenticated;

-- ป้ายของแถวที่มีอยู่แล้วในบัญชี ใช้ในข้อความซ้ำ
create function private.candidate_row_label(p_file_no integer, p_row_no integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_file_no = 0 then format('รายชื่อที่เพิ่มบนหน้าจอ ลำดับ %s', p_row_no)
              else format('แถวที่ %s ของไฟล์ที่ %s', p_row_no, p_file_no) end;
$$;
revoke all on function private.candidate_row_label(integer, integer) from public, anon, authenticated;

-- นับยอดของบัญชีใหม่ (ไม่ผ่าน = error + excluded; บันทึกแล้ว = ผู้สมัครที่นับ)
create function private.registration_recount(p_batch uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.registration_batches b
     set row_count = x.n_all, ok_count = x.n_ok, error_count = x.n_bad, saved_count = x.n_counted
    from (select count(*)::integer as n_all,
                 count(*) filter (where status = 'ok')::integer as n_ok,
                 count(*) filter (where status in ('error', 'excluded'))::integer as n_bad,
                 count(*) filter (where counted)::integer as n_counted
          from public.candidates where batch_id = p_batch) x
   where b.id = p_batch;
$$;
revoke all on function private.registration_recount(uuid) from public, anon, authenticated;

-- ออกรหัสผู้สมัครให้แถวที่ผ่านและยังไม่นับ (p_only = เฉพาะแถวนี้) แล้วนับเป็นผู้สมัคร คืนจำนวน
create function private.registration_assign_codes(p_batch uuid, p_only uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer;
  v_form_key text;
  v_n integer;
  v_no integer;
begin
  select y.year_be,
         regexp_replace(translate(f.code, '๐๑๒๓๔๕๖๗๘๙', '0123456789'), '[^0-9A-Za-zก-๙]', '', 'g')
    into v_year, v_form_key
  from public.registration_batches b
  join public.exam_rounds r on r.id = b.round_id
  join public.academic_years y on y.id = r.academic_year_id
  join public.form_templates f on f.id = b.template_id
  where b.id = p_batch;

  select count(*) into v_n from public.candidates
  where batch_id = p_batch and status = 'ok' and not counted and candidate_code is null
    and (p_only is null or id = p_only);
  if v_n > 0 then
    insert into public.candidate_code_counters (year_be, form_key, last_no) values (v_year, v_form_key, 0)
    on conflict (year_be, form_key) do nothing;
    update public.candidate_code_counters set last_no = last_no + v_n
     where year_be = v_year and form_key = v_form_key
    returning last_no - v_n into v_no;
  end if;

  begin
    update public.candidates c
       set candidate_code = v_year || '-' || v_form_key || '-' || lpad((v_no + x.n)::text, 6, '0')
      from (select id, row_number() over (order by file_no = 0, file_no, row_no) as n
            from public.candidates
            where batch_id = p_batch and status = 'ok' and not counted and candidate_code is null
              and (p_only is null or id = p_only)) x
     where c.id = x.id;
    update public.candidates set counted = true
     where batch_id = p_batch and status = 'ok' and not counted and (p_only is null or id = p_only);
  exception when unique_violation then
    raise exception 'มีผู้สมัครในบัญชีนี้ถูกยืนยันจากบัญชีอื่นพร้อมกัน กรุณาลองอีกครั้ง' using errcode = 'P0001';
  end;
  return coalesce(v_n, 0);
end;
$$;
revoke all on function private.registration_assign_codes(uuid, uuid) from public, anon, authenticated;

-- โหมดแก้ไขบัญชีของผู้ใช้ปัจจุบัน (ไม่ raise): open = แก้ได้ตามปกติ / override = ส่วนกลางแก้แทน ต้องมีเหตุผล / null = แก้ไม่ได้
create function private.registration_edit_mode(p_batch public.registration_batches)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_batch.status = 'withdrawn' then null
    when private.exam_round_accepting(r) and p_batch.status in ('draft', 'confirmed', 'returned')
         and (p_batch.uploaded_by = auth.uid() or public.has_role('admin') or public.has_role('central_staff')) then 'open'
    when public.has_role('admin') or public.has_role('central_staff') then 'override'
    else null
  end
  from public.exam_rounds r where r.id = p_batch.round_id;
$$;
revoke all on function private.registration_edit_mode(public.registration_batches) from public, anon, authenticated;

-- ตรวจสิทธิ์แก้ไขพร้อมข้อความที่บอกเหตุ (raise) คืนโหมด
create function private.registration_edit_check(p_batch public.registration_batches, p_reason text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mode text := private.registration_edit_mode(p_batch);
  v_accepting boolean;
begin
  if p_batch.id is null or not public.can_view_registration(p_batch.org_unit_id, p_batch.uploaded_by) then
    raise exception 'ไม่พบบัญชีนี้ หรือท่านไม่มีสิทธิ์' using errcode = '42501';
  end if;
  if p_batch.status = 'withdrawn' then
    raise exception 'บัญชีนี้ถอนแล้ว แก้ไขไม่ได้' using errcode = 'P0001';
  end if;
  if v_mode is null then
    select private.exam_round_accepting(r) into v_accepting from public.exam_rounds r where r.id = p_batch.round_id;
    if not v_accepting then
      raise exception 'ปิดรับสมัครแล้ว แก้ไขได้เฉพาะเจ้าหน้าที่ส่วนกลาง (ต้องระบุเหตุผล)' using errcode = '42501';
    elsif p_batch.status = 'certified' then
      raise exception 'บัญชีนี้รับรองแล้ว แก้ไขได้เฉพาะเจ้าหน้าที่ส่วนกลาง (ต้องระบุเหตุผล)' using errcode = '42501';
    elsif p_batch.status = 'submitted' then
      raise exception 'บัญชีส่งแล้ว รายชื่อถูกล็อก ถ้าต้องแก้ให้ดึงบัญชีกลับก่อน' using errcode = '42501';
    else
      raise exception 'แก้ไขได้เฉพาะผู้อัปโหลด เจ้าหน้าที่ส่วนกลาง และผู้ดูแลระบบ' using errcode = '42501';
    end if;
  end if;
  if v_mode = 'override' and length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'กรุณาระบุเหตุผลของการแก้ไข (ปิดรับสมัครแล้ว หรือบัญชีส่งแล้ว)' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception 'เหตุผลยาวเกิน 500 ตัวอักษร' using errcode = '23514';
  end if;
  return v_mode;
end;
$$;
revoke all on function private.registration_edit_check(public.registration_batches, text) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 4) เพิ่มแถวจากไฟล์เข้าบัญชี (ไฟล์แรกและไฟล์เพิ่มเติม) ตรวจซ้ำกับแถวเดิมในบัญชีด้วย
-- ---------------------------------------------------------------
create function private.registration_insert_rows(p_batch uuid, p_file_no integer, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.registration_batches%rowtype;
  v_round public.exam_rounds%rowtype;
  v_template public.form_templates%rowtype;
  v_year integer;
  v_key text := private.national_id_key();
  v_row jsonb;
  v_vals jsonb;
  v_errs jsonb;
  v_chk record;
  v_label text;
  v_dup text;
  v_seen_hash jsonb;
  v_seen_key jsonb;
  v_seen_seq jsonb := '{}'::jsonb;
  v_n integer := 0;
begin
  select * into v_batch from public.registration_batches where id = p_batch;
  select * into v_round from public.exam_rounds where id = v_batch.round_id;
  select * into v_template from public.form_templates where id = v_batch.template_id;
  select year_be into v_year from public.academic_years where id = v_round.academic_year_id;

  -- แถวที่มีอยู่แล้วในบัญชี (ผ่านหรือไม่ผ่าน ไม่รวมที่ไม่บันทึกและที่ถอน)
  select coalesce(jsonb_object_agg(national_id_hash, private.candidate_row_label(file_no, row_no)) filter (where national_id_hash is not null), '{}'::jsonb),
         coalesce(jsonb_object_agg(person_key, private.candidate_row_label(file_no, row_no)) filter (where birth_date is not null and first_name <> ''), '{}'::jsonb)
    into v_seen_hash, v_seen_key
  from public.candidates where batch_id = p_batch and status in ('ok', 'error');

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_vals := coalesce(v_row -> 'values', '{}'::jsonb);
    v_errs := '[]'::jsonb;
    if jsonb_typeof(v_row -> 'errors') = 'array' then
      select coalesce(jsonb_agg(jsonb_build_object('field', e ->> 'field', 'message', left(e ->> 'message', 200))), '[]'::jsonb)
        into v_errs from jsonb_array_elements(v_row -> 'errors') e;
    end if;
    select * into v_chk from private.registration_validate(v_template, v_round, v_year, v_vals, v_errs);
    v_errs := v_chk.errs;

    -- ซ้ำในบัญชี (ไฟล์นี้และรายชื่อเดิม)
    if v_chk.hash is not null then
      v_label := v_seen_hash ->> v_chk.hash;
      if v_label is not null then
        v_errs := v_errs || jsonb_build_object('field', 'national_id', 'message', 'เลขประจำตัวซ้ำกับ' || v_label);
      else
        v_seen_hash := v_seen_hash || jsonb_build_object(v_chk.hash, format('แถวที่ %s ในไฟล์', v_row ->> 'row_no'));
      end if;
    end if;
    if btrim(coalesce(v_vals ->> 'first_name', '')) <> '' and v_chk.birth is not null then
      v_label := v_seen_key ->> v_chk.pkey;
      if v_label is not null and v_chk.hash is null then
        v_errs := v_errs || jsonb_build_object('field', 'first_name', 'message', 'ชื่อ นามสกุล วันเกิด ซ้ำกับ' || v_label);
      elsif v_label is null then
        v_seen_key := v_seen_key || jsonb_build_object(v_chk.pkey, format('แถวที่ %s ในไฟล์', v_row ->> 'row_no'));
      end if;
    end if;
    if (v_vals ->> 'seq') ~ '^\d+$' then
      v_label := v_seen_seq ->> (v_vals ->> 'seq');
      if v_label is not null then
        v_errs := v_errs || jsonb_build_object('field', 'seq', 'message', 'เลขที่ซ้ำกับ' || v_label);
      else
        v_seen_seq := v_seen_seq || jsonb_build_object(v_vals ->> 'seq', format('แถวที่ %s ในไฟล์', v_row ->> 'row_no'));
      end if;
    end if;

    -- ซ้ำกับผู้สมัครที่นับแล้วในรอบเดียวกันทั่วประเทศ
    v_dup := private.registration_dup(v_batch.round_id, p_batch, v_chk.hash, v_chk.birth, v_chk.pkey);
    if v_dup is not null then
      v_errs := v_errs || jsonb_build_object('field', case when v_chk.hash is not null then 'national_id' else 'first_name' end,
                                             'message', v_dup);
    end if;
    v_errs := private.registration_label_errors(v_template, v_errs);

    insert into public.candidates (
      batch_id, round_id, file_no, row_no, seq, person_kind, title, first_name, monastic_name, last_name,
      birth_date, ordination_date, age, phansa,
      national_id_enc, national_id_last4, national_id_hash, id_kind, person_key,
      school_name, level, stage, extra, errors, status
    ) values (
      p_batch, v_batch.round_id, p_file_no, (v_row ->> 'row_no')::integer,
      case when (v_vals ->> 'seq') ~ '^\d{1,9}$' then (v_vals ->> 'seq')::integer end,
      case when v_round.exam_type = 'nak_tham' then 'monastic' else 'lay' end,
      left(btrim(coalesce(v_vals ->> 'title', '')), 200), left(btrim(coalesce(v_vals ->> 'first_name', '')), 200),
      left(btrim(coalesce(v_vals ->> 'monastic_name', '')), 200), left(btrim(coalesce(v_vals ->> 'last_name', '')), 200),
      v_chk.birth, v_chk.ord, private.age_on(v_chk.birth, v_round.exam_starts_on),
      case when v_round.exam_type = 'nak_tham' then private.phansa_on(v_chk.ord, v_round.exam_starts_on) end,
      case when v_chk.nid <> '' then extensions.pgp_sym_encrypt(v_chk.nid, v_key) end,
      case when v_chk.nid <> '' then right(v_chk.nid, 4) end,
      v_chk.hash,
      case when v_chk.nid ~ '^\d{13}$' then 'nid' when v_chk.nid <> '' then 'other' else 'none' end,
      v_chk.pkey,
      left(btrim(coalesce(case when v_round.exam_type = 'nak_tham' then v_vals ->> 'temple_name' else v_vals ->> 'org_name' end, '')), 200),
      v_round.level, left(btrim(coalesce(v_vals ->> 'stage', '')), 50), private.registration_extra(v_template, v_vals), v_errs,
      case when jsonb_array_length(v_errs) = 0 then 'ok' else 'error' end
    );
    v_n := v_n + 1;
  end loop;
  perform private.registration_recount(p_batch);
  return v_n;
end;
$$;
revoke all on function private.registration_insert_rows(uuid, integer, jsonb) from public, anon, authenticated;

-- สร้างบัญชีจากไฟล์แรก (แทนของบทที่ 18: ตรวจด้วยชุดกติกาเดียวกัน และหนึ่งบัญชีต่อ รอบ + สำนัก + สนามสอบ)
create or replace function public.create_registration_batch(p_round uuid, p_place uuid, p_venue uuid, p_file jsonb, p_rows jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb;
  v_place public.places%rowtype;
  v_batch uuid;
  v_max_rows integer := least(coalesce(public.setting_int('exam_upload_max_rows'), 2000), 5000);
begin
  v_ctx := public.exam_template_context(p_round, p_place, p_venue);
  select * into v_place from public.places where id = p_place;

  if coalesce(p_file ->> 'path', '') !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.xlsx$') then
    raise exception 'ที่เก็บไฟล์ต้นฉบับไม่ถูกต้อง' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'ไม่พบรายชื่อผู้สมัครในไฟล์ (เริ่มกรอกที่แถว 9)' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > v_max_rows then
    raise exception 'ไฟล์มีผู้สมัครเกิน % แถว กรุณาแบ่งไฟล์', v_max_rows using errcode = 'P0001';
  end if;
  if exists (select 1 from public.registration_batches
             where round_id = p_round and place_id = p_place and venue_id = p_venue and status <> 'withdrawn') then
    raise exception 'มีบัญชีของสำนักนี้สำหรับสนามสอบนี้ในรอบนี้แล้ว ให้อัปโหลดไฟล์เพิ่มเติมเข้าบัญชีเดิม' using errcode = 'P0001';
  end if;

  insert into public.registration_batches (round_id, template_id, place_id, venue_id, org_unit_id, file_name, file_path, file_size)
  values (p_round, (v_ctx ->> 'template_id')::uuid, p_place, p_venue, v_place.org_unit_id,
          left(coalesce(p_file ->> 'name', ''), 200), p_file ->> 'path', greatest(0, coalesce((p_file ->> 'size')::integer, 0)))
  returning id into v_batch;
  perform private.registration_insert_rows(v_batch, 1, p_rows);
  return v_batch;
end;
$$;

-- อัปโหลดไฟล์เพิ่มเติมเข้าบัญชีเดิม (ก่อนปิดรับสมัคร บัญชีที่ยังไม่ส่ง) บัญชีกลับเป็น ร่าง จนกว่าจะยืนยันรายชื่อใหม่
-- คืนลำดับไฟล์
create function public.append_registration_file(p_batch uuid, p_file jsonb, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.registration_batches%rowtype;
  v_mode text;
  v_file_no integer;
  v_n integer;
  v_max_rows integer := least(coalesce(public.setting_int('exam_upload_max_rows'), 2000), 5000);
begin
  select * into v_batch from public.registration_batches where id = p_batch for update;
  v_mode := private.registration_edit_check(v_batch, '');
  if v_mode <> 'open' then
    raise exception 'อัปโหลดไฟล์เพิ่มเติมได้เฉพาะก่อนปิดรับสมัครและบัญชีที่ยังไม่ส่ง (ส่วนกลางให้เพิ่มทีละคนพร้อมเหตุผล)' using errcode = 'P0001';
  end if;
  perform public.exam_template_context(v_batch.round_id, v_batch.place_id, v_batch.venue_id);
  if coalesce(p_file ->> 'path', '') !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.xlsx$') then
    raise exception 'ที่เก็บไฟล์ต้นฉบับไม่ถูกต้อง' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'ไม่พบรายชื่อผู้สมัครในไฟล์ (เริ่มกรอกที่แถว 9)' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > v_max_rows then
    raise exception 'ไฟล์มีผู้สมัครเกิน % แถว กรุณาแบ่งไฟล์', v_max_rows using errcode = 'P0001';
  end if;

  select coalesce(max(file_no), 1) + 1 into v_file_no from public.registration_files where batch_id = p_batch;
  insert into public.registration_files (batch_id, file_no, file_name, file_path, file_size, row_count)
  values (p_batch, v_file_no, left(coalesce(p_file ->> 'name', ''), 200), p_file ->> 'path',
          greatest(0, coalesce((p_file ->> 'size')::integer, 0)), jsonb_array_length(p_rows));
  v_n := private.registration_insert_rows(p_batch, v_file_no, p_rows);
  update public.registration_batches set status = 'draft' where id = p_batch;
  insert into public.registration_changes (batch_id, action, detail)
  values (p_batch, 'append_file', jsonb_build_object('file_no', v_file_no, 'file_name', left(coalesce(p_file ->> 'name', ''), 200), 'rows', v_n));
  return v_file_no;
end;
$$;

-- ---------------------------------------------------------------
-- 5) ยืนยันรายชื่อ (แทนของบทที่ 18): เฉพาะแถวที่ยังไม่นับ ตรวจซ้ำทั่วประเทศอีกครั้ง แล้วออกรหัส
--    บัญชีที่เคยถูกส่งกลับ กลับเป็น returned (รอส่งอีกครั้ง) นอกนั้นเป็น confirmed
-- ---------------------------------------------------------------
create or replace function public.confirm_registration_batch(p_batch uuid, p_only_ok boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.registration_batches%rowtype;
  v_c record;
  v_dup text;
  v_bad integer;
  v_ok integer;
  v_counted integer;
  v_saved integer;
begin
  select * into v_batch from public.registration_batches where id = p_batch for update;
  if not found or not (v_batch.uploaded_by = auth.uid() or public.has_role('admin') or public.has_role('central_staff')) then
    raise exception 'ยืนยันได้เฉพาะผู้อัปโหลด' using errcode = '42501';
  end if;
  if v_batch.status <> 'draft' then
    raise exception 'ชุดนี้ไม่ได้อยู่ในสถานะ ร่าง แล้ว' using errcode = 'P0001';
  end if;
  if not (select private.exam_round_accepting(r) from public.exam_rounds r where r.id = v_batch.round_id) then
    raise exception 'รอบนี้ปิดรับสมัครแล้ว หรือไม่อยู่ในช่วงวันรับสมัคร' using errcode = 'P0001';
  end if;

  for v_c in select * from public.candidates where batch_id = p_batch and status = 'ok' and not counted loop
    v_dup := private.registration_dup(v_batch.round_id, p_batch, v_c.national_id_hash, v_c.birth_date, v_c.person_key);
    if v_dup is not null then
      update public.candidates
         set status = 'error',
             errors = errors || jsonb_build_array(jsonb_build_object(
               'field', case when v_c.national_id_hash is not null then 'national_id' else 'first_name' end,
               'label', case when v_c.national_id_hash is not null then 'เลขประจำตัวประชาชน' else 'ชื่อ' end,
               'message', v_dup))
       where id = v_c.id;
    end if;
  end loop;

  select count(*) filter (where status = 'error'), count(*) filter (where status = 'ok' and not counted), count(*) filter (where counted)
    into v_bad, v_ok, v_counted from public.candidates where batch_id = p_batch;
  perform private.registration_recount(p_batch);
  if (v_bad > 0 and not p_only_ok) or (v_ok = 0 and v_counted = 0) then
    return jsonb_build_object('saved', 0, 'blocked', true, 'ok_count', v_ok, 'error_count', v_bad);
  end if;

  v_saved := private.registration_assign_codes(p_batch);
  update public.candidates set status = 'excluded' where batch_id = p_batch and status = 'error';
  update public.registration_batches
     set status = case when exists (select 1 from public.requests q where q.id = v_batch.request_id and q.status = 'returned')
                       then 'returned' else 'confirmed' end,
         confirmed_at = now(), confirmed_by = auth.uid()
   where id = p_batch;
  perform private.registration_recount(p_batch);
  insert into public.registration_changes (batch_id, action, detail)
  values (p_batch, 'confirm', jsonb_build_object('saved', v_saved, 'excluded', v_bad));
  return jsonb_build_object('saved', v_saved, 'blocked', false, 'ok_count', v_ok, 'error_count', v_bad);
end;
$$;

-- ---------------------------------------------------------------
-- 6) แก้ไขรายคน และเพิ่มทีละคน
--    p_candidate ว่าง = เพิ่มคนใหม่ / p_values = {คีย์คอลัมน์: ข้อความ} ตามแบบ ศ. (วันที่ YYYY-MM-DD ค.ศ.)
--    เลขประจำตัวเว้นว่างเมื่อแก้ไข = ใช้เลขเดิม
--    บัญชีร่าง: บันทึกได้แม้มีข้อผิดพลาด (แสดงสีแดงรอแก้) / บัญชีที่ยืนยันแล้ว: ต้องผ่านทุกข้อ แล้วนับเป็นผู้สมัครและออกรหัสทันที
--    คืน {ok, errors, id, status, candidate_code}
-- ---------------------------------------------------------------
create function public.save_candidate(p_batch uuid, p_candidate uuid, p_values jsonb, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.registration_batches%rowtype;
  v_round public.exam_rounds%rowtype;
  v_template public.form_templates%rowtype;
  v_c public.candidates%rowtype;
  v_year integer;
  v_mode text;
  v_vals jsonb := coalesce(p_values, '{}'::jsonb);
  v_old jsonb := '{}'::jsonb;
  v_chk record;
  v_errs jsonb;
  v_label text;
  v_dup text;
  v_strict boolean;
  v_status text;
  v_id uuid;
  v_row integer;
  v_changed jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_batch from public.registration_batches where id = p_batch for update;
  v_mode := private.registration_edit_check(v_batch, v_reason);
  select * into v_round from public.exam_rounds where id = v_batch.round_id;
  select * into v_template from public.form_templates where id = v_batch.template_id;
  select year_be into v_year from public.academic_years where id = v_round.academic_year_id;

  if p_candidate is not null then
    select * into v_c from public.candidates where id = p_candidate and batch_id = p_batch for update;
    if not found then
      raise exception 'ไม่พบผู้สมัครในบัญชีนี้' using errcode = 'P0001';
    end if;
    if v_c.status = 'withdrawn' then
      raise exception 'รายชื่อนี้ถอนแล้ว แก้ไขไม่ได้ (ให้เพิ่มรายชื่อใหม่)' using errcode = 'P0001';
    end if;
    v_old := private.candidate_values(v_c);
    if coalesce(btrim(v_vals ->> 'national_id'), '') = '' and v_c.national_id_enc is not null then
      v_vals := v_vals || jsonb_build_object('national_id', extensions.pgp_sym_decrypt(v_c.national_id_enc, private.national_id_key()));
    end if;
  elsif v_batch.status = 'draft' and v_mode = 'override' then
    raise exception 'บัญชีนี้ยังไม่ยืนยันรายชื่อ เพิ่มรายชื่อหลังปิดรับสมัครไม่ได้' using errcode = 'P0001';
  end if;
  -- เลขที่ว่าง = ต่อจากเลขที่มากที่สุดในบัญชี
  if coalesce(btrim(v_vals ->> 'seq'), '') = '' then
    v_vals := v_vals || jsonb_build_object('seq', (select coalesce(max(seq), 0) + 1 from public.candidates where batch_id = p_batch)::text);
  end if;

  v_strict := v_batch.status <> 'draft' or coalesce(v_c.counted, false);
  select * into v_chk from private.registration_validate(v_template, v_round, v_year, v_vals, '[]'::jsonb);
  v_errs := v_chk.errs;

  -- ซ้ำในบัญชีเดียวกัน
  select private.candidate_row_label(c.file_no, c.row_no) into v_label
  from public.candidates c
  where c.batch_id = p_batch and c.status in ('ok', 'error') and c.id is distinct from p_candidate
    and ((v_chk.hash is not null and c.national_id_hash = v_chk.hash)
         or (v_chk.hash is null and v_chk.birth is not null and btrim(coalesce(v_vals ->> 'first_name', '')) <> '' and c.person_key = v_chk.pkey))
  order by c.file_no, c.row_no
  limit 1;
  if v_label is not null then
    v_errs := v_errs || jsonb_build_object('field', case when v_chk.hash is not null then 'national_id' else 'first_name' end,
      'message', case when v_chk.hash is not null then 'เลขประจำตัวซ้ำกับ' else 'ชื่อ นามสกุล วันเกิด ซ้ำกับ' end || v_label);
  end if;
  v_dup := private.registration_dup(v_batch.round_id, p_batch, v_chk.hash, v_chk.birth, v_chk.pkey);
  if v_dup is not null then
    v_errs := v_errs || jsonb_build_object('field', case when v_chk.hash is not null then 'national_id' else 'first_name' end, 'message', v_dup);
  end if;
  v_errs := private.registration_label_errors(v_template, v_errs);

  if v_strict and jsonb_array_length(v_errs) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errs);
  end if;
  v_status := case when jsonb_array_length(v_errs) = 0 then 'ok' else 'error' end;

  if p_candidate is null then
    select coalesce(max(row_no), 0) + 1 into v_row from public.candidates where batch_id = p_batch and file_no = 0;
    insert into public.candidates (
      batch_id, round_id, file_no, row_no, seq, person_kind, title, first_name, monastic_name, last_name,
      birth_date, ordination_date, age, phansa, national_id_enc, national_id_last4, national_id_hash, id_kind, person_key,
      school_name, level, stage, extra, errors, status
    ) values (
      p_batch, v_batch.round_id, 0, v_row,
      case when (v_vals ->> 'seq') ~ '^\d{1,9}$' then (v_vals ->> 'seq')::integer end,
      case when v_round.exam_type = 'nak_tham' then 'monastic' else 'lay' end,
      left(btrim(coalesce(v_vals ->> 'title', '')), 200), left(btrim(coalesce(v_vals ->> 'first_name', '')), 200),
      left(btrim(coalesce(v_vals ->> 'monastic_name', '')), 200), left(btrim(coalesce(v_vals ->> 'last_name', '')), 200),
      v_chk.birth, v_chk.ord, private.age_on(v_chk.birth, v_round.exam_starts_on),
      case when v_round.exam_type = 'nak_tham' then private.phansa_on(v_chk.ord, v_round.exam_starts_on) end,
      case when v_chk.nid <> '' then extensions.pgp_sym_encrypt(v_chk.nid, private.national_id_key()) end,
      case when v_chk.nid <> '' then right(v_chk.nid, 4) end, v_chk.hash,
      case when v_chk.nid ~ '^\d{13}$' then 'nid' when v_chk.nid <> '' then 'other' else 'none' end, v_chk.pkey,
      left(btrim(coalesce(case when v_round.exam_type = 'nak_tham' then v_vals ->> 'temple_name' else v_vals ->> 'org_name' end, '')), 200),
      v_round.level, left(btrim(coalesce(v_vals ->> 'stage', '')), 50), private.registration_extra(v_template, v_vals), v_errs, v_status
    ) returning id into v_id;
  else
    v_id := p_candidate;
    -- ช่องที่เปลี่ยน (ชื่อช่องเท่านั้น ไม่เก็บค่าเลขประจำตัว)
    select coalesce(jsonb_agg(c ->> 'label' order by ord), '[]'::jsonb) into v_changed
    from jsonb_array_elements(v_template.columns) with ordinality as t(c, ord)
    where case when c ->> 'key' = 'national_id' then v_chk.hash is distinct from v_c.national_id_hash
               else coalesce(v_old ->> (c ->> 'key'), '') <> btrim(coalesce(v_vals ->> (c ->> 'key'), '')) end;
    update public.candidates set
      seq = case when (v_vals ->> 'seq') ~ '^\d{1,9}$' then (v_vals ->> 'seq')::integer end,
      title = left(btrim(coalesce(v_vals ->> 'title', '')), 200),
      first_name = left(btrim(coalesce(v_vals ->> 'first_name', '')), 200),
      monastic_name = left(btrim(coalesce(v_vals ->> 'monastic_name', '')), 200),
      last_name = left(btrim(coalesce(v_vals ->> 'last_name', '')), 200),
      birth_date = v_chk.birth, ordination_date = v_chk.ord,
      age = private.age_on(v_chk.birth, v_round.exam_starts_on),
      phansa = case when v_round.exam_type = 'nak_tham' then private.phansa_on(v_chk.ord, v_round.exam_starts_on) end,
      national_id_enc = case when v_chk.hash is distinct from v_c.national_id_hash
                             then case when v_chk.nid <> '' then extensions.pgp_sym_encrypt(v_chk.nid, private.national_id_key()) end
                             else national_id_enc end,
      national_id_last4 = case when v_chk.nid <> '' then right(v_chk.nid, 4) end,
      national_id_hash = v_chk.hash,
      id_kind = case when v_chk.nid ~ '^\d{13}$' then 'nid' when v_chk.nid <> '' then 'other' else 'none' end,
      person_key = v_chk.pkey,
      school_name = left(btrim(coalesce(case when v_round.exam_type = 'nak_tham' then v_vals ->> 'temple_name' else v_vals ->> 'org_name' end, '')), 200),
      stage = left(btrim(coalesce(v_vals ->> 'stage', '')), 50),
      extra = private.registration_extra(v_template, v_vals),
      errors = v_errs,
      status = v_status
    where id = v_id;
  end if;

  -- บัญชีที่ยืนยันแล้ว: นับเป็นผู้สมัครทันที (ออกรหัสถ้ายังไม่มี)
  if v_strict then
    perform private.registration_assign_codes(p_batch, v_id);
    update public.candidates set counted = true where id = v_id and status = 'ok';
  end if;
  perform private.registration_recount(p_batch);

  select * into v_c from public.candidates where id = v_id;
  insert into public.registration_changes (batch_id, candidate_id, action, reason, after_close, detail)
  values (p_batch, v_id, case when p_candidate is null then 'add' else 'edit' end, v_reason, v_mode = 'override',
          jsonb_build_object('name', btrim(concat_ws(' ', nullif(v_c.title, ''), nullif(v_c.first_name, ''), nullif(v_c.monastic_name, ''), nullif(v_c.last_name, ''))),
                             'row', private.candidate_row_label(v_c.file_no, v_c.row_no),
                             'fields', coalesce(v_changed, '[]'::jsonb)));
  return jsonb_build_object('ok', true, 'errors', v_errs, 'id', v_id, 'status', v_c.status, 'candidate_code', v_c.candidate_code);
end;
$$;

-- ถอนรายชื่อ 1 คน (ไม่ลบ ไม่นับเป็นผู้สมัคร รหัสผู้สมัครคงไว้ไม่นำกลับมาใช้)
create function public.withdraw_candidate(p_candidate uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.candidates%rowtype;
  v_batch public.registration_batches%rowtype;
  v_mode text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_c from public.candidates where id = p_candidate for update;
  select * into v_batch from public.registration_batches where id = v_c.batch_id for update;
  v_mode := private.registration_edit_check(v_batch, v_reason);
  if v_c.status = 'withdrawn' then
    raise exception 'รายชื่อนี้ถอนแล้ว' using errcode = 'P0001';
  end if;
  update public.candidates
     set status = 'withdrawn', counted = false, withdrawn_at = now(), withdraw_reason = v_reason
   where id = p_candidate;
  perform private.registration_recount(v_c.batch_id);
  insert into public.registration_changes (batch_id, candidate_id, action, reason, after_close, detail)
  values (v_c.batch_id, p_candidate, 'withdraw', v_reason, v_mode = 'override',
          jsonb_build_object('name', btrim(concat_ws(' ', nullif(v_c.title, ''), nullif(v_c.first_name, ''), nullif(v_c.monastic_name, ''), nullif(v_c.last_name, ''))),
                             'row', private.candidate_row_label(v_c.file_no, v_c.row_no), 'candidate_code', v_c.candidate_code));
end;
$$;

-- ถอนทั้งบัญชี (แทนของบทที่ 18): ก่อนปิดรับสมัคร ผู้อัปโหลดถอนบัญชีที่ยังไม่ส่งได้
-- ส่วนกลางและผู้ดูแลระบบถอนได้ทุกสถานะ ต้องระบุเหตุผลเมื่อปิดรับแล้วหรือบัญชีส่งแล้ว (คำขอรับรองที่ค้างอยู่ถูกยกเลิก)
create or replace function public.withdraw_registration_batch(p_batch uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.registration_batches%rowtype;
  v_mode text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_batch from public.registration_batches where id = p_batch for update;
  if not found or not (v_batch.uploaded_by = auth.uid() or public.has_role('admin') or public.has_role('central_staff')) then
    raise exception 'ถอนได้เฉพาะผู้อัปโหลด' using errcode = '42501';
  end if;
  if v_batch.status = 'withdrawn' then
    raise exception 'ชุดนี้ส่งแล้วหรือถอนแล้ว จึงถอนไม่ได้' using errcode = 'P0001';
  end if;
  v_mode := private.registration_edit_check(v_batch, v_reason);

  -- คำขอรับรองที่ยังไม่ได้ผล ยกเลิกด้วย
  if exists (select 1 from public.requests q where q.id = v_batch.request_id and q.status in ('pending', 'returned')) then
    update public.requests set status = 'cancelled', current_step = null, decided_at = now() where id = v_batch.request_id;
    insert into public.request_events (request_id, actor_id, action, comment)
    values (v_batch.request_id, auth.uid(), 'cancelled', nullif(v_reason, ''));
  end if;
  update public.candidates set counted = false where batch_id = p_batch and counted;
  update public.registration_batches
     set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = auth.uid(), withdraw_reason = v_reason
   where id = p_batch;
  perform private.registration_recount(p_batch);
  insert into public.registration_changes (batch_id, action, reason, after_close)
  values (p_batch, 'withdraw_batch', v_reason, v_mode = 'override');
end;
$$;

-- ---------------------------------------------------------------
-- 7) ส่งบัญชี: ล็อกรายชื่อ ออกเลขที่รับ (เลขที่คำขอ REG-ปี-ลำดับ) ส่งให้เจ้าคณะอำเภอ แล้วจังหวัด รับรอง
--    บัญชีที่ถูกส่งกลับ ส่งอีกครั้งด้วยฟังก์ชันเดียวกัน (คำขอเดิม เลขที่เดิม)
-- ---------------------------------------------------------------
create function public.submit_registration_batch(p_batch uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.registration_batches%rowtype;
  v_mode text;
  v_count integer;
  v_title text;
  v_payload jsonb;
  v_req uuid;
  v_req_row public.requests%rowtype;
  v_resubmit boolean;
begin
  select * into v_batch from public.registration_batches where id = p_batch for update;
  v_mode := private.registration_edit_check(v_batch, 'x');
  if v_mode <> 'open' then
    raise exception 'ส่งบัญชีได้ก่อนปิดรับสมัครเท่านั้น และต้องเป็นบัญชีที่ยังไม่ส่ง' using errcode = 'P0001';
  end if;
  if v_batch.status = 'draft' then
    raise exception 'มีรายชื่อที่ยังไม่ยืนยัน กรุณากดยืนยันรายชื่อก่อนส่งบัญชี' using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.candidates where batch_id = p_batch and counted;
  if v_count = 0 then
    raise exception 'ไม่มีผู้สมัครในบัญชี จึงส่งไม่ได้' using errcode = 'P0001';
  end if;

  select format('บัญชีผู้สมัครสอบ%s ปี %s %s (สนามสอบ%s)', private.exam_name(r.exam_type, r.level), y.year_be, p.name,
                regexp_replace(v.name, '^สนามสอบ', '')),
         jsonb_build_object('batch_id', b.id, 'round_id', r.id, 'year_be', y.year_be, 'exam_type', r.exam_type, 'level', r.level,
                            'form_code', f.code, 'place_id', p.id, 'place_name', p.name, 'place_code', p.code,
                            'venue_id', v.id, 'venue_name', v.name, 'venue_code', v.code, 'candidates', v_count)
    into v_title, v_payload
  from public.registration_batches b
  join public.exam_rounds r on r.id = b.round_id
  join public.academic_years y on y.id = r.academic_year_id
  join public.form_templates f on f.id = b.template_id
  join public.places p on p.id = b.place_id
  join public.exam_venues v on v.id = b.venue_id
  where b.id = p_batch;

  v_resubmit := v_batch.status = 'returned';
  perform set_config('app.exam_registration', '1', true);
  if v_resubmit then
    select * into v_req_row from public.requests where id = v_batch.request_id;
    if v_req_row.requester_id <> auth.uid() then
      perform set_config('app.exam_registration', '', true);
      raise exception 'ส่งอีกครั้งได้เฉพาะผู้ที่ส่งบัญชีครั้งแรก' using errcode = '42501';
    end if;
    perform public.resubmit_request(v_batch.request_id, v_title, v_payload);
    v_req := v_batch.request_id;
  else
    v_req := private.create_request('exam_registration', v_batch.org_unit_id, v_title, v_payload);
  end if;
  perform set_config('app.exam_registration', '', true);

  update public.registration_batches
     set status = 'submitted', request_id = v_req, submitted_at = now(), submitted_by = auth.uid()
   where id = p_batch;
  select * into v_req_row from public.requests where id = v_req;
  insert into public.registration_changes (batch_id, action, detail)
  values (p_batch, case when v_resubmit then 'resubmit' else 'submit' end,
          jsonb_build_object('request_no', v_req_row.request_no, 'candidates', v_count));
  return v_req_row.request_no;
end;
$$;

-- ---------------------------------------------------------------
-- 8) เชื่อมกับเครื่องอนุมัติกลาง
-- ---------------------------------------------------------------
-- กันการยื่นหรือแก้คำขอชนิดนี้จากฟังก์ชันกลาง (ต้องผ่าน submit_registration_batch)
create function public.requests_guard_exam_registration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.type_key = 'exam_registration'
     and coalesce(current_setting('app.exam_registration', true), '') <> '1' then
    raise exception 'บัญชีผู้สมัครสอบต้องส่งจากหน้า บัญชีผู้สมัครสอบ เท่านั้น' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.requests_guard_exam_registration() from public, anon, authenticated;
create trigger requests_guard_exam_registration before insert or update of payload, title, type_key on public.requests
  for each row execute function public.requests_guard_exam_registration();

-- ผลรับรองเปลี่ยนสถานะบัญชี: ส่งกลับ = returned (ปลดล็อกให้แก้) / รับรองครบ = certified
-- ไม่รับรอง หรือผู้ส่งยกเลิก (ดึงบัญชีกลับ) = confirmed (แก้แล้วส่งใหม่ได้ ได้เลขที่รับใหม่)
create function public.requests_sync_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.registration_batches%rowtype;
  v_comment text;
begin
  if new.type_key <> 'exam_registration' or new.status = old.status then
    return new;
  end if;
  select * into v_batch from public.registration_batches where request_id = new.id for update;
  if not found or v_batch.status = 'withdrawn' then
    return new;
  end if;
  select s.comment into v_comment from public.request_steps s
  where s.request_id = new.id and s.decided_at is not null order by s.decided_at desc limit 1;

  if new.status = 'pending' then
    update public.registration_batches set status = 'submitted' where id = v_batch.id;
  elsif new.status = 'returned' then
    update public.registration_batches set status = 'returned' where id = v_batch.id;
  elsif new.status = 'approved' then
    update public.registration_batches set status = 'certified', certified_at = now() where id = v_batch.id;
  elsif new.status in ('rejected', 'cancelled') then
    update public.registration_batches set status = 'confirmed' where id = v_batch.id;
  end if;
  if new.status in ('returned', 'approved', 'rejected', 'cancelled') then
    insert into public.registration_changes (batch_id, action, reason, detail)
    values (v_batch.id, case new.status when 'approved' then 'certified' else new.status end,
            case when new.status in ('returned', 'rejected') then left(coalesce(v_comment, ''), 500) else '' end,
            jsonb_build_object('request_no', new.request_no));
  end if;
  return new;
end;
$$;
revoke execute on function public.requests_sync_registration() from public, anon, authenticated;
create trigger requests_sync_registration after update of status on public.requests
  for each row execute function public.requests_sync_registration();

-- ---------------------------------------------------------------
-- 9) ฟังก์ชันอ่านของพื้นที่ทำงาน
-- ---------------------------------------------------------------
-- รายละเอียดบัญชี (แทนของบทที่ 18 เพิ่ม เลขที่รับ สถานะคำขอ โหมดแก้ไข ไฟล์เพิ่มเติม)
create or replace function public.get_registration_batch(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', b.id, 'status', b.status, 'file_name', b.file_name, 'file_size', b.file_size, 'has_file', b.file_path <> '',
    'row_count', b.row_count, 'ok_count', b.ok_count, 'error_count', b.error_count, 'saved_count', b.saved_count,
    'created_at', b.created_at, 'confirmed_at', b.confirmed_at, 'withdrawn_at', b.withdrawn_at, 'withdraw_reason', b.withdraw_reason,
    'submitted_at', b.submitted_at, 'certified_at', b.certified_at,
    'uploaded_by_me', b.uploaded_by = auth.uid(),
    'uploader_name', btrim(concat_ws(' ', u.title_prefix, u.first_name, nullif(u.monastic_name, ''), u.last_name)),
    'can_act', b.uploaded_by = auth.uid() or public.has_role('admin') or public.has_role('central_staff'),
    'edit_mode', private.registration_edit_mode(b),
    'is_central', public.has_role('admin') or public.has_role('central_staff'),
    'pending_error_count', (select count(*) from public.candidates c where c.batch_id = b.id and c.status = 'error'),
    'withdrawn_count', (select count(*) from public.candidates c where c.batch_id = b.id and c.status = 'withdrawn'),
    'request', (select jsonb_build_object('id', q.id, 'request_no', q.request_no, 'status', q.status,
                                          'requester_is_me', q.requester_id = auth.uid())
                from public.requests q where q.id = b.request_id),
    'files', (select coalesce(jsonb_agg(jsonb_build_object('file_no', x.file_no, 'file_name', x.file_name,
                                                           'row_count', x.row_count, 'created_at', x.created_at) order by x.file_no), '[]'::jsonb)
              from public.registration_files x where x.batch_id = b.id),
    'round', jsonb_build_object('id', r.id, 'year_be', y.year_be, 'exam_type', r.exam_type, 'level', r.level,
                                'exam_starts_on', r.exam_starts_on, 'closes_on', r.closes_on,
                                'accepting', private.exam_round_accepting(r)),
    'template', jsonb_build_object('id', f.id, 'code', f.code, 'columns', f.columns),
    'place', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name),
    'venue', jsonb_build_object('id', v.id, 'code', v.code, 'name', v.name)
  )
  from public.registration_batches b
  join public.exam_rounds r on r.id = b.round_id
  join public.academic_years y on y.id = r.academic_year_id
  join public.form_templates f on f.id = b.template_id
  join public.places p on p.id = b.place_id
  join public.exam_venues v on v.id = b.venue_id
  join public.profiles u on u.id = b.uploaded_by
  where b.id = p_id and public.can_view_registration(b.org_unit_id, b.uploaded_by);
$$;

-- รายการบัญชี p_scope: mine = ที่ตนอัปโหลด / area = บัญชีที่ส่งแล้วในเขต (ส่งแล้ว ส่งกลับ รับรองแล้ว) / all = ทุกบัญชีที่เห็น
create function public.list_registration_accounts(p_scope text default 'all', p_status text default null, p_round uuid default null,
                                                  p_limit integer default 300)
returns table (
  id uuid, status text, year_be integer, exam_type text, level text, form_code text,
  place_name text, place_code text, venue_name text, venue_code text, unit_name text,
  row_count integer, ok_count integer, error_count integer, saved_count integer,
  uploaded_by_me boolean, created_at timestamptz, submitted_at timestamptz, certified_at timestamptz,
  request_id uuid, request_no text, request_status text, current_unit_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.status, y.year_be, r.exam_type, r.level, f.code, p.name, p.code, v.name, v.code, ou.name,
         b.row_count, b.ok_count, b.error_count, b.saved_count, b.uploaded_by = auth.uid(), b.created_at, b.submitted_at,
         b.certified_at, q.id, q.request_no, q.status,
         (select su.name from public.request_steps s join public.org_units su on su.id = s.org_unit_id
          where s.request_id = q.id and s.step_no = q.current_step)
  from public.registration_batches b
  join public.exam_rounds r on r.id = b.round_id
  join public.academic_years y on y.id = r.academic_year_id
  join public.form_templates f on f.id = b.template_id
  join public.places p on p.id = b.place_id
  join public.exam_venues v on v.id = b.venue_id
  join public.org_units ou on ou.id = b.org_unit_id
  left join public.requests q on q.id = b.request_id
  where public.can_view_registration(b.org_unit_id, b.uploaded_by)
    and (coalesce(p_scope, 'all') <> 'mine' or b.uploaded_by = auth.uid())
    and (coalesce(p_scope, 'all') <> 'area' or b.status in ('submitted', 'returned', 'certified'))
    and (p_status is null or b.status = p_status)
    and (p_round is null or b.round_id = p_round)
  order by coalesce(b.submitted_at, b.created_at) desc
  limit greatest(1, least(coalesce(p_limit, 300), 1000));
$$;

-- ประวัติการแก้ไขของบัญชี พร้อมชื่อผู้ทำ
create function public.registration_history(p_batch uuid)
returns table (created_at timestamptz, action text, reason text, after_close boolean, detail jsonb, actor_name text)
language sql
stable
security definer
set search_path = public
as $$
  select h.created_at, h.action, h.reason, h.after_close, h.detail,
         btrim(concat_ws(' ', nullif(u.title_prefix, ''), u.first_name, nullif(u.monastic_name, ''), nullif(u.last_name, '')))
  from public.registration_changes h
  join public.registration_batches b on b.id = h.batch_id
  left join public.profiles u on u.id = h.actor_id
  where h.batch_id = p_batch and public.can_view_registration(b.org_unit_id, b.uploaded_by)
  order by h.created_at desc, h.id desc
  limit 500;
$$;

-- ยอดผู้สมัครต่อสนามสอบของรอบ (บัญชีที่ส่งแล้ว รวมระหว่างรับรอง) สำหรับส่วนกลางจัดเตรียมข้อสอบ
create function public.venue_registration_totals(p_round uuid)
returns table (
  venue_id uuid, venue_code text, venue_name text, region_name text, province_name text, stage text,
  sent_count integer, certified_count integer, account_count integer, pending_account_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_exam_rounds() then
    raise exception 'ยอดผู้สมัครต่อสนามสอบดูได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ' using errcode = '42501';
  end if;
  return query
  with base as (
    select b.venue_id, b.id as batch_id, b.status, c.stage
    from public.candidates c
    join public.registration_batches b on b.id = c.batch_id
    where b.round_id = p_round and c.counted and b.status in ('submitted', 'returned', 'certified')
  ), acc as (
    -- จำนวนบัญชีต่อสนาม (บัญชีหนึ่งมีได้หลายช่วงชั้น)
    select x.venue_id, count(distinct x.batch_id)::integer as n_all,
           count(distinct x.batch_id) filter (where x.status <> 'certified')::integer as n_pending
    from base x group by x.venue_id
  )
  select v.id, v.code, v.name, ur.region_name, pv.name, x.stage,
         count(*)::integer,
         count(*) filter (where x.status = 'certified')::integer,
         max(a.n_all),
         max(a.n_pending)
  from base x
  join acc a on a.venue_id = x.venue_id
  join public.exam_venues v on v.id = x.venue_id
  left join public.places pl on pl.id = v.place_id
  left join public.civil_provinces pv on pv.code = pl.province_code
  left join private.unit_regions() ur on ur.unit_id = v.org_unit_id
  group by v.id, v.code, v.name, ur.region_name, pv.name, x.stage
  order by ur.region_name nulls last, pv.name nulls last, v.code, x.stage;
end;
$$;

-- ---------------------------------------------------------------
-- 10) สถิติสาธารณะ (anon): จำนวนผู้สมัครแยก ปี ประเภท ชั้น ช่วงชั้น ภาค จังหวัด ของสนามสอบ
--     นับเฉพาะบัญชีที่ส่งแล้ว รวมระหว่างรับรอง (ผู้สั่งงานกำหนด) ไม่มีข้อมูลรายบุคคล
-- ---------------------------------------------------------------
create function public.public_registration_stats()
returns table (year_be integer, exam_type text, level text, stage text, region_name text, province_name text, candidates integer)
language sql
stable
security definer
set search_path = public
as $$
  select y.year_be, r.exam_type, r.level, c.stage, coalesce(ur.region_name, ''), coalesce(pv.name, ''), count(*)::integer
  from public.candidates c
  join public.registration_batches b on b.id = c.batch_id
  join public.exam_rounds r on r.id = b.round_id
  join public.academic_years y on y.id = r.academic_year_id
  join public.exam_venues v on v.id = b.venue_id
  left join public.places pl on pl.id = v.place_id
  left join public.civil_provinces pv on pv.code = pl.province_code
  left join private.unit_regions() ur on ur.unit_id = v.org_unit_id
  where c.counted and b.status in ('submitted', 'returned', 'certified') and r.is_active
  group by y.year_be, r.exam_type, r.level, c.stage, ur.region_name, pv.name;
$$;

revoke execute on function public.append_registration_file(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.save_candidate(uuid, uuid, jsonb, text) from public, anon;
revoke execute on function public.withdraw_candidate(uuid, text) from public, anon;
revoke execute on function public.submit_registration_batch(uuid) from public, anon;
revoke execute on function public.list_registration_accounts(text, text, uuid, integer) from public, anon;
revoke execute on function public.registration_history(uuid) from public, anon;
revoke execute on function public.venue_registration_totals(uuid) from public, anon;
revoke execute on function public.public_registration_stats() from public;
grant execute on function public.append_registration_file(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.save_candidate(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.withdraw_candidate(uuid, text) to authenticated;
grant execute on function public.submit_registration_batch(uuid) to authenticated;
grant execute on function public.list_registration_accounts(text, text, uuid, integer) to authenticated;
grant execute on function public.registration_history(uuid) to authenticated;
grant execute on function public.venue_registration_totals(uuid) to authenticated;
grant execute on function public.public_registration_stats() to anon, authenticated;
