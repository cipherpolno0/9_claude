-- บทที่ 9 (2/3): ทะเบียนสถานที่ (วัด สำนักเรียน สำนักศาสนศึกษา สถานศึกษา องค์กร)

-- ---------------------------------------------------------------
-- 1) ขอบเขตทะเบียนสถานที่ของแต่ละบทบาท (ตั้งได้ที่หน้า สิทธิ์ตามบทบาท แบบเดียวกับทะเบียนบุคคล)
--    none ไม่ได้ / own เฉพาะหน่วยตน / subtree หน่วยตนและหน่วยใต้สังกัด / all ทุกเขต
-- ---------------------------------------------------------------
alter table public.roles
  add column places_view text not null default 'none'
    check (places_view in ('none', 'own', 'subtree', 'all')),
  add column places_edit text not null default 'none'
    check (places_edit in ('none', 'own', 'subtree', 'all'));

update public.roles set places_view = 'all', places_edit = 'all' where key in ('admin', 'central_staff');
update public.roles set places_view = 'subtree', places_edit = 'subtree' where key = 'secretary';
update public.roles set places_view = 'subtree'
 where key in ('chief', 'deputy_chief', 'education_staff', 'school_officer');

alter table public.roles
  add constraint roles_places_edit_within_view
    check (public.personnel_scope_rank(places_edit) <= public.personnel_scope_rank(places_view)),
  add constraint roles_admin_full_places
    check (key <> 'admin' or (places_view = 'all' and places_edit = 'all'));

comment on column public.roles.places_view is 'ขอบเขตการดูทะเบียนสถานที่: none / own / subtree / all';
comment on column public.roles.places_edit is 'ขอบเขตการแก้ไขทะเบียนสถานที่: none / own / subtree / all (ไม่กว้างกว่า places_view)';

create function public.can_view_places(p_org_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org_unit_id is not null and exists (
    select 1
    from public.my_role_rows() m
    join public.roles r on r.key = m.role_key
    where m.effective and (
      r.places_view = 'all'
      or (r.places_view = 'own' and m.org_unit_id = p_org_unit_id)
      or (r.places_view = 'subtree'
          and m.org_unit_id in (select a.id from public.ancestors_or_self(p_org_unit_id) a))
    )
  );
$$;
comment on function public.can_view_places(uuid) is 'ดูทะเบียนสถานที่ของเขตนี้ได้หรือไม่ (ตามขอบเขต roles.places_view)';

create function public.can_edit_places(p_org_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org_unit_id is not null and exists (
    select 1
    from public.my_role_rows() m
    join public.roles r on r.key = m.role_key
    where m.effective and (
      r.places_edit = 'all'
      or (r.places_edit = 'own' and m.org_unit_id = p_org_unit_id)
      or (r.places_edit = 'subtree'
          and m.org_unit_id in (select a.id from public.ancestors_or_self(p_org_unit_id) a))
    )
  );
$$;
comment on function public.can_edit_places(uuid) is 'เพิ่มและแก้ไขทะเบียนสถานที่ของเขตนี้ได้หรือไม่ (ตามขอบเขต roles.places_edit)';

create function public.can_edit_any_places()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.my_role_rows() m
    join public.roles r on r.key = m.role_key
    where m.effective
      and (r.places_edit = 'all' or (r.places_edit in ('own', 'subtree') and m.org_unit_id is not null))
  );
$$;

revoke execute on function public.can_view_places(uuid) from public, anon;
revoke execute on function public.can_edit_places(uuid) from public, anon;
revoke execute on function public.can_edit_any_places() from public, anon;
grant execute on function public.can_view_places(uuid) to authenticated;
grant execute on function public.can_edit_places(uuid) to authenticated;
grant execute on function public.can_edit_any_places() to authenticated;

-- ---------------------------------------------------------------
-- 2) places: สถานที่
--    place_type: temple วัด / samnak_rian สำนักเรียน / samnak_sasanasuksa สำนักศาสนศึกษา /
--                school สถานศึกษา / organization องค์กร
--    status: open เปิดดำเนินการ / dissolved ยุบ / suspended ระงับ
-- ---------------------------------------------------------------
create table public.places (
  id                     uuid primary key default gen_random_uuid(),
  place_type             text not null
                           check (place_type in ('temple', 'samnak_rian', 'samnak_sasanasuksa', 'school', 'organization')),
  code                   text not null unique check (code = btrim(code) and length(code) > 0),
  name                   text not null check (length(btrim(name)) > 0),
  sect                   public.sect,                                               -- นิกาย (สถานศึกษาและองค์กรเว้นว่างได้)
  house_no               text not null default '',                                  -- เลขที่ หมู่
  road                   text not null default '',                                  -- ถนน ซอย
  subdistrict_code       integer references public.civil_subdistricts (code),      -- ตำบล (เขตการปกครองบ้านเมือง)
  district_code          integer references public.civil_districts (code),         -- อำเภอ
  province_code          integer references public.civil_provinces (code),         -- จังหวัด
  postal_code            text not null default '' check (postal_code ~ '^([0-9]{5})?$'),
  org_unit_id            uuid not null references public.org_units (id),            -- เขตปกครองคณะสงฆ์ที่สังกัด
  latitude               numeric(9, 6) check (latitude between -90 and 90),
  longitude              numeric(9, 6) check (longitude between -180 and 180),
  office_phone           text not null default '',                                  -- โทรศัพท์สำนักงาน
  email                  text not null default '',
  responsible_person_id  uuid references public.persons (id),                       -- ผู้รับผิดชอบ
  status                 text not null default 'open' check (status in ('open', 'dissolved', 'suspended')),
  established_on         date,                                                      -- วันที่จัดตั้ง
  parent_place_id        uuid references public.places (id),                        -- วัดที่ตั้ง (สำนักเรียน สำนักศาสนศึกษา)
  note                   text not null default '',
  is_active              boolean not null default true,                             -- ปิดใช้งานแทนการลบ
  created_by             uuid default auth.uid() references public.profiles (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint places_coordinates_pair check ((latitude is null) = (longitude is null)),
  constraint places_not_own_parent check (parent_place_id is distinct from id)
);
comment on table public.places is 'ทะเบียนสถานที่: วัด สำนักเรียน สำนักศาสนศึกษา สถานศึกษา องค์กร สำนักเรียนและสำนักศาสนศึกษาผูกกับวัดที่ตั้งด้วย parent_place_id';
create index places_type_idx on public.places (place_type);
create index places_org_unit_idx on public.places (org_unit_id);
create index places_district_idx on public.places (district_code);
create index places_parent_idx on public.places (parent_place_id);
create index places_name_idx on public.places (name);

create trigger places_set_updated_at before update on public.places
  for each row execute function public.set_updated_at();
create trigger places_audit after insert or update or delete on public.places
  for each row execute function public.audit_row_change();

-- กติกาของแถว: ประเภทแก้ไม่ได้ ที่ตั้งต้องสอดคล้องกัน นิกาย วัดที่ตั้ง และชื่อซ้ำในอำเภอเดียวกัน
create function public.places_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit public.org_units%rowtype;
  v_parent public.places%rowtype;
  v_sub public.civil_subdistricts%rowtype;
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.code := btrim(new.code);

  if tg_op = 'UPDATE' and new.place_type <> old.place_type then
    raise exception 'เปลี่ยนประเภทของสถานที่ไม่ได้ ถ้าบันทึกผิดให้ปิดใช้งานแล้วเพิ่มใหม่' using errcode = '23514';
  end if;

  -- ที่ตั้ง: เลือกตำบลแล้ว อำเภอ จังหวัด และรหัสไปรษณีย์ (ถ้าเว้นว่าง) ถูกกำหนดตามตำบล
  if new.subdistrict_code is not null then
    select * into v_sub from public.civil_subdistricts where code = new.subdistrict_code;
    new.district_code := v_sub.district_code;
    if new.postal_code = '' then new.postal_code := v_sub.postal_code; end if;
  end if;
  if new.district_code is not null then
    new.province_code := new.district_code / 100;
  end if;

  select * into v_unit from public.org_units where id = new.org_unit_id;
  if not found or not v_unit.is_active then
    raise exception 'ไม่พบเขตปกครองคณะสงฆ์ที่เลือก หรือเขตนั้นปิดใช้งานแล้ว' using errcode = '23503';
  end if;

  if new.place_type in ('samnak_rian', 'samnak_sasanasuksa') then
    if new.parent_place_id is null then
      raise exception 'สำนักเรียนและสำนักศาสนศึกษาต้องระบุวัดที่ตั้ง' using errcode = '23514';
    end if;
    select * into v_parent from public.places where id = new.parent_place_id;
    if not found or v_parent.place_type <> 'temple' then
      raise exception 'วัดที่ตั้งต้องเป็นรายการประเภท วัด ในทะเบียน' using errcode = '23514';
    end if;
    if new.sect is null then new.sect := v_parent.sect; end if;
    if new.sect is distinct from v_parent.sect then
      raise exception 'นิกายของสำนักต้องตรงกับนิกายของวัดที่ตั้ง' using errcode = '23514';
    end if;
  elsif new.parent_place_id is not null then
    raise exception 'เฉพาะสำนักเรียนและสำนักศาสนศึกษาเท่านั้นที่ผูกกับวัดที่ตั้ง' using errcode = '23514';
  end if;

  if new.place_type in ('temple', 'samnak_rian', 'samnak_sasanasuksa') and new.sect is null then
    raise exception 'วัด สำนักเรียน และสำนักศาสนศึกษา ต้องระบุนิกาย' using errcode = '23514';
  end if;
  if new.sect is not null and v_unit.sect is not null and new.sect <> v_unit.sect then
    raise exception 'นิกายของสถานที่ไม่ตรงกับนิกายของเขตปกครองคณะสงฆ์ที่สังกัด' using errcode = '23514';
  end if;

  if new.responsible_person_id is not null
     and (tg_op = 'INSERT' or new.responsible_person_id is distinct from old.responsible_person_id)
     and not exists (select 1 from public.persons p where p.id = new.responsible_person_id and p.is_active) then
    raise exception 'ไม่พบผู้รับผิดชอบในทะเบียนบุคคล' using errcode = '23503';
  end if;

  -- ชื่อซ้ำ: ประเภทเดียวกัน ชื่อเดียวกัน ในอำเภอเดียวกัน (นับเฉพาะรายการที่ยังใช้งาน)
  if new.is_active and new.district_code is not null and exists (
    select 1 from public.places p
    where p.id <> new.id and p.is_active and p.place_type = new.place_type
      and p.district_code = new.district_code and p.name = new.name
  ) then
    raise exception 'มี "%" ประเภทเดียวกันในอำเภอนี้อยู่แล้ว', new.name using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.is_active and not new.is_active and new.place_type = 'temple' and exists (
    select 1 from public.places c where c.parent_place_id = new.id and c.is_active
  ) then
    raise exception 'วัดนี้ยังมีสำนักเรียนหรือสำนักศาสนศึกษาที่ใช้งานอยู่ ให้ปิดใช้งานสำนักก่อน' using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke execute on function public.places_check() from public, anon, authenticated;
create trigger places_rules before insert or update on public.places
  for each row execute function public.places_check();

-- RLS: ดูและแก้ไขตามเขตปกครองคณะสงฆ์ที่สังกัด (ขอบเขตตามค่าตั้งของบทบาท) ไม่มีการลบ
alter table public.places enable row level security;
create policy places_read on public.places for select to authenticated
  using (public.can_view_places(org_unit_id));
create policy places_insert on public.places for insert to authenticated
  with check (public.can_edit_places(org_unit_id));
create policy places_update on public.places for update to authenticated
  using (public.can_edit_places(org_unit_id))
  with check (public.can_edit_places(org_unit_id));
revoke all on public.places from anon, authenticated;
grant select, insert, update on public.places to authenticated;

-- ---------------------------------------------------------------
-- 3) รายการสำหรับตารางข้อมูลกลาง (ทำงานในนามผู้ใช้ อยู่ใต้ RLS)
--    ชื่อผู้รับผิดชอบอ่านผ่าน place_responsible_name เพราะผู้ดูทะเบียนสถานที่อาจไม่มีสิทธิ์ดูทะเบียนบุคคล
-- ---------------------------------------------------------------
create function public.place_responsible_name(p_place_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(btrim(concat_ws(' ', nullif(p.title, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, ''))), '')
  from public.places pl
  join public.persons p on p.id = pl.responsible_person_id
  where pl.id = p_place_id and public.can_view_places(pl.org_unit_id);
$$;
comment on function public.place_responsible_name(uuid) is 'ชื่อผู้รับผิดชอบของสถานที่ (เฉพาะชื่อ) สำหรับผู้ที่ดูสถานที่นั้นได้';

create function public.list_places(
  p_type text,
  p_q text default '',
  p_unit uuid default null,
  p_province integer default null,
  p_status text default null,
  p_sort text default 'name',
  p_dir text default 'asc',
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid, place_type text, code text, name text, sect public.sect,
  house_no text, road text, subdistrict_name text, subdistrict_prefix text,
  district_name text, district_prefix text, province_name text, postal_code text,
  org_unit_id uuid, org_unit_name text, org_unit_code text,
  latitude numeric, longitude numeric, office_phone text, email text,
  responsible_name text, status text, established_on date,
  parent_place_id uuid, parent_name text, parent_code text, is_active boolean, total_count bigint
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
  base as (
    select pl.id, pl.place_type, pl.code, pl.name, pl.sect, pl.house_no, pl.road,
           s.name as subdistrict_name, s.prefix as subdistrict_prefix,
           d.name as district_name, d.prefix as district_prefix, pv.name as province_name, pl.postal_code,
           pl.org_unit_id, u.name as org_unit_name, u.code as org_unit_code,
           pl.latitude, pl.longitude, pl.office_phone, pl.email,
           case when pl.responsible_person_id is null then null else public.place_responsible_name(pl.id) end
             as responsible_name,
           pl.status, pl.established_on, pl.parent_place_id, par.name as parent_name, par.code as parent_code,
           pl.is_active
    from public.places pl
    join public.org_units u on u.id = pl.org_unit_id
    left join public.civil_subdistricts s on s.code = pl.subdistrict_code
    left join public.civil_districts d on d.code = pl.district_code
    left join public.civil_provinces pv on pv.code = pl.province_code
    left join public.places par on par.id = pl.parent_place_id
    where pl.place_type = p_type
      and (case when p_status = 'inactive' then not pl.is_active else pl.is_active end)
      and (p_status is null or p_status = 'inactive' or pl.status = p_status)
      and (p_province is null or pl.province_code = p_province)
      and (p_unit is null or pl.org_unit_id in (select sc.id from scope sc))
      and (
        coalesce(p_q, '') = ''
        or pl.name ilike '%' || p_q || '%'
        or pl.code ilike '%' || p_q || '%'
        or par.name ilike '%' || p_q || '%'
      )
  )
  select b.*, count(*) over () as total_count
  from base b
  order by
    case when p_sort = 'name' and p_dir = 'asc' then b.name end asc,
    case when p_sort = 'name' and p_dir = 'desc' then b.name end desc,
    case when p_sort = 'code' and p_dir = 'asc' then b.code end asc,
    case when p_sort = 'code' and p_dir = 'desc' then b.code end desc,
    case when p_sort = 'unit' and p_dir = 'asc' then b.org_unit_code end asc,
    case when p_sort = 'unit' and p_dir = 'desc' then b.org_unit_code end desc,
    case when p_sort = 'status' and p_dir = 'asc' then b.status end asc,
    case when p_sort = 'status' and p_dir = 'desc' then b.status end desc,
    b.name, b.id
  limit greatest(1, least(coalesce(p_limit, 10), 10000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- จำนวนของแต่ละประเภท (แสดงบนแท็บ) เท่าที่ผู้เรียกมีสิทธิ์เห็น
create function public.place_type_counts()
returns table (place_type text, total bigint)
language sql
stable
set search_path = public
as $$
  select pl.place_type, count(*) from public.places pl where pl.is_active group by pl.place_type;
$$;

-- ประวัติการแก้ไขของสถานที่ สำหรับผู้ที่ดูสถานที่นั้นได้ (audit_logs เปิดให้เฉพาะผู้ดูแลระบบ)
create function public.place_history(p_place_id uuid)
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
  where l.table_name = 'places' and l.row_id = p_place_id::text
    and exists (select 1 from public.places pl where pl.id = p_place_id and public.can_view_places(pl.org_unit_id))
  order by l.created_at desc, l.id desc
  limit 200;
$$;

revoke execute on function public.place_responsible_name(uuid) from public, anon;
revoke execute on function public.list_places(text, text, uuid, integer, text, text, text, integer, integer) from public, anon;
revoke execute on function public.place_type_counts() from public, anon;
revoke execute on function public.place_history(uuid) from public, anon;
grant execute on function public.place_responsible_name(uuid) to authenticated;
grant execute on function public.list_places(text, text, uuid, integer, text, text, text, integer, integer) to authenticated;
grant execute on function public.place_type_counts() to authenticated;
grant execute on function public.place_history(uuid) to authenticated;

-- ---------------------------------------------------------------
-- 4) ไฟล์แนบของสถานที่ (entity_table = places): ใช้สิทธิ์ทะเบียนสถานที่ และกำหนดเขตจากรายการที่แนบ
-- ---------------------------------------------------------------
create or replace function public.attachments_personnel_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit uuid;
begin
  if new.entity_table in ('persons', 'person_photos') then
    select org_unit_id into v_unit from public.persons where id::text = new.entity_id;
  elsif new.entity_table = 'appointments' then
    select org_unit_id into v_unit from public.appointments where id::text = new.entity_id;
  elsif new.entity_table = 'education_staff' then
    select org_unit_id into v_unit from public.education_staff where id::text = new.entity_id;
  elsif new.entity_table = 'requests' then
    select org_unit_id into v_unit from public.requests where id::text = new.entity_id;
  elsif new.entity_table = 'places' then
    select org_unit_id into v_unit from public.places where id::text = new.entity_id;
  else
    return new;
  end if;
  if v_unit is null then
    raise exception 'ไม่พบรายการที่จะแนบไฟล์' using errcode = '23503';
  end if;
  new.org_unit_id := v_unit;
  return new;
end;
$$;

alter policy attachments_read on public.attachments
  using (
    case
      when public.is_personnel_entity(entity_table) then public.can_view_personnel(org_unit_id)
      when entity_table = 'places' then public.can_view_places(org_unit_id)
      when entity_table = 'requests' then
        uploaded_by = auth.uid()
        or exists (select 1 from public.requests r where r.id::text = attachments.entity_id)
      else uploaded_by = auth.uid() or public.has_role('admin') or public.can_access(org_unit_id)
    end
  );
alter policy attachments_insert on public.attachments
  with check (
    uploaded_by = auth.uid()
    and storage_path like auth.uid()::text || '/%'
    and case
      when public.is_personnel_entity(entity_table) then public.can_edit_personnel(org_unit_id)
      when entity_table = 'places' then public.can_edit_places(org_unit_id)
      when entity_table = 'requests' then
        exists (
          select 1 from public.requests r
          where r.id::text = attachments.entity_id and r.requester_id = auth.uid()
        )
      else org_unit_id is null or public.can_access(org_unit_id)
    end
  );
alter policy attachments_update on public.attachments
  using (
    case
      when public.is_personnel_entity(entity_table) then public.can_edit_personnel(org_unit_id)
      when entity_table = 'places' then public.can_edit_places(org_unit_id)
      else uploaded_by = auth.uid() or public.has_role('admin')
    end
  )
  with check (
    case
      when public.is_personnel_entity(entity_table) then public.can_edit_personnel(org_unit_id)
      when entity_table = 'places' then public.can_edit_places(org_unit_id)
      else uploaded_by = auth.uid() or public.has_role('admin')
    end
  );
