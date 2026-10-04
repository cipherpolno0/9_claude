-- บทที่ 10 (1/2): ทะเบียนสนามสอบ ประธานสนามสอบ ผู้รับข้อสอบ

-- ---------------------------------------------------------------
-- 1) ขอบเขตทะเบียนสนามสอบของแต่ละบทบาท (ตั้งแยกจากทะเบียนสถานที่ ที่หน้า สิทธิ์ตามบทบาท)
--    none ไม่ได้ / own เฉพาะหน่วยตน / subtree หน่วยตนและหน่วยใต้สังกัด / all ทุกเขต
-- ---------------------------------------------------------------
alter table public.roles
  add column venues_view text not null default 'none'
    check (venues_view in ('none', 'own', 'subtree', 'all')),
  add column venues_edit text not null default 'none'
    check (venues_edit in ('none', 'own', 'subtree', 'all'));

update public.roles set venues_view = 'all', venues_edit = 'all' where key in ('admin', 'central_staff');
update public.roles set venues_view = 'subtree', venues_edit = 'subtree' where key = 'secretary';
update public.roles set venues_view = 'subtree' where key in ('chief', 'deputy_chief');

alter table public.roles
  add constraint roles_venues_edit_within_view
    check (public.personnel_scope_rank(venues_edit) <= public.personnel_scope_rank(venues_view)),
  add constraint roles_admin_full_venues
    check (key <> 'admin' or (venues_view = 'all' and venues_edit = 'all'));

comment on column public.roles.venues_view is 'ขอบเขตการดูทะเบียนสนามสอบ: none / own / subtree / all';
comment on column public.roles.venues_edit is 'ขอบเขตการแก้ไขทะเบียนสนามสอบ: none / own / subtree / all (ไม่กว้างกว่า venues_view)';

create function public.can_view_venues(p_org_unit_id uuid)
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
      r.venues_view = 'all'
      or (r.venues_view = 'own' and m.org_unit_id = p_org_unit_id)
      or (r.venues_view = 'subtree'
          and m.org_unit_id in (select a.id from public.ancestors_or_self(p_org_unit_id) a))
    )
  );
$$;
comment on function public.can_view_venues(uuid) is 'ดูทะเบียนสนามสอบของเขตนี้ได้หรือไม่ (ตามขอบเขต roles.venues_view)';

create function public.can_edit_venues(p_org_unit_id uuid)
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
      r.venues_edit = 'all'
      or (r.venues_edit = 'own' and m.org_unit_id = p_org_unit_id)
      or (r.venues_edit = 'subtree'
          and m.org_unit_id in (select a.id from public.ancestors_or_self(p_org_unit_id) a))
    )
  );
$$;
comment on function public.can_edit_venues(uuid) is 'เพิ่มและแก้ไขทะเบียนสนามสอบของเขตนี้ได้หรือไม่ (ตามขอบเขต roles.venues_edit)';

create function public.can_edit_any_venues()
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
      and (r.venues_edit = 'all' or (r.venues_edit in ('own', 'subtree') and m.org_unit_id is not null))
  );
$$;

revoke execute on function public.can_view_venues(uuid) from public, anon;
revoke execute on function public.can_edit_venues(uuid) from public, anon;
revoke execute on function public.can_edit_any_venues() from public, anon;
grant execute on function public.can_view_venues(uuid) to authenticated;
grant execute on function public.can_edit_venues(uuid) to authenticated;
grant execute on function public.can_edit_any_venues() to authenticated;

-- ---------------------------------------------------------------
-- 2) ปีการศึกษาปัจจุบัน: ตั้งได้เฉพาะผู้ดูแลระบบ (มีปีปัจจุบันได้ปีเดียว จึงต้องยกเลิกปีเดิมก่อน)
-- ---------------------------------------------------------------
create function public.set_current_academic_year(p_year_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งปีการศึกษาปัจจุบันได้' using errcode = '42501';
  end if;
  if not exists (select 1 from public.academic_years where id = p_year_id) then
    raise exception 'ไม่พบปีการศึกษานี้' using errcode = 'P0001';
  end if;
  update public.academic_years set is_current = false where is_current and id <> p_year_id;
  update public.academic_years set is_current = true where id = p_year_id and not is_current;
end;
$$;
revoke execute on function public.set_current_academic_year(uuid) from public, anon;
grant execute on function public.set_current_academic_year(uuid) to authenticated;

-- ---------------------------------------------------------------
-- 3) exam_venues: สนามสอบ
--    venue_type: nak_tham นักธรรม / tham_sueksa ธรรมศึกษา
--    levels: ชั้นที่เปิดสอบ tri ตรี / tho โท / ek เอก
--    status: open เปิด / closed ปิด / moved ย้าย (ระบุสนามสอบที่ย้ายไปได้)
-- ---------------------------------------------------------------
create table public.exam_venues (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code = btrim(code) and length(code) > 0),
  name               text not null check (length(btrim(name)) > 0),
  venue_type         text not null check (venue_type in ('nak_tham', 'tham_sueksa')),
  place_id           uuid not null references public.places (id),          -- สถานที่ตั้ง
  org_unit_id        uuid not null references public.org_units (id),       -- เขตปกครองคณะสงฆ์ที่สังกัด
  levels             text[] not null
                       check (cardinality(levels) > 0 and levels <@ array['tri', 'tho', 'ek']),
  capacity           integer check (capacity between 0 and 100000),        -- ความจุ (จำนวนผู้เข้าสอบ)
  status             text not null default 'open' check (status in ('open', 'closed', 'moved')),
  moved_to_venue_id  uuid references public.exam_venues (id),              -- สนามสอบที่ย้ายไป (เมื่อสถานะ ย้าย)
  start_year_be      integer check (start_year_be between 2400 and 2700),  -- ปีการศึกษาที่เริ่มใช้ (พ.ศ.)
  note               text not null default '',
  is_active          boolean not null default true,                        -- ปิดใช้งานแทนการลบ
  created_by         uuid default auth.uid() references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint exam_venues_not_moved_to_self check (moved_to_venue_id is distinct from id),
  constraint exam_venues_moved_only check (moved_to_venue_id is null or status = 'moved')
);
comment on table public.exam_venues is 'ทะเบียนสนามสอบ นักธรรม และ ธรรมศึกษา ตั้งอยู่ที่สถานที่ในทะเบียน places';
create index exam_venues_type_idx on public.exam_venues (venue_type);
create index exam_venues_org_unit_idx on public.exam_venues (org_unit_id);
create index exam_venues_place_idx on public.exam_venues (place_id);
create index exam_venues_name_idx on public.exam_venues (name);

create trigger exam_venues_set_updated_at before update on public.exam_venues
  for each row execute function public.set_updated_at();
create trigger exam_venues_audit after insert or update or delete on public.exam_venues
  for each row execute function public.audit_row_change();

create function public.exam_venues_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit public.org_units%rowtype;
  v_target public.exam_venues%rowtype;
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.code := btrim(new.code);
  -- ชั้นที่เปิดสอบ: ตัดค่าซ้ำและเรียง ตรี โท เอก
  new.levels := array(
    select l from unnest(array['tri', 'tho', 'ek']) with ordinality as o(l, n)
    where l = any (new.levels) order by n
  );

  select * into v_unit from public.org_units where id = new.org_unit_id;
  if not found or not v_unit.is_active then
    raise exception 'ไม่พบเขตปกครองคณะสงฆ์ที่เลือก หรือเขตนั้นปิดใช้งานแล้ว' using errcode = '23503';
  end if;

  if (tg_op = 'INSERT' or new.place_id is distinct from old.place_id)
     and not exists (select 1 from public.places p where p.id = new.place_id and p.is_active) then
    raise exception 'ไม่พบสถานที่ตั้งในทะเบียนสถานที่ หรือสถานที่นั้นปิดใช้งานแล้ว' using errcode = '23503';
  end if;

  if new.status <> 'moved' then
    new.moved_to_venue_id := null;
  elsif new.moved_to_venue_id is not null then
    select * into v_target from public.exam_venues where id = new.moved_to_venue_id;
    if not found or not v_target.is_active then
      raise exception 'ไม่พบสนามสอบที่ย้ายไป' using errcode = '23503';
    end if;
    if v_target.venue_type <> new.venue_type then
      raise exception 'สนามสอบที่ย้ายไปต้องเป็นประเภทเดียวกัน' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function public.exam_venues_check() from public, anon, authenticated;
create trigger exam_venues_rules before insert or update on public.exam_venues
  for each row execute function public.exam_venues_check();

alter table public.exam_venues enable row level security;
create policy exam_venues_read on public.exam_venues for select to authenticated
  using (public.can_view_venues(org_unit_id));
create policy exam_venues_insert on public.exam_venues for insert to authenticated
  with check (public.can_edit_venues(org_unit_id));
create policy exam_venues_update on public.exam_venues for update to authenticated
  using (public.can_edit_venues(org_unit_id))
  with check (public.can_edit_venues(org_unit_id));
revoke all on public.exam_venues from anon, authenticated;
grant select, insert, update on public.exam_venues to authenticated;

-- ---------------------------------------------------------------
-- 4) venue_officers: ประธานสนามสอบและผู้รับข้อสอบ ต่อสนามสอบต่อปีการศึกษา (อย่างละ 1)
--    role: chair ประธานสนามสอบ / receiver ผู้รับข้อสอบ
--    is_public: ยอมให้เผยแพร่ต่อสาธารณะหรือไม่ (ค่าเริ่มต้น ไม่เผยแพร่)
-- ---------------------------------------------------------------
create table public.venue_officers (
  id                uuid primary key default gen_random_uuid(),
  venue_id          uuid not null references public.exam_venues (id),
  academic_year_id  uuid not null references public.academic_years (id),
  role              text not null check (role in ('chair', 'receiver')),
  person_id         uuid not null references public.persons (id),
  delivery_address  text not null default '',                              -- ที่อยู่สำหรับจัดส่งข้อสอบ
  contact_phone     text not null default '' check (contact_phone ~ '^[0-9 +()-]*$'),
  is_public         boolean not null default false,
  note              text not null default '',
  is_active         boolean not null default true,                         -- ปิดใช้งานแทนการลบ
  copied_from_id    uuid references public.venue_officers (id),            -- แถวของปีก่อนที่คัดลอกมา
  created_by        uuid default auth.uid() references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.venue_officers is 'ประธานสนามสอบและผู้รับข้อสอบ ของสนามสอบแต่ละแห่งในแต่ละปีการศึกษา ที่อยู่จัดส่งและเบอร์ติดต่อไม่เผยแพร่ต่อสาธารณะ เว้นแต่ is_public';
create unique index venue_officers_one_per_role
  on public.venue_officers (venue_id, academic_year_id, role) where is_active;
create index venue_officers_person_idx on public.venue_officers (person_id);
create index venue_officers_year_idx on public.venue_officers (academic_year_id);

create trigger venue_officers_set_updated_at before update on public.venue_officers
  for each row execute function public.set_updated_at();
create trigger venue_officers_audit after insert or update or delete on public.venue_officers
  for each row execute function public.audit_row_change();

create function public.venue_officers_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.delivery_address := btrim(new.delivery_address);
  new.contact_phone := btrim(new.contact_phone);
  if tg_op = 'UPDATE' and (new.venue_id <> old.venue_id or new.academic_year_id <> old.academic_year_id
                           or new.role <> old.role) then
    raise exception 'เปลี่ยนสนามสอบ ปีการศึกษา หรือบทบาทของรายการเดิมไม่ได้ ให้นำออกแล้วเพิ่มใหม่' using errcode = '23514';
  end if;
  if (tg_op = 'INSERT' or new.person_id is distinct from old.person_id)
     and not exists (select 1 from public.persons p where p.id = new.person_id and p.is_active) then
    raise exception 'ไม่พบบุคคลนี้ในทะเบียนบุคคล' using errcode = '23503';
  end if;
  -- เลือกได้เฉพาะบุคคลที่ผู้บันทึกมีสิทธิ์ดูในทะเบียนบุคคล (แถวที่คัดลอกจากปีก่อนใช้บุคคลเดิม จึงไม่ตรวจซ้ำ)
  if auth.uid() is not null
     and (tg_op = 'INSERT' or new.person_id is distinct from old.person_id)
     and not (tg_op = 'INSERT' and exists (
       select 1 from public.venue_officers s where s.id = new.copied_from_id and s.person_id = new.person_id))
     and not public.can_view_person(new.person_id) then
    raise exception 'ท่านไม่มีสิทธิ์ดูบุคคลนี้ในทะเบียนบุคคล จึงเลือกเป็นประธานสนามสอบหรือผู้รับข้อสอบไม่ได้' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.exam_venues v where v.id = new.venue_id and v.is_active) then
    raise exception 'ไม่พบสนามสอบ หรือสนามสอบนี้ปิดใช้งานแล้ว' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke execute on function public.venue_officers_check() from public, anon, authenticated;
create trigger venue_officers_rules before insert or update on public.venue_officers
  for each row execute function public.venue_officers_check();

alter table public.venue_officers enable row level security;
create policy venue_officers_read on public.venue_officers for select to authenticated
  using (exists (select 1 from public.exam_venues v where v.id = venue_id and public.can_view_venues(v.org_unit_id)));
create policy venue_officers_insert on public.venue_officers for insert to authenticated
  with check (exists (select 1 from public.exam_venues v where v.id = venue_id and public.can_edit_venues(v.org_unit_id)));
create policy venue_officers_update on public.venue_officers for update to authenticated
  using (exists (select 1 from public.exam_venues v where v.id = venue_id and public.can_edit_venues(v.org_unit_id)))
  with check (exists (select 1 from public.exam_venues v where v.id = venue_id and public.can_edit_venues(v.org_unit_id)));
revoke all on public.venue_officers from anon, authenticated;
grant select, insert, update on public.venue_officers to authenticated;

-- ---------------------------------------------------------------
-- 5) แจ้งเตือนเจ้าหน้าที่ส่วนกลาง เมื่อประธานสนามสอบหรือผู้รับข้อสอบ (ปีการศึกษาปัจจุบันเป็นต้นไป)
--    เปลี่ยนสถานะ ย้ายสังกัด หรือถูกปิดใช้งาน ในทะเบียนบุคคล (ระบบที่ 1)
-- ---------------------------------------------------------------
create function public.notify_venue_officer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_name text;
  v_what text;
begin
  if new.status is not distinct from old.status
     and new.org_unit_id is not distinct from old.org_unit_id
     and new.is_active is not distinct from old.is_active then
    return new;
  end if;

  v_name := btrim(concat_ws(' ', nullif(new.title, ''), new.first_name, nullif(new.monastic_name, ''), nullif(new.last_name, '')));
  v_what := case
    when not new.is_active and old.is_active then 'ถูกปิดใช้งานในทะเบียนบุคคล'
    when new.status is distinct from old.status then 'เปลี่ยนสถานะเป็น ' || case new.status
      when 'active' then 'ปฏิบัติหน้าที่'
      when 'transfer_pending' then 'อยู่ระหว่างขอย้าย'
      when 'transferred' then 'ย้ายแล้ว'
      when 'resigned' then 'ลาออก'
      when 'deceased' then case when new.person_type = 'monastic' then 'มรณภาพ' else 'ตาย' end
      when 'disrobed' then 'ลาสิกขา'
      when 'removed_other' then 'พ้นตำแหน่งด้วยเหตุอื่น'
      else new.status end
    else 'ย้ายสังกัดไป ' || coalesce((select u.name from public.org_units u where u.id = new.org_unit_id), '-')
  end;
  if new.status is distinct from old.status and new.org_unit_id is distinct from old.org_unit_id then
    v_what := v_what || ' และย้ายสังกัดไป '
      || coalesce((select u.name from public.org_units u where u.id = new.org_unit_id), '-');
  end if;

  for r in
    select v.id as venue_id, v.name as venue_name, vo.role, y.year_be
    from public.venue_officers vo
    join public.exam_venues v on v.id = vo.venue_id and v.is_active
    join public.academic_years y on y.id = vo.academic_year_id
    where vo.person_id = new.id and vo.is_active
      and y.year_be >= coalesce((select c.year_be from public.academic_years c where c.is_current), 0)
  loop
    perform public.notify_user(
      s.user_id,
      case r.role when 'chair' then 'ประธานสนามสอบ' else 'ผู้รับข้อสอบ' end || 'มีการเปลี่ยนแปลงในทะเบียนบุคคล',
      v_name || ' (' || case r.role when 'chair' then 'ประธานสนามสอบ' else 'ผู้รับข้อสอบ' end || ' '
        || r.venue_name || ' ปีการศึกษา ' || r.year_be || ') ' || v_what || ' กรุณาตรวจสอบและแก้ไขรายชื่อถ้าจำเป็น',
      '/app/places/venues/' || r.venue_id || '?tab=officers'
    )
    from (
      select distinct ur.user_id
      from public.user_roles ur
      join public.profiles p on p.id = ur.user_id and p.status = 'active'
      where ur.role_key = 'central_staff'
        and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
    ) s;
  end loop;
  return new;
end;
$$;
revoke execute on function public.notify_venue_officer_change() from public, anon, authenticated;
create trigger persons_notify_venue_officers after update of status, org_unit_id, is_active on public.persons
  for each row execute function public.notify_venue_officer_change();
