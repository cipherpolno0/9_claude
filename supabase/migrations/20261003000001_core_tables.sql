-- บทที่ 2 (1/3): ตารางแกนกลาง org_units, academic_years, audit_logs
-- รันครั้งเดียว ตามลำดับเลขไฟล์

-- ---------------------------------------------------------------
-- ชนิดข้อมูล
-- ---------------------------------------------------------------
create type public.org_level as enum ('central', 'region', 'province', 'district', 'subdistrict');
comment on type public.org_level is 'ระดับเขตปกครอง: ส่วนกลาง ภาค จังหวัด อำเภอ ตำบล';

create type public.sect as enum ('mahanikaya', 'dhammayut');
comment on type public.sect is 'นิกาย: มหานิกาย ธรรมยุต';

-- ---------------------------------------------------------------
-- audit_logs: ใคร ทำอะไร กับตารางใด แถวใด ค่าเดิม ค่าใหม่ เมื่อใด
-- ---------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,                 -- ผู้กระทำ (ว่างได้จนกว่าจะมีระบบล็อกอินในบทที่ 3)
  action      text not null check (action in ('insert', 'update', 'delete')),
  table_name  text not null,
  row_id      text not null,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.audit_logs is 'ประวัติการเพิ่ม แก้ไข ลบ ของทุกตาราง';
create index audit_logs_table_row_idx on public.audit_logs (table_name, row_id, created_at desc);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- ฟังก์ชันกลาง: ผูกเป็น trigger กับตารางใดก็ได้ที่มีคอลัมน์ id
create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, action, table_name, row_id, new_data)
    values (auth.uid(), 'insert', tg_table_name, new.id::text, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(old) is distinct from to_jsonb(new) then
      insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
      values (auth.uid(), 'update', tg_table_name, new.id::text, to_jsonb(old), to_jsonb(new));
    end if;
    return new;
  else
    insert into public.audit_logs (actor_id, action, table_name, row_id, old_data)
    values (auth.uid(), 'delete', tg_table_name, old.id::text, to_jsonb(old));
    return old;
  end if;
end;
$$;
comment on function public.audit_row_change() is 'บันทึกการเปลี่ยนแปลงของแถวลง audit_logs โดยอัตโนมัติ';

-- ฟังก์ชันกลาง: ปรับ updated_at ทุกครั้งที่แก้ไข
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- org_units: เขตปกครองแบบลำดับชั้น
-- ---------------------------------------------------------------
create table public.org_units (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.org_units (id) on delete restrict,
  level       public.org_level not null,
  sect        public.sect,          -- ว่างได้เฉพาะระดับส่วนกลาง
  name        text not null check (length(btrim(name)) > 0),
  code        text not null unique check (code = btrim(code) and length(code) > 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- ส่วนกลางไม่มีหน่วยเหนือและไม่ระบุนิกาย ระดับอื่นต้องมีทั้งสองอย่าง
  constraint org_units_central_shape check (
    (level = 'central' and parent_id is null and sect is null)
    or (level <> 'central' and parent_id is not null and sect is not null)
  )
);
comment on table public.org_units is 'เขตปกครอง: ส่วนกลาง > ภาค > จังหวัด > อำเภอ > ตำบล แยกนิกาย';
create index org_units_parent_idx on public.org_units (parent_id);
create index org_units_level_sect_idx on public.org_units (level, sect);

-- ตรวจลำดับชั้น: หน่วยต้องอยู่ใต้หน่วยระดับถัดขึ้นไปหนึ่งชั้น และนิกายเดียวกับหน่วยเหนือ
create function public.org_units_check_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent public.org_units%rowtype;
  v_expected public.org_level;
begin
  if new.level = 'central' then
    return new;
  end if;

  select * into v_parent from public.org_units where id = new.parent_id;

  v_expected := case new.level
    when 'region' then 'central'
    when 'province' then 'region'
    when 'district' then 'province'
    when 'subdistrict' then 'district'
  end;

  if v_parent.level <> v_expected then
    raise exception 'ระดับของหน่วยเหนือไม่ถูกต้อง: หน่วยระดับนี้ต้องอยู่ใต้หน่วยระดับถัดขึ้นไปหนึ่งชั้น'
      using errcode = '23514';
  end if;

  if v_parent.sect is not null and v_parent.sect <> new.sect then
    raise exception 'นิกายต้องตรงกับหน่วยเหนือ' using errcode = '23514';
  end if;

  if new.is_active and not v_parent.is_active then
    raise exception 'หน่วยเหนือถูกปิดใช้งานอยู่ ต้องเปิดใช้งานหน่วยเหนือก่อน' using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ห้ามปิดใช้งานหน่วยที่ยังมีหน่วยใต้สังกัดเปิดใช้งานอยู่ และห้ามย้ายระดับหรือนิกายเมื่อมีหน่วยใต้สังกัด
create function public.org_units_check_children()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_active and not new.is_active then
    if exists (select 1 from public.org_units c where c.parent_id = new.id and c.is_active) then
      raise exception 'ปิดใช้งานไม่ได้ เพราะยังมีหน่วยใต้สังกัดที่เปิดใช้งานอยู่' using errcode = '23514';
    end if;
  end if;

  if (new.level <> old.level or new.sect is distinct from old.sect) then
    if exists (select 1 from public.org_units c where c.parent_id = new.id) then
      raise exception 'เปลี่ยนระดับหรือนิกายไม่ได้ เพราะมีหน่วยใต้สังกัดอยู่' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger org_units_hierarchy
  before insert or update of parent_id, level, sect, is_active on public.org_units
  for each row execute function public.org_units_check_hierarchy();

create trigger org_units_children
  before update of level, sect, is_active on public.org_units
  for each row execute function public.org_units_check_children();

create trigger org_units_set_updated_at
  before update on public.org_units
  for each row execute function public.set_updated_at();

create trigger org_units_audit
  after insert or update or delete on public.org_units
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- academic_years: ปีการศึกษา (พ.ศ.)
-- ---------------------------------------------------------------
create table public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  year_be     integer not null unique check (year_be between 2400 and 2700),
  starts_on   date not null,
  ends_on     date not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint academic_years_dates check (ends_on > starts_on)
);
comment on table public.academic_years is 'ปีการศึกษา (พ.ศ.) มีปีปัจจุบันได้ปีเดียว';
create unique index academic_years_one_current on public.academic_years (is_current) where is_current;

create trigger academic_years_set_updated_at
  before update on public.academic_years
  for each row execute function public.set_updated_at();

create trigger academic_years_audit
  after insert or update or delete on public.academic_years
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- RLS: เปิดทุกตาราง
-- บทนี้ยังไม่มีล็อกอิน จึงให้ "อ่าน" เขตปกครองและปีการศึกษาได้ทุกคน (ข้อมูลอ้างอิงสาธารณะ)
-- ส่วน "เขียน" ยังไม่มี policy ให้ใคร ทำได้เฉพาะฝั่งเซิร์ฟเวอร์ด้วย secret key
-- policy ตามบทบาทและเขตปกครองจะเพิ่มในบทที่ 3
-- ---------------------------------------------------------------
alter table public.org_units enable row level security;
alter table public.academic_years enable row level security;
alter table public.audit_logs enable row level security;

create policy org_units_read_all on public.org_units
  for select to anon, authenticated using (true);

create policy academic_years_read_all on public.academic_years
  for select to anon, authenticated using (true);

-- audit_logs: ไม่มี policy = ไม่มีใครอ่านหรือเขียนผ่าน API ได้ (ยกเว้น secret key ฝั่งเซิร์ฟเวอร์)
revoke all on public.audit_logs from anon, authenticated;
