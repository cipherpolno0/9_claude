-- บทที่ 21: นำเข้าผลสอบ ประกาศผล และค้นผลสอบ (ระบบที่ 5)
-- 1) ผลสอบต่อผู้สมัคร (exam_results) สถานะประกาศต่อรอบ (ร่าง > ประกาศแล้ว) และประวัติการแก้ผล
-- 2) ส่วนกลางนำเข้าผลจาก Excel (จับคู่ด้วยรหัสผู้สมัคร) แก้ผลรายคน (หลังประกาศต้องมีเหตุผล) และประกาศผล
-- 3) ผลสอบได้ย้อนหลัง (ก่อนมีระบบ) ที่ส่วนกลางนำเข้า ใช้เป็นหลักฐานคุณสมบัติ
-- 4) ตรวจคุณสมบัติชั้นโท เอก: ต้องมีผลสอบได้ชั้นก่อนหน้า (บังคับทุกกรณี: ผู้สั่งงานกำหนด)
-- 5) บัญชีผู้สอบได้ ศ.๔ (นักธรรม) ศ.๘ (ธรรมศึกษา) ตามแบบจริง ข้อความรับรองและช่องลงนามผู้ดูแลระบบตั้งเอง
-- 6) หน้าสาธารณะ: ค้นผลสอบ (เฉพาะผู้สอบได้: ผู้สั่งงานกำหนด) และสถิติผลสอบ เฉพาะรอบที่ประกาศแล้ว

-- ---------------------------------------------------------------
-- 1) สถานะการประกาศผลต่อรอบ (เปลี่ยนได้เฉพาะผ่าน publish_exam_results)
-- ---------------------------------------------------------------
alter table public.exam_rounds
  add column result_status text not null default 'draft' check (result_status in ('draft', 'published')),
  add column results_published_at timestamptz,
  add column results_published_by uuid references public.profiles (id),
  add column results_announced_on date;
comment on column public.exam_rounds.result_status is 'สถานะผลสอบของรอบ: draft ร่าง (ยังไม่เปิดเผย) / published ประกาศแล้ว';
comment on column public.exam_rounds.results_announced_on is 'วันที่ประกาศผลสอบ (พิมพ์ท้ายบัญชีผู้สอบได้)';

create function public.exam_rounds_result_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.result_status, new.results_published_at, new.results_published_by, new.results_announced_on)
     is distinct from (old.result_status, old.results_published_at, old.results_published_by, old.results_announced_on) then
    if coalesce(current_setting('app.exam_results', true), '') <> '1' then
      raise exception 'สถานะการประกาศผลสอบเปลี่ยนได้จากหน้า ผลสอบ เท่านั้น' using errcode = '42501';
    end if;
    if old.result_status = 'published' and new.result_status <> 'published' then
      raise exception 'ผลสอบของรอบนี้ประกาศแล้ว ยกเลิกการประกาศไม่ได้' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.exam_rounds_result_guard() from public, anon, authenticated;
create trigger exam_rounds_result_guard before update on public.exam_rounds
  for each row execute function public.exam_rounds_result_guard();

-- ---------------------------------------------------------------
-- 2) แบบบัญชีผู้สอบได้ (ศ.๔ นักธรรม / ศ.๘ ธรรมศึกษา ตามไฟล์จริงที่ผู้สั่งงานแนบ ฉบับ 2568)
--    ข้อความรับรองและช่องลงนามผู้ดูแลระบบแก้ได้ (ช่องลงนามเริ่มว่าง ห้ามเดาชื่อและตำแหน่ง)
-- ---------------------------------------------------------------
create table public.exam_result_forms (
  exam_type    text primary key check (exam_type in ('nak_tham', 'tham_sueksa')),
  code         text not null check (length(btrim(code)) between 1 and 20),
  certify_text text not null default '' check (length(certify_text) <= 200),
  signatures   jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now()
);
comment on table public.exam_result_forms is 'แบบบัญชีรายชื่อผู้สอบได้ ต่อประเภทการสอบ (ศ.๔ นักธรรม, ศ.๘ ธรรมศึกษา)';
insert into public.exam_result_forms (exam_type, code, certify_text) values
  ('nak_tham', 'ศ.๔', 'รับรองตามนี้'),
  ('tham_sueksa', 'ศ.๘', 'รับรองตามนี้');

create function public.exam_result_forms_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.code := btrim(new.code);
  new.certify_text := btrim(new.certify_text);
  if not private.form_signatures_ok(new.signatures) then
    raise exception 'ช่องลงนามมีได้ไม่เกิน 6 ช่อง แต่ละช่องต้องมีข้อความ 1 ถึง 300 ตัวอักษร ไม่เกิน 5 บรรทัด' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.exam_result_forms_check() from public, anon, authenticated;
create trigger exam_result_forms_check before insert or update on public.exam_result_forms
  for each row execute function public.exam_result_forms_check();
create trigger exam_result_forms_set_updated_at before update on public.exam_result_forms
  for each row execute function public.set_updated_at();
create trigger exam_result_forms_audit after insert or update or delete on public.exam_result_forms
  for each row execute function public.audit_row_change();
alter table public.exam_result_forms enable row level security;
revoke all on public.exam_result_forms from anon;
revoke insert, delete, truncate on public.exam_result_forms from authenticated;
create policy exam_result_forms_read on public.exam_result_forms for select to authenticated using (true);
create policy exam_result_forms_admin_update on public.exam_result_forms for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---------------------------------------------------------------
-- 3) ผลสอบ: หนึ่งแถวต่อผู้สมัคร (เขียนผ่านฟังก์ชันเท่านั้น)
--    result: passed สอบได้ / failed สอบตก / absent ขาดสอบ  scores: {kratu, dhamma, buddha, vinaya} (ถ้ามี)
-- ---------------------------------------------------------------
create table public.exam_results (
  id              uuid primary key default gen_random_uuid(),
  candidate_id    uuid not null unique references public.candidates (id),
  round_id        uuid not null references public.exam_rounds (id),
  result          text not null check (result in ('passed', 'failed', 'absent')),
  scores          jsonb not null default '{}'::jsonb check (jsonb_typeof(scores) = 'object'),
  certificate_no  text not null default '' check (length(certificate_no) <= 40),
  note            text not null default '' check (length(note) <= 200),
  announced_on    date,
  created_by      uuid default auth.uid() references public.profiles (id),
  updated_by      uuid default auth.uid() references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint exam_results_cert_passed check (certificate_no = '' or result = 'passed'),
  constraint exam_results_absent_scores check (result <> 'absent' or scores = '{}'::jsonb)
);
comment on table public.exam_results is 'ผลสอบของผู้สมัคร (นำเข้าและแก้ไขโดยส่วนกลางผ่านฟังก์ชัน) เปิดเผยเมื่อรอบประกาศผลแล้ว';
create index exam_results_round_idx on public.exam_results (round_id, result);
create unique index exam_results_certificate_unique on public.exam_results (certificate_no) where certificate_no <> '';

create trigger exam_results_set_updated_at before update on public.exam_results
  for each row execute function public.set_updated_at();
create trigger exam_results_audit after insert or update or delete on public.exam_results
  for each row execute function public.audit_row_change();

-- ประวัติการนำเข้า แก้ไข และประกาศผล (ระบบเขียนเท่านั้น)
create table public.exam_result_changes (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.exam_rounds (id),
  candidate_id  uuid references public.candidates (id),
  action        text not null check (action in ('import', 'edit', 'publish')),
  before_data   jsonb,
  after_data    jsonb,
  reason        text not null default '' check (length(reason) <= 500),
  after_publish boolean not null default false,
  actor_id      uuid default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now()
);
comment on table public.exam_result_changes is 'ประวัติผลสอบ: นำเข้า แก้ไข (หลังประกาศต้องมีเหตุผล) และประกาศผล';
create index exam_result_changes_round_idx on public.exam_result_changes (round_id, created_at);
create index exam_result_changes_candidate_idx on public.exam_result_changes (candidate_id) where candidate_id is not null;
create trigger exam_result_changes_audit after insert or update or delete on public.exam_result_changes
  for each row execute function public.audit_row_change();

-- ผลสอบได้ย้อนหลัง (ปีที่ยังไม่มีในระบบ) ส่วนกลางนำเข้า ใช้เป็นหลักฐานคุณสมบัติ ปิดใช้งานแทนการลบ
create table public.exam_pass_history (
  id                 uuid primary key default gen_random_uuid(),
  exam_type          text not null check (exam_type in ('nak_tham', 'tham_sueksa')),
  level              text not null check (level in ('tri', 'tho', 'ek')),
  year_be            integer not null check (year_be between 2400 and 2700),
  title              text not null default '' check (length(title) <= 60),
  first_name         text not null check (length(btrim(first_name)) between 1 and 100),
  monastic_name      text not null default '' check (length(monastic_name) <= 100),
  last_name          text not null check (length(btrim(last_name)) between 1 and 100),
  birth_date         date,
  national_id_enc    bytea,
  national_id_hash   text,
  national_id_last4  text,
  person_key         text not null,
  certificate_no     text not null default '' check (length(certificate_no) <= 40),
  place_name         text not null default '' check (length(place_name) <= 200),
  note               text not null default '' check (length(note) <= 200),
  is_active          boolean not null default true,
  created_by         uuid default auth.uid() references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint exam_pass_history_identity check (national_id_hash is not null or birth_date is not null)
);
comment on table public.exam_pass_history is 'ผลสอบได้ย้อนหลังที่ส่วนกลางนำเข้า (ก่อนมีระบบ) เลขประจำตัวเข้ารหัส แสดงได้เฉพาะ 4 ตัวท้าย';
create unique index exam_pass_history_unique on public.exam_pass_history (exam_type, level, coalesce(national_id_hash, person_key))
  where is_active;
create index exam_pass_history_hash_idx on public.exam_pass_history (national_id_hash) where is_active and national_id_hash is not null;
create index exam_pass_history_person_idx on public.exam_pass_history (person_key) where is_active and birth_date is not null;
create trigger exam_pass_history_set_updated_at before update on public.exam_pass_history
  for each row execute function public.set_updated_at();
-- audit_row_change ตัดคอลัมน์ national_id_enc ออกก่อนบันทึกประวัติอยู่แล้ว
create trigger exam_pass_history_audit after insert or update or delete on public.exam_pass_history
  for each row execute function public.audit_row_change();

-- สิทธิ์: ผลสอบอ่านได้เมื่อเป็นส่วนกลาง หรือรอบประกาศแล้วและเห็นบัญชีนั้น / ผลย้อนหลังอ่านได้เฉพาะส่วนกลาง
alter table public.exam_results enable row level security;
alter table public.exam_result_changes enable row level security;
alter table public.exam_pass_history enable row level security;
revoke all on public.exam_results, public.exam_result_changes, public.exam_pass_history from anon;
revoke insert, update, delete, truncate on public.exam_results, public.exam_result_changes, public.exam_pass_history from authenticated;
revoke select on public.exam_pass_history from authenticated;
grant select (id, exam_type, level, year_be, title, first_name, monastic_name, last_name, birth_date, national_id_last4,
              certificate_no, place_name, note, is_active, created_at, updated_at) on public.exam_pass_history to authenticated;
create policy exam_results_read on public.exam_results for select to authenticated
  using (
    public.can_manage_exam_rounds()
    or exists (
      select 1 from public.exam_rounds r
      join public.candidates c on c.id = exam_results.candidate_id
      join public.registration_batches b on b.id = c.batch_id
      where r.id = exam_results.round_id and r.result_status = 'published'
        and public.can_view_registration(b.org_unit_id, b.uploaded_by)
    )
  );
create policy exam_result_changes_read on public.exam_result_changes for select to authenticated
  using (public.can_manage_exam_rounds());
create policy exam_pass_history_read on public.exam_pass_history for select to authenticated
  using (public.can_manage_exam_rounds());

-- ---------------------------------------------------------------
-- 4) ตัวช่วย
-- ---------------------------------------------------------------
-- มีผลสอบได้ (ประกาศแล้ว หรือผลย้อนหลังที่ใช้งาน) ของประเภทและชั้นนี้ ในปีก่อน p_before_year หรือไม่
-- บุคคลเดียวกัน = เลขประจำตัวเดียวกัน หรือ ชื่อ + นามสกุล + วันเกิด (กติกาเดียวกับการตรวจซ้ำ)
create function private.has_passed(p_type text, p_level text, p_before_year integer, p_hash text, p_birth date, p_pkey text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.exam_results x
    join public.exam_rounds r on r.id = x.round_id
    join public.academic_years y on y.id = r.academic_year_id
    join public.candidates c on c.id = x.candidate_id
    where x.result = 'passed' and r.result_status = 'published'
      and r.exam_type = p_type and r.level = p_level and y.year_be < p_before_year
      and ((p_hash is not null and c.national_id_hash = p_hash)
           or (p_birth is not null and c.birth_date is not null and c.person_key = p_pkey))
  ) or exists (
    select 1
    from public.exam_pass_history h
    where h.is_active and h.exam_type = p_type and h.level = p_level and h.year_be < p_before_year
      and ((p_hash is not null and h.national_id_hash = p_hash)
           or (p_birth is not null and h.birth_date is not null and h.person_key = p_pkey))
  );
$$;
revoke all on function private.has_passed(text, text, integer, text, date, text) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 5) ตรวจข้อมูลผู้สมัคร (แทนของบทที่ 19) เพิ่มการตรวจผลสอบได้ชั้นก่อนหน้าของชั้นโท เอก
--    ใช้ทั้งการอ่านไฟล์ การแก้ไขรายคน และการเพิ่มทีละคน
-- ---------------------------------------------------------------
create or replace function private.registration_validate(
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

  -- บทที่ 21: ชั้นโท เอก ต้องมีผลสอบได้ชั้นก่อนหน้าของประเภทเดียวกัน ในปีก่อนปีที่สมัคร (บังคับทุกกรณี: ผู้สั่งงานกำหนด)
  -- นับผลสอบที่ประกาศแล้วในระบบ และผลสอบได้ย้อนหลังที่ส่วนกลางนำเข้า
  if p_round.level in ('tho', 'ek')
     and not errs @> '[{"field":"national_id"}]'::jsonb
     and not errs @> '[{"field":"prev_year"}]'::jsonb
     and (hash is not null or birth is not null)
     and not private.has_passed(p_round.exam_type, case p_round.level when 'tho' then 'tri' else 'tho' end, p_year, hash, birth, pkey) then
    errs := errs || jsonb_build_object('field', 'prev_year',
      'message', format('ไม่พบผลสอบได้%s ก่อนปี %s ในระบบ (ผลที่ประกาศแล้ว หรือผลย้อนหลังที่ส่วนกลางนำเข้า)',
                        private.exam_name(p_round.exam_type, case p_round.level when 'tho' then 'tri' else 'tho' end), p_year));
  elsif p_round.level in ('tho', 'ek') and hash is null and birth is null
     and not errs @> '[{"field":"prev_year"}]'::jsonb then
    errs := errs || '{"field":"prev_year","message":"ตรวจผลสอบได้ชั้นก่อนหน้าไม่ได้ เพราะไม่มีทั้งเลขประจำตัวและวันเกิด"}'::jsonb;
  end if;
end;
$$;
revoke all on function private.registration_validate(public.form_templates, public.exam_rounds, integer, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 6) นำเข้าผลสอบ (ส่วนกลาง เฉพาะรอบที่ยังไม่ประกาศผล)
--    p_rows: [{row_no, code, result: passed|failed|absent|'' , scores: {kratu, dhamma, buddha, vinaya: ตัวเลขหรือ null},
--              certificate_no, note}]  หน้าเว็บแปลงข้อความ สอบได้ / สอบตก / ขาดสอบ เป็นรหัสแล้ว ฐานข้อมูลตรวจซ้ำทุกข้อ
--    สถานะต่อแถว: new เพิ่มใหม่ / update แก้ผลเดิม / same เหมือนเดิม / empty ยังไม่กรอกผล (ข้าม) / error ผิด
-- ---------------------------------------------------------------
create function private.exam_result_scores(p_scores jsonb, out scores jsonb, out err text)
returns record
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
begin
  scores := '{}'::jsonb;
  err := null;
  if p_scores is null or jsonb_typeof(p_scores) = 'null' then
    return;
  end if;
  if jsonb_typeof(p_scores) <> 'object' then
    err := 'คะแนนรายวิชาไม่ถูกต้อง';
    return;
  end if;
  for k, v in select key, value from jsonb_each(p_scores) loop
    if k <> all (array['kratu', 'dhamma', 'buddha', 'vinaya']) then
      err := 'มีคะแนนของวิชาที่ไม่รู้จัก';
      return;
    end if;
    if jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
      continue;
    end if;
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 999.99
       or (v #>> '{}')::numeric <> round((v #>> '{}')::numeric, 2) then
      err := 'คะแนนต้องเป็นตัวเลข 0 ถึง 999.99 (ทศนิยมไม่เกิน 2 ตำแหน่ง)';
      return;
    end if;
    scores := scores || jsonb_build_object(k, (v #>> '{}')::numeric);
  end loop;
end;
$$;
revoke all on function private.exam_result_scores(jsonb) from public, anon, authenticated;

create function private.exam_result_eval(p_round uuid, p_rows jsonb)
returns table (row_no integer, status text, message text, candidate_id uuid, candidate_code text, full_name text,
               place_name text, result text, scores jsonb, certificate_no text, note text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_c record;
  v_seen jsonb := '{}'::jsonb;
  v_certs jsonb := '{}'::jsonb;
  v_sc record;
  v_old public.exam_results%rowtype;
  v_code text;
  v_cert text;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ข้อมูลที่ส่งมาไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  for r in
    select * from jsonb_to_recordset(p_rows) as x(row_no integer, code text, result text, scores jsonb, certificate_no text, note text)
  loop
    row_no := r.row_no;
    v_code := upper(btrim(coalesce(r.code, '')));
    candidate_code := v_code;
    candidate_id := null; full_name := ''; place_name := '';
    result := coalesce(btrim(r.result), '');
    scores := '{}'::jsonb;
    v_cert := btrim(coalesce(r.certificate_no, ''));
    certificate_no := v_cert;
    note := btrim(coalesce(r.note, ''));
    status := 'error';
    message := '';

    if v_code = '' then
      message := 'ไม่มีรหัสผู้สมัคร';
      return next; continue;
    end if;
    if v_seen ? v_code then
      message := format('รหัสผู้สมัครซ้ำกับแถวที่ %s', v_seen ->> v_code);
      return next; continue;
    end if;
    v_seen := v_seen || jsonb_build_object(v_code, r.row_no);

    select c.id, c.counted, c.status as c_status, b.status as b_status, p.name as p_name,
           btrim(concat_ws(' ', nullif(c.title, ''), c.first_name, nullif(c.monastic_name, ''), nullif(c.last_name, ''))) as nm
      into v_c
      from public.candidates c
      join public.registration_batches b on b.id = c.batch_id
      join public.places p on p.id = b.place_id
     where c.round_id = p_round and upper(c.candidate_code) = v_code;
    if not found then
      message := 'ไม่พบรหัสผู้สมัครนี้ในรอบนี้';
      return next; continue;
    end if;
    candidate_id := v_c.id; full_name := v_c.nm; place_name := v_c.p_name;
    if not v_c.counted or v_c.b_status not in ('submitted', 'returned', 'certified') then
      message := 'ผู้สมัครนี้ถูกถอน หรือบัญชียังไม่ได้ส่ง';
      return next; continue;
    end if;
    if result = '' then
      status := 'empty'; message := 'ยังไม่กรอกผลสอบ';
      return next; continue;
    end if;
    if result not in ('passed', 'failed', 'absent') then
      message := 'ผลสอบต้องเป็น สอบได้ สอบตก หรือ ขาดสอบ';
      return next; continue;
    end if;
    select * into v_sc from private.exam_result_scores(r.scores);
    if v_sc.err is not null then
      message := v_sc.err;
      return next; continue;
    end if;
    scores := v_sc.scores;
    if result = 'absent' and scores <> '{}'::jsonb then
      message := 'ขาดสอบต้องไม่มีคะแนน';
      return next; continue;
    end if;
    if length(v_cert) > 40 or length(note) > 200 then
      message := 'เลขที่ ปกศ. ยาวเกิน 40 ตัวอักษร หรือหมายเหตุยาวเกิน 200 ตัวอักษร';
      return next; continue;
    end if;
    if v_cert <> '' and result <> 'passed' then
      message := 'เลขที่ ปกศ. มีได้เฉพาะผู้สอบได้';
      return next; continue;
    end if;
    if v_cert <> '' then
      if v_certs ? v_cert then
        message := format('เลขที่ ปกศ. ซ้ำกับแถวที่ %s', v_certs ->> v_cert);
        return next; continue;
      end if;
      v_certs := v_certs || jsonb_build_object(v_cert, r.row_no);
      if exists (select 1 from public.exam_results e where e.certificate_no = v_cert and e.candidate_id <> v_c.id) then
        message := 'เลขที่ ปกศ. นี้ใช้กับผู้สอบได้คนอื่นแล้ว';
        return next; continue;
      end if;
    end if;

    select * into v_old from public.exam_results e where e.candidate_id = v_c.id;
    if not found then
      status := 'new';
    elsif v_old.result = result and v_old.scores = scores and v_old.certificate_no = v_cert and v_old.note = note then
      status := 'same'; message := 'ผลเหมือนเดิม';
    else
      status := 'update';
      message := format('แก้ผลเดิม (%s)', case v_old.result when 'passed' then 'สอบได้' when 'failed' then 'สอบตก' else 'ขาดสอบ' end);
    end if;
    return next;
  end loop;
end;
$$;
revoke all on function private.exam_result_eval(uuid, jsonb) from public, anon, authenticated;

-- ตรวจรอบและสิทธิ์ก่อนนำเข้า (ส่วนกลาง รอบใช้งาน ยังไม่ประกาศผล)
create function private.exam_result_round_check(p_round uuid)
returns public.exam_rounds
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.exam_rounds%rowtype;
begin
  if not public.can_manage_exam_rounds() then
    raise exception 'นำเข้าและประกาศผลสอบได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ' using errcode = '42501';
  end if;
  select * into v from public.exam_rounds where id = p_round and is_active;
  if not found then
    raise exception 'ไม่พบรอบสมัครสอบนี้' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
revoke all on function private.exam_result_round_check(uuid) from public, anon, authenticated;

create function public.check_exam_results_import(p_round uuid, p_rows jsonb)
returns table (row_no integer, status text, message text, candidate_code text, full_name text, place_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.exam_rounds%rowtype;
begin
  v := private.exam_result_round_check(p_round);
  if v.result_status = 'published' then
    raise exception 'รอบนี้ประกาศผลแล้ว นำเข้าไม่ได้ ให้แก้ผลรายคนพร้อมระบุเหตุผล' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 5,000 แถว' using errcode = 'P0001';
  end if;
  return query select e.row_no, e.status, e.message, e.candidate_code, e.full_name, e.place_name
               from private.exam_result_eval(p_round, p_rows) e order by e.row_no;
end;
$$;

create function public.import_exam_results(p_round uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.exam_rounds%rowtype;
  v_err integer;
  v_new integer;
  v_upd integer;
  v_same integer;
  v_empty integer;
begin
  v := private.exam_result_round_check(p_round);
  if v.result_status = 'published' then
    raise exception 'รอบนี้ประกาศผลแล้ว นำเข้าไม่ได้ ให้แก้ผลรายคนพร้อมระบุเหตุผล' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 5,000 แถว' using errcode = 'P0001';
  end if;

  with ev as (select * from private.exam_result_eval(p_round, p_rows))
  select count(*) filter (where status = 'error'), count(*) filter (where status = 'new'),
         count(*) filter (where status = 'update'), count(*) filter (where status = 'same'),
         count(*) filter (where status = 'empty')
    into v_err, v_new, v_upd, v_same, v_empty
    from ev;
  if v_err > 0 then
    raise exception 'ยังมีแถวที่ผิด % แถว กรุณาแก้ไฟล์แล้วอัปโหลดใหม่', v_err using errcode = 'P0001';
  end if;
  if v_new + v_upd = 0 then
    raise exception 'ไม่มีผลสอบใหม่หรือที่เปลี่ยนแปลงให้นำเข้า' using errcode = 'P0001';
  end if;

  insert into public.exam_results as t (candidate_id, round_id, result, scores, certificate_no, note)
  select e.candidate_id, p_round, e.result, e.scores, e.certificate_no, e.note
    from private.exam_result_eval(p_round, p_rows) e
   where e.status in ('new', 'update')
  on conflict (candidate_id) do update
    set result = excluded.result, scores = excluded.scores, certificate_no = excluded.certificate_no,
        note = excluded.note, updated_by = auth.uid();

  insert into public.exam_result_changes (round_id, action, after_data)
  values (p_round, 'import', jsonb_build_object('new', v_new, 'updated', v_upd, 'same', v_same, 'empty', v_empty));

  return jsonb_build_object('new', v_new, 'updated', v_upd, 'same', v_same, 'empty', v_empty);
end;
$$;

-- ---------------------------------------------------------------
-- 7) แก้ผลรายคน (ส่วนกลาง) รอบที่ประกาศแล้วต้องมีเหตุผล บันทึกค่าก่อนและหลังใน exam_result_changes
-- ---------------------------------------------------------------
create function public.save_exam_result(p_candidate uuid, p_result text, p_scores jsonb, p_certificate_no text,
                                        p_note text default '', p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.candidates%rowtype;
  v public.exam_rounds%rowtype;
  v_ev record;
  v_old public.exam_results%rowtype;
  v_had boolean;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_c from public.candidates where id = p_candidate;
  if not found then
    raise exception 'ไม่พบผู้สมัครนี้' using errcode = 'P0001';
  end if;
  v := private.exam_result_round_check(v_c.round_id);
  if v.result_status = 'published' and length(v_reason) < 3 then
    raise exception 'รอบนี้ประกาศผลแล้ว ต้องระบุเหตุผลการแก้ไข' using errcode = 'P0001';
  end if;
  if length(v_reason) > 500 then
    raise exception 'เหตุผลยาวเกิน 500 ตัวอักษร' using errcode = 'P0001';
  end if;

  select * into v_ev from private.exam_result_eval(v_c.round_id, jsonb_build_array(jsonb_build_object(
    'row_no', 1, 'code', v_c.candidate_code, 'result', coalesce(p_result, ''), 'scores', p_scores,
    'certificate_no', coalesce(p_certificate_no, ''), 'note', coalesce(p_note, ''))));
  if v_ev.status = 'empty' then
    raise exception 'กรุณาเลือกผลสอบ' using errcode = 'P0001';
  elsif v_ev.status = 'error' then
    raise exception '%', v_ev.message using errcode = 'P0001';
  elsif v_ev.status = 'same' then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  select * into v_old from public.exam_results where candidate_id = p_candidate;
  v_had := found;
  insert into public.exam_results as t (candidate_id, round_id, result, scores, certificate_no, note, announced_on)
  values (p_candidate, v_c.round_id, v_ev.result, v_ev.scores, v_ev.certificate_no, v_ev.note,
          case when v.result_status = 'published' then v.results_announced_on end)
  on conflict (candidate_id) do update
    set result = excluded.result, scores = excluded.scores, certificate_no = excluded.certificate_no,
        note = excluded.note, updated_by = auth.uid();

  insert into public.exam_result_changes (round_id, candidate_id, action, before_data, after_data, reason, after_publish)
  values (v_c.round_id, p_candidate, 'edit',
          case when v_had then jsonb_build_object('result', v_old.result, 'scores', v_old.scores,
                                                  'certificate_no', v_old.certificate_no, 'note', v_old.note) end,
          jsonb_build_object('result', v_ev.result, 'scores', v_ev.scores, 'certificate_no', v_ev.certificate_no, 'note', v_ev.note),
          v_reason, v.result_status = 'published');
  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

-- ---------------------------------------------------------------
-- 8) ประกาศผล: ร่าง > ประกาศแล้ว (ย้อนกลับไม่ได้) ผู้สมัครที่ยังไม่มีผลต้องยืนยันเอง (p_allow_missing)
-- ---------------------------------------------------------------
create function public.publish_exam_results(p_round uuid, p_announced_on date, p_allow_missing boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.exam_rounds%rowtype;
  v_results integer;
  v_missing integer;
begin
  v := private.exam_result_round_check(p_round);
  if v.result_status = 'published' then
    raise exception 'รอบนี้ประกาศผลแล้ว' using errcode = 'P0001';
  end if;
  if p_announced_on is null or p_announced_on > (now() at time zone 'Asia/Bangkok')::date + 30 then
    raise exception 'กรุณาระบุวันที่ประกาศผล (ไม่เกิน 30 วันล่วงหน้า)' using errcode = 'P0001';
  end if;
  select count(*) into v_results from public.exam_results where round_id = p_round;
  if v_results = 0 then
    raise exception 'ยังไม่มีผลสอบในรอบนี้ กรุณานำเข้าผลก่อน' using errcode = 'P0001';
  end if;
  select count(*) into v_missing
    from public.candidates c
    join public.registration_batches b on b.id = c.batch_id
    left join public.exam_results x on x.candidate_id = c.id
   where c.round_id = p_round and c.counted and b.status in ('submitted', 'returned', 'certified') and x.id is null;
  if v_missing > 0 and not coalesce(p_allow_missing, false) then
    raise exception 'ยังมีผู้สมัครที่ไม่มีผลสอบ % คน ถ้าต้องการประกาศก่อน ให้ติ๊กยืนยัน', v_missing using errcode = 'P0001';
  end if;

  perform set_config('app.exam_results', '1', true);
  update public.exam_rounds
     set result_status = 'published', results_published_at = now(), results_published_by = auth.uid(),
         results_announced_on = p_announced_on
   where id = p_round;
  perform set_config('app.exam_results', '', true);
  update public.exam_results set announced_on = p_announced_on where round_id = p_round;
  insert into public.exam_result_changes (round_id, action, after_data)
  values (p_round, 'publish', jsonb_build_object('announced_on', p_announced_on, 'results', v_results, 'missing', v_missing));
  return jsonb_build_object('results', v_results, 'missing', v_missing);
end;
$$;

-- ---------------------------------------------------------------
-- 9) ฟังก์ชันอ่านของส่วนกลาง
-- ---------------------------------------------------------------
-- รอบที่เคยเปิดรับสมัคร พร้อมยอดผลสอบ (ส่วนกลางเท่านั้น ผู้อื่นได้ผลว่าง)
create function public.exam_result_rounds()
returns table (id uuid, year_be integer, exam_type text, level text, status text, result_status text,
               results_published_at timestamptz, results_announced_on date,
               candidates integer, results integer, passed integer, failed integer, absent integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, y.year_be, r.exam_type, r.level, r.status, r.result_status, r.results_published_at, r.results_announced_on,
         count(c.id)::integer, count(x.id)::integer,
         count(x.id) filter (where x.result = 'passed')::integer,
         count(x.id) filter (where x.result = 'failed')::integer,
         count(x.id) filter (where x.result = 'absent')::integer
  from public.exam_rounds r
  join public.academic_years y on y.id = r.academic_year_id
  left join (public.candidates c join public.registration_batches b
             on b.id = c.batch_id and b.status in ('submitted', 'returned', 'certified'))
    on c.round_id = r.id and c.counted
  left join public.exam_results x on x.candidate_id = c.id
  where public.can_manage_exam_rounds() and r.is_active and r.status <> 'draft'
  group by r.id, y.year_be
  order by y.year_be desc, r.exam_type, case r.level when 'tri' then 1 when 'tho' then 2 else 3 end;
$$;

-- ผู้สมัครของรอบพร้อมผล (ส่วนกลาง) p_result: passed / failed / absent / missing / null = ทั้งหมด
create function public.exam_result_rows(p_round uuid, p_result text default null, p_q text default '',
                                        p_venue uuid default null, p_limit integer default 200, p_offset integer default 0)
returns table (candidate_id uuid, candidate_code text, title text, first_name text, monastic_name text, last_name text,
               stage text, place_name text, venue_code text, venue_name text, result text, scores jsonb,
               certificate_no text, note text, updated_at timestamptz, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.candidate_code, c.title, c.first_name, c.monastic_name, c.last_name, c.stage, p.name, v.code, v.name,
         x.result, x.scores, x.certificate_no, x.note, x.updated_at, count(*) over ()
  from public.candidates c
  join public.registration_batches b on b.id = c.batch_id
  join public.places p on p.id = b.place_id
  join public.exam_venues v on v.id = b.venue_id
  left join public.exam_results x on x.candidate_id = c.id
  where public.can_manage_exam_rounds()
    and c.round_id = p_round and c.counted and b.status in ('submitted', 'returned', 'certified')
    and (p_venue is null or b.venue_id = p_venue)
    and (p_result is null
         or (p_result = 'missing' and x.id is null)
         or x.result = p_result)
    and (coalesce(btrim(p_q), '') = ''
         or c.candidate_code ilike '%' || btrim(p_q) || '%'
         or concat_ws(' ', c.first_name, c.monastic_name, c.last_name) ilike '%' || btrim(p_q) || '%')
  order by v.code, p.name, c.candidate_code
  limit greatest(1, least(coalesce(p_limit, 200), 10000)) offset greatest(0, coalesce(p_offset, 0));
$$;

-- ประวัติผลสอบของรอบ หรือของผู้สมัครคนเดียว (ส่วนกลาง)
create function public.exam_result_history(p_round uuid, p_candidate uuid default null)
returns table (created_at timestamptz, action text, candidate_code text, full_name text, before_data jsonb,
               after_data jsonb, reason text, after_publish boolean, actor_name text)
language sql
stable
security definer
set search_path = public
as $$
  select h.created_at, h.action, c.candidate_code,
         btrim(concat_ws(' ', nullif(c.title, ''), c.first_name, nullif(c.monastic_name, ''), nullif(c.last_name, ''))),
         h.before_data, h.after_data, h.reason, h.after_publish,
         btrim(concat_ws(' ', nullif(u.title_prefix, ''), u.first_name, nullif(u.monastic_name, ''), nullif(u.last_name, '')))
  from public.exam_result_changes h
  left join public.candidates c on c.id = h.candidate_id
  left join public.profiles u on u.id = h.actor_id
  where public.can_manage_exam_rounds() and h.round_id = p_round
    and (p_candidate is null or h.candidate_id = p_candidate)
  order by h.created_at desc, h.id desc
  limit 500;
$$;

-- ---------------------------------------------------------------
-- 10) บัญชีผู้สอบได้ ศ.๔ ศ.๘: ส่วนกลางเห็นได้ทุกเวลา (ร่าง) ผู้อื่นเห็นเมื่อประกาศผลแล้ว และเห็นบัญชีนั้น
-- ---------------------------------------------------------------
create function private.can_view_results(p_round public.exam_rounds)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_exam_rounds() or (p_round.result_status = 'published');
$$;
revoke all on function private.can_view_results(public.exam_rounds) from public, anon, authenticated;

create function public.exam_pass_list_options(p_round uuid, p_unit uuid default null)
returns table (kind text, id uuid, code text, name text, candidates integer, passed integer)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select b.id, b.place_id, b.venue_id, c.id as cid, x.result
    from public.exam_rounds r
    join public.registration_batches b on b.round_id = r.id and b.status in ('submitted', 'returned', 'certified')
    join public.candidates c on c.batch_id = b.id and c.counted
    left join public.exam_results x on x.candidate_id = c.id
    where r.id = p_round and r.is_active and private.can_view_results(r)
      and public.can_view_registration(b.org_unit_id, b.uploaded_by)
      and (p_unit is null or b.org_unit_id = p_unit
           or b.org_unit_id in (select d.id from public.descendants_of(p_unit) d))
  )
  select 'venue', v.id, v.code, v.name, count(*)::integer, count(*) filter (where b.result = 'passed')::integer
  from b join public.exam_venues v on v.id = b.venue_id
  group by v.id, v.code, v.name
  union all
  select 'place', p.id, p.code, p.name, count(*)::integer, count(*) filter (where b.result = 'passed')::integer
  from b join public.places p on p.id = b.place_id
  group by p.id, p.code, p.name
  order by 1 desc, 3, 4;
$$;

-- ผู้สมัครทุกคนของสำนักหรือสนามที่เลือก พร้อมผล (ใช้ทำยอด ส่งสอบ ขาดสอบ คงสอบ สอบได้ สอบตก และรายชื่อผู้สอบได้)
-- ไม่คืนเลขประจำตัว วันเกิด
create function public.exam_pass_list(p_round uuid, p_unit uuid default null, p_place uuid default null, p_venue uuid default null)
returns table (place_id uuid, place_code text, place_name text, venue_id uuid, venue_code text, venue_name text,
               stage text, candidate_id uuid, candidate_code text, title text, first_name text, monastic_name text,
               last_name text, age integer, phansa integer, vals jsonb, result text, certificate_no text, note text,
               announced_on date, result_status text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.code, p.name, v.id, v.code, v.name, c.stage, c.id, c.candidate_code, c.title, c.first_name,
         c.monastic_name, c.last_name, c.age, c.phansa, private.candidate_values(c), x.result, x.certificate_no,
         x.note, r.results_announced_on, r.result_status
  from public.exam_rounds r
  join public.registration_batches b on b.round_id = r.id and b.status in ('submitted', 'returned', 'certified')
  join public.candidates c on c.batch_id = b.id and c.counted
  join public.places p on p.id = b.place_id
  join public.exam_venues v on v.id = b.venue_id
  left join public.exam_results x on x.candidate_id = c.id
  where (p_place is not null or p_venue is not null)
    and r.id = p_round and r.is_active and private.can_view_results(r)
    and (p_place is null or b.place_id = p_place)
    and (p_venue is null or b.venue_id = p_venue)
    and public.can_view_registration(b.org_unit_id, b.uploaded_by)
    and (p_unit is null or b.org_unit_id = p_unit
         or b.org_unit_id in (select d.id from public.descendants_of(p_unit) d))
  order by p.name, v.code, c.stage, nullif(x.certificate_no, '') nulls last, c.candidate_code
  limit 20000;
$$;

-- ---------------------------------------------------------------
-- 11) ผลสอบได้ย้อนหลัง (ส่วนกลาง)
--     p_rows: [{row_no, national_id, title, first_name, monastic_name, last_name, birth_date (YYYY-MM-DD ค.ศ.),
--               exam_type, level, year_be, certificate_no, place_name, note}]
-- ---------------------------------------------------------------
create function private.pass_history_eval(p_rows jsonb)
returns table (row_no integer, status text, message text, exam_type text, level text, year_be integer, title text,
               first_name text, monastic_name text, last_name text, birth_date date, nid text, hash text, pkey text,
               certificate_no text, place_name text, note text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_seen jsonb := '{}'::jsonb;
  v_ref text;
  v_key text;
  v_this_year integer := extract(year from (now() at time zone 'Asia/Bangkok'))::integer + 543;
begin
  for r in
    select * from jsonb_to_recordset(p_rows) as x(row_no integer, national_id text, title text, first_name text,
      monastic_name text, last_name text, birth_date text, exam_type text, level text, year_be text,
      certificate_no text, place_name text, note text)
  loop
    row_no := r.row_no; status := 'error'; message := '';
    exam_type := r.exam_type; level := r.level;
    title := btrim(coalesce(r.title, '')); first_name := btrim(coalesce(r.first_name, ''));
    monastic_name := btrim(coalesce(r.monastic_name, '')); last_name := btrim(coalesce(r.last_name, ''));
    certificate_no := btrim(coalesce(r.certificate_no, '')); place_name := btrim(coalesce(r.place_name, ''));
    note := btrim(coalesce(r.note, ''));
    nid := upper(regexp_replace(coalesce(r.national_id, ''), '[\s-]', '', 'g'));
    hash := null; birth_date := null; year_be := null;

    if first_name = '' or last_name = '' then
      message := 'ต้องกรอกชื่อและนามสกุล'; return next; continue;
    end if;
    if length(first_name) > 100 or length(last_name) > 100 or length(monastic_name) > 100 or length(title) > 60
       or length(certificate_no) > 40 or length(place_name) > 200 or length(note) > 200 then
      message := 'มีช่องที่ยาวเกินกำหนด'; return next; continue;
    end if;
    if coalesce(exam_type, '') not in ('nak_tham', 'tham_sueksa') then
      message := 'ประเภทต้องเป็น นักธรรม หรือ ธรรมศึกษา'; return next; continue;
    end if;
    if coalesce(level, '') not in ('tri', 'tho', 'ek') then
      message := 'ชั้นต้องเป็น ตรี โท หรือ เอก'; return next; continue;
    end if;
    if coalesce(r.year_be, '') !~ '^\d{4}$' or r.year_be::integer not between 2400 and v_this_year then
      message := format('ปีที่สอบได้ต้องเป็นปี พ.ศ. 4 หลัก ไม่เกิน %s', v_this_year); return next; continue;
    end if;
    year_be := r.year_be::integer;
    if coalesce(btrim(r.birth_date), '') <> '' then
      birth_date := private.iso_date_or_null(r.birth_date);
      if birth_date is null then
        message := 'วันเกิดไม่ถูกต้อง'; return next; continue;
      end if;
    end if;
    if nid <> '' then
      if nid !~ '^\d{13}$' or not public.valid_national_id(nid) then
        message := 'เลขประจำตัวประชาชนไม่ถูกต้อง (13 หลัก เลขตรวจสอบต้องตรง)'; return next; continue;
      end if;
      hash := encode(extensions.hmac(convert_to(nid, 'utf8'), convert_to(private.national_id_key(), 'utf8'), 'sha256'), 'hex');
    elsif birth_date is null then
      message := 'ต้องมีเลขประจำตัวประชาชน หรือวันเกิด อย่างน้อยหนึ่งอย่าง (ใช้ยืนยันตัวบุคคล)'; return next; continue;
    end if;
    pkey := private.person_key(first_name, last_name, birth_date);
    v_ref := coalesce(hash, pkey);
    v_key := exam_type || '|' || level || '|' || v_ref;
    if v_seen ? v_key then
      message := format('ซ้ำกับแถวที่ %s (บุคคล ประเภท และชั้นเดียวกัน)', v_seen ->> v_key); return next; continue;
    end if;
    v_seen := v_seen || jsonb_build_object(v_key, r.row_no);
    if exists (select 1 from public.exam_pass_history h
               where h.is_active and h.exam_type = pass_history_eval.exam_type and h.level = pass_history_eval.level
                 and coalesce(h.national_id_hash, h.person_key) = v_ref) then
      status := 'skip'; message := 'มีในระบบแล้ว';
      return next; continue;
    end if;
    status := 'new';
    return next;
  end loop;
end;
$$;
revoke all on function private.pass_history_eval(jsonb) from public, anon, authenticated;

create function public.check_pass_history_import(p_rows jsonb)
returns table (row_no integer, status text, message text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_exam_rounds() then
    raise exception 'นำเข้าผลสอบได้ย้อนหลังได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 5,000 แถว' using errcode = 'P0001';
  end if;
  return query select e.row_no, e.status, e.message from private.pass_history_eval(p_rows) e order by e.row_no;
end;
$$;

create function public.import_pass_history(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_err integer;
  v_n integer;
  v_key text := private.national_id_key();
begin
  if not public.can_manage_exam_rounds() then
    raise exception 'นำเข้าผลสอบได้ย้อนหลังได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 5,000 แถว' using errcode = 'P0001';
  end if;
  select count(*) filter (where status = 'error') into v_err from private.pass_history_eval(p_rows);
  if v_err > 0 then
    raise exception 'ยังมีแถวที่ผิด % แถว กรุณาแก้ไฟล์แล้วอัปโหลดใหม่', v_err using errcode = 'P0001';
  end if;
  insert into public.exam_pass_history (exam_type, level, year_be, title, first_name, monastic_name, last_name, birth_date,
                                        national_id_enc, national_id_hash, national_id_last4, person_key, certificate_no,
                                        place_name, note)
  select e.exam_type, e.level, e.year_be, e.title, e.first_name, e.monastic_name, e.last_name, e.birth_date,
         case when e.nid <> '' then extensions.pgp_sym_encrypt(e.nid, v_key) end, e.hash,
         case when e.nid <> '' then right(e.nid, 4) end, e.pkey, e.certificate_no, e.place_name, e.note
  from private.pass_history_eval(p_rows) e
  where e.status = 'new';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'ไม่มีรายการใหม่ให้นำเข้า (ทุกแถวมีในระบบแล้ว)' using errcode = 'P0001';
  end if;
  return v_n;
end;
$$;

create function public.list_pass_history(p_q text default '', p_active boolean default true, p_limit integer default 200,
                                         p_offset integer default 0)
returns table (id uuid, exam_type text, level text, year_be integer, title text, first_name text, monastic_name text,
               last_name text, birth_date date, national_id_last4 text, certificate_no text, place_name text, note text,
               is_active boolean, created_at timestamptz, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.exam_type, h.level, h.year_be, h.title, h.first_name, h.monastic_name, h.last_name, h.birth_date,
         h.national_id_last4, h.certificate_no, h.place_name, h.note, h.is_active, h.created_at, count(*) over ()
  from public.exam_pass_history h
  where public.can_manage_exam_rounds()
    and h.is_active = coalesce(p_active, true)
    and (coalesce(btrim(p_q), '') = ''
         or concat_ws(' ', h.first_name, h.monastic_name, h.last_name) ilike '%' || btrim(p_q) || '%'
         or h.certificate_no ilike '%' || btrim(p_q) || '%'
         or h.place_name ilike '%' || btrim(p_q) || '%')
  order by h.year_be desc, h.first_name, h.last_name
  limit greatest(1, least(coalesce(p_limit, 200), 1000)) offset greatest(0, coalesce(p_offset, 0));
$$;

create function public.set_pass_history_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_exam_rounds() then
    raise exception 'แก้ผลสอบได้ย้อนหลังได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ' using errcode = '42501';
  end if;
  update public.exam_pass_history set is_active = coalesce(p_active, false) where id = p_id;
  if not found then
    raise exception 'ไม่พบรายการนี้' using errcode = 'P0001';
  end if;
exception when unique_violation then
  raise exception 'มีรายการของบุคคล ประเภท และชั้นนี้ที่ใช้งานอยู่แล้ว' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------
-- 12) หน้าสาธารณะ: เฉพาะรอบที่ประกาศผลแล้ว และเฉพาะผู้สอบได้ (ผู้สั่งงานกำหนด)
--     ไม่คืนเลขประจำตัว วันเกิด อายุ รหัสผู้สมัคร เลขที่ ปกศ. หรือคะแนน
-- ---------------------------------------------------------------
-- สถิติ: ส่งสอบ ขาดสอบ คงสอบ (สอบได้ + สอบตก) สอบได้ สอบตก ต่อ ปี ประเภท ชั้น ช่วงชั้น ภาค จังหวัด (ที่ตั้งสนามสอบ)
create function public.public_result_stats()
returns table (year_be integer, exam_type text, level text, stage text, region_name text, province_name text,
               sent integer, absent integer, passed integer, failed integer, no_result integer)
language sql
stable
security definer
set search_path = public
as $$
  select y.year_be, r.exam_type, r.level, c.stage, coalesce(ur.region_name, ''), coalesce(pv.name, ''),
         count(*)::integer,
         count(*) filter (where x.result = 'absent')::integer,
         count(*) filter (where x.result = 'passed')::integer,
         count(*) filter (where x.result = 'failed')::integer,
         count(*) filter (where x.id is null)::integer
  from public.candidates c
  join public.registration_batches b on b.id = c.batch_id
  join public.exam_rounds r on r.id = b.round_id
  join public.academic_years y on y.id = r.academic_year_id
  join public.exam_venues v on v.id = b.venue_id
  left join public.places pl on pl.id = v.place_id
  left join public.civil_provinces pv on pv.code = pl.province_code
  left join private.unit_regions() ur on ur.unit_id = v.org_unit_id
  left join public.exam_results x on x.candidate_id = c.id
  where c.counted and b.status in ('submitted', 'returned', 'certified') and r.is_active and r.result_status = 'published'
  group by y.year_be, r.exam_type, r.level, c.stage, ur.region_name, pv.name;
$$;

-- รายชื่อจังหวัดและสำนักที่มีผู้สอบได้ของปี ประเภท ชั้น (จังหวัด = ที่อยู่ของสำนัก)
create function public.public_result_places(p_year integer, p_type text, p_level text)
returns table (province_code integer, province_name text, place_id uuid, place_name text, passed integer)
language sql
stable
security definer
set search_path = public
as $$
  select pl.province_code, coalesce(pv.name, 'ไม่ระบุจังหวัด'), pl.id, pl.name, count(*)::integer
  from public.exam_results x
  join public.exam_rounds r on r.id = x.round_id
  join public.academic_years y on y.id = r.academic_year_id
  join public.candidates c on c.id = x.candidate_id
  join public.registration_batches b on b.id = c.batch_id
  join public.places pl on pl.id = b.place_id
  left join public.civil_provinces pv on pv.code = pl.province_code
  where x.result = 'passed' and r.result_status = 'published' and r.is_active
    and y.year_be = p_year and r.exam_type = p_type and r.level = p_level
  group by pl.province_code, pv.name, pl.id, pl.name
  order by pv.name nulls last, pl.name;
$$;

-- ผู้สอบได้ของสำนักที่เลือก
create function public.public_result_list(p_year integer, p_type text, p_level text, p_place uuid)
returns table (title text, first_name text, monastic_name text, last_name text, stage text, place_name text)
language sql
stable
security definer
set search_path = public
as $$
  select c.title, c.first_name, c.monastic_name, c.last_name, c.stage, pl.name
  from public.exam_results x
  join public.exam_rounds r on r.id = x.round_id
  join public.academic_years y on y.id = r.academic_year_id
  join public.candidates c on c.id = x.candidate_id
  join public.registration_batches b on b.id = c.batch_id
  join public.places pl on pl.id = b.place_id
  where x.result = 'passed' and r.result_status = 'published' and r.is_active
    and y.year_be = p_year and r.exam_type = p_type and r.level = p_level and b.place_id = p_place
  order by c.stage, c.first_name, c.last_name
  limit 3000;
$$;

-- ค้นด้วยชื่อ (ตรงทั้งคำ) + นามสกุลหรือฉายา (ไม่บังคับ) ในปี ประเภท ชั้นที่เลือก ไม่เกิน 20 รายการ
-- เรียกได้เฉพาะ service_role (เซิร์ฟเวอร์ของเว็บ) จำกัด 10 ครั้งต่อนาทีต่อเครื่องด้วยตัวนับเดียวกับบทที่ 20
create function public.public_result_search(p_first text, p_last text, p_year integer, p_type text, p_level text, p_client text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := regexp_replace(btrim(coalesce(p_first, '')), '\s+', ' ', 'g');
  v_last text := regexp_replace(btrim(coalesce(p_last, '')), '\s+', ' ', 'g');
  v_rows jsonb;
  v_total integer;
begin
  if not private.rate_limit_hit('public_result_search', p_client, 10) then
    return jsonb_build_object('limited', true);
  end if;
  if length(v_first) < 2 or length(v_first) > 100 or (v_last <> '' and length(v_last) < 2) or length(v_last) > 100 then
    raise exception 'กรอกชื่อ (และนามสกุลหรือฉายาถ้ามี) อย่างน้อย 2 ตัวอักษร' using errcode = 'P0001';
  end if;
  if p_year is null or p_type not in ('nak_tham', 'tham_sueksa') or p_level not in ('tri', 'tho', 'ek') then
    raise exception 'กรุณาเลือกปี ประเภท และชั้น' using errcode = 'P0001';
  end if;
  with found as (
    select c.title, c.first_name, c.monastic_name, c.last_name, c.stage, pl.name as place_name, c.id
    from public.exam_results x
    join public.exam_rounds r on r.id = x.round_id
    join public.academic_years y on y.id = r.academic_year_id
    join public.candidates c on c.id = x.candidate_id
    join public.registration_batches b on b.id = c.batch_id
    join public.places pl on pl.id = b.place_id
    where x.result = 'passed' and r.result_status = 'published' and r.is_active
      and y.year_be = p_year and r.exam_type = p_type and r.level = p_level
      and c.first_name = v_first
      and (v_last = '' or c.last_name = v_last or c.monastic_name = v_last)
  )
  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object('title', f.title, 'first_name', f.first_name, 'monastic_name', f.monastic_name,
                                               'last_name', f.last_name, 'stage', f.stage, 'place_name', f.place_name)
                            order by f.first_name, f.last_name, f.id) filter (where f.rn <= 20), '[]'::jsonb)
    into v_total, v_rows
  from (select found.*, row_number() over (order by found.first_name, found.last_name, found.id) as rn from found) f;
  return jsonb_build_object('limited', false, 'total', v_total, 'rows', v_rows);
end;
$$;

-- ---------------------------------------------------------------
-- 13) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke execute on function public.check_exam_results_import(uuid, jsonb) from public, anon;
revoke execute on function public.import_exam_results(uuid, jsonb) from public, anon;
revoke execute on function public.save_exam_result(uuid, text, jsonb, text, text, text) from public, anon;
revoke execute on function public.publish_exam_results(uuid, date, boolean) from public, anon;
revoke execute on function public.exam_result_rounds() from public, anon;
revoke execute on function public.exam_result_rows(uuid, text, text, uuid, integer, integer) from public, anon;
revoke execute on function public.exam_result_history(uuid, uuid) from public, anon;
revoke execute on function public.exam_pass_list_options(uuid, uuid) from public, anon;
revoke execute on function public.exam_pass_list(uuid, uuid, uuid, uuid) from public, anon;
revoke execute on function public.check_pass_history_import(jsonb) from public, anon;
revoke execute on function public.import_pass_history(jsonb) from public, anon;
revoke execute on function public.list_pass_history(text, boolean, integer, integer) from public, anon;
revoke execute on function public.set_pass_history_active(uuid, boolean) from public, anon;
revoke execute on function public.public_result_stats() from public;
revoke execute on function public.public_result_places(integer, text, text) from public;
revoke execute on function public.public_result_list(integer, text, text, uuid) from public;
revoke execute on function public.public_result_search(text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.check_exam_results_import(uuid, jsonb) to authenticated;
grant execute on function public.import_exam_results(uuid, jsonb) to authenticated;
grant execute on function public.save_exam_result(uuid, text, jsonb, text, text, text) to authenticated;
grant execute on function public.publish_exam_results(uuid, date, boolean) to authenticated;
grant execute on function public.exam_result_rounds() to authenticated;
grant execute on function public.exam_result_rows(uuid, text, text, uuid, integer, integer) to authenticated;
grant execute on function public.exam_result_history(uuid, uuid) to authenticated;
grant execute on function public.exam_pass_list_options(uuid, uuid) to authenticated;
grant execute on function public.exam_pass_list(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.check_pass_history_import(jsonb) to authenticated;
grant execute on function public.import_pass_history(jsonb) to authenticated;
grant execute on function public.list_pass_history(text, boolean, integer, integer) to authenticated;
grant execute on function public.set_pass_history_active(uuid, boolean) to authenticated;
grant execute on function public.public_result_stats() to anon, authenticated;
grant execute on function public.public_result_places(integer, text, text) to anon, authenticated;
grant execute on function public.public_result_list(integer, text, text, uuid) to anon, authenticated;
grant execute on function public.public_result_search(text, text, integer, text, text, text) to service_role;
