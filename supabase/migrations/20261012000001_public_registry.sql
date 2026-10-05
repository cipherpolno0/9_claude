-- บทที่ 11: หน้าค้นหาทะเบียนสาธารณะ (สถานที่ และ สนามสอบ)
-- ผู้ไม่ล็อกอิน (anon) ยังอ่านตาราง places, exam_venues, venue_officers ตรงไม่ได้
-- หน้าสาธารณะอ่านผ่านฟังก์ชัน security definer ด้านล่าง ซึ่งคืนเฉพาะช่องที่เปิดเผยได้ และเฉพาะรายการที่ is_active

-- ---------------------------------------------------------------
-- 1) ความยินยอมเผยแพร่เบอร์ติดต่อ แยกจากความยินยอมเผยแพร่ชื่อ
--    is_public = เผยแพร่ชื่อ / is_phone_public = เผยแพร่เบอร์ติดต่อ (ต้องเผยแพร่ชื่อด้วย)
-- ---------------------------------------------------------------
alter table public.venue_officers
  add column is_phone_public boolean not null default false,
  add constraint venue_officers_phone_public_needs_name check (not is_phone_public or is_public);
comment on column public.venue_officers.is_phone_public is
  'ยินยอมให้เผยแพร่เบอร์ติดต่อต่อสาธารณะ (ค่าเริ่มต้น ไม่เผยแพร่ และต้องยินยอมเผยแพร่ชื่อด้วย)';

-- คัดลอกจากปีก่อน: ยกความยินยอมเผยแพร่เบอร์ติดต่อมาด้วย (ส่วนอื่นเหมือนเดิมทุกประการ)
create or replace function public.copy_venue_officers(p_to_year uuid, p_unit uuid default null, p_dry_run boolean default false)
returns table (from_year_be integer, copied integer, skipped_filled integer, skipped_person integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_to public.academic_years%rowtype;
  v_from public.academic_years%rowtype;
  v_copied integer := 0;
  v_filled integer := 0;
  v_person integer := 0;
begin
  if not public.can_edit_any_venues() then
    raise exception 'ท่านไม่มีสิทธิ์แก้ไขทะเบียนสนามสอบ' using errcode = '42501';
  end if;
  select * into v_to from public.academic_years where id = p_to_year;
  if not found then
    raise exception 'ไม่พบปีการศึกษาที่เลือก' using errcode = 'P0001';
  end if;
  select * into v_from from public.academic_years where year_be < v_to.year_be order by year_be desc limit 1;
  if not found then
    raise exception 'ไม่มีปีการศึกษาก่อนหน้าปี % ให้คัดลอก', v_to.year_be using errcode = 'P0001';
  end if;

  with src as (
    select vo.id, vo.venue_id, vo.role, vo.person_id, vo.delivery_address, vo.contact_phone,
           vo.is_public, vo.is_phone_public, vo.note,
           exists (
             select 1 from public.venue_officers t
             where t.venue_id = vo.venue_id and t.academic_year_id = v_to.id and t.role = vo.role and t.is_active
           ) as filled,
           (p.is_active and p.status in ('active', 'transfer_pending')) as person_ok
    from public.venue_officers vo
    join public.exam_venues v on v.id = vo.venue_id
    join public.persons p on p.id = vo.person_id
    where vo.academic_year_id = v_from.id and vo.is_active
      and v.is_active and v.status = 'open'
      and public.can_edit_venues(v.org_unit_id)
      and (p_unit is null or v.org_unit_id = p_unit
           or v.org_unit_id in (select d.id from public.descendants_of(p_unit) d))
  ),
  ins as (
    insert into public.venue_officers
      (venue_id, academic_year_id, role, person_id, delivery_address, contact_phone,
       is_public, is_phone_public, note, copied_from_id)
    select s.venue_id, v_to.id, s.role, s.person_id, s.delivery_address, s.contact_phone,
           s.is_public, s.is_phone_public, s.note, s.id
    from src s
    where not p_dry_run and not s.filled and s.person_ok
    returning 1
  )
  select count(*) filter (where not s.filled and s.person_ok),
         count(*) filter (where s.filled),
         count(*) filter (where not s.filled and not s.person_ok)
    into v_copied, v_filled, v_person
  from src s, (select count(*) from ins) i;

  return query select v_from.year_be, v_copied, v_filled, v_person;
end;
$$;

-- ---------------------------------------------------------------
-- 2) ดัชนีสำหรับหน้าค้นหาสาธารณะ
--    ค้นชื่อแบบมีคำอยู่ตรงกลาง (ilike '%คำ%') ใช้ดัชนี trigram  ตัวกรองและการเรียงตามชื่อใช้ดัชนี btree
-- ---------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

create index places_name_trgm_idx on public.places using gin (name extensions.gin_trgm_ops);
create index places_public_name_idx on public.places (place_type, name, id) where is_active;
create index places_public_area_idx on public.places (place_type, province_code, district_code, subdistrict_code)
  where is_active;
create index exam_venues_name_trgm_idx on public.exam_venues using gin (name extensions.gin_trgm_ops);
create index exam_venues_public_name_idx on public.exam_venues (name, id) where is_active;
create index venue_officers_public_idx on public.venue_officers (venue_id, academic_year_id)
  where is_active and is_public;

-- ---------------------------------------------------------------
-- 3) ภาคของคณะสงฆ์ของแต่ละเขตปกครอง (ไล่จากภาคลงไปถึงตำบลครั้งเดียว)
-- ---------------------------------------------------------------
create function private.unit_regions()
returns table (unit_id uuid, region_id uuid, region_name text)
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select u.id as unit_id, u.id as region_id, u.name as region_name
    from public.org_units u
    where u.level = 'region' and u.is_active
    union all
    select c.id, t.region_id, t.region_name
    from public.org_units c
    join tree t on c.parent_id = t.unit_id
  )
  select t.unit_id, t.region_id, t.region_name from tree t;
$$;
revoke execute on function private.unit_regions() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 4) ค้นหาสถานที่ (วัด สำนักเรียน สำนักศาสนศึกษา สถานศึกษา องค์กร)
--    ภาค = ภาคของคณะสงฆ์ที่สังกัด / จังหวัด อำเภอ ตำบล = ที่อยู่ตามเขตการปกครองบ้านเมือง
--    ไม่คืน: ผู้รับผิดชอบ อีเมล หมายเหตุ ผู้บันทึก  จำกัด 5,000 แถวต่อครั้ง (ใช้กับการส่งออก Excel)
-- ---------------------------------------------------------------
create function public.public_places(
  p_type text,
  p_q text default '',
  p_region uuid default null,
  p_province integer default null,
  p_district integer default null,
  p_subdistrict integer default null,
  p_sect text default null,
  p_status text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, code text, name text, place_type text, sect text, status text,
  house_no text, road text, subdistrict_name text, subdistrict_prefix text,
  district_name text, district_prefix text, province_name text, postal_code text,
  region_name text, org_unit_name text, office_phone text,
  parent_place_id uuid, parent_name text, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with regions as materialized (select r.unit_id, r.region_id, r.region_name from private.unit_regions() r),
  hits as (
    select pl.id, pl.name, count(*) over () as total_count
    from public.places pl
    where pl.is_active
      and pl.place_type = p_type
      and (p_status is null or pl.status = p_status)
      and (p_sect is null or pl.sect::text = p_sect)
      and (p_province is null or pl.province_code = p_province)
      and (p_district is null or pl.district_code = p_district)
      and (p_subdistrict is null or pl.subdistrict_code = p_subdistrict)
      and (p_region is null or pl.org_unit_id in (
            select r.unit_id from regions r where r.region_id = p_region))
      and (btrim(coalesce(p_q, '')) = '' or pl.name ilike '%' || left(btrim(p_q), 100) || '%')
    order by pl.name, pl.id
    limit greatest(1, least(coalesce(p_limit, 20), 5000))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select pl.id, pl.code, pl.name, pl.place_type, pl.sect::text, pl.status,
         pl.house_no, pl.road, s.name, s.prefix, d.name, d.prefix, pv.name, pl.postal_code,
         rg.region_name, u.name, pl.office_phone,
         case when par.is_active then par.id end, case when par.is_active then par.name end,
         h.total_count
  from hits h
  join public.places pl on pl.id = h.id
  join public.org_units u on u.id = pl.org_unit_id
  left join regions rg on rg.unit_id = pl.org_unit_id
  left join public.civil_subdistricts s on s.code = pl.subdistrict_code
  left join public.civil_districts d on d.code = pl.district_code
  left join public.civil_provinces pv on pv.code = pl.province_code
  left join public.places par on par.id = pl.parent_place_id
  order by h.name, h.id;
$$;
comment on function public.public_places(text, text, uuid, integer, integer, integer, text, text, integer, integer) is
  'ค้นหาทะเบียนสถานที่สำหรับหน้าสาธารณะ: ชื่อ ที่ตั้ง นิกาย สถานะ โทรศัพท์สำนักงาน เท่านั้น';

-- รายละเอียดสถานที่ 1 แห่ง
create function public.public_place(p_id uuid)
returns table (
  id uuid, code text, name text, place_type text, sect text, status text, established_on date,
  house_no text, road text, subdistrict_name text, subdistrict_prefix text,
  district_name text, district_prefix text, province_name text, postal_code text,
  latitude numeric, longitude numeric, region_name text, org_unit_name text, office_phone text,
  parent_place_id uuid, parent_name text, parent_type text
)
language sql
stable
security definer
set search_path = public
as $$
  select pl.id, pl.code, pl.name, pl.place_type, pl.sect::text, pl.status, pl.established_on,
         pl.house_no, pl.road, s.name, s.prefix, d.name, d.prefix, pv.name, pl.postal_code,
         pl.latitude, pl.longitude,
         (select r.region_name from private.unit_regions() r where r.unit_id = pl.org_unit_id),
         u.name, pl.office_phone,
         case when par.is_active then par.id end, case when par.is_active then par.name end,
         case when par.is_active then par.place_type end
  from public.places pl
  join public.org_units u on u.id = pl.org_unit_id
  left join public.civil_subdistricts s on s.code = pl.subdistrict_code
  left join public.civil_districts d on d.code = pl.district_code
  left join public.civil_provinces pv on pv.code = pl.province_code
  left join public.places par on par.id = pl.parent_place_id
  where pl.id = p_id and pl.is_active;
$$;

-- สถานที่ที่เกี่ยวข้องกับสถานที่นี้: สำนักที่ตั้งอยู่ในวัด และสนามสอบที่ตั้งอยู่ที่นี่
create function public.public_place_related(p_id uuid)
returns table (kind text, id uuid, code text, name text, subtype text, levels text[], status text)
language sql
stable
security definer
set search_path = public
as $$
  select 'venue', v.id, v.code, v.name, v.venue_type, v.levels, v.status
  from public.exam_venues v
  where v.place_id = p_id and v.is_active
    and exists (select 1 from public.places pl where pl.id = p_id and pl.is_active)
  union all
  select 'place', c.id, c.code, c.name, c.place_type, null::text[], c.status
  from public.places c
  where c.parent_place_id = p_id and c.is_active
    and exists (select 1 from public.places pl where pl.id = p_id and pl.is_active)
  order by 1 desc, 4;
$$;

-- ---------------------------------------------------------------
-- 5) ค้นหาสนามสอบ (ที่ตั้งและนิกายตามสถานที่ตั้งและเขตคณะสงฆ์ที่สังกัด)
-- ---------------------------------------------------------------
create function public.public_venues(
  p_type text default null,
  p_q text default '',
  p_region uuid default null,
  p_province integer default null,
  p_district integer default null,
  p_subdistrict integer default null,
  p_sect text default null,
  p_status text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, code text, name text, venue_type text, levels text[], capacity integer, status text,
  sect text, place_id uuid, place_name text,
  house_no text, road text, subdistrict_name text, subdistrict_prefix text,
  district_name text, district_prefix text, province_name text, postal_code text,
  region_name text, org_unit_name text, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with regions as materialized (select r.unit_id, r.region_id, r.region_name from private.unit_regions() r),
  hits as (
    select v.id, v.name, count(*) over () as total_count
    from public.exam_venues v
    join public.places pl on pl.id = v.place_id
    join public.org_units u on u.id = v.org_unit_id
    where v.is_active
      and (p_type is null or v.venue_type = p_type)
      and (p_status is null or v.status = p_status)
      and (p_sect is null or u.sect::text = p_sect)
      and (p_province is null or pl.province_code = p_province)
      and (p_district is null or pl.district_code = p_district)
      and (p_subdistrict is null or pl.subdistrict_code = p_subdistrict)
      and (p_region is null or v.org_unit_id in (
            select r.unit_id from regions r where r.region_id = p_region))
      and (btrim(coalesce(p_q, '')) = ''
           or v.name ilike '%' || left(btrim(p_q), 100) || '%'
           or pl.name ilike '%' || left(btrim(p_q), 100) || '%')
    order by v.name, v.id
    limit greatest(1, least(coalesce(p_limit, 20), 5000))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select v.id, v.code, v.name, v.venue_type, v.levels, v.capacity, v.status,
         u.sect::text, case when pl.is_active then pl.id end, pl.name,
         pl.house_no, pl.road, s.name, s.prefix, d.name, d.prefix, pv.name, pl.postal_code,
         rg.region_name, u.name, h.total_count
  from hits h
  join public.exam_venues v on v.id = h.id
  join public.places pl on pl.id = v.place_id
  join public.org_units u on u.id = v.org_unit_id
  left join regions rg on rg.unit_id = v.org_unit_id
  left join public.civil_subdistricts s on s.code = pl.subdistrict_code
  left join public.civil_districts d on d.code = pl.district_code
  left join public.civil_provinces pv on pv.code = pl.province_code
  order by h.name, h.id;
$$;
comment on function public.public_venues(text, text, uuid, integer, integer, integer, text, text, integer, integer) is
  'ค้นหาทะเบียนสนามสอบสำหรับหน้าสาธารณะ: ชื่อ ประเภท ชั้นที่เปิดสอบ ที่ตั้ง สถานะ เท่านั้น (ไม่มีชื่อบุคคล)';

-- รายละเอียดสนามสอบ 1 แห่ง
create function public.public_venue(p_id uuid)
returns table (
  id uuid, code text, name text, venue_type text, levels text[], capacity integer, status text,
  start_year_be integer, moved_to_venue_id uuid, moved_to_name text, sect text,
  place_id uuid, place_name text, place_type text, place_phone text,
  house_no text, road text, subdistrict_name text, subdistrict_prefix text,
  district_name text, district_prefix text, province_name text, postal_code text,
  latitude numeric, longitude numeric, region_name text, org_unit_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.code, v.name, v.venue_type, v.levels, v.capacity, v.status, v.start_year_be,
         case when mv.is_active then mv.id end, case when mv.is_active then mv.name end, u.sect::text,
         case when pl.is_active then pl.id end, pl.name, pl.place_type, pl.office_phone,
         pl.house_no, pl.road, s.name, s.prefix, d.name, d.prefix, pv.name, pl.postal_code,
         pl.latitude, pl.longitude,
         (select r.region_name from private.unit_regions() r where r.unit_id = v.org_unit_id),
         u.name
  from public.exam_venues v
  join public.places pl on pl.id = v.place_id
  join public.org_units u on u.id = v.org_unit_id
  left join public.civil_subdistricts s on s.code = pl.subdistrict_code
  left join public.civil_districts d on d.code = pl.district_code
  left join public.civil_provinces pv on pv.code = pl.province_code
  left join public.exam_venues mv on mv.id = v.moved_to_venue_id
  where v.id = p_id and v.is_active;
$$;

-- ประธานสนามสอบและผู้รับข้อสอบของปีการศึกษาปัจจุบัน เฉพาะรายการที่ยินยอมเผยแพร่ชื่อ (is_public)
-- ชื่อ = คำนำหน้า ชื่อ ฉายา (ไม่มีนามสกุล)  เบอร์ติดต่อคืนเฉพาะรายการที่ยินยอมเผยแพร่เบอร์ (is_phone_public)
-- ไม่คืนที่อยู่จัดส่งข้อสอบ หมายเหตุ และรหัสบุคคล  ไม่แสดงบุคคลที่ไม่ได้ปฏิบัติหน้าที่แล้ว
create function public.public_venue_officers(p_venue_id uuid)
returns table (role text, display_name text, contact_phone text, year_be integer)
language sql
stable
security definer
set search_path = public
as $$
  select vo.role,
         concat_ws(' ', nullif(p.title, ''), p.first_name, nullif(p.monastic_name, '')),
         case when vo.is_phone_public then nullif(vo.contact_phone, '') end,
         y.year_be
  from public.venue_officers vo
  join public.exam_venues v on v.id = vo.venue_id and v.is_active
  join public.academic_years y on y.id = vo.academic_year_id and y.is_current
  join public.persons p on p.id = vo.person_id
  where vo.venue_id = p_venue_id and vo.is_active and vo.is_public
    and p.is_active and p.status in ('active', 'transfer_pending')
  order by vo.role;
$$;
comment on function public.public_venue_officers(uuid) is
  'ประธานสนามสอบและผู้รับข้อสอบของปีการศึกษาปัจจุบันที่ยินยอมเผยแพร่ชื่อ เบอร์ติดต่อเฉพาะที่ยินยอมเผยแพร่เบอร์';

-- ---------------------------------------------------------------
-- สิทธิ์เรียกฟังก์ชัน: เปิดให้ผู้ไม่ล็อกอิน (หน้าสาธารณะ) และผู้ล็อกอิน
-- ---------------------------------------------------------------
revoke execute on function public.public_places(text, text, uuid, integer, integer, integer, text, text, integer, integer) from public;
revoke execute on function public.public_place(uuid) from public;
revoke execute on function public.public_place_related(uuid) from public;
revoke execute on function public.public_venues(text, text, uuid, integer, integer, integer, text, text, integer, integer) from public;
revoke execute on function public.public_venue(uuid) from public;
revoke execute on function public.public_venue_officers(uuid) from public;
grant execute on function public.public_places(text, text, uuid, integer, integer, integer, text, text, integer, integer) to anon, authenticated;
grant execute on function public.public_place(uuid) to anon, authenticated;
grant execute on function public.public_place_related(uuid) to anon, authenticated;
grant execute on function public.public_venues(text, text, uuid, integer, integer, integer, text, text, integer, integer) to anon, authenticated;
grant execute on function public.public_venue(uuid) to anon, authenticated;
grant execute on function public.public_venue_officers(uuid) to anon, authenticated;
