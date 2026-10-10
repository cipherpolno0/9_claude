-- บทที่ 20: ตรวจรายชื่อและพิมพ์บัญชี ศ. (ระบบที่ 5)
-- 1) ข้อความช่องลงนามท้ายบัญชี (ผู้ดูแลระบบตั้งเองต่อแบบ ศ.)
-- 2) บัญชีรายชื่อตามแบบ ศ. (ปี > แบบ > เขต > สำนักหรือสนามสอบ) เฉพาะบัญชีที่ส่งแล้ว รวมระหว่างรับรอง
-- 3) ตรวจสอบรายบุคคลของเจ้าหน้าที่ (ชื่อ หรือเลขประจำตัว) พร้อมประวัติการสมัครปีก่อน ๆ
-- 4) ตรวจรายชื่อผู้ขอเข้าสอบสาธารณะ: เรียกจากเซิร์ฟเวอร์ของเว็บด้วยกุญแจลับเท่านั้น จำกัด 10 ครั้งต่อนาทีต่อเครื่อง
-- 5) รายงานสรุป: จำนวนผู้สมัครต่อแบบ ศ. ต่อเขต และรายชื่อที่สมัครซ้ำข้ามสำนักในปีเดียวกัน
-- ทุกฟังก์ชันอ่านของพื้นที่ทำงานกรองด้วย can_view_registration

-- ---------------------------------------------------------------
-- 1) ช่องลงนาม: [{"text": "ข้อความใต้เส้นลงนาม หลายบรรทัดได้"}] ไม่เกิน 6 ช่อง ช่องละไม่เกิน 300 ตัวอักษร 5 บรรทัด
-- ---------------------------------------------------------------
create function private.form_signatures_ok(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 6
     and not exists (
       select 1 from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e -> 'text') is distinct from 'string'
          or length(btrim(e ->> 'text')) not between 1 and 300
          or array_length(string_to_array(e ->> 'text', E'\n'), 1) > 5
          or (select count(*) from jsonb_object_keys(e)) <> 1
     );
$$;
revoke all on function private.form_signatures_ok(jsonb) from public, anon, authenticated;

alter table public.form_templates
  add column signatures jsonb not null default '[]'::jsonb;
comment on column public.form_templates.signatures is 'ช่องลงนามท้ายบัญชีที่พิมพ์ [{text}] ผู้ดูแลระบบตั้งเอง (ไม่มีค่าตั้งต้น)';

-- ตรวจด้วย trigger (check constraint จะเรียกฟังก์ชันด้วยสิทธิ์ของผู้แก้ ซึ่งเข้า schema private ไม่ได้)
create function public.form_templates_signatures_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.form_signatures_ok(new.signatures) then
    raise exception 'ช่องลงนามมีได้ไม่เกิน 6 ช่อง แต่ละช่องต้องมีข้อความ 1 ถึง 300 ตัวอักษร ไม่เกิน 5 บรรทัด' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.form_templates_signatures_check() from public, anon, authenticated;
create trigger form_templates_signatures_check before insert or update of signatures on public.form_templates
  for each row execute function public.form_templates_signatures_check();

-- ---------------------------------------------------------------
-- 2) ดัชนีสำหรับการค้น
-- ---------------------------------------------------------------
create index candidates_hash_idx on public.candidates (national_id_hash) where national_id_hash is not null;
create index candidates_person_key_idx on public.candidates (person_key) where birth_date is not null;
create index candidates_first_name_idx on public.candidates (first_name) where counted;
create index candidates_last_name_idx on public.candidates (last_name) where counted;
create index candidates_monastic_name_idx on public.candidates (monastic_name) where counted and monastic_name <> '';

-- บุคคลเดียวกัน = เลขประจำตัวเดียวกัน หรือ (ไม่มีเลข) ชื่อ + นามสกุล + วันเกิด (กติกาเดียวกับการตรวจซ้ำของบทที่ 18)
create function private.candidate_ref(p_hash text, p_pkey text, p_birth date)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_hash, case when p_birth is not null then 'k:' || p_pkey end);
$$;
revoke all on function private.candidate_ref(text, text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 3) บัญชีรายชื่อตามแบบ ศ.
-- ---------------------------------------------------------------
-- ตัวเลือกสำนักและสนามสอบที่มีบัญชีส่งแล้วในปี + ประเภท + ชั้น (+ เขต) ที่ผู้ใช้เห็นได้
create function public.registration_list_options(p_year integer, p_exam_type text, p_level text, p_unit uuid default null)
returns table (kind text, id uuid, code text, name text, candidates integer, accounts integer)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select b.id, b.place_id, b.venue_id, b.saved_count
    from public.registration_batches b
    join public.exam_rounds r on r.id = b.round_id
    join public.academic_years y on y.id = r.academic_year_id
    where y.year_be = p_year and r.exam_type = p_exam_type and r.level = p_level
      and b.status in ('submitted', 'returned', 'certified')
      and public.can_view_registration(b.org_unit_id, b.uploaded_by)
      and (p_unit is null or b.org_unit_id = p_unit
           or b.org_unit_id in (select d.id from public.descendants_of(p_unit) d))
  )
  select 'venue', v.id, v.code, v.name, sum(b.saved_count)::integer, count(*)::integer
  from b join public.exam_venues v on v.id = b.venue_id
  group by v.id, v.code, v.name
  union all
  select 'place', p.id, p.code, p.name, sum(b.saved_count)::integer, count(*)::integer
  from b join public.places p on p.id = b.place_id
  group by p.id, p.code, p.name
  order by 1 desc, 3, 4;
$$;

-- รายชื่อผู้สมัคร (ที่นับแล้ว ของบัญชีที่ส่งแล้ว) ของสนามสอบหรือสำนักที่เลือก เรียงตาม สนามสอบ > สำนัก > ลำดับในบัญชี
-- ต้องเลือกสำนักหรือสนามสอบอย่างน้อยหนึ่งอย่าง ไม่คืนเลขประจำตัวเต็ม (มีเฉพาะ 4 ตัวท้าย)
create function public.registration_list(
  p_year integer, p_exam_type text, p_level text, p_unit uuid default null, p_place uuid default null, p_venue uuid default null)
returns table (
  venue_id uuid, venue_code text, venue_name text, venue_subdistrict text, venue_district text, venue_province text,
  region_name text, place_id uuid, place_code text, place_name text, batch_id uuid, batch_status text, request_no text,
  candidate_id uuid, candidate_code text, national_id_last4 text, id_kind text, vals jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.code, v.name,
         (select s.name from public.civil_subdistricts s where s.code = vp.subdistrict_code),
         (select d.name from public.civil_districts d where d.code = vp.district_code),
         (select pv.name from public.civil_provinces pv where pv.code = vp.province_code),
         (select ur.region_name from private.unit_regions() ur where ur.unit_id = v.org_unit_id),
         p.id, p.code, p.name, b.id, b.status, q.request_no,
         c.id, c.candidate_code, c.national_id_last4, c.id_kind, private.candidate_values(c)
  from public.registration_batches b
  join public.exam_rounds r on r.id = b.round_id
  join public.academic_years y on y.id = r.academic_year_id
  join public.candidates c on c.batch_id = b.id and c.counted
  join public.places p on p.id = b.place_id
  join public.exam_venues v on v.id = b.venue_id
  left join public.places vp on vp.id = v.place_id
  left join public.requests q on q.id = b.request_id
  where (p_place is not null or p_venue is not null)
    and y.year_be = p_year and r.exam_type = p_exam_type and r.level = p_level
    and b.status in ('submitted', 'returned', 'certified')
    and (p_place is null or b.place_id = p_place)
    and (p_venue is null or b.venue_id = p_venue)
    and public.can_view_registration(b.org_unit_id, b.uploaded_by)
    and (p_unit is null or b.org_unit_id = p_unit
         or b.org_unit_id in (select d.id from public.descendants_of(p_unit) d))
  order by v.code, v.name, p.name, b.created_at, c.file_no, c.row_no
  limit 10000;
$$;

-- ---------------------------------------------------------------
-- 4) ตรวจสอบรายบุคคล (เจ้าหน้าที่): ค้นด้วยชื่อ (คำละอย่างน้อย 2 ตัวอักษร ทุกคำต้องตรงกับ ชื่อ ฉายา หรือนามสกุล)
--    หรือเลขประจำตัว (เทียบรหัสเข้ารหัส) แล้วคืนการสมัครทุกปีของบุคคลที่พบ เฉพาะบัญชีที่ผู้ใช้เห็นได้
-- ---------------------------------------------------------------
create function public.registration_person_search(p_q text default '', p_nid text default '')
returns table (
  person_ref text, matched boolean, candidate_id uuid, batch_id uuid, year_be integer, exam_type text, level text,
  form_code text, stage text, candidate_code text, cand_status text, batch_status text, request_no text,
  title text, first_name text, monastic_name text, last_name text, national_id_last4 text, birth_date date,
  place_name text, venue_code text, venue_name text, unit_name text, withdraw_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nid text := upper(regexp_replace(coalesce(p_nid, ''), '[\s-]', '', 'g'));
  v_hash text;
  v_tokens text[];
begin
  if v_nid <> '' then
    if v_nid !~ '^[0-9A-Z]{5,20}$' then
      raise exception 'เลขประจำตัวมีอักขระที่ใช้ไม่ได้' using errcode = 'P0001';
    end if;
    v_hash := encode(extensions.hmac(convert_to(v_nid, 'utf8'), convert_to(private.national_id_key(), 'utf8'), 'sha256'), 'hex');
  else
    select array_agg(replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_'))
      into v_tokens
      from unnest(regexp_split_to_array(btrim(coalesce(p_q, '')), '\s+')) t
      where t <> '';
    if v_tokens is null or exists (select 1 from unnest(v_tokens) t where length(t) < 2) or array_length(v_tokens, 1) > 4 then
      raise exception 'พิมพ์ชื่อ ฉายา หรือนามสกุล คำละอย่างน้อย 2 ตัวอักษร (ไม่เกิน 4 คำ) หรือเลขประจำตัว' using errcode = 'P0001';
    end if;
  end if;

  return query
  with vis as (
    select c.*, b.status as b_status, b.place_id as b_place, b.venue_id as b_venue, b.org_unit_id as b_unit,
           b.request_id as b_request, b.template_id as b_template, b.round_id as b_round,
           coalesce(private.candidate_ref(c.national_id_hash, c.person_key, c.birth_date), 'c:' || c.id::text) as ref
    from public.candidates c
    join public.registration_batches b on b.id = c.batch_id
    where c.status in ('ok', 'withdrawn')
      and public.can_view_registration(b.org_unit_id, b.uploaded_by)
  ), hit as (
    select distinct x.ref from vis x
    where (v_hash is not null and x.national_id_hash = v_hash)
       or (v_hash is null and not exists (
             select 1 from unnest(v_tokens) t
             where x.first_name not ilike '%' || t || '%'
               and x.monastic_name not ilike '%' || t || '%'
               and x.last_name not ilike '%' || t || '%'))
    limit 30
  ), m as (
    select x.id from vis x
    where (v_hash is not null and x.national_id_hash = v_hash)
       or (v_hash is null and not exists (
             select 1 from unnest(v_tokens) t
             where x.first_name not ilike '%' || t || '%'
               and x.monastic_name not ilike '%' || t || '%'
               and x.last_name not ilike '%' || t || '%'))
  )
  select md5(x.ref), x.id in (select m.id from m), x.id, x.batch_id, y.year_be, r.exam_type, r.level, f.code, x.stage,
         x.candidate_code, x.status, x.b_status, q.request_no, x.title, x.first_name, x.monastic_name, x.last_name,
         x.national_id_last4, x.birth_date, p.name, v.code, v.name, ou.name, x.withdraw_reason
  from vis x
  join hit h on h.ref = x.ref
  join public.exam_rounds r on r.id = x.b_round
  join public.academic_years y on y.id = r.academic_year_id
  join public.form_templates f on f.id = x.b_template
  join public.places p on p.id = x.b_place
  join public.exam_venues v on v.id = x.b_venue
  join public.org_units ou on ou.id = x.b_unit
  left join public.requests q on q.id = x.b_request
  order by md5(x.ref), y.year_be desc, r.exam_type, r.level, x.created_at desc
  limit 500;
end;
$$;

-- ---------------------------------------------------------------
-- 5) ตรวจรายชื่อผู้ขอเข้าสอบ (สาธารณะ)
--    จำกัดความถี่ = ตาราง private.request_hits หนึ่งแถวต่อเครื่องต่องาน (รหัสเครื่องเข้ารหัสจากเซิร์ฟเวอร์ ไม่เก็บที่อยู่เครื่องจริง)
--    นับในนาทีปัจจุบัน ขึ้นนาทีใหม่ = เริ่มนับใหม่ในแถวเดิม (ไม่ต้องลบแถวเก่า)
--    ไม่ผูก audit_row_change: เป็นตัวนับทางเทคนิค ไม่มีข้อมูลบุคคล และจะทำให้ audit_logs โตตามจำนวนการค้นสาธารณะ
-- ---------------------------------------------------------------
create table private.request_hits (
  bucket       text not null,
  client_hash  text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, client_hash)
);
comment on table private.request_hits is 'ตัวนับจำนวนครั้งในนาทีล่าสุดของการค้นสาธารณะ ต่อเครื่อง (ระบบเขียนเท่านั้น)';
alter table private.request_hits enable row level security;
revoke all on private.request_hits from public, anon, authenticated;

-- นับ 1 ครั้งในนาทีปัจจุบัน คืน true เมื่อยังไม่เกินจำนวนที่กำหนด
create function private.rate_limit_hit(p_bucket text, p_client text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  if coalesce(p_client, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'รหัสเครื่องไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  insert into private.request_hits as h (bucket, client_hash, window_start, hits)
  values (p_bucket, p_client, date_trunc('minute', now()), 1)
  on conflict (bucket, client_hash) do update
    set hits = case when h.window_start = excluded.window_start then h.hits + 1 else 1 end,
        window_start = excluded.window_start
  returning h.hits into v_hits;
  return v_hits <= p_limit;
end;
$$;
revoke all on function private.rate_limit_hit(text, text, integer) from public, anon, authenticated;

-- ค้นด้วย ชื่อ / นามสกุลหรือฉายา / ปี พ.ศ. ต้องกรอกอย่างน้อย 2 ช่อง ชื่อต้องตรงทั้งคำ (ไม่ค้นบางส่วน)
-- คืนไม่เกิน 20 รายการ: คำนำหน้า ชื่อ ฉายาและนามสกุล (แสดงเต็มเฉพาะเมื่อผู้ค้นพิมพ์มาเอง มิฉะนั้นแสดงอักษรแรก)
-- ชั้น สำนัก สนามสอบ ปี และสถานะการรับรอง ไม่คืนเลขประจำตัว วันเกิด รหัสผู้สมัคร หรือที่อยู่
create function public.public_registration_search(p_first text, p_last text, p_year integer, p_client text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := regexp_replace(btrim(coalesce(p_first, '')), '\s+', ' ', 'g');
  v_last text := regexp_replace(btrim(coalesce(p_last, '')), '\s+', ' ', 'g');
  v_filled integer;
  v_rows jsonb;
  v_total integer;
begin
  if not private.rate_limit_hit('public_registration_search', p_client, 10) then
    return jsonb_build_object('limited', true);
  end if;
  v_filled := (v_first <> '')::integer + (v_last <> '')::integer + (p_year is not null)::integer;
  if v_filled < 2 then
    raise exception 'กรอกอย่างน้อย 2 ช่อง จาก ชื่อ นามสกุลหรือฉายา และปี' using errcode = 'P0001';
  end if;
  if (v_first <> '' and length(v_first) < 2) or (v_last <> '' and length(v_last) < 2) or length(v_first) > 100 or length(v_last) > 100 then
    raise exception 'ชื่อและนามสกุลต้องยาว 2 ถึง 100 ตัวอักษร' using errcode = 'P0001';
  end if;
  if p_year is not null and p_year not between 2500 and 2700 then
    raise exception 'ปี พ.ศ. ไม่ถูกต้อง' using errcode = 'P0001';
  end if;

  with found as (
    select c.title, c.first_name, c.monastic_name, c.last_name, y.year_be, r.exam_type, r.level, c.stage,
           p.name as place_name, v.name as venue_name, b.status = 'certified' as certified, c.id
    from public.candidates c
    join public.registration_batches b on b.id = c.batch_id
    join public.exam_rounds r on r.id = b.round_id
    join public.academic_years y on y.id = r.academic_year_id
    join public.places p on p.id = b.place_id
    join public.exam_venues v on v.id = b.venue_id
    where c.counted and b.status in ('submitted', 'returned', 'certified') and r.is_active
      and (v_first = '' or c.first_name = v_first)
      and (v_last = '' or c.last_name = v_last or c.monastic_name = v_last)
      and (p_year is null or y.year_be = p_year)
  )
  select count(*)::integer,
         coalesce(jsonb_agg(x.j order by x.year_be desc, x.first_name, x.exam_type, x.level) filter (where x.rn <= 20), '[]'::jsonb)
    into v_total, v_rows
  from (
    select f.year_be, f.first_name, f.exam_type, f.level,
           row_number() over (order by f.year_be desc, f.first_name, f.exam_type, f.level, f.id) as rn,
           jsonb_build_object(
             'title', f.title,
             'first_name', f.first_name,
             'monastic_name', case when f.monastic_name = '' then ''
                                   when v_last <> '' then f.monastic_name else left(f.monastic_name, 1) || '…' end,
             'last_name', case when f.last_name = '' then ''
                               when v_last <> '' then f.last_name else left(f.last_name, 1) || '…' end,
             'year_be', f.year_be, 'exam_type', f.exam_type, 'level', f.level, 'stage', f.stage,
             'place_name', f.place_name, 'venue_name', f.venue_name, 'certified', f.certified) as j
    from found f
  ) x;

  return jsonb_build_object('limited', false, 'total', v_total, 'rows', v_rows);
end;
$$;

-- ---------------------------------------------------------------
-- 6) รายงานสรุป
-- ---------------------------------------------------------------
-- จำนวนผู้สมัครต่อแบบ ศ. ต่อเขตใต้สังกัดของ p_unit (บัญชีส่งแล้ว รวมระหว่างรับรอง) บัญชีที่อยู่ที่ p_unit เองแสดงเป็นแถวของ p_unit
create function public.registration_report_counts(p_year integer, p_unit uuid)
returns table (unit_id uuid, unit_name text, unit_code text, is_self boolean,
               exam_type text, level text, form_code text, candidates integer, accounts integer)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select b.id, b.org_unit_id, b.saved_count, r.exam_type, r.level, f.code as form_code
    from public.registration_batches b
    join public.exam_rounds r on r.id = b.round_id
    join public.academic_years y on y.id = r.academic_year_id
    join public.form_templates f on f.id = b.template_id
    where y.year_be = p_year and b.status in ('submitted', 'returned', 'certified')
      and public.can_view_registration(b.org_unit_id, b.uploaded_by)
      and (b.org_unit_id = p_unit or b.org_unit_id in (select d.id from public.descendants_of(p_unit) d))
  ), g as (
    select coalesce((select a.id from public.ancestors_or_self(b.org_unit_id) a
                     join public.org_units u on u.id = a.id
                     where u.parent_id = p_unit limit 1), p_unit) as gid,
           b.*
    from b
  )
  select u.id, u.name, u.code, u.id = p_unit, g.exam_type, g.level, min(g.form_code),
         sum(g.saved_count)::integer, count(*)::integer
  from g join public.org_units u on u.id = g.gid
  group by u.id, u.name, u.code, g.exam_type, g.level
  order by u.id = p_unit desc, u.code, u.name;
$$;

-- รายชื่อที่สมัครซ้ำข้ามสำนักในปีเดียวกัน (บุคคลเดียวกันตามเลขประจำตัว หรือ ชื่อ + นามสกุล + วันเกิด)
-- นับผู้สมัครที่นับแล้วทุกบัญชีที่ยังไม่ถอน (ยืนยันแล้วหรือส่งแล้ว) แสดงเฉพาะกลุ่มที่มีอย่างน้อย 1 รายการในเขตที่เลือกและผู้ใช้เห็นได้
-- รายการที่ผู้ใช้ไม่มีสิทธิ์เห็นไม่แสดงรายละเอียด นับไว้ใน hidden_count
create function public.registration_report_duplicates(p_year integer, p_unit uuid)
returns table (
  person_ref text, candidate_id uuid, batch_id uuid, exam_type text, level text, form_code text, candidate_code text,
  title text, first_name text, monastic_name text, last_name text, national_id_last4 text, birth_date date,
  place_name text, venue_name text, unit_name text, batch_status text, hidden_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select c.id, c.batch_id, c.candidate_code, c.title, c.first_name, c.monastic_name, c.last_name, c.national_id_last4,
           c.birth_date, b.place_id, b.venue_id, b.org_unit_id, b.uploaded_by, b.status as b_status, r.exam_type, r.level,
           b.template_id, private.candidate_ref(c.national_id_hash, c.person_key, c.birth_date) as ref
    from public.candidates c
    join public.registration_batches b on b.id = c.batch_id
    join public.exam_rounds r on r.id = b.round_id
    join public.academic_years y on y.id = r.academic_year_id
    where y.year_be = p_year and c.counted and b.status <> 'withdrawn'
  ), dup as (
    select x.ref from base x where x.ref is not null group by x.ref having count(distinct x.place_id) > 1
  ), marked as (
    select x.*, public.can_view_registration(x.org_unit_id, x.uploaded_by) as shown,
           (x.org_unit_id = p_unit or x.org_unit_id in (select d.id from public.descendants_of(p_unit) d)) as in_unit
    from base x join dup d on d.ref = x.ref
  ), grp as (
    select m.ref, count(*) filter (where not m.shown)::integer as hidden
    from marked m group by m.ref having bool_or(m.shown and m.in_unit)
  )
  select md5(m.ref), m.id, m.batch_id, m.exam_type, m.level, f.code, m.candidate_code, m.title, m.first_name,
         m.monastic_name, m.last_name, m.national_id_last4, m.birth_date, p.name, v.name, ou.name, m.b_status, g.hidden
  from marked m
  join grp g on g.ref = m.ref
  join public.form_templates f on f.id = m.template_id
  join public.places p on p.id = m.place_id
  join public.exam_venues v on v.id = m.venue_id
  join public.org_units ou on ou.id = m.org_unit_id
  where m.shown
  order by m.first_name, m.last_name, md5(m.ref), m.exam_type, m.level, p.name
  limit 2000;
$$;

-- ---------------------------------------------------------------
-- 7) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke execute on function public.registration_list_options(integer, text, text, uuid) from public, anon;
revoke execute on function public.registration_list(integer, text, text, uuid, uuid, uuid) from public, anon;
revoke execute on function public.registration_person_search(text, text) from public, anon;
revoke execute on function public.registration_report_counts(integer, uuid) from public, anon;
revoke execute on function public.registration_report_duplicates(integer, uuid) from public, anon;
-- การค้นสาธารณะไม่ grant ให้ anon: เว็บเรียกจากเซิร์ฟเวอร์ด้วยกุญแจลับ (service_role) เพื่อให้การจำกัดความถี่เลี่ยงไม่ได้
revoke execute on function public.public_registration_search(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.registration_list_options(integer, text, text, uuid) to authenticated;
grant execute on function public.registration_list(integer, text, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.registration_person_search(text, text) to authenticated;
grant execute on function public.registration_report_counts(integer, uuid) to authenticated;
grant execute on function public.registration_report_duplicates(integer, uuid) to authenticated;
grant execute on function public.public_registration_search(text, text, integer, text) to service_role;
