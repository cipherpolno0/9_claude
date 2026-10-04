-- บทที่ 10 (2/2): ฟังก์ชันอ่านของทะเบียนสนามสอบ คัดลอกรายชื่อจากปีก่อน ประวัติ และรายงาน
-- ฟังก์ชันอ่านเป็น security definer เพราะผู้ดูสนามสอบอาจไม่มีสิทธิ์ดูทะเบียนสถานที่หรือทะเบียนบุคคล
-- ทุกฟังก์ชันกรองด้วย can_view_venues(org_unit_id) และคืนเฉพาะชื่อบุคคลกับสถานะ

-- ---------------------------------------------------------------
-- 1) รายการสนามสอบของปีการศึกษาที่เลือก (ตารางข้อมูลกลาง)
--    p_alert: missing = สนามที่เปิดอยู่แต่ยังไม่มีประธานหรือผู้รับข้อสอบ / changed = มีผู้ที่สถานะไม่ใช่ปฏิบัติหน้าที่
-- ---------------------------------------------------------------
create function public.list_venues(
  p_year uuid,
  p_type text default null,
  p_q text default '',
  p_unit uuid default null,
  p_province integer default null,
  p_status text default null,
  p_alert text default null,
  p_sort text default 'name',
  p_dir text default 'asc',
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid, code text, name text, venue_type text, levels text[], capacity integer, status text,
  moved_to_venue_id uuid, moved_to_name text, start_year_be integer, is_active boolean,
  place_id uuid, place_name text, district_name text, district_prefix text, province_name text,
  org_unit_id uuid, org_unit_name text, org_unit_code text,
  chair_name text, chair_status text, chair_person_type text, chair_phone text,
  receiver_name text, receiver_status text, receiver_person_type text, receiver_phone text,
  missing_chair boolean, missing_receiver boolean, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select p_unit as id where p_unit is not null
    union
    select d.id from public.descendants_of(p_unit) d where p_unit is not null
  ),
  officers as (
    select vo.venue_id, vo.role, vo.contact_phone, p.status, p.person_type, p.is_active as person_active,
           btrim(concat_ws(' ', nullif(p.title, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, ''))) as full_name
    from public.venue_officers vo
    join public.persons p on p.id = vo.person_id
    where vo.is_active and vo.academic_year_id = p_year
  ),
  base as (
    select v.id, v.code, v.name, v.venue_type, v.levels, v.capacity, v.status,
           v.moved_to_venue_id, mv.name as moved_to_name, v.start_year_be, v.is_active,
           v.place_id, pl.name as place_name, d.name as district_name, d.prefix as district_prefix, pv.name as province_name,
           v.org_unit_id, u.name as org_unit_name, u.code as org_unit_code,
           c.full_name as chair_name, case when c.venue_id is null then null when c.person_active then c.status else 'inactive' end as chair_status,
           c.person_type as chair_person_type, c.contact_phone as chair_phone,
           r.full_name as receiver_name, case when r.venue_id is null then null when r.person_active then r.status else 'inactive' end as receiver_status,
           r.person_type as receiver_person_type, r.contact_phone as receiver_phone,
           (v.is_active and v.status = 'open' and c.venue_id is null) as missing_chair,
           (v.is_active and v.status = 'open' and r.venue_id is null) as missing_receiver
    from public.exam_venues v
    join public.org_units u on u.id = v.org_unit_id
    join public.places pl on pl.id = v.place_id
    left join public.civil_districts d on d.code = pl.district_code
    left join public.civil_provinces pv on pv.code = pl.province_code
    left join public.exam_venues mv on mv.id = v.moved_to_venue_id
    left join officers c on c.venue_id = v.id and c.role = 'chair'
    left join officers r on r.venue_id = v.id and r.role = 'receiver'
    where public.can_view_venues(v.org_unit_id)
      and (p_type is null or v.venue_type = p_type)
      and (case when p_status = 'inactive' then not v.is_active else v.is_active end)
      and (p_status is null or p_status = 'inactive' or v.status = p_status)
      and (p_province is null or pl.province_code = p_province)
      and (p_unit is null or v.org_unit_id in (select sc.id from scope sc))
      and (
        coalesce(p_q, '') = ''
        or v.name ilike '%' || p_q || '%'
        or v.code ilike '%' || p_q || '%'
        or pl.name ilike '%' || p_q || '%'
      )
  ),
  filtered as (
    select b.* from base b
    where p_alert is null
       or (p_alert = 'missing' and (b.missing_chair or b.missing_receiver))
       or (p_alert = 'changed' and b.status = 'open'
           and (coalesce(b.chair_status, 'active') <> 'active' or coalesce(b.receiver_status, 'active') <> 'active'))
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'name' and p_dir = 'asc' then f.name end asc,
    case when p_sort = 'name' and p_dir = 'desc' then f.name end desc,
    case when p_sort = 'code' and p_dir = 'asc' then f.code end asc,
    case when p_sort = 'code' and p_dir = 'desc' then f.code end desc,
    case when p_sort = 'unit' and p_dir = 'asc' then f.org_unit_code end asc,
    case when p_sort = 'unit' and p_dir = 'desc' then f.org_unit_code end desc,
    case when p_sort = 'status' and p_dir = 'asc' then f.status end asc,
    case when p_sort = 'status' and p_dir = 'desc' then f.status end desc,
    f.name, f.id
  limit greatest(1, least(coalesce(p_limit, 10), 10000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- จำนวนสำหรับกล่องเตือนบนหน้ารายการ (สนามที่เปิดอยู่ ในเขตที่เลือก)
create function public.venue_alerts(p_year uuid, p_unit uuid default null, p_type text default null)
returns table (open_total bigint, missing_chair bigint, missing_receiver bigint, status_changed bigint)
language sql
stable
security definer
set search_path = public
as $$
  select count(*),
         count(*) filter (where l.missing_chair),
         count(*) filter (where l.missing_receiver),
         count(*) filter (where coalesce(l.chair_status, 'active') <> 'active'
                             or coalesce(l.receiver_status, 'active') <> 'active')
  from public.list_venues(p_year, p_type, '', p_unit, null, 'open', null, 'name', 'asc', 10000, 0) l;
$$;

-- ---------------------------------------------------------------
-- 2) รายละเอียดสนามสอบ 1 แห่ง และรายชื่อประธาน ผู้รับข้อสอบ ทุกปีการศึกษา
-- ---------------------------------------------------------------
create function public.venue_detail(p_venue_id uuid)
returns table (
  id uuid, code text, name text, venue_type text, levels text[], capacity integer, status text,
  moved_to_venue_id uuid, moved_to_name text, moved_to_code text, start_year_be integer, note text, is_active boolean,
  place_id uuid, place_name text, place_code text, place_type text,
  house_no text, road text, subdistrict_name text, subdistrict_prefix text,
  district_name text, district_prefix text, province_name text, postal_code text,
  org_unit_id uuid, org_unit_name text, can_edit boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.code, v.name, v.venue_type, v.levels, v.capacity, v.status,
         v.moved_to_venue_id, mv.name, mv.code, v.start_year_be, v.note, v.is_active,
         v.place_id, pl.name, pl.code, pl.place_type,
         pl.house_no, pl.road, s.name, s.prefix, d.name, d.prefix, pv.name, pl.postal_code,
         v.org_unit_id, u.name, public.can_edit_venues(v.org_unit_id)
  from public.exam_venues v
  join public.org_units u on u.id = v.org_unit_id
  join public.places pl on pl.id = v.place_id
  left join public.civil_subdistricts s on s.code = pl.subdistrict_code
  left join public.civil_districts d on d.code = pl.district_code
  left join public.civil_provinces pv on pv.code = pl.province_code
  left join public.exam_venues mv on mv.id = v.moved_to_venue_id
  where v.id = p_venue_id and public.can_view_venues(v.org_unit_id);
$$;

create function public.venue_officer_rows(p_venue_id uuid)
returns table (
  id uuid, academic_year_id uuid, year_be integer, role text, person_id uuid,
  person_name text, person_status text, person_type text, person_unit_name text,
  delivery_address text, contact_phone text, is_public boolean, note text
)
language sql
stable
security definer
set search_path = public
as $$
  select vo.id, vo.academic_year_id, y.year_be, vo.role, vo.person_id,
         btrim(concat_ws(' ', nullif(p.title, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, ''))),
         case when p.is_active then p.status else 'inactive' end, p.person_type, pu.name,
         vo.delivery_address, vo.contact_phone, vo.is_public, vo.note
  from public.venue_officers vo
  join public.exam_venues v on v.id = vo.venue_id
  join public.academic_years y on y.id = vo.academic_year_id
  join public.persons p on p.id = vo.person_id
  join public.org_units pu on pu.id = p.org_unit_id
  where vo.venue_id = p_venue_id and vo.is_active and public.can_view_venues(v.org_unit_id)
  order by y.year_be desc, vo.role;
$$;

-- ---------------------------------------------------------------
-- 3) คัดลอกรายชื่อประธานและผู้รับข้อสอบจากปีการศึกษาก่อนหน้า มาปีที่เลือก
--    คัดลอกเฉพาะสนามที่เปิดอยู่ ที่ผู้เรียกแก้ไขได้ และปีใหม่ยังไม่มีผู้ทำหน้าที่ในบทบาทนั้น
--    ข้ามบุคคลที่ไม่ได้ปฏิบัติหน้าที่แล้ว (ย้ายแล้ว ลาออก มรณภาพ ลาสิกขา พ้นตำแหน่ง หรือถูกปิดใช้งาน)
--    p_dry_run = true นับอย่างเดียว ไม่บันทึก
-- ---------------------------------------------------------------
create function public.copy_venue_officers(p_to_year uuid, p_unit uuid default null, p_dry_run boolean default false)
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
    select vo.id, vo.venue_id, vo.role, vo.person_id, vo.delivery_address, vo.contact_phone, vo.is_public, vo.note,
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
      (venue_id, academic_year_id, role, person_id, delivery_address, contact_phone, is_public, note, copied_from_id)
    select s.venue_id, v_to.id, s.role, s.person_id, s.delivery_address, s.contact_phone, s.is_public, s.note, s.id
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
-- 4) ประวัติการแก้ไขของสนามสอบ รวมรายชื่อประธานและผู้รับข้อสอบ (audit_logs เปิดให้เฉพาะผู้ดูแลระบบ)
-- ---------------------------------------------------------------
create function public.venue_history(p_venue_id uuid)
returns table (
  id bigint, action text, table_name text, row_id text,
  old_data jsonb, new_data jsonb, created_at timestamptz, actor_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.action, l.table_name, l.row_id,
         l.old_data - 'created_by', l.new_data - 'created_by', l.created_at,
         nullif(btrim(concat_ws(' ', pr.title_prefix, pr.first_name, pr.monastic_name, pr.last_name)), '')
  from public.audit_logs l
  left join public.profiles pr on pr.id = l.actor_id
  where (
      (l.table_name = 'exam_venues' and l.row_id = p_venue_id::text)
      or (l.table_name = 'venue_officers'
          and coalesce(l.new_data ->> 'venue_id', l.old_data ->> 'venue_id') = p_venue_id::text)
    )
    and exists (select 1 from public.exam_venues v where v.id = p_venue_id and public.can_view_venues(v.org_unit_id))
  order by l.created_at desc, l.id desc
  limit 300;
$$;

-- ---------------------------------------------------------------
-- 5) รายงาน: บัญชีสนามสอบที่เปิดอยู่ พร้อมที่อยู่จัดส่งและเบอร์ติดต่อ เรียงตามจังหวัดของสถานที่ตั้ง
-- ---------------------------------------------------------------
create function public.report_venues(p_year uuid, p_unit uuid default null, p_type text default null)
returns table (
  province_name text, code text, name text, venue_type text, levels text[], capacity integer,
  place_name text, house_no text, road text, subdistrict_name text, subdistrict_prefix text,
  district_name text, district_prefix text, postal_code text, org_unit_name text,
  chair_name text, chair_phone text, chair_address text,
  receiver_name text, receiver_phone text, receiver_address text
)
language sql
stable
security definer
set search_path = public
as $$
  with officers as (
    select vo.venue_id, vo.role, vo.contact_phone, vo.delivery_address,
           btrim(concat_ws(' ', nullif(p.title, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, ''))) as full_name
    from public.venue_officers vo
    join public.persons p on p.id = vo.person_id
    where vo.is_active and vo.academic_year_id = p_year
  )
  select coalesce(pv.name, 'ไม่ระบุจังหวัด'), v.code, v.name, v.venue_type, v.levels, v.capacity,
         pl.name, pl.house_no, pl.road, s.name, s.prefix, d.name, d.prefix, pl.postal_code, u.name,
         c.full_name, c.contact_phone, c.delivery_address,
         r.full_name, r.contact_phone, r.delivery_address
  from public.exam_venues v
  join public.org_units u on u.id = v.org_unit_id
  join public.places pl on pl.id = v.place_id
  left join public.civil_subdistricts s on s.code = pl.subdistrict_code
  left join public.civil_districts d on d.code = pl.district_code
  left join public.civil_provinces pv on pv.code = pl.province_code
  left join officers c on c.venue_id = v.id and c.role = 'chair'
  left join officers r on r.venue_id = v.id and r.role = 'receiver'
  where v.is_active and v.status = 'open'
    and public.can_view_venues(v.org_unit_id)
    and (p_type is null or v.venue_type = p_type)
    and (p_unit is null or v.org_unit_id = p_unit
         or v.org_unit_id in (select x.id from public.descendants_of(p_unit) x))
  order by pv.name nulls last, v.venue_type, v.name, v.code
  limit 10000;
$$;

revoke execute on function public.list_venues(uuid, text, text, uuid, integer, text, text, text, text, integer, integer) from public, anon;
revoke execute on function public.venue_alerts(uuid, uuid, text) from public, anon;
revoke execute on function public.venue_detail(uuid) from public, anon;
revoke execute on function public.venue_officer_rows(uuid) from public, anon;
revoke execute on function public.copy_venue_officers(uuid, uuid, boolean) from public, anon;
revoke execute on function public.venue_history(uuid) from public, anon;
revoke execute on function public.report_venues(uuid, uuid, text) from public, anon;
grant execute on function public.list_venues(uuid, text, text, uuid, integer, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.venue_alerts(uuid, uuid, text) to authenticated;
grant execute on function public.venue_detail(uuid) to authenticated;
grant execute on function public.venue_officer_rows(uuid) to authenticated;
grant execute on function public.copy_venue_officers(uuid, uuid, boolean) to authenticated;
grant execute on function public.venue_history(uuid) to authenticated;
grant execute on function public.report_venues(uuid, uuid, text) to authenticated;
