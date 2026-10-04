-- บทที่ 5 (2/3): ประเภทตำแหน่งปกครอง 12 ตำแหน่ง และการแต่งตั้ง (เก็บประวัติทุกวาระ)

-- ---------------------------------------------------------------
-- position_types: เจ้าคณะ / รองเจ้าคณะ / เลขานุการเจ้าคณะ ของ ตำบล อำเภอ จังหวัด ภาค
-- max_per_unit = จำนวนสูงสุดต่อหน่วยในเวลาเดียวกัน (ว่าง = ไม่จำกัด) ผู้ดูแลระบบแก้ได้
-- เจ้าคณะมีได้ 1 รูปต่อหน่วยเสมอ
-- ---------------------------------------------------------------
create table public.position_types (
  key           text primary key check (key ~ '^[a-z_]+$'),
  name          text not null,
  kind          text not null check (kind in ('chief', 'deputy', 'secretary')),
  level         public.org_level not null check (level <> 'central'),
  max_per_unit  integer check (max_per_unit is null or max_per_unit between 1 and 99),
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint position_types_kind_level unique (kind, level),
  constraint position_types_chief_single check (kind <> 'chief' or max_per_unit = 1)
);
comment on table public.position_types is 'ประเภทตำแหน่งปกครอง max_per_unit ว่าง = ไม่จำกัดจำนวนต่อหน่วย';

insert into public.position_types (key, name, kind, level, max_per_unit, sort_order) values
  ('chief_region',          'เจ้าคณะภาค',              'chief',     'region',      1,    10),
  ('deputy_region',         'รองเจ้าคณะภาค',           'deputy',    'region',      null, 20),
  ('secretary_region',      'เลขานุการเจ้าคณะภาค',      'secretary', 'region',      null, 30),
  ('chief_province',        'เจ้าคณะจังหวัด',           'chief',     'province',    1,    40),
  ('deputy_province',       'รองเจ้าคณะจังหวัด',        'deputy',    'province',    null, 50),
  ('secretary_province',    'เลขานุการเจ้าคณะจังหวัด',   'secretary', 'province',    null, 60),
  ('chief_district',        'เจ้าคณะอำเภอ',            'chief',     'district',    1,    70),
  ('deputy_district',       'รองเจ้าคณะอำเภอ',         'deputy',    'district',    null, 80),
  ('secretary_district',    'เลขานุการเจ้าคณะอำเภอ',    'secretary', 'district',    null, 90),
  ('chief_subdistrict',     'เจ้าคณะตำบล',             'chief',     'subdistrict', 1,    100),
  ('deputy_subdistrict',    'รองเจ้าคณะตำบล',          'deputy',    'subdistrict', null, 110),
  ('secretary_subdistrict', 'เลขานุการเจ้าคณะตำบล',     'secretary', 'subdistrict', null, 120);

create trigger position_types_set_updated_at before update on public.position_types
  for each row execute function public.set_updated_at();
create trigger position_types_audit after insert or update or delete on public.position_types
  for each row execute function public.audit_row_change();

alter table public.position_types enable row level security;
revoke all on public.position_types from anon;
revoke insert, delete on public.position_types from authenticated;
create policy position_types_read on public.position_types for select to authenticated using (true);
create policy position_types_admin_update on public.position_types for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---------------------------------------------------------------
-- appointments: การแต่งตั้ง หนึ่งแถว = หนึ่งวาระ ไม่เขียนทับของเดิม
-- เหตุที่พ้น: term_ended ครบวาระ / resigned ลาออก / transferred ย้ายหรือเลื่อนตำแหน่ง /
--            removed ถูกถอดถอน / disrobed ลาสิกขา / deceased มรณภาพ / other อื่น ๆ (ระบุ)
-- ---------------------------------------------------------------
create table public.appointments (
  id                 uuid primary key default gen_random_uuid(),
  person_id          uuid not null references public.persons (id),
  position_type_key  text not null references public.position_types (key),
  org_unit_id        uuid not null references public.org_units (id),
  appointed_on       date not null,                       -- วันที่แต่งตั้ง
  order_no           text not null default '',            -- เลขที่คำสั่งหรือตราตั้ง (ไฟล์แนบอยู่ในตาราง attachments)
  ended_on           date,                                -- วันพ้นตำแหน่ง
  end_reason         text check (end_reason in
                       ('term_ended', 'resigned', 'transferred', 'removed', 'disrobed', 'deceased', 'other')),
  end_note           text not null default '',
  is_active          boolean not null default true,       -- ปิดใช้งาน = ยกเลิกรายการที่บันทึกผิด
  created_by         uuid default auth.uid() references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint appointments_dates check (ended_on is null or ended_on >= appointed_on),
  constraint appointments_end_shape check ((ended_on is null) = (end_reason is null)),
  constraint appointments_other_note check (end_reason is distinct from 'other' or length(btrim(end_note)) > 0)
);
comment on table public.appointments is 'ประวัติการดำรงตำแหน่งปกครอง เก็บทุกวาระ';
create index appointments_person_idx on public.appointments (person_id);
create index appointments_unit_position_idx on public.appointments (org_unit_id, position_type_key);

-- ตรวจกติกาการแต่งตั้ง
create function public.appointments_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.position_types%rowtype;
  v_unit public.org_units%rowtype;
  v_person public.persons%rowtype;
  v_count integer;
  v_holder text;
  v_level_name text;
begin
  if tg_op = 'UPDATE' then
    if new.person_id <> old.person_id
       or new.position_type_key <> old.position_type_key
       or new.org_unit_id <> old.org_unit_id then
      raise exception 'เปลี่ยนบุคคล ตำแหน่ง หรือหน่วยของวาระที่บันทึกแล้วไม่ได้ ให้บันทึกการพ้นตำแหน่ง แล้วเพิ่มวาระใหม่'
        using errcode = '23514';
    end if;
    if not old.is_active and new.is_active then
      raise exception 'รายการที่ยกเลิกแล้วนำกลับมาใช้ไม่ได้ กรุณาเพิ่มวาระใหม่' using errcode = '23514';
    end if;
  end if;

  if not new.is_active then
    return new;
  end if;

  select * into v_type from public.position_types where key = new.position_type_key;
  select * into v_unit from public.org_units where id = new.org_unit_id;
  select * into v_person from public.persons where id = new.person_id;

  if tg_op = 'INSERT' then
    if not v_type.is_active then
      raise exception 'ตำแหน่งนี้ถูกปิดใช้งานอยู่' using errcode = '23514';
    end if;
    if not v_unit.is_active then
      raise exception 'เขตปกครองนี้ถูกปิดใช้งานอยู่' using errcode = '23514';
    end if;
    if not v_person.is_active then
      raise exception 'บุคคลนี้ถูกปิดใช้งานอยู่ในทะเบียน' using errcode = '23514';
    end if;
  end if;

  if v_unit.level <> v_type.level then
    v_level_name := case v_type.level
      when 'region' then 'ภาค' when 'province' then 'จังหวัด'
      when 'district' then 'อำเภอ' when 'subdistrict' then 'ตำบล' end;
    raise exception 'ตำแหน่ง% ต้องแต่งตั้งที่เขตปกครองระดับ%', v_type.name, v_level_name using errcode = '23514';
  end if;

  if new.appointed_on > current_date + 366 then
    raise exception 'วันที่แต่งตั้งอยู่ไกลเกินไปในอนาคต กรุณาตรวจปี พ.ศ.' using errcode = '23514';
  end if;

  -- กันสองคนบันทึกพร้อมกันในหน่วยและตำแหน่งเดียวกัน
  perform pg_advisory_xact_lock(hashtextextended(new.org_unit_id::text || ':' || new.position_type_key, 0));

  -- บุคคลเดียวกัน ตำแหน่งเดียวกัน หน่วยเดียวกัน ห้ามมีวาระซ้อนกัน
  if exists (
    select 1 from public.appointments a
    where a.id <> new.id and a.is_active
      and a.person_id = new.person_id
      and a.org_unit_id = new.org_unit_id
      and a.position_type_key = new.position_type_key
      and a.appointed_on < coalesce(new.ended_on, 'infinity'::date)
      and coalesce(a.ended_on, 'infinity'::date) > new.appointed_on
  ) then
    raise exception 'บุคคลนี้มีวาระในตำแหน่งนี้ที่หน่วยนี้ในช่วงเวลาเดียวกันอยู่แล้ว' using errcode = '23514';
  end if;

  -- จำนวนต่อหน่วยในเวลาเดียวกัน
  if v_type.max_per_unit is not null then
    select count(*),
           string_agg(concat_ws(' ', nullif(p.title, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, '')), ', ')
      into v_count, v_holder
    from public.appointments a
    join public.persons p on p.id = a.person_id
    where a.id <> new.id and a.is_active
      and a.org_unit_id = new.org_unit_id
      and a.position_type_key = new.position_type_key
      and a.appointed_on < coalesce(new.ended_on, 'infinity'::date)
      and coalesce(a.ended_on, 'infinity'::date) > new.appointed_on;

    if v_count >= v_type.max_per_unit then
      if v_type.max_per_unit = 1 then
        raise exception '% มี%อยู่แล้วในช่วงเวลาเดียวกัน (%) ต้องบันทึกการพ้นตำแหน่งของรูปเดิมก่อน',
          v_unit.name, v_type.name, v_holder using errcode = '23514';
      else
        raise exception '% มี%ครบ % รูปแล้วในช่วงเวลาเดียวกัน (%)',
          v_unit.name, v_type.name, v_type.max_per_unit, v_holder using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function public.appointments_check() from public, anon, authenticated;

create trigger appointments_rules before insert or update on public.appointments
  for each row execute function public.appointments_check();
create trigger appointments_set_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();
create trigger appointments_audit after insert or update or delete on public.appointments
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- มองเห็นบุคคลนี้ได้หรือไม่: อยู่ในเขตที่ตนดูได้ หรือดำรง/เคยดำรงตำแหน่งในเขตที่ตนดูได้
-- (เช่น เจ้าคณะภาคที่วัดสังกัดอยู่นอกภาค เลขานุการภาคต้องเห็นประวัติได้)
-- ---------------------------------------------------------------
create function public.can_view_person(p_person_id uuid)
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
        public.can_view_personnel(p.org_unit_id)
        or exists (
          select 1 from public.appointments a
          where a.person_id = p.id and a.is_active and public.can_view_personnel(a.org_unit_id)
        )
      )
  );
$$;
revoke execute on function public.can_view_person(uuid) from public, anon;
grant execute on function public.can_view_person(uuid) to authenticated;

create policy persons_read on public.persons for select to authenticated
  using (public.can_view_person(id));

-- ปิดใช้งานบุคคลไม่ได้ ถ้ายังดำรงตำแหน่งอยู่
create function public.persons_check_deactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_active and not new.is_active and exists (
    select 1 from public.appointments a
    where a.person_id = new.id and a.is_active and (a.ended_on is null or a.ended_on > current_date)
  ) then
    raise exception 'ปิดใช้งานไม่ได้ เพราะบุคคลนี้ยังดำรงตำแหน่งอยู่ ต้องบันทึกการพ้นตำแหน่งก่อน' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.persons_check_deactivate() from public, anon, authenticated;
create trigger persons_deactivate before update of is_active on public.persons
  for each row execute function public.persons_check_deactivate();

-- ---------------------------------------------------------------
-- RLS ของ appointments: เห็นตามเขต เลขานุการ (และผู้ดูแลระบบ) เพิ่มและแก้ไขได้ ห้ามลบ
-- ---------------------------------------------------------------
alter table public.appointments enable row level security;
revoke all on public.appointments from anon;
revoke delete, truncate on public.appointments from authenticated;

create policy appointments_read on public.appointments for select to authenticated
  using (public.can_view_personnel(org_unit_id) or public.can_view_person(person_id));
create policy appointments_insert on public.appointments for insert to authenticated
  with check (public.can_edit_personnel(org_unit_id) and public.can_view_person(person_id));
create policy appointments_update on public.appointments for update to authenticated
  using (public.can_edit_personnel(org_unit_id))
  with check (public.can_edit_personnel(org_unit_id));
