-- บทที่ 6 (1/2): ทะเบียน จศป. ครบทุกแท่ง และการผูกบัญชีผู้ใช้กับทะเบียนบุคคล
-- แท่ง (track): dhamma แผนกธรรม / pali แผนกบาลี / general แผนกสามัญ / supervisor ปริยัตินิเทศก์

-- ---------------------------------------------------------------
-- persons.user_id: บัญชีผู้ใช้ของบุคคลนี้ (ใช้กับหน้า "ประวัติของฉัน" /app/me)
-- ---------------------------------------------------------------
alter table public.persons add column user_id uuid unique references public.profiles (id);
comment on column public.persons.user_id is 'บัญชีผู้ใช้ที่ผูกกับบุคคลนี้ (หนึ่งบัญชีต่อหนึ่งบุคคล)';
grant select (user_id) on public.persons to authenticated;

-- ---------------------------------------------------------------
-- education_position_types: ประเภทตำแหน่งในแต่ละแท่ง (ตารางตั้งค่า ผู้ดูแลระบบแก้ไขได้)
-- ---------------------------------------------------------------
create table public.education_position_types (
  id          uuid primary key default gen_random_uuid(),
  track       text not null check (track in ('dhamma', 'pali', 'general', 'supervisor')),
  name        text not null check (length(btrim(name)) > 0),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint education_position_types_name unique (track, name)
);
comment on table public.education_position_types is 'ประเภทตำแหน่งของ จศป. แยกตามแท่ง ผู้ดูแลระบบเพิ่มและแก้ไขได้';

create trigger education_position_types_set_updated_at before update on public.education_position_types
  for each row execute function public.set_updated_at();
create trigger education_position_types_audit after insert or update or delete on public.education_position_types
  for each row execute function public.audit_row_change();

alter table public.education_position_types enable row level security;
revoke all on public.education_position_types from anon;
revoke delete, truncate on public.education_position_types from authenticated;
create policy education_position_types_read on public.education_position_types
  for select to authenticated using (true);
create policy education_position_types_admin_insert on public.education_position_types
  for insert to authenticated with check (public.has_role('admin'));
create policy education_position_types_admin_update on public.education_position_types
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---------------------------------------------------------------
-- education_staff: จศป. หนึ่งแถว = บุคคลหนึ่งรูปหรือคน ในแท่งหนึ่ง ที่สำนักหนึ่ง
-- บุคคลเดียวมีได้หลายแถว (หลายแท่ง หลายสำนัก) และดำรงตำแหน่งปกครองควบได้ (ตาราง appointments แยกกัน)
-- school_type: samnak_rian สำนักเรียน / samnak_sasanasuksa สำนักศาสนศึกษา / school โรงเรียน
-- status: active ปฏิบัติหน้าที่ / suspended พักหน้าที่ / ended พ้นหน้าที่
-- ---------------------------------------------------------------
create table public.education_staff (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid not null references public.persons (id),
  track             text not null check (track in ('dhamma', 'pali', 'general', 'supervisor')),
  position_type_id  uuid not null references public.education_position_types (id),
  school_name       text not null default '',          -- สำนักเรียน สำนักศาสนศึกษา หรือโรงเรียนที่ปฏิบัติหน้าที่
  school_type       text not null default ''
                      check (school_type in ('', 'samnak_rian', 'samnak_sasanasuksa', 'school')),
  org_unit_id       uuid not null references public.org_units (id),   -- เขตที่รับผิดชอบ
  started_on        date,                              -- วันที่เริ่ม
  order_no          text not null default '',          -- เลขที่คำสั่งแต่งตั้ง (ไฟล์แนบอยู่ในตาราง attachments)
  subjects          text not null default '',          -- วิชาที่สอน
  status            text not null default 'active' check (status in ('active', 'suspended', 'ended')),
  ended_on          date,                              -- วันที่พ้นหน้าที่
  note              text not null default '',
  is_active         boolean not null default true,     -- ปิดใช้งาน = ยกเลิกรายการที่บันทึกผิด
  created_by        uuid default auth.uid() references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint education_staff_ended check (ended_on is null or status = 'ended'),
  constraint education_staff_dates check (ended_on is null or started_on is null or ended_on >= started_on)
);
comment on table public.education_staff is 'ทะเบียน จศป. ทุกแท่ง ผูกกับ persons';
create index education_staff_person_idx on public.education_staff (person_id);
create index education_staff_track_unit_idx on public.education_staff (track, org_unit_id);

create function public.education_staff_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.education_position_types%rowtype;
  v_unit public.org_units%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.person_id <> old.person_id or new.track <> old.track then
      raise exception 'เปลี่ยนบุคคลหรือแท่งของรายการที่บันทึกแล้วไม่ได้ ให้ยกเลิกรายการนี้แล้วเพิ่มรายการใหม่' using errcode = '23514';
    end if;
    if not old.is_active and new.is_active then
      raise exception 'รายการที่ยกเลิกแล้วนำกลับมาใช้ไม่ได้ กรุณาเพิ่มรายการใหม่' using errcode = '23514';
    end if;
  end if;
  if not new.is_active then
    return new;
  end if;

  select * into v_type from public.education_position_types where id = new.position_type_id;
  if v_type.track <> new.track then
    raise exception 'ประเภทตำแหน่งที่เลือกไม่ได้อยู่ในแท่งนี้' using errcode = '23514';
  end if;
  if not v_type.is_active and (tg_op = 'INSERT' or new.position_type_id <> old.position_type_id) then
    raise exception 'ประเภทตำแหน่งนี้ถูกปิดใช้งานอยู่' using errcode = '23514';
  end if;

  select * into v_unit from public.org_units where id = new.org_unit_id;
  if v_unit.level = 'central' then
    raise exception 'เขตที่รับผิดชอบต้องเป็นระดับภาค จังหวัด อำเภอ หรือตำบล' using errcode = '23514';
  end if;
  if not v_unit.is_active and (tg_op = 'INSERT' or new.org_unit_id <> old.org_unit_id) then
    raise exception 'เขตปกครองนี้ถูกปิดใช้งานอยู่' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and not exists (select 1 from public.persons p where p.id = new.person_id and p.is_active) then
    raise exception 'บุคคลนี้ถูกปิดใช้งานอยู่ในทะเบียน' using errcode = '23514';
  end if;
  if new.started_on is not null and new.started_on > current_date + 366 then
    raise exception 'วันที่เริ่มอยู่ไกลเกินไปในอนาคต กรุณาตรวจปี พ.ศ.' using errcode = '23514';
  end if;
  if new.ended_on is not null and new.ended_on > current_date then
    raise exception 'วันที่พ้นหน้าที่ต้องไม่เป็นวันในอนาคต' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.education_staff_check() from public, anon, authenticated;

create trigger education_staff_rules before insert or update on public.education_staff
  for each row execute function public.education_staff_check();
create trigger education_staff_set_updated_at before update on public.education_staff
  for each row execute function public.set_updated_at();
create trigger education_staff_audit after insert or update or delete on public.education_staff
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- มองเห็นบุคคลนี้ได้หรือไม่ (เพิ่ม: เจ้าของบัญชีเห็นประวัติของตนเอง และผู้ดูแลเขตที่บุคคลนั้นเป็น จศป.)
-- ---------------------------------------------------------------
create or replace function public.can_view_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.persons p
    where p.id = p_person_id
      and (
        p.user_id = auth.uid()
        or public.can_view_personnel(p.org_unit_id)
        or exists (
          select 1 from public.appointments a
          where a.person_id = p.id and a.is_active and public.can_view_personnel(a.org_unit_id)
        )
        or exists (
          select 1 from public.education_staff e
          where e.person_id = p.id and e.is_active and public.can_view_personnel(e.org_unit_id)
        )
      )
  );
$$;

alter table public.education_staff enable row level security;
revoke all on public.education_staff from anon;
revoke delete, truncate on public.education_staff from authenticated;

create policy education_staff_read on public.education_staff for select to authenticated
  using (public.can_view_personnel(org_unit_id) or public.can_view_person(person_id));
create policy education_staff_insert on public.education_staff for insert to authenticated
  with check (public.can_edit_personnel(org_unit_id) and public.can_view_person(person_id));
create policy education_staff_update on public.education_staff for update to authenticated
  using (public.can_edit_personnel(org_unit_id))
  with check (public.can_edit_personnel(org_unit_id));

-- ---------------------------------------------------------------
-- ผูกหรือเลิกผูกบัญชีผู้ใช้กับบุคคล (อีเมลว่าง = เลิกผูก)
-- ทำได้เฉพาะผู้ที่แก้ไขบุคคลนั้นได้ และบัญชีต้องอยู่ในเขตที่ตนดูแล
-- ---------------------------------------------------------------
create function public.link_person_user(p_person_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.persons%rowtype;
  v_user uuid;
begin
  select * into v_person from public.persons where id = p_person_id for update;
  if not found or not public.can_edit_personnel(v_person.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์แก้ไขบุคคลนี้' using errcode = '42501';
  end if;

  if coalesce(btrim(p_email), '') = '' then
    update public.persons set user_id = null where id = p_person_id;
    return;
  end if;

  select id into v_user from public.profiles
  where lower(email) = lower(btrim(p_email)) and status = 'active';
  -- ข้อความเดียวกันทั้งกรณีไม่พบและกรณีอยู่นอกเขต เพื่อไม่ให้ใช้ตรวจว่าอีเมลใดมีบัญชี
  if v_user is null or not (public.has_role('admin') or public.can_review_user(v_user)) then
    raise exception 'ไม่พบบัญชีผู้ใช้ที่ใช้งานอยู่ด้วยอีเมลนี้ในเขตที่ท่านดูแล' using errcode = '23514';
  end if;
  if exists (select 1 from public.persons where user_id = v_user and id <> p_person_id) then
    raise exception 'บัญชีนี้ผูกกับบุคคลอื่นในทะเบียนอยู่แล้ว' using errcode = '23514';
  end if;

  update public.persons set user_id = v_user where id = p_person_id;
  perform public.notify_user(
    v_user, 'บัญชีของท่านผูกกับทะเบียนบุคคลแล้ว',
    'ท่านดูประวัติของตนเองและขอแก้ไขข้อมูลได้ที่หน้า ประวัติของฉัน', '/app/me'
  );
end;
$$;
revoke execute on function public.link_person_user(uuid, text) from public, anon;
grant execute on function public.link_person_user(uuid, text) to authenticated;

-- ---------------------------------------------------------------
-- ไฟล์แนบของข้อมูลบุคคล: รวมชื่อตารางไว้ที่ฟังก์ชันเดียว (เพิ่มตารางใหม่ให้แก้ที่นี่ที่เดียว)
-- และไฟล์แนบของคำขอ: เห็นได้เมื่อเห็นคำขอนั้น แนบได้เฉพาะผู้ยื่น
-- ---------------------------------------------------------------
create function public.is_personnel_entity(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table in ('persons', 'person_photos', 'appointments', 'education_staff');
$$;
revoke execute on function public.is_personnel_entity(text) from public, anon;
grant execute on function public.is_personnel_entity(text) to authenticated;

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
      else uploaded_by = auth.uid() or public.has_role('admin')
    end
  )
  with check (
    case
      when public.is_personnel_entity(entity_table) then public.can_edit_personnel(org_unit_id)
      else uploaded_by = auth.uid() or public.has_role('admin')
    end
  );

-- ---------------------------------------------------------------
-- ประวัติการแก้ไขของบุคคล: รวมรายการ จศป. ของบุคคลนั้นด้วย
-- ---------------------------------------------------------------
create or replace function public.personnel_history(p_person_id uuid)
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
         l.old_data - 'national_id_enc' - 'national_id_hash' - 'created_by',
         l.new_data - 'national_id_enc' - 'national_id_hash' - 'created_by',
         l.created_at,
         nullif(btrim(concat_ws(' ', pr.title_prefix, pr.first_name, pr.monastic_name, pr.last_name)), '')
  from public.audit_logs l
  left join public.profiles pr on pr.id = l.actor_id
  where public.can_view_person(p_person_id)
    and (
      (l.table_name = 'persons' and l.row_id = p_person_id::text)
      or (l.table_name = 'appointments' and l.row_id in (
        select a.id::text from public.appointments a where a.person_id = p_person_id
      ))
      or (l.table_name = 'education_staff' and l.row_id in (
        select e.id::text from public.education_staff e where e.person_id = p_person_id
      ))
    )
  order by l.created_at desc, l.id desc
  limit 200;
$$;

-- ---------------------------------------------------------------
-- รายชื่อ จศป. สำหรับตารางข้อมูลกลาง (ทำงานในนามผู้ใช้ อยู่ใต้ RLS)
-- p_status: active / suspended / ended / inactive (รายการที่ยกเลิก)
-- ---------------------------------------------------------------
create function public.list_education_staff(
  p_track text,
  p_q text default '',
  p_unit uuid default null,
  p_school text default null,
  p_status text default null,
  p_sort text default 'name',
  p_dir text default 'asc',
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid, person_id uuid, person_type text, title text, first_name text, monastic_name text, last_name text,
  track text, position_name text, school_name text, school_type text,
  org_unit_id uuid, org_unit_name text, org_unit_code text,
  started_on date, order_no text, subjects text, status text, is_active boolean, total_count bigint
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
    select e.id, e.person_id, p.person_type, p.title, p.first_name, p.monastic_name, p.last_name,
           e.track, t.name as position_name, e.school_name, e.school_type,
           e.org_unit_id, u.name as org_unit_name, u.code as org_unit_code,
           e.started_on, e.order_no, e.subjects, e.status, e.is_active
    from public.education_staff e
    join public.persons p on p.id = e.person_id
    join public.education_position_types t on t.id = e.position_type_id
    join public.org_units u on u.id = e.org_unit_id
    where e.track = p_track
      and (case when p_status = 'inactive' then not e.is_active else e.is_active end)
      and (p_status is null or p_status = 'inactive' or e.status = p_status)
      and (p_unit is null or e.org_unit_id in (select s.id from scope s))
      and (p_school is null or e.school_name = p_school)
      and (
        coalesce(p_q, '') = ''
        or p.first_name ilike '%' || p_q || '%'
        or p.monastic_name ilike '%' || p_q || '%'
        or p.last_name ilike '%' || p_q || '%'
        or e.school_name ilike '%' || p_q || '%'
        or e.subjects ilike '%' || p_q || '%'
      )
  )
  select b.*, count(*) over () as total_count
  from base b
  order by
    case when p_sort = 'name' and p_dir = 'asc' then b.first_name end asc,
    case when p_sort = 'name' and p_dir = 'desc' then b.first_name end desc,
    case when p_sort = 'school' and p_dir = 'asc' then b.school_name end asc,
    case when p_sort = 'school' and p_dir = 'desc' then b.school_name end desc,
    case when p_sort = 'unit' and p_dir = 'asc' then b.org_unit_code end asc,
    case when p_sort = 'unit' and p_dir = 'desc' then b.org_unit_code end desc,
    case when p_sort = 'started' and p_dir = 'asc' then b.started_on end asc nulls last,
    case when p_sort = 'started' and p_dir = 'desc' then b.started_on end desc nulls last,
    b.first_name, b.last_name, b.id
  limit greatest(1, least(coalesce(p_limit, 10), 10000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- จำนวน จศป. ที่ปฏิบัติหน้าที่อยู่ ต่อเขตที่รับผิดชอบ (ของแท่งหนึ่ง)
create function public.education_staff_counts(p_track text, p_unit uuid default null)
returns table (org_unit_id uuid, org_unit_name text, org_unit_code text, level public.org_level, staff_count bigint)
language sql
stable
set search_path = public
as $$
  with scope as (
    select p_unit as id where p_unit is not null
    union
    select d.id from public.descendants_of(p_unit) d where p_unit is not null
  )
  select u.id, u.name, u.code, u.level, count(*)
  from public.education_staff e
  join public.org_units u on u.id = e.org_unit_id
  where e.track = p_track and e.is_active and e.status = 'active'
    and (p_unit is null or e.org_unit_id in (select s.id from scope s))
  group by u.id, u.name, u.code, u.level
  order by u.code;
$$;

-- รายชื่อสำนักที่มี จศป. ของแท่งหนึ่ง (ใช้เป็นตัวกรอง)
create function public.education_schools(p_track text)
returns table (school_name text)
language sql
stable
set search_path = public
as $$
  select distinct e.school_name
  from public.education_staff e
  where e.track = p_track and e.is_active and e.school_name <> ''
  order by e.school_name
  limit 500;
$$;

revoke execute on function public.list_education_staff(text, text, uuid, text, text, text, text, integer, integer) from public, anon;
revoke execute on function public.education_staff_counts(text, uuid) from public, anon;
revoke execute on function public.education_schools(text) from public, anon;
grant execute on function public.list_education_staff(text, text, uuid, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.education_staff_counts(text, uuid) to authenticated;
grant execute on function public.education_schools(text) to authenticated;
