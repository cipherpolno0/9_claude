-- บทที่ 8: หน้าตรวจสอบ ผังสายการปกครอง ทำเนียบสาธารณะ รายงาน และแดชบอร์ดบุคลากร
-- ไม่มีตารางใหม่ มีแต่ฟังก์ชันอ่านข้อมูล ทุกฟังก์ชันจำกัดผลตามสิทธิ์ดูทะเบียนบุคคลของผู้เรียก
-- (ยกเว้น public_officers ที่เปิดให้บุคคลทั่วไป และคืนเฉพาะข้อมูลที่เปิดเผยได้)

-- ตำแหน่งที่ "ดำรงอยู่ในวันนี้" ใช้เงื่อนไขเดียวกันทุกฟังก์ชัน:
--   is_active และ appointed_on <= วันนี้ และ (ended_on ว่าง หรือ ended_on > วันนี้)

-- ---------------------------------------------------------------
-- 1) เขตปกครองที่ผู้ใช้ปัจจุบันดูทะเบียนบุคคลได้ (ตามค่าตั้ง สิทธิ์ตามบทบาท)
-- ---------------------------------------------------------------
create function public.viewable_personnel_units()
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select m.org_unit_id, r.personnel_view as scope
    from public.my_role_rows() m
    join public.roles r on r.key = m.role_key
    where m.effective and r.personnel_view <> 'none'
  )
  select u.id from public.org_units u where exists (select 1 from mine where scope = 'all')
  union
  select m.org_unit_id from mine m where m.scope in ('own', 'subtree') and m.org_unit_id is not null
  union
  select d.id
  from mine m
  cross join lateral public.descendants_of(m.org_unit_id) d
  where m.scope = 'subtree' and m.org_unit_id is not null;
$$;
comment on function public.viewable_personnel_units() is 'เขตปกครองทั้งหมดที่ผู้ใช้ปัจจุบันดูทะเบียนบุคคลได้';

-- หน่วยบนสุดที่ดูได้ ใช้เป็นตัวเลือกเริ่มต้นของผังและรายงาน (เห็นทุกเขต = รายชื่อภาค)
create function public.personnel_view_roots()
returns table (id uuid, name text, code text, level public.org_level, sect public.sect)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select m.org_unit_id, r.personnel_view as scope
    from public.my_role_rows() m
    join public.roles r on r.key = m.role_key
    where m.effective and r.personnel_view <> 'none'
  ),
  picked as (
    select u.id
    from public.org_units u
    where u.level = 'region' and u.is_active and exists (select 1 from mine where scope = 'all')
    union
    select m.org_unit_id
    from mine m
    where m.scope in ('own', 'subtree') and m.org_unit_id is not null
      and not exists (select 1 from mine where scope = 'all')
      -- ตัดหน่วยที่อยู่ใต้หน่วยอื่นของตนเองออก (เหลือเฉพาะหน่วยบนสุด)
      and not exists (
        select 1
        from mine o
        join public.ancestors_or_self(m.org_unit_id) a on a.id = o.org_unit_id
        where o.scope = 'subtree' and a.depth > 0
      )
  )
  select u.id, u.name, u.code, u.level, u.sect
  from picked p
  join public.org_units u on u.id = p.id
  order by u.code;
$$;

-- ---------------------------------------------------------------
-- 2) หน้าตรวจสอบ: ค้นด้วยชื่อ ฉายา ตำแหน่ง เขต แท่ง สถานะ (ทำงานในนามผู้ใช้ อยู่ใต้ RLS)
-- ---------------------------------------------------------------
create function public.lookup_personnel(
  p_q text default '',
  p_unit uuid default null,
  p_position text default null,
  p_track text default null,
  p_status text default null,
  p_sort text default 'name',
  p_dir text default 'asc',
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid, person_type text, title text, first_name text, monastic_name text, last_name text,
  temple_name text, org_unit_name text, org_unit_code text, status text,
  positions text, education text, total_count bigint
)
language sql
stable
set search_path = public
as $$
  with scope as (
    select p_unit as id where p_unit is not null
    union
    select d.id from public.descendants_of(p_unit) d where p_unit is not null
  ),
  cur as (
    select a.person_id, a.position_type_key, a.org_unit_id
    from public.appointments a
    where a.is_active and a.appointed_on <= current_date
      and (a.ended_on is null or a.ended_on > current_date)
  ),
  edu as (
    select e.person_id, e.track, e.position_type_id, e.school_name, e.org_unit_id
    from public.education_staff e
    where e.is_active and e.status = 'active'
  ),
  base as (
    select p.id, p.person_type, p.title, p.first_name, p.monastic_name, p.last_name,
           p.temple_name, u.name as org_unit_name, u.code as org_unit_code, p.status,
           (
             select string_agg(t.name || ' · ' || cu.name, E'\n' order by t.sort_order, cu.code)
             from cur c
             join public.position_types t on t.key = c.position_type_key
             join public.org_units cu on cu.id = c.org_unit_id
             where c.person_id = p.id
           ) as positions,
           (
             select string_agg(
                      e.track || '|' || t.name || case when e.school_name <> '' then ' · ' || e.school_name else '' end,
                      E'\n' order by e.track, t.sort_order)
             from edu e
             join public.education_position_types t on t.id = e.position_type_id
             where e.person_id = p.id
           ) as education
    from public.persons p
    join public.org_units u on u.id = p.org_unit_id
    where p.is_active
      and (p_status is null or p.status = p_status)
      and (
        coalesce(p_q, '') = ''
        or p.first_name ilike '%' || p_q || '%'
        or p.monastic_name ilike '%' || p_q || '%'
        or p.last_name ilike '%' || p_q || '%'
        or p.title ilike '%' || p_q || '%'
      )
      and (
        p_position is null
        or exists (select 1 from cur c where c.person_id = p.id and c.position_type_key = p_position)
      )
      and (
        p_track is null
        or exists (select 1 from edu e where e.person_id = p.id and e.track = p_track)
      )
      and (
        p_unit is null
        or p.org_unit_id in (select s.id from scope s)
        or exists (select 1 from cur c where c.person_id = p.id and c.org_unit_id in (select s.id from scope s))
        or exists (select 1 from edu e where e.person_id = p.id and e.org_unit_id in (select s.id from scope s))
      )
  )
  select b.*, count(*) over () as total_count
  from base b
  order by
    case when p_sort = 'name' and p_dir = 'asc' then b.first_name end asc,
    case when p_sort = 'name' and p_dir = 'desc' then b.first_name end desc,
    case when p_sort = 'unit' and p_dir = 'asc' then b.org_unit_code end asc,
    case when p_sort = 'unit' and p_dir = 'desc' then b.org_unit_code end desc,
    case when p_sort = 'status' and p_dir = 'asc' then b.status end asc,
    case when p_sort = 'status' and p_dir = 'desc' then b.status end desc,
    b.first_name, b.id
  limit greatest(1, least(coalesce(p_limit, 10), 10000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- ---------------------------------------------------------------
-- 3) ช่องตำแหน่งปกครองของแต่ละหน่วย: ผู้ดำรงตำแหน่ง และจำนวนที่ว่าง
--    ใช้ทั้งผังสายการปกครองและรายงานตำแหน่งว่าง
--    ว่าง = เจ้าคณะไม่มีผู้ดำรง / รองเจ้าคณะและเลขานุการ: ไม่มีผู้ดำรง หรือมีน้อยกว่าจำนวนที่ตั้งไว้ (max_per_unit)
-- ---------------------------------------------------------------
create function public.governance_slots(p_unit uuid)
returns table (
  unit_id uuid, parent_id uuid, unit_level public.org_level, unit_name text, unit_code text, sect public.sect,
  position_key text, position_name text, kind text, sort_order integer, max_per_unit integer,
  held integer, holders text, missing integer
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select v.id
    from public.viewable_personnel_units() v
    where p_unit is not null
      and (v.id = p_unit or v.id in (select d.id from public.descendants_of(p_unit) d))
  ),
  cur as (
    select a.org_unit_id, a.position_type_key,
           count(*)::integer as held,
           string_agg(
             concat_ws(' ', nullif(p.title, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, '')),
             E'\n' order by a.appointed_on, p.first_name
           ) as holders
    from public.appointments a
    join public.persons p on p.id = a.person_id and p.is_active
    where a.is_active and a.appointed_on <= current_date
      and (a.ended_on is null or a.ended_on > current_date)
      and a.org_unit_id in (select s.id from scope s)
    group by a.org_unit_id, a.position_type_key
  )
  select u.id, u.parent_id, u.level, u.name, u.code, u.sect,
         t.key, t.name, t.kind, t.sort_order, t.max_per_unit,
         coalesce(c.held, 0),
         coalesce(c.holders, ''),
         case
           when t.max_per_unit is not null then greatest(t.max_per_unit - coalesce(c.held, 0), 0)
           when coalesce(c.held, 0) = 0 then 1
           else 0
         end
  from scope s
  join public.org_units u on u.id = s.id and u.is_active
  join public.position_types t on t.level = u.level and t.is_active
  left join cur c on c.org_unit_id = u.id and c.position_type_key = t.key
  order by u.code, t.sort_order;
$$;
comment on function public.governance_slots(uuid) is 'ผู้ดำรงตำแหน่งและจำนวนตำแหน่งว่างของหน่วยที่เลือกและหน่วยใต้สังกัด (เฉพาะหน่วยที่ผู้เรียกดูได้)';

-- ---------------------------------------------------------------
-- 4) รายงาน: ทำเนียบตามเขต (หนึ่งแถว = ผู้ดำรงตำแหน่งปัจจุบันหนึ่งตำแหน่ง)
-- ---------------------------------------------------------------
create function public.report_directory(p_unit uuid)
returns table (
  unit_code text, unit_name text, unit_level public.org_level, sect public.sect,
  position_name text, person_id uuid, person_type text, title text, first_name text, monastic_name text,
  last_name text, temple_name text, appointed_on date, order_no text, status text
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select v.id
    from public.viewable_personnel_units() v
    where p_unit is not null
      and (v.id = p_unit or v.id in (select d.id from public.descendants_of(p_unit) d))
  )
  select u.code, u.name, u.level, u.sect, t.name, p.id, p.person_type, p.title, p.first_name, p.monastic_name,
         p.last_name, p.temple_name, a.appointed_on, a.order_no, p.status
  from public.appointments a
  join scope s on s.id = a.org_unit_id
  join public.org_units u on u.id = a.org_unit_id
  join public.position_types t on t.key = a.position_type_key
  join public.persons p on p.id = a.person_id and p.is_active
  where a.is_active and a.appointed_on <= current_date
    and (a.ended_on is null or a.ended_on > current_date)
  order by u.code, t.sort_order, a.appointed_on, p.first_name;
$$;

-- ---------------------------------------------------------------
-- 5) รายงาน: จศป. แยกแท่งและเขต (นับผู้ที่ปฏิบัติหน้าที่อยู่ รวมหน่วยใต้สังกัดของแต่ละเขต)
-- ---------------------------------------------------------------
create function public.report_education_staff(p_unit uuid)
returns table (
  unit_id uuid, unit_code text, unit_name text, unit_level public.org_level,
  dhamma integer, pali integer, general integer, supervisor integer, persons integer
)
language sql
stable
security definer
set search_path = public
as $$
  with viewable as (select v.id from public.viewable_personnel_units() v),
  scope as (
    select v.id
    from viewable v
    where p_unit is not null
      and (v.id = p_unit or v.id in (select d.id from public.descendants_of(p_unit) d))
  )
  select u.id, u.code, u.name, u.level,
         (count(*) filter (where e.track = 'dhamma'))::integer,
         (count(*) filter (where e.track = 'pali'))::integer,
         (count(*) filter (where e.track = 'general'))::integer,
         (count(*) filter (where e.track = 'supervisor'))::integer,
         (count(distinct e.person_id))::integer
  from public.education_staff e
  join public.persons p on p.id = e.person_id and p.is_active
  cross join lateral public.ancestors_or_self(e.org_unit_id) a
  join scope s on s.id = a.id
  join public.org_units u on u.id = a.id
  where e.is_active and e.status = 'active'
    and e.org_unit_id in (select v.id from viewable v)
  group by u.id, u.code, u.name, u.level
  order by u.code;
$$;

-- ---------------------------------------------------------------
-- 6) รายงาน: สรุปการย้าย ลาออก มรณภาพ-ตาย ลาสิกขา รายปีงบประมาณ
--    ปีงบประมาณ 2570 = 1 ต.ค. 2569 ถึง 30 ก.ย. 2570  นับที่หน่วยต้นสังกัดขณะเปลี่ยนสถานะ
-- ---------------------------------------------------------------
create function public.fiscal_year_be(p_date date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (extract(year from p_date + interval '3 months'))::integer + 543;
$$;
comment on function public.fiscal_year_be(date) is 'ปีงบประมาณ (พ.ศ.) ของวันที่: เริ่ม 1 ต.ค. ของปีก่อน ถึง 30 ก.ย.';

create function public.report_status_summary(p_unit uuid)
returns table (
  fiscal_year integer, unit_id uuid, unit_code text, unit_name text,
  transfer integer, resign integer, death integer, disrobe integer, other integer
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select v.id
    from public.viewable_personnel_units() v
    where p_unit is not null
      and (v.id = p_unit or v.id in (select d.id from public.descendants_of(p_unit) d))
  ),
  changes as (
    select public.fiscal_year_be(c.effective_on) as fiscal_year,
           coalesce(c.from_org_unit_id, r.org_unit_id, p.org_unit_id) as unit_id,
           c.change_type
    from public.status_changes c
    join public.persons p on p.id = c.person_id
    left join public.requests r on r.id = c.request_id
  )
  select c.fiscal_year, u.id, u.code, u.name,
         (count(*) filter (where c.change_type = 'transfer'))::integer,
         (count(*) filter (where c.change_type = 'resign'))::integer,
         (count(*) filter (where c.change_type = 'death'))::integer,
         (count(*) filter (where c.change_type = 'disrobe'))::integer,
         (count(*) filter (where c.change_type = 'other'))::integer
  from changes c
  join scope s on s.id = c.unit_id
  join public.org_units u on u.id = c.unit_id
  group by c.fiscal_year, u.id, u.code, u.name
  order by c.fiscal_year desc, u.code;
$$;

-- ---------------------------------------------------------------
-- 7) แดชบอร์ดบุคลากร: จำนวนผู้ดำรงตำแหน่งตามตำแหน่ง และจำนวน จศป. ตามแท่ง ในเขตที่ผู้เรียกดูได้
-- ---------------------------------------------------------------
create function public.personnel_counts()
returns table (grp text, key text, label text, sort_order integer, total integer)
language sql
stable
security definer
set search_path = public
as $$
  with viewable as (select v.id from public.viewable_personnel_units() v)
  select 'position', t.key, t.name, t.sort_order,
         (
           select count(*)::integer
           from public.appointments a
           join public.persons p on p.id = a.person_id and p.is_active
           where a.position_type_key = t.key and a.is_active and a.appointed_on <= current_date
             and (a.ended_on is null or a.ended_on > current_date)
             and a.org_unit_id in (select v.id from viewable v)
         )
  from public.position_types t
  where t.is_active
  union all
  select 'track', k.track, k.track, k.ord,
         (
           select count(*)::integer
           from public.education_staff e
           join public.persons p on p.id = e.person_id and p.is_active
           where e.track = k.track and e.is_active and e.status = 'active'
             and e.org_unit_id in (select v.id from viewable v)
         )
  from (values ('dhamma', 1), ('pali', 2), ('general', 3), ('supervisor', 4)) as k(track, ord)
  order by 1, 4;
$$;

-- ---------------------------------------------------------------
-- 8) ทำเนียบสาธารณะ (/directory/officers): บุคคลทั่วไปเรียกได้
--    คืนเฉพาะ ชื่อ-ฉายา ตำแหน่ง สังกัด (วัดและเขตปกครอง) สถานะ ของผู้ดำรงตำแหน่งปกครองปัจจุบัน
--    ไม่คืนรหัสบุคคล นามสกุล วันเกิด เลขประจำตัวประชาชน เบอร์ติดต่อ รูปถ่าย หรือหมายเหตุ
--    คำขอที่อยู่ระหว่างพิจารณาเป็นเรื่องภายใน สถานะ "อยู่ระหว่างขอย้าย" จึงแสดงเป็น ปฏิบัติหน้าที่
-- ---------------------------------------------------------------
create function public.public_officers(
  p_q text default '',
  p_sect text default null,
  p_level text default null,
  p_region uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  display_name text, person_type text, position_name text, unit_name text, temple_name text,
  status text, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select left(btrim(coalesce(p_q, '')), 100) as text),
  region as (
    select p_region as id where p_region is not null
    union
    select d.id from public.descendants_of(p_region) d where p_region is not null
  ),
  base as (
    select concat_ws(' ', nullif(p.title, ''), p.first_name, nullif(p.monastic_name, '')) as display_name,
           p.person_type, t.name as position_name, u.name as unit_name, p.temple_name,
           case when p.status = 'transfer_pending' then 'active' else p.status end as status,
           u.code, t.sort_order, p.first_name
    from public.appointments a
    join public.persons p on p.id = a.person_id and p.is_active
    join public.position_types t on t.key = a.position_type_key and t.is_active
    join public.org_units u on u.id = a.org_unit_id and u.is_active
    cross join q
    where a.is_active and a.appointed_on <= current_date
      and (a.ended_on is null or a.ended_on > current_date)
      and (p_sect is null or u.sect::text = p_sect)
      and (p_level is null or u.level::text = p_level)
      and (p_region is null or u.id in (select r.id from region r))
      and (
        q.text = ''
        or p.first_name ilike '%' || q.text || '%'
        or p.monastic_name ilike '%' || q.text || '%'
        or p.title ilike '%' || q.text || '%'
        or p.temple_name ilike '%' || q.text || '%'
        or u.name ilike '%' || q.text || '%'
        or t.name ilike '%' || q.text || '%'
      )
  )
  select b.display_name, b.person_type, b.position_name, b.unit_name, b.temple_name, b.status,
         count(*) over ()
  from base b
  order by b.code, b.sort_order, b.first_name
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;
comment on function public.public_officers(text, text, text, uuid, integer, integer) is
  'ทำเนียบผู้ดำรงตำแหน่งปกครองปัจจุบันสำหรับหน้าสาธารณะ: ชื่อ-ฉายา ตำแหน่ง สังกัด สถานะ เท่านั้น';

-- ---------------------------------------------------------------
-- สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke execute on function public.viewable_personnel_units() from public, anon;
revoke execute on function public.personnel_view_roots() from public, anon;
revoke execute on function public.lookup_personnel(text, uuid, text, text, text, text, text, integer, integer) from public, anon;
revoke execute on function public.governance_slots(uuid) from public, anon;
revoke execute on function public.report_directory(uuid) from public, anon;
revoke execute on function public.report_education_staff(uuid) from public, anon;
revoke execute on function public.report_status_summary(uuid) from public, anon;
revoke execute on function public.personnel_counts() from public, anon;
grant execute on function public.viewable_personnel_units() to authenticated;
grant execute on function public.personnel_view_roots() to authenticated;
grant execute on function public.lookup_personnel(text, uuid, text, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.governance_slots(uuid) to authenticated;
grant execute on function public.report_directory(uuid) to authenticated;
grant execute on function public.report_education_staff(uuid) to authenticated;
grant execute on function public.report_status_summary(uuid) to authenticated;
grant execute on function public.personnel_counts() to authenticated;

revoke execute on function public.public_officers(text, text, text, uuid, integer, integer) from public;
grant execute on function public.public_officers(text, text, text, uuid, integer, integer) to anon, authenticated;
