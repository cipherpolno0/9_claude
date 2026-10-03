-- บทที่ 3 (1/4): บัญชีผู้ใช้ บทบาท และฟังก์ชันสิทธิ์ can_access / has_role

-- ---------------------------------------------------------------
-- ปรับฟังก์ชันบันทึกประวัติให้ใช้กับตารางที่ไม่มีคอลัมน์ id ได้ (เช่น roles ใช้ key)
-- และไม่บันทึกเมื่อเปลี่ยนเฉพาะเวลาเข้าใช้ล่าสุด
-- ---------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id text;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key', '');

  if tg_op = 'UPDATE'
     and (v_old - 'updated_at' - 'last_seen_at') = (v_new - 'updated_at' - 'last_seen_at') then
    return new;
  end if;

  insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_old, v_new);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- app_settings: ค่าตั้งที่ปรับได้ (ตัวเลขในวงเล็บเหลี่ยมของ prompt)
-- ---------------------------------------------------------------
create table public.app_settings (
  key          text primary key,
  value_int    integer not null,
  description  text not null,
  updated_at   timestamptz not null default now()
);
comment on table public.app_settings is 'ค่าตั้งของระบบที่ผู้ดูแลปรับได้';

insert into public.app_settings (key, value_int, description) values
  ('password_max_age_days', 180, 'อายุรหัสผ่าน (วัน) ครบแล้วต้องเปลี่ยนก่อนใช้งานต่อ'),
  ('password_warn_days', 14, 'เตือนให้เปลี่ยนรหัสผ่านล่วงหน้า (วัน)'),
  ('inactive_suspend_days', 180, 'ไม่เข้าใช้เกินกี่วันจึงระงับบัญชีอัตโนมัติ'),
  ('access_review_grace_days', 30, 'จำนวนวันที่ให้ยืนยันบัญชีในรอบทบทวนสิทธิ์ประจำปี');

create function public.setting_int(p_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select value_int from public.app_settings where key = p_key;
$$;

create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();
create trigger app_settings_audit after insert or update or delete on public.app_settings
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- roles: บทบาท
-- ---------------------------------------------------------------
create table public.roles (
  key                text primary key check (key ~ '^[a-z_]+$'),
  name               text not null,
  requires_org_unit  boolean not null default true,   -- ต้องผูกกับเขตปกครองหรือไม่
  mfa_required       boolean not null default false,  -- บังคับยืนยันตัวตน 2 ขั้นหรือไม่
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.roles is 'บทบาทของผู้ใช้ เจ้าคณะ รองเจ้าคณะ เลขานุการ ใช้คู่กับระดับของหน่วยที่ผูก';

insert into public.roles (key, name, requires_org_unit, mfa_required, sort_order) values
  ('chief',            'เจ้าคณะ',               true,  true,  10),
  ('deputy_chief',     'รองเจ้าคณะ',            true,  true,  20),
  ('secretary',        'เลขานุการ',             true,  false, 30),
  ('central_staff',    'เจ้าหน้าที่ส่วนกลาง',     false, false, 40),
  ('admin',            'ผู้ดูแลระบบ',            false, true,  50),
  ('education_staff',  'จศป.',                  true,  false, 60),
  ('school_officer',   'เจ้าหน้าที่สำนักเรียน',   true,  false, 70),
  ('finance_officer',  'เจ้าหน้าที่การเงิน',      true,  true,  80),
  ('supplies_officer', 'เจ้าหน้าที่พัสดุ',        true,  false, 90),
  ('saraban_officer',  'เจ้าหน้าที่สารบรรณ',     true,  false, 100),
  ('quiz_manager',     'ผู้จัดการคลังข้อสอบ',     false, false, 110),
  ('learner',          'ผู้เรียน',               false, false, 120);

create trigger roles_set_updated_at before update on public.roles
  for each row execute function public.set_updated_at();
create trigger roles_audit after insert or update or delete on public.roles
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- profiles: ข้อมูลผู้ใช้ (1 แถวต่อ 1 บัญชีใน auth.users)
-- ---------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  title_prefix         text not null default '',     -- คำนำหน้า
  first_name           text not null check (length(btrim(first_name)) > 0),
  monastic_name        text not null default '',     -- ฉายา
  last_name            text not null default '',
  phone                text not null default '',     -- เบอร์ติดต่อ (ไม่แสดงในหน้าสาธารณะ)
  email                text not null,
  status               text not null default 'pending'
                         check (status in ('pending', 'active', 'suspended', 'rejected')),
  status_reason        text,
  activated_at         timestamptz,                  -- เวลาที่อนุมัติหรือเปิดใช้ครั้งล่าสุด
  last_seen_at         timestamptz,                  -- เวลาเข้าใช้ล่าสุด
  password_changed_at  timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table public.profiles is 'ข้อมูลผู้ใช้ สถานะ: pending รออนุมัติ / active ใช้งาน / suspended ระงับ / rejected ไม่อนุมัติ';

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- user_roles: ใครมีบทบาทใด ที่หน่วยใด ช่วงเวลาใด
-- ---------------------------------------------------------------
create table public.user_roles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role_key     text not null references public.roles (key),
  org_unit_id  uuid references public.org_units (id),
  starts_on    date not null default current_date,
  ends_on      date,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint user_roles_dates check (ends_on is null or ends_on >= starts_on)
);
comment on table public.user_roles is 'บทบาทของผู้ใช้ ผูกกับเขตปกครองและช่วงวันที่';
create index user_roles_user_idx on public.user_roles (user_id);
create index user_roles_org_unit_idx on public.user_roles (org_unit_id);

create function public.user_roles_check_org_unit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_requires boolean;
begin
  select requires_org_unit into v_requires from public.roles where key = new.role_key;
  if v_requires and new.org_unit_id is null then
    raise exception 'บทบาทนี้ต้องระบุเขตปกครอง' using errcode = '23514';
  end if;
  if not v_requires then
    new.org_unit_id := null;
  end if;
  return new;
end;
$$;

create trigger user_roles_org_unit before insert or update on public.user_roles
  for each row execute function public.user_roles_check_org_unit();
create trigger user_roles_set_updated_at before update on public.user_roles
  for each row execute function public.set_updated_at();
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- ฟังก์ชันสิทธิ์ (ใช้ใน RLS ของทุกตารางต่อจากนี้)
-- ---------------------------------------------------------------

-- หน่วยนี้และหน่วยเหนือขึ้นไปทุกชั้น (depth 0 = ตัวเอง)
create function public.ancestors_or_self(p_org_unit_id uuid)
returns table (id uuid, depth integer)
language sql
stable
set search_path = public
as $$
  with recursive up as (
    select u.id, u.parent_id, 0 as depth from public.org_units u where u.id = p_org_unit_id
    union all
    select u.id, u.parent_id, up.depth + 1 from public.org_units u join up on u.id = up.parent_id
  )
  select up.id, up.depth from up;
$$;

-- บทบาทที่ยังมีผลของผู้ใช้ปัจจุบัน
-- effective = ใช้สิทธิ์ได้จริง (บทบาทที่บังคับ 2 ขั้น ต้องยืนยัน 2 ขั้นในรอบล็อกอินนี้แล้ว)
create function public.my_role_rows()
returns table (user_role_id uuid, role_key text, org_unit_id uuid, mfa_required boolean, effective boolean)
language sql
stable
security definer
set search_path = public
as $$
  select ur.id, ur.role_key, ur.org_unit_id, r.mfa_required,
         (not r.mfa_required or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
  from public.user_roles ur
  join public.roles r on r.key = ur.role_key
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = auth.uid()
    and p.status = 'active'
    and ur.starts_on <= current_date
    and (ur.ends_on is null or ur.ends_on >= current_date);
$$;

create function public.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.my_role_rows() m where m.role_key = p_role and m.effective);
$$;
comment on function public.has_role(text) is 'ผู้ใช้ปัจจุบันมีบทบาทนี้และใช้สิทธิ์ได้จริงหรือไม่';

-- เข้าถึงข้อมูลของหน่วยนี้ได้หรือไม่: หน่วยตนและหน่วยใต้สังกัด ไม่ข้ามสาย ไม่ข้ามนิกาย
-- ผู้ดูแลระบบและเจ้าหน้าที่ส่วนกลางเข้าถึงได้ทุกหน่วย
create function public.can_access(p_org_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org_unit_id is not null and (
    exists (
      select 1 from public.my_role_rows() m
      where m.effective and m.role_key in ('admin', 'central_staff')
    )
    or exists (
      select 1
      from public.my_role_rows() m
      join public.ancestors_or_self(p_org_unit_id) a on a.id = m.org_unit_id
      where m.effective
    )
  );
$$;
comment on function public.can_access(uuid) is 'ผู้ใช้ปัจจุบันเข้าถึงข้อมูลของเขตปกครองนี้ได้หรือไม่';

-- อนุมัติบัญชีของหน่วยนี้ได้หรือไม่: ผู้ดูแลระบบ เจ้าหน้าที่ส่วนกลาง
-- หรือ เจ้าคณะ รองเจ้าคณะ เลขานุการ ของ "หน่วยเหนือ" (ไม่รวมหน่วยเดียวกัน)
create function public.can_manage_accounts_of(p_org_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin') or (
    p_org_unit_id is not null and (
      public.has_role('central_staff')
      or exists (
        select 1
        from public.my_role_rows() m
        join public.ancestors_or_self(p_org_unit_id) a on a.id = m.org_unit_id
        where m.effective and m.role_key in ('chief', 'deputy_chief', 'secretary') and a.depth > 0
      )
    )
  );
$$;

-- ดูข้อมูลและทบทวนบัญชีของผู้ใช้คนนี้ได้หรือไม่: ผู้ดูแลระบบ เจ้าหน้าที่ส่วนกลาง
-- หรือ เจ้าคณะ รองเจ้าคณะ เลขานุการ ของหน่วยเดียวกันหรือหน่วยเหนือ
create function public.can_review_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin') or public.has_role('central_staff') or exists (
    select 1
    from public.user_roles t
    join public.my_role_rows() m on m.effective and m.role_key in ('chief', 'deputy_chief', 'secretary')
    join public.ancestors_or_self(t.org_unit_id) a on a.id = m.org_unit_id
    where t.user_id = p_user_id
      and t.org_unit_id is not null
      and t.starts_on <= current_date
      and (t.ends_on is null or t.ends_on >= current_date)
  );
$$;

-- หน่วยที่ผู้ใช้ปัจจุบันดูแล (ใช้กับกล่อง "เขตที่ท่านดูแล")
create function public.my_org_units()
returns table (
  role_key text, role_name text, org_unit_id uuid, org_unit_name text, org_unit_code text,
  level public.org_level, sect public.sect, descendant_count bigint, all_units boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select m.role_key, r.name, u.id, u.name, u.code, u.level, u.sect,
         (select count(*) from public.descendants_of(u.id) d where d.is_active),
         m.role_key in ('admin', 'central_staff')
  from public.my_role_rows() m
  join public.roles r on r.key = m.role_key
  left join public.org_units u on u.id = m.org_unit_id
  order by r.sort_order, u.code;
$$;

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

-- roles และ app_settings: อ่านได้ทุกคน (ใช้แสดงในแบบฟอร์มขอบัญชี) แก้ไขได้เฉพาะผู้ดูแลระบบ
create policy roles_read_all on public.roles for select to anon, authenticated using (true);
create policy roles_admin_update on public.roles for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke insert, update, delete on public.roles from anon;
revoke insert, delete on public.roles from authenticated;

create policy app_settings_read_all on public.app_settings for select to anon, authenticated using (true);
create policy app_settings_admin_update on public.app_settings for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke insert, update, delete on public.app_settings from anon;
revoke insert, delete on public.app_settings from authenticated;

-- profiles: เห็นของตนเอง และของผู้ที่ตนมีหน้าที่ดูแล การแก้ไขทำผ่านฟังก์ชันเท่านั้น
revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_review_user(id));

-- user_roles: เห็นของตนเอง และของหน่วยที่ตนเข้าถึงได้ การแก้ไขทำผ่านฟังก์ชันเท่านั้น
revoke all on public.user_roles from anon;
revoke insert, update, delete on public.user_roles from authenticated;
create policy user_roles_read on public.user_roles for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role('admin')
    or public.has_role('central_staff')
    or public.can_access(org_unit_id)
  );

-- org_units และ academic_years: เขียนได้เฉพาะผู้ดูแลระบบ (แทนการใช้ secret key ของบทที่ 2)
create policy org_units_admin_insert on public.org_units for insert to authenticated
  with check (public.has_role('admin'));
create policy org_units_admin_update on public.org_units for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke insert, update, delete on public.org_units from anon;
revoke delete on public.org_units from authenticated;

create policy academic_years_admin_insert on public.academic_years for insert to authenticated
  with check (public.has_role('admin'));
create policy academic_years_admin_update on public.academic_years for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke insert, update, delete on public.academic_years from anon;
revoke delete on public.academic_years from authenticated;

-- นำเข้าเขตปกครอง: ให้ผู้ล็อกอินเรียกได้ แต่ RLS ของ org_units ยอมเฉพาะผู้ดูแลระบบ
grant execute on function public.import_org_units(jsonb) to authenticated;

-- audit_logs: ผู้ดูแลระบบอ่านได้
grant select on public.audit_logs to authenticated;
create policy audit_logs_admin_read on public.audit_logs for select to authenticated
  using (public.has_role('admin'));

-- ฟังก์ชันสิทธิ์: ให้ผู้ล็อกอินเรียกได้ ผู้ไม่ล็อกอินเรียกไม่ได้
revoke execute on function public.my_role_rows() from public, anon;
revoke execute on function public.has_role(text) from public, anon;
revoke execute on function public.can_access(uuid) from public, anon;
revoke execute on function public.can_manage_accounts_of(uuid) from public, anon;
revoke execute on function public.can_review_user(uuid) from public, anon;
revoke execute on function public.my_org_units() from public, anon;
revoke execute on function public.user_roles_check_org_unit() from public, anon, authenticated;
grant execute on function public.my_role_rows() to authenticated;
grant execute on function public.has_role(text) to authenticated;
grant execute on function public.can_access(uuid) to authenticated;
grant execute on function public.can_manage_accounts_of(uuid) to authenticated;
grant execute on function public.can_review_user(uuid) to authenticated;
grant execute on function public.my_org_units() to authenticated;
