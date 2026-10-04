-- สิทธิ์ตามบทบาท: ผู้ดูแลระบบกำหนดเองได้ว่าแต่ละบทบาทใช้เมนูใด และดู/แก้ไขทะเบียนบุคคลได้กว้างเพียงใด
-- ค่าเริ่มต้นเท่ากับพฤติกรรมเดิมของบทที่ 3-7 ทุกประการ

-- ---------------------------------------------------------------
-- 1) ขอบเขตทะเบียนบุคคลของแต่ละบทบาท (ใช้กับ บุคคล ตำแหน่งปกครอง จศป. และคำขอเปลี่ยนสถานะ)
--    none ไม่ได้ / own เฉพาะหน่วยตน / subtree หน่วยตนและหน่วยใต้สังกัด / all ทุกเขต
-- ---------------------------------------------------------------
create function public.personnel_scope_rank(p_scope text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_scope when 'none' then 0 when 'own' then 1 when 'subtree' then 2 when 'all' then 3 end;
$$;

alter table public.roles
  add column personnel_view text not null default 'none'
    check (personnel_view in ('none', 'own', 'subtree', 'all')),
  add column personnel_edit text not null default 'none'
    check (personnel_edit in ('none', 'own', 'subtree', 'all'));

update public.roles set personnel_view = 'all', personnel_edit = 'all' where key = 'admin';
update public.roles set personnel_view = 'all' where key = 'central_staff';
update public.roles set personnel_view = 'subtree' where key in ('chief', 'deputy_chief');
update public.roles set personnel_view = 'subtree', personnel_edit = 'subtree' where key = 'secretary';

alter table public.roles
  -- สิทธิ์แก้ไขกว้างกว่าสิทธิ์ดูไม่ได้
  add constraint roles_personnel_edit_within_view
    check (public.personnel_scope_rank(personnel_edit) <= public.personnel_scope_rank(personnel_view)),
  -- ผู้ดูแลระบบได้สิทธิ์เต็มเสมอ
  add constraint roles_admin_full_personnel
    check (key <> 'admin' or (personnel_view = 'all' and personnel_edit = 'all'));

comment on column public.roles.personnel_view is 'ขอบเขตการดูทะเบียนบุคคล: none / own / subtree / all';
comment on column public.roles.personnel_edit is 'ขอบเขตการแก้ไขทะเบียนบุคคล: none / own / subtree / all (ไม่กว้างกว่า personnel_view)';

-- ---------------------------------------------------------------
-- 2) เมนูพื้นที่ทำงานที่แต่ละบทบาทใช้ได้ (แดชบอร์ดเห็นทุกคน ผู้ดูแลระบบเห็นทุกเมนูเสมอ)
-- ---------------------------------------------------------------
create table public.role_menus (
  id          uuid primary key default gen_random_uuid(),
  role_key    text not null references public.roles (key),
  menu_href   text not null check (menu_href ~ '^/app/[a-z]+$'),
  enabled     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (role_key, menu_href),
  constraint role_menus_admin_all check (role_key <> 'admin' or enabled)
);
comment on table public.role_menus is 'เมนูพื้นที่ทำงานที่แต่ละบทบาทใช้ได้ (หนึ่งแถว = บทบาท + เมนู) แก้ที่หน้า สิทธิ์ตามบทบาท';

create trigger role_menus_set_updated_at before update on public.role_menus
  for each row execute function public.set_updated_at();
create trigger role_menus_audit after insert or update or delete on public.role_menus
  for each row execute function public.audit_row_change();

insert into public.role_menus (role_key, menu_href, enabled)
select r.key, m.href,
  case
    when r.key in ('admin', 'central_staff') then true
    when r.key in ('chief', 'deputy_chief', 'secretary') then m.href <> '/app/quiz'
    when r.key = 'education_staff' then m.href in ('/app/personnel', '/app/places', '/app/exams', '/app/docs')
    when r.key = 'school_officer' then m.href in ('/app/places', '/app/requests', '/app/exams')
    when r.key = 'finance_officer' then m.href in ('/app/budget', '/app/docs')
    when r.key = 'supplies_officer' then m.href in ('/app/assets', '/app/docs')
    when r.key = 'saraban_officer' then m.href = '/app/docs'
    when r.key in ('quiz_manager', 'learner') then m.href = '/app/quiz'
    else false
  end
from public.roles r
cross join (values
  ('/app/personnel'), ('/app/places'), ('/app/requests'), ('/app/exams'),
  ('/app/quiz'), ('/app/docs'), ('/app/budget'), ('/app/assets')
) as m(href);

alter table public.role_menus enable row level security;
create policy role_menus_read on public.role_menus for select to authenticated using (true);
create policy role_menus_admin_update on public.role_menus for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.role_menus from anon;
revoke insert, delete, truncate on public.role_menus from authenticated;
grant select, update on public.role_menus to authenticated;

-- ---------------------------------------------------------------
-- 3) ฟังก์ชันสิทธิ์ของทะเบียนบุคคล อ่านขอบเขตจากตาราง roles แทนการเขียนชื่อบทบาทตายตัว
--    (ชื่อและรูปแบบเดิม ทุก policy และฟังก์ชันของบทที่ 5-7 จึงใช้ค่าตั้งใหม่ทันที)
-- ---------------------------------------------------------------
create or replace function public.can_view_personnel(p_org_unit_id uuid)
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
      r.personnel_view = 'all'
      or (r.personnel_view = 'own' and m.org_unit_id = p_org_unit_id)
      or (r.personnel_view = 'subtree'
          and m.org_unit_id in (select a.id from public.ancestors_or_self(p_org_unit_id) a))
    )
  );
$$;
comment on function public.can_view_personnel(uuid) is 'ดูทะเบียนบุคคลของเขตนี้ได้หรือไม่ (ตามขอบเขต roles.personnel_view)';

create or replace function public.can_edit_personnel(p_org_unit_id uuid)
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
      r.personnel_edit = 'all'
      or (r.personnel_edit = 'own' and m.org_unit_id = p_org_unit_id)
      or (r.personnel_edit = 'subtree'
          and m.org_unit_id in (select a.id from public.ancestors_or_self(p_org_unit_id) a))
    )
  );
$$;
comment on function public.can_edit_personnel(uuid) is 'เพิ่มและแก้ไขทะเบียนบุคคลของเขตนี้ได้หรือไม่ (ตามขอบเขต roles.personnel_edit)';

-- มีสิทธิ์แก้ไขทะเบียนบุคคลอย่างน้อยหนึ่งเขตหรือไม่ (ใช้เปิดปุ่มเพิ่มและนำเข้า)
create function public.can_edit_any_personnel()
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
      and (r.personnel_edit = 'all' or (r.personnel_edit in ('own', 'subtree') and m.org_unit_id is not null))
  );
$$;
revoke execute on function public.can_edit_any_personnel() from public, anon;
grant execute on function public.can_edit_any_personnel() to authenticated;

-- ---------------------------------------------------------------
-- 4) นำเข้าบุคคลจาก Excel: ใช้สิทธิ์แก้ไขตามค่าตั้ง แทนชื่อบทบาทตายตัว
-- ---------------------------------------------------------------
create or replace function public.check_persons_import(p_rows jsonb)
returns table (row_number integer, duplicate boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_edit_any_personnel() then
    raise exception 'ท่านไม่มีสิทธิ์นำเข้าทะเบียนบุคคล' using errcode = '42501';
  end if;
  return query
    select x.row_number,
           private.person_duplicate(
             nullif(regexp_replace(coalesce(x.national_id, ''), '[^0-9A-Za-z]', '', 'g'), ''),
             x.first_name, x.monastic_name, x.last_name, nullif(x.birth_date, '')::date, null
           )
    from jsonb_to_recordset(p_rows) as x(
      row_number integer, national_id text, first_name text, monastic_name text, last_name text, birth_date text
    );
end;
$$;

create or replace function public.import_persons(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_count integer := 0;
  v_row integer;
begin
  if not public.can_edit_any_personnel() then
    raise exception 'ท่านไม่มีสิทธิ์นำเข้าทะเบียนบุคคล' using errcode = '42501';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 2,000 แถว' using errcode = '23514';
  end if;

  for r in select value from jsonb_array_elements(p_rows) order by (value ->> 'row_number')::integer
  loop
    v_row := (r ->> 'row_number')::integer;
    if private.person_duplicate(
         nullif(regexp_replace(coalesce(r ->> 'national_id', ''), '[^0-9A-Za-z]', '', 'g'), ''),
         r ->> 'first_name', r ->> 'monastic_name', r ->> 'last_name',
         nullif(r ->> 'birth_date', '')::date, null
       ) then
      continue;
    end if;
    begin
      perform public.save_person(null, r);
    exception when others then
      raise exception 'แถวที่ %: %', v_row, sqlerrm using errcode = '23514';
    end;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------
-- 5) ข้อความแจ้งเมื่อไม่มีสิทธิ์: เดิมระบุชื่อบทบาท "เลขานุการ" ตายตัว เปลี่ยนเป็นข้อความกลาง
--    (แก้เฉพาะข้อความในฟังก์ชันเดิม การทำงานไม่เปลี่ยน)
-- ---------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select pg_get_functiondef(p.oid) as def
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('save_person', 'submit_status_request')
  loop
    execute replace(replace(replace(replace(f.def,
      'ท่านไม่มีสิทธิ์แก้ไขบุคคลนี้ (แก้ไขได้เฉพาะเลขานุการของเขตนั้นหรือหน่วยเหนือ)',
      'ท่านไม่มีสิทธิ์แก้ไขบุคคลนี้ (บทบาทของท่านไม่มีสิทธิ์แก้ไขทะเบียนบุคคลของเขตนี้)'),
      'ท่านไม่มีสิทธิ์บันทึกบุคคลในเขตปกครองนี้ (บันทึกได้เฉพาะเลขานุการของเขตนั้นหรือหน่วยเหนือ)',
      'ท่านไม่มีสิทธิ์บันทึกบุคคลในเขตปกครองนี้ (บทบาทของท่านไม่มีสิทธิ์แก้ไขทะเบียนบุคคลของเขตนี้)'),
      'ผู้ยื่นต้องเป็นเจ้าของประวัติ หรือเลขานุการของหน่วยต้นสังกัด',
      'ผู้ยื่นต้องเป็นเจ้าของประวัติ หรือผู้มีสิทธิ์แก้ไขทะเบียนบุคคลของหน่วยต้นสังกัด'),
      'การแจ้งนี้บันทึกได้เฉพาะเลขานุการของหน่วยต้นสังกัด',
      'การแจ้งนี้บันทึกได้เฉพาะผู้มีสิทธิ์แก้ไขทะเบียนบุคคลของหน่วยต้นสังกัด');
  end loop;
end;
$$;
