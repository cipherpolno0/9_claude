-- บทที่ 16 (2/2): หน้าสาธารณะ ติดตามคำขอ (/track) และตารางสรุป
--   ฟังก์ชันชุดนี้เปิดให้ผู้ไม่ล็อกอินเรียกได้ จึงคืนเฉพาะข้อมูลที่เปิดเผยได้:
--   เลขที่ ชนิดคำขอ ชื่อสำนักหรือสนามสอบ ประเภท สถานที่ตั้ง จังหวัด ภาค ขั้นพิจารณา วันที่ และผล
--   ไม่คืน: ชื่อผู้ยื่น ชื่อผู้พิจารณา ความเห็น เหตุผลในคำขอ ชื่อเจ้าสำนัก ประธานสนามสอบ ผู้รับข้อสอบ และเอกสารแนบ
--   ปีของคำขอ = ปี พ.ศ. ตามวันที่ยื่น (เวลาประเทศไทย) ตรงกับปีในเลขที่คำขอ (ผู้สั่งงานกำหนด)

-- ปี พ.ศ. ของวันที่ยื่น
create function private.request_year_be(p_submitted_at timestamptz)
returns integer
language sql
immutable
set search_path = ''
as $$
  select extract(year from (p_submitted_at at time zone 'Asia/Bangkok'))::integer + 543;
$$;
revoke all on function private.request_year_be(timestamptz) from public, anon, authenticated;

-- สถานที่ที่ใช้บอกจังหวัดของคำขอ: จัดตั้ง = วัดที่ตั้ง / ยุบ = สำนัก / สนามสอบ = สถานที่ตั้ง (ขอย้าย = สถานที่ตั้งเดิม)
create function private.request_place_id(p_type_key text, p_payload jsonb)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select private.uuid_or_null(case p_type_key
    when 'samnak_establish' then p_payload ->> 'temple_id'
    else p_payload ->> 'place_id' end);
$$;
revoke all on function private.request_place_id(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- สถานะของคำขอ 1 รายการ ค้นด้วยเลขที่คำขอ
-- ไม่คืนคำขอที่มีข้อมูลส่วนบุคคล (request_types.is_personnel: ย้าย ลาออก แจ้งมรณภาพ ฯลฯ) เพราะเลขที่คำขอเดาได้
-- เพิ่ม: type_key, current_step และสำหรับคำขอของระบบที่ 4 เพิ่ม ชื่อสำนักหรือสนามสอบ ประเภท สถานที่ตั้ง จังหวัด ภาค
-- ---------------------------------------------------------------
create or replace function public.public_request_status(p_request_no text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'request_no', r.request_no,
    'type_key', r.type_key,
    'type_name', t.name,
    'status', r.status,
    'current_step', r.current_step,
    'submitted_at', r.submitted_at,
    'decided_at', r.decided_at,
    'steps', (
      select jsonb_agg(jsonb_build_object(
        'step_no', s.step_no, 'level', s.level, 'unit_name', u.name,
        'status', s.status, 'decided_at', s.decided_at
      ) order by s.step_no)
      from public.request_steps s
      join public.org_units u on u.id = s.org_unit_id
      where s.request_id = r.id
    )
  ) || case when public.is_place_request_type(r.type_key) then jsonb_build_object(
    'subject_name', r.payload ->> 'name',
    'kind', coalesce(r.payload ->> 'place_type', r.payload ->> 'venue_type'),
    'place_name', coalesce(r.payload ->> 'temple_name', r.payload ->> 'place_name'),
    'to_place_name', r.payload ->> 'to_place_name',
    'province_name', (
      select pv.name from public.places pl join public.civil_provinces pv on pv.code = pl.province_code
      where pl.id = private.request_place_id(r.type_key, r.payload)
    ),
    'region_name', (select ur.region_name from private.unit_regions() ur where ur.unit_id = r.org_unit_id)
  ) else '{}'::jsonb end
  from public.requests r
  join public.request_types t on t.key = r.type_key
  where r.request_no = upper(btrim(p_request_no))
    and not t.is_personnel;
$$;

-- ---------------------------------------------------------------
-- รายการคำขอของระบบที่ 4 สำหรับหน้าติดตาม: กรองตามชนิดคำขอ จังหวัด (เขตการปกครองบ้านเมืองของสถานที่) และปี พ.ศ. ที่ยื่น
-- คืนครั้งละไม่เกิน 100 แถว
-- ---------------------------------------------------------------
create function public.public_requests(
  p_type text default null,
  p_province integer default null,
  p_year integer default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  request_no text, type_key text, type_name text, subject_name text, kind text, place_name text,
  province_name text, region_name text, status text, current_step integer, step_count integer,
  current_level text, current_unit_name text, submitted_at timestamptz, decided_at timestamptz, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select r.request_no, r.type_key, t.name as type_name, r.payload ->> 'name' as subject_name,
           coalesce(r.payload ->> 'place_type', r.payload ->> 'venue_type') as kind,
           coalesce(r.payload ->> 'temple_name', r.payload ->> 'place_name') as place_name,
           pv.name as province_name, ur.region_name, r.status, r.current_step,
           (select count(*)::integer from public.request_steps s where s.request_id = r.id) as step_count,
           cs.level::text as current_level, su.name as current_unit_name, r.submitted_at, r.decided_at, r.id
    from public.requests r
    join public.request_types t on t.key = r.type_key
    left join public.places pl on pl.id = private.request_place_id(r.type_key, r.payload)
    left join public.civil_provinces pv on pv.code = pl.province_code
    left join private.unit_regions() ur on ur.unit_id = r.org_unit_id
    left join public.request_steps cs on cs.request_id = r.id and cs.step_no = r.current_step
    left join public.org_units su on su.id = cs.org_unit_id
    where public.is_place_request_type(r.type_key)
      and (p_type is null or r.type_key = p_type)
      and (p_province is null or pl.province_code = p_province)
      and (p_year is null or private.request_year_be(r.submitted_at) = p_year)
  )
  select b.request_no, b.type_key, b.type_name, b.subject_name, b.kind, b.place_name,
         b.province_name, b.region_name, b.status, b.current_step, b.step_count,
         b.current_level, b.current_unit_name, b.submitted_at, b.decided_at, count(*) over () as total_count
  from base b
  order by b.submitted_at desc, b.id
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- ---------------------------------------------------------------
-- ตารางสรุป: จำนวนคำขอของระบบที่ 4 แยกตามภาค (ของคณะสงฆ์ที่สังกัด) ชนิดคำขอ และสถานะ ของปี พ.ศ. ที่ยื่น
-- region_name ว่าง = หน่วยที่ไม่อยู่ใต้ภาคใด
-- ---------------------------------------------------------------
create function public.public_request_summary(p_year integer default null)
returns table (region_name text, type_key text, status text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select ur.region_name, r.type_key, r.status, count(*)
  from public.requests r
  left join private.unit_regions() ur on ur.unit_id = r.org_unit_id
  where public.is_place_request_type(r.type_key)
    and private.request_year_be(r.submitted_at) = coalesce(p_year, public.current_year_be())
  group by ur.region_name, r.type_key, r.status
  order by ur.region_name nulls last, r.type_key, r.status;
$$;

-- ปี พ.ศ. ที่มีคำขอของระบบที่ 4 (รวมปีปัจจุบันเสมอ) สำหรับตัวเลือก ปี ในหน้าติดตาม
create function public.public_request_years()
returns table (year_be integer)
language sql
stable
security definer
set search_path = public
as $$
  select y from (
    select distinct private.request_year_be(r.submitted_at) as y
    from public.requests r where public.is_place_request_type(r.type_key)
    union
    select public.current_year_be()
  ) x
  order by y desc;
$$;

revoke execute on function public.public_requests(text, integer, integer, integer, integer) from public;
revoke execute on function public.public_request_summary(integer) from public;
revoke execute on function public.public_request_years() from public;
grant execute on function public.public_requests(text, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.public_request_summary(integer) to anon, authenticated;
grant execute on function public.public_request_years() to anon, authenticated;
