-- บทที่ 18 (1/2): อัปโหลด ตรวจ แสดงตัวอย่าง ยืนยัน รายชื่อผู้สมัครสอบ (ระบบที่ 9)
--   ไฟล์ .xlsx ตามแบบ ศ. ถูกอ่านที่เซิร์ฟเวอร์ (src/lib/exam-upload.ts: ตรวจโครงแฟ้ม ตัดช่องว่าง แปลงเลขไทย แปลงวันที่ พ.ศ.)
--   แล้วส่งค่ารายแถวมาที่ create_registration_batch ซึ่งตรวจข้อมูลทุกข้อซ้ำในฐานข้อมูลตามค่าตั้งใน form_templates
--   (ช่องบังคับ ชนิดข้อมูล เลขประจำตัว ซ้ำในไฟล์ ซ้ำทั่วประเทศ คุณสมบัติตามชั้น) จึงข้ามการตรวจด้วยการเรียกฟังก์ชันตรงไม่ได้

insert into public.app_settings (key, value_int, description) values
  ('exam_upload_max_mb', 5, 'สมัครสอบ: ขนาดไฟล์ Excel ที่อัปโหลดได้สูงสุด (MB ไม่เกิน 10)'),
  ('exam_upload_max_rows', 2000, 'สมัครสอบ: จำนวนผู้สมัครสูงสุดต่อไฟล์ (แถว ไม่เกิน 5000)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- 1) ตาราง
-- ---------------------------------------------------------------
-- status: draft ร่าง (อัปโหลดแล้ว รอตรวจและยืนยัน) / confirmed ยืนยันแล้ว / submitted ส่งแล้ว (บทถัดไป) / withdrawn ถอน
create table public.registration_batches (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references public.exam_rounds (id),
  template_id     uuid not null references public.form_templates (id),
  place_id        uuid not null references public.places (id),           -- สำนักหรือสถานศึกษาที่ส่งสมัคร
  venue_id        uuid not null references public.exam_venues (id),      -- สนามสอบ
  org_unit_id     uuid not null references public.org_units (id),        -- เขตคณะสงฆ์ของสำนัก (ใช้กำหนดสิทธิ์เห็น)
  uploaded_by     uuid not null default auth.uid() references public.profiles (id),
  file_name       text not null default '' check (length(file_name) <= 200),
  file_path       text not null default '',                              -- ไฟล์ต้นฉบับในที่เก็บ registration-files
  file_size       integer not null default 0 check (file_size >= 0),
  row_count       integer not null default 0 check (row_count >= 0),      -- จำนวนแถวในไฟล์
  ok_count        integer not null default 0 check (ok_count >= 0),       -- แถวที่ผ่าน
  error_count     integer not null default 0 check (error_count >= 0),    -- แถวที่ไม่ผ่าน
  saved_count     integer not null default 0 check (saved_count >= 0),    -- ผู้สมัครที่บันทึกเมื่อยืนยัน
  status          text not null default 'draft' check (status in ('draft', 'confirmed', 'submitted', 'withdrawn')),
  confirmed_at    timestamptz,
  confirmed_by    uuid references public.profiles (id),
  withdrawn_at    timestamptz,
  withdrawn_by    uuid references public.profiles (id),
  withdraw_reason text not null default '' check (length(withdraw_reason) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.registration_batches is 'ชุดรายชื่อผู้สมัครสอบที่อัปโหลดจากไฟล์ Excel บัญชี ศ. (หนึ่งชุด = หนึ่งไฟล์ = รอบ + สำนัก + สนามสอบ)';
create index registration_batches_round_idx on public.registration_batches (round_id, status);
create index registration_batches_unit_idx on public.registration_batches (org_unit_id);
create index registration_batches_uploader_idx on public.registration_batches (uploaded_by);

-- หนึ่งแถว = ผู้สมัคร 1 รูป/คน ในชุด (แถวที่ไม่ผ่านการตรวจก็เก็บไว้เพื่อแสดงเหตุผล แต่ไม่นับเป็นผู้สมัคร)
-- status: ok ผ่าน / error ไม่ผ่าน / excluded ไม่ผ่านและไม่ได้บันทึกเมื่อยืนยันเฉพาะแถวที่ผ่าน
-- counted: เป็นผู้สมัครที่นับแล้ว (ชุดยืนยันหรือส่งแล้ว และแถวผ่าน) ใช้ตรวจซ้ำทั่วประเทศ
create table public.candidates (
  id                 uuid primary key default gen_random_uuid(),
  batch_id           uuid not null references public.registration_batches (id),
  round_id           uuid not null references public.exam_rounds (id),
  row_no             integer not null check (row_no >= 1),                  -- แถวในไฟล์ Excel
  seq                integer,                                               -- เลขที่ (คอลัมน์ A)
  candidate_code     text unique,                                           -- รหัสผู้สมัคร ออกเมื่อยืนยัน เช่น 2569-ศ1-000001
  person_kind        text not null check (person_kind in ('monastic', 'lay')),  -- บรรพชิต / คฤหัสถ์
  title              text not null default '',
  first_name         text not null default '',
  monastic_name      text not null default '',
  last_name          text not null default '',
  birth_date         date,
  ordination_date    date,
  age                integer,                                               -- อายุเต็มปี ณ วันสอบวันแรก
  phansa             integer,                                               -- พรรษา ณ วันสอบวันแรก (บรรพชิต)
  national_id_enc    bytea,                                                 -- เลขประจำตัว (เข้ารหัส)
  national_id_last4  text,                                                  -- 4 ตัวท้าย (แสดงผล)
  national_id_hash   text,                                                  -- รหัสเทียบซ้ำ
  id_kind            text not null default 'none' check (id_kind in ('nid', 'other', 'none')),  -- เลข 13 หลัก / เลขอื่น / ไม่มี
  person_key         text not null,                                         -- รหัสเทียบซ้ำจาก ชื่อ นามสกุล วันเกิด
  school_name        text not null default '',                              -- วัด (นักธรรม) หรือสถานศึกษา/องค์กร (ธรรมศึกษา)
  level              text not null check (level in ('tri', 'tho', 'ek')),   -- ชั้นที่สมัคร
  stage              text not null default '',                              -- ช่วงชั้น (ระดับธรรมศึกษา)
  extra              jsonb not null default '{}'::jsonb,                    -- คอลัมน์อื่นตามแบบ ศ.
  errors             jsonb not null default '[]'::jsonb,                    -- [{field, label, message}]
  status             text not null check (status in ('ok', 'error', 'excluded')),
  counted            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint candidates_counted_ok check (not counted or status = 'ok'),
  constraint candidates_row_unique unique (batch_id, row_no)
);
comment on table public.candidates is 'ผู้สมัครสอบจากไฟล์ที่อัปโหลด (เขียนผ่านฟังก์ชันของชุดเท่านั้น) เลขประจำตัวเข้ารหัส แสดงได้เฉพาะ 4 ตัวท้าย';
create index candidates_batch_idx on public.candidates (batch_id, row_no);
create unique index candidates_counted_nid on public.candidates (round_id, national_id_hash)
  where counted and national_id_hash is not null;
create index candidates_counted_person on public.candidates (round_id, person_key) where counted;

-- เลขลำดับของรหัสผู้สมัคร ต่อปี พ.ศ. + แบบ (ระบบเขียนเท่านั้น)
create table public.candidate_code_counters (
  year_be   integer not null,
  form_key  text not null,
  last_no   integer not null default 0,
  primary key (year_be, form_key)
);
comment on table public.candidate_code_counters is 'ลำดับล่าสุดของรหัสผู้สมัคร ต่อปีและแบบ ศ. (ศ.๒ ชั้นโทและเอกใช้ลำดับร่วมกัน)';

create trigger registration_batches_set_updated_at before update on public.registration_batches
  for each row execute function public.set_updated_at();
create trigger registration_batches_audit after insert or update or delete on public.registration_batches
  for each row execute function public.audit_row_change();
create trigger candidates_set_updated_at before update on public.candidates
  for each row execute function public.set_updated_at();
-- audit_row_change ตัดคอลัมน์ national_id_enc ออกก่อนบันทึกประวัติอยู่แล้ว
create trigger candidates_audit after insert or update or delete on public.candidates
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- 2) สิทธิ์เห็นรายชื่อ (ผู้สั่งงานกำหนด): ผู้อัปโหลดเห็นชุดของตน / เจ้าคณะ รองเจ้าคณะ เลขานุการ เห็นชุดในเขตตนและใต้สังกัด
--    ส่วนกลางและผู้ดูแลระบบเห็นทั้งหมด (เจ้าหน้าที่สำนักเรียนและ จศป. จึงเห็นเฉพาะชุดที่ตนอัปโหลด)
-- ---------------------------------------------------------------
create function public.can_view_registration(p_org_unit_id uuid, p_uploaded_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uploaded_by = auth.uid()
    or public.has_role('admin') or public.has_role('central_staff')
    or exists (
      select 1
      from public.my_role_rows() m
      join public.ancestors_or_self(p_org_unit_id) a on a.id = m.org_unit_id
      where m.effective and m.role_key in ('chief', 'deputy_chief', 'secretary')
    );
$$;
revoke execute on function public.can_view_registration(uuid, uuid) from public, anon;
grant execute on function public.can_view_registration(uuid, uuid) to authenticated;

alter table public.registration_batches enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_code_counters enable row level security;
revoke all on public.registration_batches, public.candidates, public.candidate_code_counters from anon;
revoke insert, update, delete, truncate on public.registration_batches, public.candidates from authenticated;
revoke all on public.candidate_code_counters from authenticated;
-- คอลัมน์เลขประจำตัวที่เข้ารหัสและรหัสเทียบซ้ำ อ่านไม่ได้
revoke select on public.candidates from authenticated;
grant select (
  id, batch_id, round_id, row_no, seq, candidate_code, person_kind, title, first_name, monastic_name, last_name,
  birth_date, ordination_date, age, phansa, national_id_last4, id_kind, school_name, level, stage, extra, errors,
  status, counted, created_at, updated_at
) on public.candidates to authenticated;

create policy registration_batches_read on public.registration_batches for select to authenticated
  using (public.can_view_registration(org_unit_id, uploaded_by));
create policy candidates_read on public.candidates for select to authenticated
  using (exists (
    select 1 from public.registration_batches b
    where b.id = batch_id and public.can_view_registration(b.org_unit_id, b.uploaded_by)
  ));

-- ---------------------------------------------------------------
-- 3) ตัวช่วยตรวจข้อมูล
-- ---------------------------------------------------------------
-- อายุเต็มปี และพรรษา (ตรงกับ ageOf / phansaOf ใน src/lib/persons.ts: นับพรรษาเมื่ออุปสมบทก่อน 1 ส.ค. และพ้น 31 ต.ค.)
create function private.age_on(p_birth date, p_ref date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_birth is null or p_ref is null or p_birth > p_ref then null
    else extract(year from age(p_ref, p_birth))::integer end;
$$;
revoke all on function private.age_on(date, date) from public, anon, authenticated;

create function private.phansa_on(p_ordination date, p_ref date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_ordination is null or p_ref is null then null
    else greatest(0,
      (case when extract(month from p_ref) >= 11 then extract(year from p_ref) else extract(year from p_ref) - 1 end)::integer
      - (case when extract(month from p_ordination) < 8 then extract(year from p_ordination) else extract(year from p_ordination) + 1 end)::integer
      + 1) end;
$$;
revoke all on function private.phansa_on(date, date) from public, anon, authenticated;

-- ข้อความเป็นวันที่ (YYYY-MM-DD ที่มีจริง) หรือ null
create function private.iso_date_or_null(p_value text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p_value::date;
exception when others then
  return null;
end;
$$;
revoke all on function private.iso_date_or_null(text) from public, anon, authenticated;

-- รหัสเทียบซ้ำจาก ชื่อ นามสกุล วันเกิด (ไม่สนช่องว่าง)
create function private.person_key(p_first text, p_last text, p_birth date)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(regexp_replace(coalesce(p_first, ''), '\s+', '', 'g') || '|' || regexp_replace(coalesce(p_last, ''), '\s+', '', 'g')
             || '|' || coalesce(p_birth::text, ''));
$$;
revoke all on function private.person_key(text, text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 4) สร้างชุดจากไฟล์ (ร่าง) และตรวจทุกแถว
--    p_file: {name, path, size}  path ต้องอยู่ในโฟลเดอร์ของผู้อัปโหลด (auth.uid()/...)
--    p_rows: [{row_no, values: {คีย์คอลัมน์: ข้อความ}, errors: [{field, message}]}]
--      values เป็นข้อความที่ตัดช่องว่างและแปลงเลขไทยแล้ว วันที่เป็น YYYY-MM-DD (ค.ศ.)
--      errors = ข้อผิดพลาดจากการอ่านไฟล์ (เช่น วันที่อ่านไม่ได้) ฐานข้อมูลตรวจซ้ำทุกข้อและเพิ่มข้อผิดพลาดของตนเอง
-- ---------------------------------------------------------------
create function public.create_registration_batch(p_round uuid, p_place uuid, p_venue uuid, p_file jsonb, p_rows jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb;
  v_round public.exam_rounds%rowtype;
  v_year integer;
  v_template public.form_templates%rowtype;
  v_place public.places%rowtype;
  v_batch uuid;
  v_max_rows integer := least(coalesce(public.setting_int('exam_upload_max_rows'), 2000), 5000);
  v_key text := private.national_id_key();
  v_row jsonb;
  v_vals jsonb;
  v_col jsonb;
  v_errs jsonb;
  v_ckey text;
  v_val text;
  v_label text;
  v_type text;
  v_nid text;
  v_note text;
  v_birth date;
  v_ord date;
  v_hash text;
  v_pkey text;
  v_first_row integer;
  v_dup record;
  v_extra jsonb;
  v_known text[] := array['seq', 'national_id', 'title', 'first_name', 'monastic_name', 'last_name', 'birth_date',
                          'ordination_date', 'stage'];
  v_seen_hash jsonb := '{}'::jsonb;
  v_seen_key jsonb := '{}'::jsonb;
  v_seen_seq jsonb := '{}'::jsonb;
  v_ok integer := 0;
  v_bad integer := 0;
  v_n integer := 0;
  v_ref date;
begin
  -- รอบเปิดรับและอยู่ในช่วงวัน / สำนักในเขตของผู้ใช้ / สนามสอบเปิดและสอบชั้นนี้ / มีเมนูสมัครสอบ (ข้อความผิดพลาดจากฟังก์ชันนี้)
  v_ctx := public.exam_template_context(p_round, p_place, p_venue);
  select * into v_round from public.exam_rounds where id = p_round;
  v_year := (v_ctx ->> 'year_be')::integer;
  select * into v_template from public.form_templates where id = (v_ctx ->> 'template_id')::uuid;
  select * into v_place from public.places where id = p_place;
  v_ref := v_round.exam_starts_on;

  if coalesce(p_file ->> 'path', '') !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.xlsx$') then
    raise exception 'ที่เก็บไฟล์ต้นฉบับไม่ถูกต้อง' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'ไม่พบรายชื่อผู้สมัครในไฟล์ (เริ่มกรอกที่แถว 9)' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > v_max_rows then
    raise exception 'ไฟล์มีผู้สมัครเกิน % แถว กรุณาแบ่งไฟล์', v_max_rows using errcode = 'P0001';
  end if;

  insert into public.registration_batches (round_id, template_id, place_id, venue_id, org_unit_id, file_name, file_path, file_size)
  values (p_round, v_template.id, p_place, p_venue, v_place.org_unit_id,
          left(coalesce(p_file ->> 'name', ''), 200), p_file ->> 'path', greatest(0, coalesce((p_file ->> 'size')::integer, 0)))
  returning id into v_batch;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_vals := coalesce(v_row -> 'values', '{}'::jsonb);
    v_errs := '[]'::jsonb;
    -- ข้อผิดพลาดจากการอ่านไฟล์
    if jsonb_typeof(v_row -> 'errors') = 'array' then
      select coalesce(jsonb_agg(jsonb_build_object('field', e ->> 'field', 'message', left(e ->> 'message', 200))), '[]'::jsonb)
        into v_errs from jsonb_array_elements(v_row -> 'errors') e;
    end if;

    -- ตรวจรายคอลัมน์ตามแบบ ศ.
    for v_col in select value from jsonb_array_elements(v_template.columns) loop
      v_ckey := v_col ->> 'key';
      v_label := v_col ->> 'label';
      v_type := v_col ->> 'type';
      v_val := btrim(coalesce(v_vals ->> v_ckey, ''));
      if v_errs @> jsonb_build_array(jsonb_build_object('field', v_ckey)) then
        continue;  -- อ่านค่าช่องนี้ไม่ได้ แจ้งไว้แล้ว
      end if;
      if v_val = '' then
        if (v_col ->> 'required')::boolean and v_type <> 'id' then
          v_errs := v_errs || jsonb_build_object('field', v_ckey, 'message', 'ต้องกรอก');
        end if;
        continue;
      end if;
      if length(v_val) > 200 then
        v_errs := v_errs || jsonb_build_object('field', v_ckey, 'message', 'ยาวเกิน 200 ตัวอักษร');
      elsif v_type in ('number', 'year') then
        if v_val !~ '^\d{1,10}$' then
          v_errs := v_errs || jsonb_build_object('field', v_ckey, 'message', 'ต้องเป็นตัวเลขอารบิก');
        elsif v_val::bigint not between (v_col ->> 'min')::bigint and (v_col ->> 'max')::bigint then
          v_errs := v_errs || jsonb_build_object('field', v_ckey,
            'message', format('ต้องอยู่ระหว่าง %s ถึง %s', v_col ->> 'min', v_col ->> 'max'));
        end if;
      elsif v_type = 'list' then
        if not (v_col -> 'options') ? v_val then
          v_errs := v_errs || jsonb_build_object('field', v_ckey,
            'message', 'เลือกได้เฉพาะ ' || (select string_agg(o, ' / ') from jsonb_array_elements_text(v_col -> 'options') o));
        end if;
      elsif v_type = 'date' then
        if private.iso_date_or_null(v_val) is null then
          v_errs := v_errs || jsonb_build_object('field', v_ckey, 'message', 'วันที่ไม่ถูกต้อง พิมพ์แบบ วัน/เดือน/ปี พ.ศ. เช่น 1/1/2540');
        elsif private.iso_date_or_null(v_val) > v_ref then
          v_errs := v_errs || jsonb_build_object('field', v_ckey, 'message', 'วันที่อยู่หลังวันสอบ');
        end if;
      elsif v_type = 'text' and left(v_val, 1) = '=' then
        v_errs := v_errs || jsonb_build_object('field', v_ckey, 'message', 'ห้ามใช้สูตร');
      end if;
    end loop;

    -- เลขประจำตัว: 13 หลักต้องผ่านเลขตรวจสอบ / เลขอื่นหรือไม่มี ต้องระบุเหตุในช่องหมายเหตุ (ผู้สั่งงานกำหนด)
    v_nid := upper(regexp_replace(coalesce(v_vals ->> 'national_id', ''), '[\s-]', '', 'g'));
    v_note := btrim(coalesce(v_vals ->> 'note', ''));
    v_hash := null;
    if not v_errs @> '[{"field":"national_id"}]'::jsonb then
      if v_nid ~ '^\d{13}$' then
        if not public.valid_national_id(v_nid) then
          v_errs := v_errs || '{"field":"national_id","message":"เลขประจำตัวประชาชนไม่ถูกต้อง (เลขตรวจสอบไม่ตรง)"}'::jsonb;
        end if;
      elsif v_nid = '' then
        if exists (select 1 from jsonb_array_elements(v_template.columns) c where c ->> 'key' = 'national_id' and (c ->> 'required')::boolean) then
          v_errs := v_errs || '{"field":"national_id","message":"ต้องกรอก"}'::jsonb;
        elsif v_note = '' then
          v_errs := v_errs || '{"field":"national_id","message":"ไม่มีเลขประจำตัว ต้องระบุเหตุในช่องหมายเหตุ"}'::jsonb;
        end if;
      elsif v_nid !~ '^[0-9A-Z]{5,20}$' then
        v_errs := v_errs || '{"field":"national_id","message":"เลขประจำตัวมีอักขระที่ใช้ไม่ได้"}'::jsonb;
      elsif v_note = '' then
        v_errs := v_errs || '{"field":"national_id","message":"ไม่ใช่เลข 13 หลัก ต้องระบุเหตุในช่องหมายเหตุ เช่น ต่างชาติ"}'::jsonb;
      end if;
    end if;
    if v_nid <> '' then
      v_hash := encode(extensions.hmac(convert_to(v_nid, 'utf8'), convert_to(v_key, 'utf8'), 'sha256'), 'hex');
    end if;

    v_birth := private.iso_date_or_null(v_vals ->> 'birth_date');
    v_ord := private.iso_date_or_null(v_vals ->> 'ordination_date');
    if v_birth is not null and v_ord is not null and v_ord < v_birth then
      v_errs := v_errs || '{"field":"ordination_date","message":"วันอุปสมบทอยู่ก่อนวันเกิด"}'::jsonb;
    end if;

    -- คุณสมบัติตามชั้น (ผู้สั่งงานกำหนด: ตรวจเท่าที่ไฟล์บอกได้) ชั้นโท เอก ต้องสอบได้ชั้นก่อนหน้าแล้ว: ปีที่สอบได้ต้องก่อนปีที่สมัคร
    if v_round.level in ('tho', 'ek') and (v_vals ->> 'prev_year') ~ '^\d{4}$'
       and (v_vals ->> 'prev_year')::integer >= v_year
       and not v_errs @> '[{"field":"prev_year"}]'::jsonb then
      v_errs := v_errs || jsonb_build_object('field', 'prev_year',
        'message', format('ปีที่สอบได้ชั้นก่อนหน้าต้องก่อนปีที่สมัคร (%s)', v_year));
    end if;

    -- ซ้ำในไฟล์
    v_pkey := private.person_key(v_vals ->> 'first_name', v_vals ->> 'last_name', v_birth);
    if v_hash is not null then
      v_first_row := (v_seen_hash ->> v_hash)::integer;
      if v_first_row is not null then
        v_errs := v_errs || jsonb_build_object('field', 'national_id', 'message', format('เลขประจำตัวซ้ำกับแถวที่ %s ในไฟล์', v_first_row));
      else
        v_seen_hash := v_seen_hash || jsonb_build_object(v_hash, (v_row ->> 'row_no')::integer);
      end if;
    end if;
    if btrim(coalesce(v_vals ->> 'first_name', '')) <> '' and v_birth is not null then
      v_first_row := (v_seen_key ->> v_pkey)::integer;
      if v_first_row is not null and v_hash is null then
        v_errs := v_errs || jsonb_build_object('field', 'first_name', 'message', format('ชื่อ นามสกุล วันเกิด ซ้ำกับแถวที่ %s ในไฟล์', v_first_row));
      elsif v_first_row is null then
        v_seen_key := v_seen_key || jsonb_build_object(v_pkey, (v_row ->> 'row_no')::integer);
      end if;
    end if;
    if (v_vals ->> 'seq') ~ '^\d+$' then
      v_first_row := (v_seen_seq ->> (v_vals ->> 'seq'))::integer;
      if v_first_row is not null then
        v_errs := v_errs || jsonb_build_object('field', 'seq', 'message', format('เลขที่ซ้ำกับแถวที่ %s ในไฟล์', v_first_row));
      else
        v_seen_seq := v_seen_seq || jsonb_build_object(v_vals ->> 'seq', (v_row ->> 'row_no')::integer);
      end if;
    end if;

    -- ซ้ำกับผู้สมัครที่ยืนยันแล้วในรอบเดียวกันทั่วประเทศ
    select c.candidate_code, p.name as place_name into v_dup
    from public.candidates c
    join public.registration_batches b on b.id = c.batch_id
    join public.places p on p.id = b.place_id
    where c.round_id = p_round and c.counted
      and ((v_hash is not null and c.national_id_hash = v_hash)
           or (v_hash is null and v_birth is not null and c.person_key = v_pkey))
    limit 1;
    if found then
      v_errs := v_errs || jsonb_build_object('field', case when v_hash is not null then 'national_id' else 'first_name' end,
        'message', format('สมัครในรอบนี้แล้ว (รหัส %s %s)', v_dup.candidate_code, v_dup.place_name));
    end if;

    -- ใส่ชื่อช่องให้ข้อผิดพลาดทุกข้อ
    select coalesce(jsonb_agg(e || jsonb_build_object('label', coalesce(
             (select c ->> 'label' from jsonb_array_elements(v_template.columns) c where c ->> 'key' = e ->> 'field' limit 1),
             e ->> 'field'))), '[]'::jsonb)
      into v_errs from jsonb_array_elements(v_errs) e;

    v_extra := '{}'::jsonb;
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_extra
    from jsonb_each_text(v_vals) as x(k, v)
    where k <> all (v_known) and v <> ''
      and exists (select 1 from jsonb_array_elements(v_template.columns) c where c ->> 'key' = k);

    insert into public.candidates (
      batch_id, round_id, row_no, seq, person_kind, title, first_name, monastic_name, last_name,
      birth_date, ordination_date, age, phansa,
      national_id_enc, national_id_last4, national_id_hash, id_kind, person_key,
      school_name, level, stage, extra, errors, status
    ) values (
      v_batch, p_round, (v_row ->> 'row_no')::integer,
      case when (v_vals ->> 'seq') ~ '^\d{1,9}$' then (v_vals ->> 'seq')::integer end,
      case when v_round.exam_type = 'nak_tham' then 'monastic' else 'lay' end,
      left(btrim(coalesce(v_vals ->> 'title', '')), 200), left(btrim(coalesce(v_vals ->> 'first_name', '')), 200),
      left(btrim(coalesce(v_vals ->> 'monastic_name', '')), 200), left(btrim(coalesce(v_vals ->> 'last_name', '')), 200),
      v_birth, v_ord, private.age_on(v_birth, v_ref),
      case when v_round.exam_type = 'nak_tham' then private.phansa_on(v_ord, v_ref) end,
      case when v_nid <> '' then extensions.pgp_sym_encrypt(v_nid, v_key) end,
      case when v_nid <> '' then right(v_nid, 4) end,
      v_hash,
      case when v_nid ~ '^\d{13}$' then 'nid' when v_nid <> '' then 'other' else 'none' end,
      v_pkey,
      left(btrim(coalesce(case when v_round.exam_type = 'nak_tham' then v_vals ->> 'temple_name' else v_vals ->> 'org_name' end, '')), 200),
      v_round.level, left(btrim(coalesce(v_vals ->> 'stage', '')), 50), v_extra, v_errs,
      case when jsonb_array_length(v_errs) = 0 then 'ok' else 'error' end
    );
    v_n := v_n + 1;
    if jsonb_array_length(v_errs) = 0 then v_ok := v_ok + 1; else v_bad := v_bad + 1; end if;
  end loop;

  update public.registration_batches set row_count = v_n, ok_count = v_ok, error_count = v_bad where id = v_batch;
  return v_batch;
end;
$$;

-- ---------------------------------------------------------------
-- 5) ยืนยัน: บันทึกเมื่อไม่มีแถวผิด หรือ p_only_ok = บันทึกเฉพาะแถวที่ผ่าน (แถวผิดเป็น excluded เก็บไว้ ไม่ลบ)
--    คืน {saved, blocked, ok_count, error_count}: blocked = ไม่ได้บันทึกเพราะมีแถวผิด (หรือไม่มีแถวผ่านเลย)
--    ตรวจซ้ำทั่วประเทศอีกครั้ง (มีผู้ยืนยันก่อนระหว่างนั้นได้) แล้วออกรหัสผู้สมัคร ปี-แบบ-ลำดับ 6 หลัก
--    เช่น 2569-ศ1-000001 นับต่อตามปี พ.ศ. + แบบ ศ. (ผู้สั่งงานกำหนด)
-- ---------------------------------------------------------------
create function public.confirm_registration_batch(p_batch uuid, p_only_ok boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.registration_batches%rowtype;
  v_round public.exam_rounds%rowtype;
  v_year integer;
  v_form_key text;
  v_c record;
  v_dup record;
  v_bad integer;
  v_ok integer;
  v_no integer;
begin
  select * into v_batch from public.registration_batches where id = p_batch for update;
  if not found or not (v_batch.uploaded_by = auth.uid() or public.has_role('admin') or public.has_role('central_staff')) then
    raise exception 'ยืนยันได้เฉพาะผู้อัปโหลด' using errcode = '42501';
  end if;
  if v_batch.status <> 'draft' then
    raise exception 'ชุดนี้ไม่ได้อยู่ในสถานะ ร่าง แล้ว' using errcode = 'P0001';
  end if;
  select * into v_round from public.exam_rounds where id = v_batch.round_id;
  if not private.exam_round_accepting(v_round) then
    raise exception 'รอบนี้ปิดรับสมัครแล้ว หรือไม่อยู่ในช่วงวันรับสมัคร' using errcode = 'P0001';
  end if;
  select y.year_be into v_year from public.academic_years y where y.id = v_round.academic_year_id;

  -- ตรวจซ้ำทั่วประเทศอีกครั้ง
  for v_c in select * from public.candidates where batch_id = p_batch and status = 'ok' order by row_no loop
    select c.candidate_code, p.name as place_name into v_dup
    from public.candidates c
    join public.registration_batches b on b.id = c.batch_id
    join public.places p on p.id = b.place_id
    where c.round_id = v_batch.round_id and c.counted
      and ((v_c.national_id_hash is not null and c.national_id_hash = v_c.national_id_hash)
           or (v_c.national_id_hash is null and v_c.birth_date is not null and c.person_key = v_c.person_key))
    limit 1;
    if found then
      update public.candidates
         set status = 'error',
             errors = errors || jsonb_build_array(jsonb_build_object(
               'field', case when v_c.national_id_hash is not null then 'national_id' else 'first_name' end,
               'label', case when v_c.national_id_hash is not null then 'เลขประจำตัวประชาชน' else 'ชื่อ' end,
               'message', format('สมัครในรอบนี้แล้ว (รหัส %s %s)', v_dup.candidate_code, v_dup.place_name)))
       where id = v_c.id;
    end if;
  end loop;

  select count(*) filter (where status = 'error'), count(*) filter (where status = 'ok')
    into v_bad, v_ok from public.candidates where batch_id = p_batch;
  update public.registration_batches set ok_count = v_ok, error_count = v_bad where id = p_batch;
  -- ไม่บันทึก แต่เก็บผลตรวจซ้ำล่าสุดไว้ให้เห็นในหน้าตรวจ (จึงคืนผลแทนการยกเลิกทั้งรายการ)
  if (v_bad > 0 and not p_only_ok) or v_ok = 0 then
    return jsonb_build_object('saved', 0, 'blocked', true, 'ok_count', v_ok, 'error_count', v_bad);
  end if;

  v_form_key := regexp_replace(translate((select code from public.form_templates where id = v_batch.template_id),
                                         '๐๑๒๓๔๕๖๗๘๙', '0123456789'), '[^0-9A-Za-zก-๙]', '', 'g');
  insert into public.candidate_code_counters (year_be, form_key, last_no) values (v_year, v_form_key, 0)
  on conflict (year_be, form_key) do nothing;
  update public.candidate_code_counters set last_no = last_no + v_ok
   where year_be = v_year and form_key = v_form_key
  returning last_no - v_ok into v_no;

  begin
    update public.candidates c
       set candidate_code = v_year || '-' || v_form_key || '-' || lpad((v_no + x.n)::text, 6, '0'),
           counted = true
      from (select id, row_number() over (order by row_no) as n from public.candidates where batch_id = p_batch and status = 'ok') x
     where c.id = x.id;
  exception when unique_violation then
    -- มีผู้ยืนยันรายชื่อคนเดียวกันพร้อมกันในเวลาเดียวกัน
    raise exception 'มีผู้สมัครในชุดนี้ถูกยืนยันจากชุดอื่นพร้อมกัน กรุณากดยืนยันอีกครั้ง' using errcode = 'P0001';
  end;
  update public.candidates set status = 'excluded' where batch_id = p_batch and status = 'error';
  update public.registration_batches
     set status = 'confirmed', saved_count = v_ok, confirmed_at = now(), confirmed_by = auth.uid()
   where id = p_batch;
  return jsonb_build_object('saved', v_ok, 'blocked', false, 'ok_count', v_ok, 'error_count', v_bad);
end;
$$;

-- ถอน: ผู้อัปโหลด ส่วนกลาง หรือผู้ดูแลระบบ ถอนชุดที่ยังไม่ส่งได้ ผู้สมัครในชุดไม่นับอีกต่อไป (รหัสผู้สมัครคงไว้ไม่นำกลับมาใช้)
create function public.withdraw_registration_batch(p_batch uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.registration_batches%rowtype;
begin
  select * into v_batch from public.registration_batches where id = p_batch for update;
  if not found or not (v_batch.uploaded_by = auth.uid() or public.has_role('admin') or public.has_role('central_staff')) then
    raise exception 'ถอนได้เฉพาะผู้อัปโหลด' using errcode = '42501';
  end if;
  if v_batch.status not in ('draft', 'confirmed') then
    raise exception 'ชุดนี้ส่งแล้วหรือถอนแล้ว จึงถอนไม่ได้' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception 'เหตุผลยาวเกิน 500 ตัวอักษร' using errcode = '23514';
  end if;
  update public.candidates set counted = false where batch_id = p_batch and counted;
  update public.registration_batches
     set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = auth.uid(), withdraw_reason = btrim(coalesce(p_reason, ''))
   where id = p_batch;
end;
$$;

-- รายการชุดที่ผู้ใช้เห็น พร้อมชื่อรอบ สำนัก สนามสอบ (ใช้กับหน้า /app/exams/batches)
create function public.list_registration_batches(p_status text default null, p_limit integer default 100)
returns table (
  id uuid, status text, year_be integer, exam_type text, level text, form_code text,
  place_name text, venue_name text, venue_code text, file_name text,
  row_count integer, ok_count integer, error_count integer, saved_count integer,
  uploaded_by_me boolean, created_at timestamptz, confirmed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.status, y.year_be, r.exam_type, r.level, f.code, p.name, v.name, v.code, b.file_name,
         b.row_count, b.ok_count, b.error_count, b.saved_count, b.uploaded_by = auth.uid(), b.created_at, b.confirmed_at
  from public.registration_batches b
  join public.exam_rounds r on r.id = b.round_id
  join public.academic_years y on y.id = r.academic_year_id
  join public.form_templates f on f.id = b.template_id
  join public.places p on p.id = b.place_id
  join public.exam_venues v on v.id = b.venue_id
  where public.can_view_registration(b.org_unit_id, b.uploaded_by)
    and (p_status is null or b.status = p_status)
  order by b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

-- รายละเอียดชุดหนึ่ง (ใช้กับหน้า /app/exams/batches/[id]) คืน null ถ้าไม่พบหรือไม่มีสิทธิ์เห็น
create function public.get_registration_batch(p_id uuid)
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
    'uploaded_by_me', b.uploaded_by = auth.uid(),
    'uploader_name', btrim(concat_ws(' ', u.title_prefix, u.first_name, nullif(u.monastic_name, ''), u.last_name)),
    'can_act', b.uploaded_by = auth.uid() or public.has_role('admin') or public.has_role('central_staff'),
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

revoke execute on function public.get_registration_batch(uuid) from public, anon;
grant execute on function public.get_registration_batch(uuid) to authenticated;
revoke execute on function public.create_registration_batch(uuid, uuid, uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.confirm_registration_batch(uuid, boolean) from public, anon;
revoke execute on function public.withdraw_registration_batch(uuid, text) from public, anon;
revoke execute on function public.list_registration_batches(text, integer) from public, anon;
grant execute on function public.create_registration_batch(uuid, uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.confirm_registration_batch(uuid, boolean) to authenticated;
grant execute on function public.withdraw_registration_batch(uuid, text) to authenticated;
grant execute on function public.list_registration_batches(text, integer) to authenticated;
