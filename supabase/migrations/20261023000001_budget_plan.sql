-- บทที่ 22: โครงสร้างงบประมาณและการจัดสรร (ระบบที่ 6)
-- ปีงบประมาณ แหล่งเงิน หมวดรายจ่าย รายการงบ 3 ชั้น การจัดสรรจากหน่วยเหนือสู่หน่วยล่าง และคำขอโอนเปลี่ยนแปลง
-- จำนวนเงินทุกช่องเป็น numeric(14,2) (ห้ามใช้ float)

-- ---------------------------------------------------------------
-- 1) ขอบเขตงบประมาณของแต่ละบทบาท (ตั้งที่หน้า สิทธิ์ตามบทบาท)
--    ค่าเริ่มต้น (ผู้สั่งงานเลือก): เจ้าหน้าที่การเงินดูและแก้ไขหน่วยตนและใต้สังกัด
--    เจ้าคณะ รองเจ้าคณะ ดูอย่างเดียว ผู้ดูแลระบบทุกเขต บทบาทอื่นไม่ได้
-- ---------------------------------------------------------------
alter table public.roles
  add column budget_view text not null default 'none'
    check (budget_view in ('none', 'own', 'subtree', 'all')),
  add column budget_edit text not null default 'none'
    check (budget_edit in ('none', 'own', 'subtree', 'all'));

update public.roles set budget_view = 'all', budget_edit = 'all' where key = 'admin';
update public.roles set budget_view = 'subtree', budget_edit = 'subtree' where key = 'finance_officer';
update public.roles set budget_view = 'subtree' where key in ('chief', 'deputy_chief');

alter table public.roles
  add constraint roles_budget_edit_within_view
    check (public.personnel_scope_rank(budget_edit) <= public.personnel_scope_rank(budget_view)),
  add constraint roles_admin_full_budget
    check (key <> 'admin' or (budget_view = 'all' and budget_edit = 'all'));

comment on column public.roles.budget_view is 'ขอบเขตการดูงบประมาณ: none / own / subtree / all';
comment on column public.roles.budget_edit is 'ขอบเขตการแก้ไขงบประมาณ: none / own / subtree / all (ไม่กว้างกว่า budget_view)';

create function public.can_view_budget(p_org_unit_id uuid)
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
      r.budget_view = 'all'
      or (r.budget_view = 'own' and m.org_unit_id = p_org_unit_id)
      or (r.budget_view = 'subtree'
          and m.org_unit_id in (select a.id from public.ancestors_or_self(p_org_unit_id) a))
    )
  );
$$;
comment on function public.can_view_budget(uuid) is 'ดูงบประมาณของหน่วยนี้ได้หรือไม่ (ตามขอบเขต roles.budget_view)';

create function public.can_edit_budget(p_org_unit_id uuid)
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
      r.budget_edit = 'all'
      or (r.budget_edit = 'own' and m.org_unit_id = p_org_unit_id)
      or (r.budget_edit = 'subtree'
          and m.org_unit_id in (select a.id from public.ancestors_or_self(p_org_unit_id) a))
    )
  );
$$;
comment on function public.can_edit_budget(uuid) is 'แก้ไข จัดสรร และยื่นคำขอโอนงบประมาณของหน่วยนี้ได้หรือไม่ (ตามขอบเขต roles.budget_edit)';

revoke execute on function public.can_view_budget(uuid) from public, anon;
revoke execute on function public.can_edit_budget(uuid) from public, anon;
grant execute on function public.can_view_budget(uuid) to authenticated;
grant execute on function public.can_edit_budget(uuid) to authenticated;

-- เขตที่ผู้ใช้ดูงบประมาณได้ สำหรับตัวเลือกเขต (รูปแบบเดียวกับ accessible_org_units)
-- selectable = ดูงบของหน่วยนั้นได้ / หน่วยเหนือของสายตนส่งมาให้ไล่ชั้นลงมาเท่านั้น
create function public.budget_units()
returns table (
  id uuid, parent_id uuid, level public.org_level, sect public.sect,
  name text, code text, is_active boolean, selectable boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select r.budget_view, m.org_unit_id
    from public.my_role_rows() m
    join public.roles r on r.key = m.role_key
    where m.effective and r.budget_view <> 'none'
  ),
  everything as (
    select exists (select 1 from mine where budget_view = 'all') as yes
  ),
  reachable as (
    select org_unit_id as id from mine where org_unit_id is not null
    union
    select d.id from mine x cross join lateral public.descendants_of(x.org_unit_id) d
    where x.budget_view = 'subtree' and x.org_unit_id is not null
  ),
  path_only as (
    select a.id from mine x cross join lateral public.ancestors_or_self(x.org_unit_id) a
    where x.org_unit_id is not null and a.depth > 0
  )
  select u.id, u.parent_id, u.level, u.sect, u.name, u.code, u.is_active,
         ((select yes from everything) or u.id in (select id from reachable)) as selectable
  from public.org_units u
  where u.is_active
    and ((select yes from everything) or u.id in (select id from reachable) or u.id in (select id from path_only))
  order by u.code;
$$;
revoke execute on function public.budget_units() from public, anon;
grant execute on function public.budget_units() to authenticated;

-- ---------------------------------------------------------------
-- 2) ปีงบประมาณ: ปีงบ 2570 = 1 ต.ค. 2569 - 30 ก.ย. 2570 (วันที่คำนวณให้จากปี พ.ศ.)
--    สถานะ open เปิด / closed ปิด (ปิดแล้วแก้ไข จัดสรร หรือโอนไม่ได้) ผู้ดูแลระบบเพิ่มและเปิดปิดเอง
-- ---------------------------------------------------------------
create table public.fiscal_years (
  id          uuid primary key default gen_random_uuid(),
  year_be     integer not null unique check (year_be between 2500 and 2700),
  starts_on   date not null,
  ends_on     date not null,
  status      text not null default 'open' check (status in ('open', 'closed')),
  note        text not null default '' check (length(note) <= 500),
  closed_at   timestamptz,
  closed_by   uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint fiscal_years_dates check (
    starts_on = make_date(year_be - 544, 10, 1) and ends_on = make_date(year_be - 543, 9, 30)
  )
);
comment on table public.fiscal_years is 'ปีงบประมาณ (1 ต.ค. ถึง 30 ก.ย.) สถานะ open เปิด / closed ปิด';

create function public.fiscal_years_fill()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.year_be <> old.year_be then
    raise exception 'เปลี่ยนปีงบประมาณของรายการเดิมไม่ได้' using errcode = 'P0001';
  end if;
  new.starts_on := make_date(new.year_be - 544, 10, 1);
  new.ends_on := make_date(new.year_be - 543, 9, 30);
  if new.status = 'closed' and (tg_op = 'INSERT' or old.status <> 'closed') then
    new.closed_at := now();
    new.closed_by := auth.uid();
  elsif new.status = 'open' then
    new.closed_at := null;
    new.closed_by := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.fiscal_years_fill() from public, anon, authenticated;
create trigger fiscal_years_fill before insert or update on public.fiscal_years
  for each row execute function public.fiscal_years_fill();
create trigger fiscal_years_set_updated_at before update on public.fiscal_years
  for each row execute function public.set_updated_at();
create trigger fiscal_years_audit after insert or update or delete on public.fiscal_years
  for each row execute function public.audit_row_change();

alter table public.fiscal_years enable row level security;
create policy fiscal_years_read on public.fiscal_years for select to authenticated using (true);
create policy fiscal_years_admin_insert on public.fiscal_years for insert to authenticated
  with check (public.has_role('admin'));
create policy fiscal_years_admin_update on public.fiscal_years for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.fiscal_years from anon;
revoke delete, truncate on public.fiscal_years from authenticated;
grant select, insert, update on public.fiscal_years to authenticated;

-- ---------------------------------------------------------------
-- 3) แหล่งเงิน และหมวดรายจ่าย (ค่าตั้งต้นตามตัวอย่างในคำสั่ง ผู้ดูแลระบบเพิ่ม แก้ชื่อ ปิดใช้งานได้)
-- ---------------------------------------------------------------
create table public.budget_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> '' and length(name) <= 100),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.budget_sources is 'แหล่งเงินของรายการงบประมาณ';
create unique index budget_sources_name_unique on public.budget_sources (lower(btrim(name)));

create table public.budget_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> '' and length(name) <= 100),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.budget_categories is 'หมวดรายจ่าย (ชั้นล่างสุดของรายการงบประมาณ)';
create unique index budget_categories_name_unique on public.budget_categories (lower(btrim(name)));

insert into public.budget_sources (name, sort_order) values
  ('เงินอุดหนุน', 1), ('เงินบริจาค', 2), ('เงินรายได้ของหน่วย', 3);
insert into public.budget_categories (name, sort_order) values
  ('ค่าตอบแทน', 1), ('ค่าใช้สอย', 2), ('ค่าวัสดุ', 3), ('ค่าครุภัณฑ์', 4);

create trigger budget_sources_set_updated_at before update on public.budget_sources
  for each row execute function public.set_updated_at();
create trigger budget_sources_audit after insert or update or delete on public.budget_sources
  for each row execute function public.audit_row_change();
create trigger budget_categories_set_updated_at before update on public.budget_categories
  for each row execute function public.set_updated_at();
create trigger budget_categories_audit after insert or update or delete on public.budget_categories
  for each row execute function public.audit_row_change();

alter table public.budget_sources enable row level security;
alter table public.budget_categories enable row level security;
create policy budget_sources_read on public.budget_sources for select to authenticated using (true);
create policy budget_sources_admin_insert on public.budget_sources for insert to authenticated
  with check (public.has_role('admin'));
create policy budget_sources_admin_update on public.budget_sources for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy budget_categories_read on public.budget_categories for select to authenticated using (true);
create policy budget_categories_admin_insert on public.budget_categories for insert to authenticated
  with check (public.has_role('admin'));
create policy budget_categories_admin_update on public.budget_categories for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.budget_sources, public.budget_categories from anon;
revoke delete, truncate on public.budget_sources, public.budget_categories from authenticated;
grant select, insert, update on public.budget_sources, public.budget_categories to authenticated;

-- ---------------------------------------------------------------
-- 4) รายการงบประมาณ 3 ชั้น: program แผนงาน > project โครงการหรือกิจกรรม > category หมวดรายจ่าย
--    วงเงินและแหล่งเงินอยู่ที่ชั้นหมวดรายจ่าย ชั้นบนแสดงผลรวม
--    org_unit_id = หน่วยเจ้าของงบ (ชั้นล่างต้องเป็นปีและหน่วยเดียวกับชั้นบน)
-- ---------------------------------------------------------------
create table public.budget_items (
  id              uuid primary key default gen_random_uuid(),
  fiscal_year_id  uuid not null references public.fiscal_years (id),
  org_unit_id     uuid not null references public.org_units (id),
  parent_id       uuid references public.budget_items (id),
  kind            text not null check (kind in ('program', 'project', 'category')),
  name            text not null default '' check (length(name) <= 200),
  code            text not null default '' check (length(code) <= 40),
  category_id     uuid references public.budget_categories (id),
  source_id       uuid references public.budget_sources (id),
  amount          numeric(14,2) check (amount >= 0),
  note            text not null default '' check (length(note) <= 500),
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_by      uuid default auth.uid() references public.profiles (id),
  updated_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint budget_items_parent_kind check ((kind = 'program') = (parent_id is null)),
  constraint budget_items_leaf_fields check (
    (kind = 'category') = (category_id is not null)
    and (kind = 'category') = (source_id is not null)
    and (kind = 'category') = (amount is not null)
  ),
  constraint budget_items_name check (kind = 'category' or btrim(name) <> '')
);
comment on table public.budget_items is 'รายการงบประมาณ: program แผนงาน > project โครงการ/กิจกรรม > category หมวดรายจ่าย (มีวงเงินและแหล่งเงิน)';
create unique index budget_items_program_unique on public.budget_items (fiscal_year_id, org_unit_id, lower(btrim(name)))
  where kind = 'program' and is_active;
create unique index budget_items_project_unique on public.budget_items (parent_id, lower(btrim(name)))
  where kind = 'project' and is_active;
create unique index budget_items_category_unique on public.budget_items (parent_id, category_id, source_id)
  where kind = 'category' and is_active;
create index budget_items_owner_idx on public.budget_items (fiscal_year_id, org_unit_id);
create index budget_items_parent_idx on public.budget_items (parent_id);

-- ประวัติการเปลี่ยนแปลงของรายการ (ระบบเขียนเท่านั้น)
-- action: create สร้าง / edit แก้ไข / import นำเข้า / transfer_in รับโอน / transfer_out โอนออก / deactivate ปิดใช้งาน / activate เปิดใช้งาน
create table public.budget_item_changes (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.budget_items (id),
  action         text not null check (action in ('create', 'edit', 'import', 'transfer_in', 'transfer_out', 'deactivate', 'activate')),
  amount_before  numeric(14,2),
  amount_after   numeric(14,2),
  detail         jsonb not null default '{}'::jsonb,
  reason         text not null default '' check (length(reason) <= 1000),
  transfer_id    uuid,
  actor_id       uuid default auth.uid() references public.profiles (id),
  created_at     timestamptz not null default now()
);
comment on table public.budget_item_changes is 'ประวัติรายการงบประมาณ (สร้าง แก้ไข นำเข้า โอน ปิดใช้งาน) ระบบเขียนเท่านั้น';
create index budget_item_changes_item_idx on public.budget_item_changes (item_id, created_at);

-- ---------------------------------------------------------------
-- 5) การจัดสรร: หน่วยหนึ่งจัดสรรรายการ (ชั้นหมวดรายจ่าย) ให้หน่วยใต้สังกัดชั้นใดก็ได้ (ข้ามชั้นได้: ผู้สั่งงานเลือก)
--    หรือให้สำนักเรียน / สำนักศาสนศึกษา ในเขตของตน จำนวนเงินติดลบ = ปรับลดการจัดสรรครั้งก่อน
--    ยอดที่หน่วยได้รับของรายการ = วงเงินของรายการ (ถ้าเป็นหน่วยเจ้าของ) หรือผลรวมที่หน่วยเหนือจัดสรรลงมา
--    ยอดที่หน่วยจัดสรรลงล่างรวมกันต้องไม่เกินยอดที่หน่วยได้รับ (ตรวจใน allocate_budget และ cancel_budget_allocation)
-- ---------------------------------------------------------------
create table public.budget_allocations (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.budget_items (id),
  fiscal_year_id  uuid not null references public.fiscal_years (id),
  from_unit_id    uuid not null references public.org_units (id),
  to_unit_id      uuid references public.org_units (id),
  to_place_id     uuid references public.places (id),
  to_org_unit_id  uuid not null references public.org_units (id),  -- เขตของผู้รับ (หน่วยผู้รับ หรือเขตของสำนัก) ใช้กำหนดสิทธิ์ดู
  round_no        integer not null check (round_no between 1 and 999),  -- ครั้งที่
  allocated_on    date not null,
  amount          numeric(14,2) not null check (amount <> 0),
  reference_no    text not null default '' check (length(reference_no) <= 200),  -- เอกสารอ้างอิง เช่น เลขที่หนังสือ
  note            text not null default '' check (length(note) <= 500),
  is_active       boolean not null default true,
  cancel_reason   text not null default '' check (length(cancel_reason) <= 500),
  cancelled_at    timestamptz,
  cancelled_by    uuid references public.profiles (id),
  created_by      uuid default auth.uid() references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint budget_allocations_one_target check ((to_unit_id is null) <> (to_place_id is null)),
  constraint budget_allocations_not_self check (to_unit_id is null or to_unit_id <> from_unit_id)
);
comment on table public.budget_allocations is 'การจัดสรรงบประมาณจากหน่วยเหนือสู่หน่วยล่างหรือสำนัก (ติดลบ = ปรับลด) ยกเลิก = is_active false';
create index budget_allocations_item_from_idx on public.budget_allocations (item_id, from_unit_id) where is_active;
create index budget_allocations_item_to_idx on public.budget_allocations (item_id, to_unit_id) where is_active;
create index budget_allocations_to_unit_idx on public.budget_allocations (fiscal_year_id, to_unit_id);
create index budget_allocations_to_place_idx on public.budget_allocations (to_place_id) where to_place_id is not null;

create trigger budget_allocations_set_updated_at before update on public.budget_allocations
  for each row execute function public.set_updated_at();
create trigger budget_allocations_audit after insert or update or delete on public.budget_allocations
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- 6) คำขอโอนเปลี่ยนแปลงระหว่างรายการ (หมวดรายจ่าย 2 รายการของหน่วยเจ้าของงบเดียวกัน ปีเดียวกัน)
--    ยื่นผ่านเครื่องอนุมัติกลาง ชนิด budget_transfer ขั้นเดียวที่หน่วยเจ้าของงบ
--    (เจ้าคณะหรือรองเจ้าคณะของหน่วยนั้น ถ้าหน่วยเจ้าของเป็นส่วนกลาง = เจ้าหน้าที่ส่วนกลาง: ผู้สั่งงานเลือก)
--    อนุมัติแล้วระบบย้ายวงเงินให้และบันทึกประวัติทั้ง 2 รายการ
-- ---------------------------------------------------------------
create table public.budget_transfers (
  id              uuid primary key default gen_random_uuid(),
  fiscal_year_id  uuid not null references public.fiscal_years (id),
  org_unit_id     uuid not null references public.org_units (id),
  from_item_id    uuid not null references public.budget_items (id),
  to_item_id      uuid not null references public.budget_items (id),
  amount          numeric(14,2) not null check (amount > 0),
  reason          text not null check (length(btrim(reason)) between 3 and 1000),
  status          text not null default 'pending'
                    check (status in ('pending', 'returned', 'approved', 'rejected', 'cancelled')),
  request_id      uuid references public.requests (id),
  applied_at      timestamptz,
  created_by      uuid default auth.uid() references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint budget_transfers_two_items check (from_item_id <> to_item_id)
);
comment on table public.budget_transfers is 'คำขอโอนเปลี่ยนแปลงวงเงินระหว่างรายการ สถานะตามคำขอในเครื่องอนุมัติกลาง';
create index budget_transfers_owner_idx on public.budget_transfers (fiscal_year_id, org_unit_id);
create index budget_transfers_items_idx on public.budget_transfers (from_item_id, to_item_id);
create unique index budget_transfers_request_unique on public.budget_transfers (request_id) where request_id is not null;

create trigger budget_transfers_set_updated_at before update on public.budget_transfers
  for each row execute function public.set_updated_at();
create trigger budget_transfers_audit after insert or update or delete on public.budget_transfers
  for each row execute function public.audit_row_change();

alter table public.budget_item_changes
  add constraint budget_item_changes_transfer_fk foreign key (transfer_id) references public.budget_transfers (id);
create trigger budget_item_changes_audit after insert or update or delete on public.budget_item_changes
  for each row execute function public.audit_row_change();
create trigger budget_items_set_updated_at before update on public.budget_items
  for each row execute function public.set_updated_at();
create trigger budget_items_audit after insert or update or delete on public.budget_items
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- 7) ยอดเงินต่อหน่วย
-- ---------------------------------------------------------------
-- ยอดที่หน่วยจัดสรรออกของรายการ
create function private.budget_out(p_item uuid, p_unit uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(a.amount), 0)::numeric(14,2)
  from public.budget_allocations a
  where a.item_id = p_item and a.from_unit_id = p_unit and a.is_active;
$$;

-- ยอดที่หน่วยได้รับของรายการ: หน่วยเจ้าของ = วงเงิน / หน่วยอื่น = ผลรวมที่ถูกจัดสรรลงมา
create function private.budget_received(p_item uuid, p_unit uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when i.org_unit_id = p_unit then coalesce(i.amount, 0)
    else coalesce((select sum(a.amount) from public.budget_allocations a
                   where a.item_id = p_item and a.to_unit_id = p_unit and a.is_active), 0)
  end::numeric(14,2)
  from public.budget_items i
  where i.id = p_item;
$$;

-- ยอดสุทธิที่หน่วยหนึ่งจัดสรรให้ผู้รับรายหนึ่ง (รวมการปรับลด)
create function private.budget_pair_total(p_item uuid, p_from uuid, p_to_unit uuid, p_to_place uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(a.amount), 0)::numeric(14,2)
  from public.budget_allocations a
  where a.item_id = p_item and a.from_unit_id = p_from and a.is_active
    and a.to_unit_id is not distinct from p_to_unit and a.to_place_id is not distinct from p_to_place;
$$;

-- ปีงบประมาณต้องเปิดอยู่
create function private.budget_year_open(p_year uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_year public.fiscal_years%rowtype;
begin
  select * into v_year from public.fiscal_years where id = p_year;
  if not found then
    raise exception 'ไม่พบปีงบประมาณ' using errcode = 'P0001';
  end if;
  if v_year.status <> 'open' then
    raise exception 'ปีงบประมาณ % ปิดแล้ว แก้ไข จัดสรร หรือโอนไม่ได้', v_year.year_be using errcode = 'P0001';
  end if;
end;
$$;

-- ชื่อที่แสดงของรายการ (หมวดรายจ่าย = ชื่อหมวด + แหล่งเงิน)
create function private.budget_item_label(p_item uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when i.kind = 'category' then concat(c.name, ' (', s.name, ')')
    else i.name
  end
  from public.budget_items i
  left join public.budget_categories c on c.id = i.category_id
  left join public.budget_sources s on s.id = i.source_id
  where i.id = p_item;
$$;

-- เส้นทางของรายการ: แผนงาน > โครงการ > หมวด
create function private.budget_item_path(p_item uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with recursive up as (
    select i.id, i.parent_id, 0 as depth from public.budget_items i where i.id = p_item
    union all
    select i.id, i.parent_id, up.depth + 1 from public.budget_items i join up on i.id = up.parent_id
  )
  select string_agg(private.budget_item_label(up.id), ' > ' order by up.depth desc) from up;
$$;

revoke all on function private.budget_out(uuid, uuid) from public, anon, authenticated;
revoke all on function private.budget_received(uuid, uuid) from public, anon, authenticated;
revoke all on function private.budget_pair_total(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.budget_year_open(uuid) from public, anon, authenticated;
revoke all on function private.budget_item_label(uuid) from public, anon, authenticated;
revoke all on function private.budget_item_path(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 8) กติกาของรายการ (trigger)
-- ---------------------------------------------------------------
create function public.budget_items_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent public.budget_items%rowtype;
  v_allocated boolean;
begin
  if tg_op = 'UPDATE' and (
       new.fiscal_year_id <> old.fiscal_year_id or new.org_unit_id <> old.org_unit_id
       or new.kind <> old.kind or new.parent_id is distinct from old.parent_id) then
    raise exception 'เปลี่ยนปีงบประมาณ หน่วยเจ้าของ ชั้น หรือรายการแม่ของรายการเดิมไม่ได้' using errcode = 'P0001';
  end if;
  perform private.budget_year_open(new.fiscal_year_id);

  if not exists (select 1 from public.org_units u where u.id = new.org_unit_id and u.is_active) then
    raise exception 'หน่วยเจ้าของงบถูกปิดใช้งานแล้ว' using errcode = 'P0001';
  end if;

  if new.parent_id is not null then
    select * into v_parent from public.budget_items where id = new.parent_id;
    if v_parent.fiscal_year_id <> new.fiscal_year_id or v_parent.org_unit_id <> new.org_unit_id then
      raise exception 'รายการย่อยต้องเป็นปีงบประมาณและหน่วยเดียวกับรายการแม่' using errcode = 'P0001';
    end if;
    if (new.kind = 'project' and v_parent.kind <> 'program') or (new.kind = 'category' and v_parent.kind <> 'project') then
      raise exception 'ลำดับชั้นไม่ถูกต้อง: แผนงาน > โครงการหรือกิจกรรม > หมวดรายจ่าย' using errcode = 'P0001';
    end if;
    if new.is_active and not v_parent.is_active then
      raise exception 'รายการแม่ถูกปิดใช้งานแล้ว' using errcode = 'P0001';
    end if;
  end if;

  new.name := btrim(new.name);
  new.code := btrim(new.code);
  new.note := btrim(new.note);
  if new.kind = 'category' then
    new.name := '';
    if (tg_op = 'INSERT' or new.category_id <> old.category_id)
       and not exists (select 1 from public.budget_categories c where c.id = new.category_id and c.is_active) then
      raise exception 'หมวดรายจ่ายนี้ถูกปิดใช้งานแล้ว' using errcode = 'P0001';
    end if;
    if (tg_op = 'INSERT' or new.source_id <> old.source_id)
       and not exists (select 1 from public.budget_sources s where s.id = new.source_id and s.is_active) then
      raise exception 'แหล่งเงินนี้ถูกปิดใช้งานแล้ว' using errcode = 'P0001';
    end if;
    if new.amount <> round(new.amount, 2) then
      raise exception 'จำนวนเงินมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.kind = 'category' then
    v_allocated := exists (select 1 from public.budget_allocations a where a.item_id = new.id and a.is_active);
    if v_allocated and (new.category_id <> old.category_id or new.source_id <> old.source_id) then
      raise exception 'รายการที่เริ่มจัดสรรแล้ว เปลี่ยนหมวดรายจ่ายหรือแหล่งเงินไม่ได้' using errcode = 'P0001';
    end if;
    if new.amount <> old.amount then
      if v_allocated and coalesce(current_setting('app.budget_transfer', true), '') <> '1' then
        raise exception 'รายการที่เริ่มจัดสรรแล้ว เปลี่ยนวงเงินได้ผ่านคำขอโอนเปลี่ยนแปลงที่อนุมัติแล้วเท่านั้น' using errcode = 'P0001';
      end if;
      if new.amount < private.budget_out(new.id, new.org_unit_id) then
        raise exception 'วงเงินน้อยกว่ายอดที่จัดสรรออกไปแล้ว (%)', to_char(private.budget_out(new.id, new.org_unit_id), 'FM999,999,999,990.00')
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.is_active and not new.is_active then
    if exists (select 1 from public.budget_items c where c.parent_id = new.id and c.is_active) then
      raise exception 'ยังมีรายการย่อยที่ใช้งานอยู่ ต้องปิดใช้งานรายการย่อยก่อน' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.budget_allocations a where a.item_id = new.id and a.is_active) then
      raise exception 'รายการนี้มีการจัดสรรแล้ว ปิดใช้งานไม่ได้ (ยกเลิกการจัดสรรก่อน)' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.budget_transfers t
               where (t.from_item_id = new.id or t.to_item_id = new.id) and t.status in ('pending', 'returned')) then
      raise exception 'รายการนี้มีคำขอโอนที่ยังไม่ได้ผล ปิดใช้งานไม่ได้' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke execute on function public.budget_items_rules() from public, anon, authenticated;
create trigger budget_items_rules before insert or update on public.budget_items
  for each row execute function public.budget_items_rules();

-- ---------------------------------------------------------------
-- 9) RLS: เห็นงบของหน่วยที่มีสิทธิ์ดู (ตามขอบเขต budget_view) เขียนผ่านฟังก์ชันเท่านั้น
--    รายการของหน่วยเหนือที่จัดสรรลงมา อ่านผ่านฟังก์ชัน budget_tree / budget_item_detail
-- ---------------------------------------------------------------
alter table public.budget_items enable row level security;
alter table public.budget_item_changes enable row level security;
alter table public.budget_allocations enable row level security;
alter table public.budget_transfers enable row level security;

create policy budget_items_read on public.budget_items for select to authenticated
  using (public.can_view_budget(org_unit_id));
create policy budget_item_changes_read on public.budget_item_changes for select to authenticated
  using (exists (select 1 from public.budget_items i where i.id = item_id and public.can_view_budget(i.org_unit_id)));
create policy budget_allocations_read on public.budget_allocations for select to authenticated
  using (public.can_view_budget(from_unit_id) or public.can_view_budget(to_org_unit_id));
create policy budget_transfers_read on public.budget_transfers for select to authenticated
  using (created_by = auth.uid() or public.can_view_budget(org_unit_id));

revoke all on public.budget_items, public.budget_item_changes, public.budget_allocations, public.budget_transfers from anon;
revoke insert, update, delete, truncate on public.budget_items, public.budget_item_changes, public.budget_allocations,
  public.budget_transfers from authenticated;
grant select on public.budget_items, public.budget_item_changes, public.budget_allocations, public.budget_transfers
  to authenticated;

-- ---------------------------------------------------------------
-- 10) เพิ่ม แก้ไข ปิดใช้งาน รายการ
-- ---------------------------------------------------------------
create function public.save_budget_item(
  p_id uuid, p_year uuid, p_unit uuid, p_parent uuid, p_kind text, p_name text, p_code text,
  p_category uuid, p_source uuid, p_amount numeric, p_note text, p_sort integer default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.budget_items%rowtype;
  v_new public.budget_items%rowtype;
  v_parent public.budget_items%rowtype;
  v_year uuid := p_year;
  v_unit uuid := p_unit;
  v_kind text := p_kind;
  v_detail jsonb := '{}'::jsonb;
  v_id uuid;
begin
  if p_id is not null then
    select * into v_old from public.budget_items where id = p_id for update;
    if not found then
      raise exception 'ไม่พบรายการงบประมาณ' using errcode = 'P0001';
    end if;
    if not v_old.is_active then
      raise exception 'รายการนี้ถูกปิดใช้งานแล้ว' using errcode = 'P0001';
    end if;
    v_year := v_old.fiscal_year_id; v_unit := v_old.org_unit_id; v_kind := v_old.kind;
  elsif p_parent is not null then
    select * into v_parent from public.budget_items where id = p_parent;
    if not found then
      raise exception 'ไม่พบรายการแม่' using errcode = 'P0001';
    end if;
    v_year := v_parent.fiscal_year_id; v_unit := v_parent.org_unit_id;
  end if;

  if not public.can_edit_budget(v_unit) then
    raise exception 'ท่านไม่มีสิทธิ์แก้ไขงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  if coalesce(v_kind, '') not in ('program', 'project', 'category') then
    raise exception 'ชั้นของรายการไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  if v_kind = 'program' and p_parent is not null and p_id is null then
    raise exception 'แผนงานเป็นชั้นบนสุด ไม่มีรายการแม่' using errcode = 'P0001';
  end if;
  if v_kind <> 'program' and p_id is null and p_parent is null then
    raise exception 'กรุณาเลือกรายการแม่' using errcode = 'P0001';
  end if;
  if v_kind = 'category' then
    if p_category is null then
      raise exception 'กรุณาเลือกหมวดรายจ่าย' using errcode = 'P0001';
    end if;
    if p_source is null then
      raise exception 'กรุณาเลือกแหล่งเงิน' using errcode = 'P0001';
    end if;
    if p_amount is null or p_amount < 0 then
      raise exception 'กรุณากรอกวงเงิน (ไม่ติดลบ)' using errcode = 'P0001';
    end if;
    if p_amount > 999999999999.99 or p_amount <> round(p_amount, 2) then
      raise exception 'วงเงินไม่ถูกต้อง (ทศนิยมไม่เกิน 2 ตำแหน่ง)' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.budget_items i
               where i.parent_id = coalesce(p_parent, v_old.parent_id) and i.kind = 'category' and i.is_active
                 and i.category_id = p_category and i.source_id = p_source and i.id is distinct from p_id) then
      raise exception 'โครงการนี้มีหมวดรายจ่ายและแหล่งเงินนี้แล้ว' using errcode = 'P0001';
    end if;
  else
    if coalesce(btrim(p_name), '') = '' then
      raise exception 'กรุณากรอกชื่อ%', case v_kind when 'program' then 'แผนงาน' else 'โครงการหรือกิจกรรม' end
        using errcode = 'P0001';
    end if;
    if v_kind = 'program' and exists (
         select 1 from public.budget_items i
         where i.fiscal_year_id = v_year and i.org_unit_id = v_unit and i.kind = 'program' and i.is_active
           and lower(btrim(i.name)) = lower(btrim(p_name)) and i.id is distinct from p_id) then
      raise exception 'มีแผนงานชื่อนี้ในปีงบประมาณนี้แล้ว' using errcode = 'P0001';
    end if;
    if v_kind = 'project' and exists (
         select 1 from public.budget_items i
         where i.parent_id = coalesce(p_parent, v_old.parent_id) and i.kind = 'project' and i.is_active
           and lower(btrim(i.name)) = lower(btrim(p_name)) and i.id is distinct from p_id) then
      raise exception 'แผนงานนี้มีโครงการหรือกิจกรรมชื่อนี้แล้ว' using errcode = 'P0001';
    end if;
  end if;

  if p_id is null then
    insert into public.budget_items (fiscal_year_id, org_unit_id, parent_id, kind, name, code, category_id, source_id,
                                     amount, note, sort_order)
    values (v_year, v_unit, p_parent, v_kind, coalesce(p_name, ''), coalesce(p_code, ''),
            case when v_kind = 'category' then p_category end, case when v_kind = 'category' then p_source end,
            case when v_kind = 'category' then p_amount end, coalesce(p_note, ''),
            coalesce(p_sort, (select coalesce(max(i.sort_order), 0) + 1 from public.budget_items i
                              where i.fiscal_year_id = v_year and i.org_unit_id = v_unit
                                and i.parent_id is not distinct from p_parent)))
    returning * into v_new;
    insert into public.budget_item_changes (item_id, action, amount_after, detail)
    values (v_new.id, 'create', v_new.amount, jsonb_build_object('label', private.budget_item_label(v_new.id)));
    return v_new.id;
  end if;

  update public.budget_items
     set name = case when kind = 'category' then '' else coalesce(p_name, '') end,
         code = coalesce(p_code, ''),
         category_id = case when kind = 'category' then p_category end,
         source_id = case when kind = 'category' then p_source end,
         amount = case when kind = 'category' then p_amount end,
         note = coalesce(p_note, ''),
         sort_order = coalesce(p_sort, sort_order)
   where id = p_id
  returning * into v_new;

  if v_new.name <> v_old.name then
    v_detail := v_detail || jsonb_build_object('name', jsonb_build_object('from', v_old.name, 'to', v_new.name));
  end if;
  if v_new.code <> v_old.code then
    v_detail := v_detail || jsonb_build_object('code', jsonb_build_object('from', v_old.code, 'to', v_new.code));
  end if;
  if v_new.category_id is distinct from v_old.category_id then
    v_detail := v_detail || jsonb_build_object('category', jsonb_build_object(
      'from', (select name from public.budget_categories where id = v_old.category_id),
      'to', (select name from public.budget_categories where id = v_new.category_id)));
  end if;
  if v_new.source_id is distinct from v_old.source_id then
    v_detail := v_detail || jsonb_build_object('source', jsonb_build_object(
      'from', (select name from public.budget_sources where id = v_old.source_id),
      'to', (select name from public.budget_sources where id = v_new.source_id)));
  end if;
  if v_new.note <> v_old.note then
    v_detail := v_detail || jsonb_build_object('note', jsonb_build_object('from', v_old.note, 'to', v_new.note));
  end if;
  if v_detail <> '{}'::jsonb or v_new.amount is distinct from v_old.amount then
    insert into public.budget_item_changes (item_id, action, amount_before, amount_after, detail)
    values (p_id, 'edit', v_old.amount, v_new.amount, v_detail);
  end if;
  return p_id;
end;
$$;

create function public.set_budget_item_active(p_id uuid, p_active boolean, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.budget_items%rowtype;
begin
  select * into v_item from public.budget_items where id = p_id for update;
  if not found then
    raise exception 'ไม่พบรายการงบประมาณ' using errcode = 'P0001';
  end if;
  if not public.can_edit_budget(v_item.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์แก้ไขงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  if v_item.is_active = p_active then
    return;
  end if;
  if p_active then
    if v_item.kind = 'program' and exists (
         select 1 from public.budget_items i where i.fiscal_year_id = v_item.fiscal_year_id and i.org_unit_id = v_item.org_unit_id
           and i.kind = 'program' and i.is_active and lower(btrim(i.name)) = lower(btrim(v_item.name))) then
      raise exception 'มีแผนงานชื่อนี้ที่ใช้งานอยู่แล้ว' using errcode = 'P0001';
    end if;
    if v_item.kind = 'project' and exists (
         select 1 from public.budget_items i where i.parent_id = v_item.parent_id and i.kind = 'project' and i.is_active
           and lower(btrim(i.name)) = lower(btrim(v_item.name))) then
      raise exception 'มีโครงการหรือกิจกรรมชื่อนี้ที่ใช้งานอยู่แล้ว' using errcode = 'P0001';
    end if;
    if v_item.kind = 'category' and exists (
         select 1 from public.budget_items i where i.parent_id = v_item.parent_id and i.kind = 'category' and i.is_active
           and i.category_id = v_item.category_id and i.source_id = v_item.source_id) then
      raise exception 'มีหมวดรายจ่ายและแหล่งเงินนี้ที่ใช้งานอยู่แล้ว' using errcode = 'P0001';
    end if;
  end if;
  update public.budget_items set is_active = p_active where id = p_id;
  insert into public.budget_item_changes (item_id, action, amount_before, amount_after, reason)
  values (p_id, case when p_active then 'activate' else 'deactivate' end, v_item.amount, v_item.amount,
          left(btrim(coalesce(p_reason, '')), 1000));
end;
$$;

-- ---------------------------------------------------------------
-- 11) จัดสรร และยกเลิกการจัดสรร
-- ---------------------------------------------------------------
create function public.allocate_budget(
  p_item uuid, p_from_unit uuid, p_to_unit uuid, p_to_place uuid, p_round integer, p_date date,
  p_amount numeric, p_reference text default '', p_note text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.budget_items%rowtype;
  v_place public.places%rowtype;
  v_to_org uuid;
  v_received numeric;
  v_out numeric;
  v_id uuid;
begin
  select * into v_item from public.budget_items where id = p_item for update;
  if not found or v_item.kind <> 'category' then
    raise exception 'จัดสรรได้เฉพาะรายการชั้นหมวดรายจ่าย' using errcode = 'P0001';
  end if;
  if not v_item.is_active then
    raise exception 'รายการนี้ถูกปิดใช้งานแล้ว' using errcode = 'P0001';
  end if;
  perform private.budget_year_open(v_item.fiscal_year_id);
  if not public.can_edit_budget(p_from_unit) then
    raise exception 'ท่านไม่มีสิทธิ์จัดสรรงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 or p_amount <> round(p_amount, 2) or abs(p_amount) > 999999999999.99 then
    raise exception 'จำนวนเงินไม่ถูกต้อง (ไม่เป็นศูนย์ ทศนิยมไม่เกิน 2 ตำแหน่ง)' using errcode = 'P0001';
  end if;
  if p_round is null or p_round not between 1 and 999 then
    raise exception 'ครั้งที่ต้องเป็นตัวเลข 1 ถึง 999' using errcode = 'P0001';
  end if;
  if p_date is null then
    raise exception 'กรุณากรอกวันที่จัดสรร' using errcode = 'P0001';
  end if;
  if (p_to_unit is null) = (p_to_place is null) then
    raise exception 'กรุณาเลือกผู้รับการจัดสรร 1 ราย (หน่วยหรือสำนัก)' using errcode = 'P0001';
  end if;

  if p_to_unit is not null then
    if not exists (select 1 from public.descendants_of(p_from_unit) d where d.id = p_to_unit and d.is_active) then
      raise exception 'ผู้รับต้องเป็นหน่วยใต้สังกัดของหน่วยที่จัดสรร' using errcode = 'P0001';
    end if;
    v_to_org := p_to_unit;
  else
    select * into v_place from public.places where id = p_to_place;
    if not found or v_place.place_type not in ('samnak_rian', 'samnak_sasanasuksa') or not v_place.is_active then
      raise exception 'ผู้รับต้องเป็นสำนักเรียนหรือสำนักศาสนศึกษาที่ใช้งานอยู่' using errcode = 'P0001';
    end if;
    if p_amount > 0 and v_place.status <> 'open' then
      raise exception 'สำนักนี้ไม่ได้เปิดดำเนินการ' using errcode = 'P0001';
    end if;
    if v_place.org_unit_id <> p_from_unit
       and not exists (select 1 from public.descendants_of(p_from_unit) d where d.id = v_place.org_unit_id) then
      raise exception 'สำนักต้องอยู่ในเขตของหน่วยที่จัดสรร' using errcode = 'P0001';
    end if;
    v_to_org := v_place.org_unit_id;
  end if;

  if v_item.org_unit_id <> p_from_unit and not exists (
       select 1 from public.budget_allocations a where a.item_id = p_item and a.to_unit_id = p_from_unit and a.is_active) then
    raise exception 'หน่วยนี้ไม่ได้เป็นเจ้าของหรือได้รับจัดสรรรายการนี้' using errcode = 'P0001';
  end if;
  v_received := private.budget_received(p_item, p_from_unit);
  v_out := private.budget_out(p_item, p_from_unit);
  if p_amount > 0 then
    if v_out + p_amount > v_received then
      raise exception 'ยอดจัดสรรเกินยอดคงเหลือของหน่วย (คงเหลือ % บาท)', to_char(v_received - v_out, 'FM999,999,999,990.00')
        using errcode = 'P0001';
    end if;
  else
    if private.budget_pair_total(p_item, p_from_unit, p_to_unit, p_to_place) + p_amount < 0 then
      raise exception 'ปรับลดเกินยอดที่จัดสรรให้ผู้รับรายนี้ (จัดสรรไว้ % บาท)',
        to_char(private.budget_pair_total(p_item, p_from_unit, p_to_unit, p_to_place), 'FM999,999,999,990.00')
        using errcode = 'P0001';
    end if;
    if p_to_unit is not null
       and private.budget_received(p_item, p_to_unit) + p_amount < private.budget_out(p_item, p_to_unit) then
      raise exception 'ปรับลดไม่ได้ เพราะผู้รับจัดสรรต่อลงไปแล้ว % บาท', to_char(private.budget_out(p_item, p_to_unit), 'FM999,999,999,990.00')
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.budget_allocations (item_id, fiscal_year_id, from_unit_id, to_unit_id, to_place_id, to_org_unit_id,
                                         round_no, allocated_on, amount, reference_no, note)
  values (p_item, v_item.fiscal_year_id, p_from_unit, p_to_unit, p_to_place, v_to_org, p_round, p_date, p_amount,
          btrim(coalesce(p_reference, '')), btrim(coalesce(p_note, '')))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.cancel_budget_allocation(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alloc public.budget_allocations%rowtype;
  v_item public.budget_items%rowtype;
begin
  select * into v_alloc from public.budget_allocations where id = p_id;
  if not found then
    raise exception 'ไม่พบรายการจัดสรร' using errcode = 'P0001';
  end if;
  select * into v_item from public.budget_items where id = v_alloc.item_id for update;
  select * into v_alloc from public.budget_allocations where id = p_id for update;
  if not v_alloc.is_active then
    raise exception 'รายการจัดสรรนี้ถูกยกเลิกแล้ว' using errcode = 'P0001';
  end if;
  if not public.can_edit_budget(v_alloc.from_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์จัดสรรงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  perform private.budget_year_open(v_alloc.fiscal_year_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'กรุณาระบุเหตุผลที่ยกเลิก (อย่างน้อย 3 ตัวอักษร)' using errcode = 'P0001';
  end if;
  if private.budget_pair_total(v_alloc.item_id, v_alloc.from_unit_id, v_alloc.to_unit_id, v_alloc.to_place_id) - v_alloc.amount < 0 then
    raise exception 'ยกเลิกไม่ได้ เพราะยอดสุทธิที่จัดสรรให้ผู้รับรายนี้จะติดลบ (ยกเลิกรายการปรับลดก่อน)' using errcode = 'P0001';
  end if;
  if v_alloc.amount > 0 and v_alloc.to_unit_id is not null
     and private.budget_received(v_alloc.item_id, v_alloc.to_unit_id) - v_alloc.amount
         < private.budget_out(v_alloc.item_id, v_alloc.to_unit_id) then
    raise exception 'ยกเลิกไม่ได้ เพราะผู้รับจัดสรรต่อลงไปแล้ว % บาท',
      to_char(private.budget_out(v_alloc.item_id, v_alloc.to_unit_id), 'FM999,999,999,990.00') using errcode = 'P0001';
  end if;
  if v_alloc.amount < 0
     and private.budget_out(v_alloc.item_id, v_alloc.from_unit_id) - v_alloc.amount
         > private.budget_received(v_alloc.item_id, v_alloc.from_unit_id) then
    raise exception 'ยกเลิกการปรับลดไม่ได้ เพราะยอดจัดสรรจะเกินยอดที่หน่วยได้รับ' using errcode = 'P0001';
  end if;
  update public.budget_allocations
     set is_active = false, cancel_reason = btrim(p_reason), cancelled_at = now(), cancelled_by = auth.uid()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------
-- 12) คำขอโอนเปลี่ยนแปลง (ชนิดคำขอ budget_transfer ในเครื่องอนุมัติกลาง)
-- ---------------------------------------------------------------
insert into public.request_types (key, code, name, route_levels, start_at_own_unit, decider_roles, central_roles)
values ('budget_transfer', 'BUDGET', 'คำขอโอนเปลี่ยนแปลงงบประมาณ', '{subdistrict,district,province,region,central}', true,
        '{chief,deputy_chief}', '{central_staff}');

-- ตรวจข้อมูลคำขอโอน คืน payload และชื่อเรื่อง (ใช้ทั้งยื่นใหม่และส่งใหม่)
create function private.budget_transfer_check(p_from uuid, p_to uuid, p_amount numeric, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.budget_items%rowtype;
  v_to public.budget_items%rowtype;
  v_free numeric;
begin
  -- ล็อกตามลำดับรหัส กันการรอกันเอง
  perform 1 from public.budget_items where id in (p_from, p_to) order by id for update;
  select * into v_from from public.budget_items where id = p_from;
  select * into v_to from public.budget_items where id = p_to;
  if v_from.id is null or v_to.id is null or v_from.kind <> 'category' or v_to.kind <> 'category' then
    raise exception 'โอนได้เฉพาะระหว่างรายการชั้นหมวดรายจ่าย' using errcode = 'P0001';
  end if;
  if p_from = p_to then
    raise exception 'รายการต้นทางและปลายทางต้องเป็นคนละรายการ' using errcode = 'P0001';
  end if;
  if v_from.fiscal_year_id <> v_to.fiscal_year_id or v_from.org_unit_id <> v_to.org_unit_id then
    raise exception 'โอนได้เฉพาะระหว่างรายการของหน่วยเจ้าของงบเดียวกันในปีงบประมาณเดียวกัน' using errcode = 'P0001';
  end if;
  if not v_from.is_active or not v_to.is_active then
    raise exception 'รายการต้นทางหรือปลายทางถูกปิดใช้งานแล้ว' using errcode = 'P0001';
  end if;
  perform private.budget_year_open(v_from.fiscal_year_id);
  if not public.can_edit_budget(v_from.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์ยื่นคำขอโอนงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 999999999999.99 then
    raise exception 'จำนวนเงินที่โอนต้องมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'กรุณาระบุเหตุผลการโอน (อย่างน้อย 3 ตัวอักษร)' using errcode = 'P0001';
  end if;
  if length(btrim(p_reason)) > 1000 then
    raise exception 'เหตุผลยาวเกิน 1,000 ตัวอักษร' using errcode = 'P0001';
  end if;
  v_free := v_from.amount - private.budget_out(p_from, v_from.org_unit_id);
  if p_amount > v_free then
    raise exception 'ยอดคงเหลือ (ยังไม่จัดสรร) ของรายการต้นทางไม่พอ คงเหลือ % บาท', to_char(v_free, 'FM999,999,999,990.00')
      using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'title', 'โอนเปลี่ยนแปลงงบประมาณ ' || private.budget_item_label(p_from) || ' > ' || private.budget_item_label(p_to),
    'org_unit_id', v_from.org_unit_id,
    'fiscal_year_id', v_from.fiscal_year_id,
    'payload', jsonb_build_object(
      'year_be', (select year_be from public.fiscal_years where id = v_from.fiscal_year_id),
      'unit_name', (select name from public.org_units where id = v_from.org_unit_id),
      'from_item_id', p_from,
      'to_item_id', p_to,
      'from_path', private.budget_item_path(p_from),
      'to_path', private.budget_item_path(p_to),
      'from_amount', v_from.amount,
      'to_amount', v_to.amount,
      'amount', p_amount,
      'detail', btrim(p_reason)));
end;
$$;
revoke all on function private.budget_transfer_check(uuid, uuid, numeric, text) from public, anon, authenticated;

create function public.submit_budget_transfer(p_from uuid, p_to uuid, p_amount numeric, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chk jsonb;
  v_id uuid;
  v_req uuid;
  v_unit uuid;
begin
  v_chk := private.budget_transfer_check(p_from, p_to, p_amount, p_reason);
  v_unit := (v_chk ->> 'org_unit_id')::uuid;
  insert into public.budget_transfers (fiscal_year_id, org_unit_id, from_item_id, to_item_id, amount, reason)
  values ((v_chk ->> 'fiscal_year_id')::uuid, v_unit, p_from, p_to, p_amount, btrim(p_reason))
  returning id into v_id;
  perform set_config('app.budget_transfer_request', '1', true);
  v_req := private.create_request('budget_transfer', v_unit, v_chk ->> 'title',
                                  (v_chk -> 'payload') || jsonb_build_object('transfer_id', v_id), array[v_unit]);
  perform set_config('app.budget_transfer_request', '', true);
  update public.budget_transfers set request_id = v_req where id = v_id;
  return v_id;
end;
$$;

create function public.resubmit_budget_transfer(p_id uuid, p_amount numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.budget_transfers%rowtype;
  v_chk jsonb;
begin
  select * into v_t from public.budget_transfers where id = p_id for update;
  if not found then
    raise exception 'ไม่พบคำขอโอน' using errcode = 'P0001';
  end if;
  if v_t.created_by <> auth.uid() then
    raise exception 'ส่งใหม่ได้เฉพาะผู้ยื่นคำขอ' using errcode = '42501';
  end if;
  if v_t.status <> 'returned' then
    raise exception 'ส่งใหม่ได้เฉพาะคำขอที่ถูกส่งกลับแก้ไข' using errcode = 'P0001';
  end if;
  v_chk := private.budget_transfer_check(v_t.from_item_id, v_t.to_item_id, p_amount, p_reason);
  update public.budget_transfers set amount = p_amount, reason = btrim(p_reason) where id = p_id;
  perform set_config('app.budget_transfer_request', '1', true);
  perform public.resubmit_request(v_t.request_id, v_chk ->> 'title',
                                  (v_chk -> 'payload') || jsonb_build_object('transfer_id', p_id));
  perform set_config('app.budget_transfer_request', '', true);
end;
$$;

-- กันการยื่นหรือแก้คำขอชนิดนี้จากฟังก์ชันกลาง (ต้องผ่าน submit_budget_transfer / resubmit_budget_transfer)
create function public.requests_guard_budget_transfer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.type_key = 'budget_transfer' or (tg_op = 'UPDATE' and old.type_key = 'budget_transfer'))
     and coalesce(current_setting('app.budget_transfer_request', true), '') <> '1' then
    raise exception 'คำขอโอนงบประมาณต้องยื่นจากหน้า งบประมาณ เท่านั้น' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.requests_guard_budget_transfer() from public, anon, authenticated;
create trigger requests_guard_budget_transfer before insert or update of payload, title, type_key on public.requests
  for each row execute function public.requests_guard_budget_transfer();

-- ผลพิจารณา: อนุมัติ = ย้ายวงเงิน + บันทึกประวัติทั้ง 2 รายการ / สถานะอื่นตามคำขอ
create function public.requests_sync_budget_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.budget_transfers%rowtype;
  v_from public.budget_items%rowtype;
  v_to public.budget_items%rowtype;
begin
  if new.type_key <> 'budget_transfer' or new.status = old.status then
    return new;
  end if;
  select * into v_t from public.budget_transfers where request_id = new.id for update;
  if not found or v_t.status = 'approved' then
    return new;
  end if;
  if new.status <> 'approved' then
    update public.budget_transfers set status = new.status where id = v_t.id;
    return new;
  end if;

  perform 1 from public.budget_items where id in (v_t.from_item_id, v_t.to_item_id) order by id for update;
  select * into v_from from public.budget_items where id = v_t.from_item_id;
  select * into v_to from public.budget_items where id = v_t.to_item_id;
  if not v_from.is_active or not v_to.is_active then
    raise exception 'อนุมัติไม่ได้: รายการต้นทางหรือปลายทางถูกปิดใช้งานแล้ว' using errcode = 'P0001';
  end if;
  if v_from.amount - v_t.amount < private.budget_out(v_from.id, v_from.org_unit_id) then
    raise exception 'อนุมัติไม่ได้: ยอดคงเหลือ (ยังไม่จัดสรร) ของรายการต้นทางเหลือ % บาท ไม่พอโอน',
      to_char(v_from.amount - private.budget_out(v_from.id, v_from.org_unit_id), 'FM999,999,999,990.00')
      using errcode = 'P0001';
  end if;

  perform set_config('app.budget_transfer', '1', true);
  update public.budget_items set amount = amount - v_t.amount where id = v_from.id;
  update public.budget_items set amount = amount + v_t.amount where id = v_to.id;
  perform set_config('app.budget_transfer', '', true);

  insert into public.budget_item_changes (item_id, action, amount_before, amount_after, reason, transfer_id, detail)
  values
    (v_from.id, 'transfer_out', v_from.amount, v_from.amount - v_t.amount, v_t.reason, v_t.id,
     jsonb_build_object('request_no', new.request_no, 'other', private.budget_item_label(v_to.id))),
    (v_to.id, 'transfer_in', v_to.amount, v_to.amount + v_t.amount, v_t.reason, v_t.id,
     jsonb_build_object('request_no', new.request_no, 'other', private.budget_item_label(v_from.id)));
  update public.budget_transfers set status = 'approved', applied_at = now() where id = v_t.id;
  return new;
end;
$$;
revoke execute on function public.requests_sync_budget_transfer() from public, anon, authenticated;
create trigger requests_sync_budget_transfer after update of status on public.requests
  for each row execute function public.requests_sync_budget_transfer();

-- ผู้พิจารณาในเส้นทางของคำขอ (ใช้กับคำขอที่สิทธิ์ดูไม่ได้มาจาก can_access เช่น เจ้าหน้าที่ส่วนกลางพิจารณาคำขอโอนของงบส่วนกลาง)
create function public.is_request_decider(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.request_steps s
    join public.requests r on r.id = s.request_id
    join public.request_types t on t.key = r.type_key
    join public.my_role_rows() m on m.effective
    where s.request_id = p_request_id
      and (
        (s.level = 'central' and m.role_key = any (t.central_roles))
        or (s.level <> 'central' and m.org_unit_id = s.org_unit_id and m.role_key = any (t.decider_roles))
      )
  );
$$;
revoke execute on function public.is_request_decider(uuid) from public, anon;
grant execute on function public.is_request_decider(uuid) to authenticated;

-- คำขอโอนงบเห็นได้เฉพาะผู้ยื่น ผู้มีสิทธิ์ดูงบของหน่วยนั้น และผู้พิจารณาในเส้นทาง (ไม่ใช้ can_access ซึ่งให้ทุกบทบาทของเขตเห็น)
alter policy requests_read on public.requests
  using (
    requester_id = auth.uid()
    or case
      when type_key = 'budget_transfer' then
        public.can_view_budget(org_unit_id) or public.is_request_decider(id)
      when public.is_personnel_request(type_key) then
        public.can_view_personnel(org_unit_id)
        or public.can_view_request_steps(id)
        or public.is_request_subject(payload)
      else public.can_access(org_unit_id)
    end
  );

-- ---------------------------------------------------------------
-- 13) ฟังก์ชันอ่าน (มุมมองของหน่วยหนึ่ง: รายการที่หน่วยเป็นเจ้าของ + รายการที่หน่วยได้รับจัดสรร)
-- ---------------------------------------------------------------
-- ต้นไม้งบประมาณของหน่วย: received = วงเงินที่หน่วยได้รับ / allocated = จัดสรรลงล่างแล้ว / remaining = คงเหลือ
-- ชั้นบน (แผนงาน โครงการ) เป็นผลรวมของหมวดรายจ่ายใต้ชั้นนั้นที่หน่วยถืออยู่
create function public.budget_tree(p_year uuid, p_unit uuid, p_include_inactive boolean default false)
returns table (
  id uuid, parent_id uuid, kind text, label text, name text, code text, category_id uuid, category_name text,
  source_id uuid, source_name text, note text, owner_unit_id uuid, owner_unit_name text, owned boolean,
  is_active boolean, sort_order integer, received numeric, allocated numeric, remaining numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view_budget(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์ดูงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  return query
  with leaves as (
    select i.id, i.parent_id
    from public.budget_items i
    where i.fiscal_year_id = p_year and i.kind = 'category'
      and (
        (i.org_unit_id = p_unit and (i.is_active or p_include_inactive))
        or (i.is_active and exists (select 1 from public.budget_allocations a
                                    where a.item_id = i.id and a.to_unit_id = p_unit and a.is_active))
      )
  ),
  leaf_vals as (
    select l.id, l.parent_id, p.parent_id as program_id,
           private.budget_received(l.id, p_unit) as rec, private.budget_out(l.id, p_unit) as alloc
    from leaves l
    join public.budget_items p on p.id = l.parent_id
  ),
  nodes as (
    select i.id from public.budget_items i
    where i.fiscal_year_id = p_year and i.org_unit_id = p_unit and (i.is_active or p_include_inactive)
    union select lv.id from leaf_vals lv
    union select lv.parent_id from leaf_vals lv
    union select lv.program_id from leaf_vals lv
  )
  select i.id, i.parent_id, i.kind, private.budget_item_label(i.id), i.name, i.code, i.category_id, c.name,
         i.source_id, s.name, i.note, i.org_unit_id, u.name, i.org_unit_id = p_unit, i.is_active, i.sort_order,
         x.rec::numeric(14,2), x.alloc::numeric(14,2), (x.rec - x.alloc)::numeric(14,2)
  from nodes n
  join public.budget_items i on i.id = n.id
  join public.org_units u on u.id = i.org_unit_id
  left join public.budget_categories c on c.id = i.category_id
  left join public.budget_sources s on s.id = i.source_id
  cross join lateral (
    select coalesce(sum(lv.rec), 0) as rec, coalesce(sum(lv.alloc), 0) as alloc
    from leaf_vals lv
    where (i.kind = 'category' and lv.id = i.id)
       or (i.kind = 'project' and lv.parent_id = i.id)
       or (i.kind = 'program' and lv.program_id = i.id)
  ) x
  order by i.sort_order, i.created_at;
end;
$$;

-- รายละเอียดรายการในมุมมองของหน่วย
create function public.budget_item_detail(p_item uuid, p_unit uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item public.budget_items%rowtype;
  v_row record;
begin
  select * into v_item from public.budget_items where id = p_item;
  if not found or not public.can_view_budget(p_unit) then
    raise exception 'ไม่พบรายการงบประมาณ หรือท่านไม่มีสิทธิ์ดู' using errcode = '42501';
  end if;
  select * into v_row from public.budget_tree(v_item.fiscal_year_id, p_unit, true) t where t.id = p_item;
  if not found then
    raise exception 'หน่วยนี้ไม่ได้เป็นเจ้าของหรือได้รับจัดสรรรายการนี้' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', v_item.id, 'kind', v_item.kind, 'label', v_row.label, 'path', private.budget_item_path(v_item.id),
    'name', v_item.name, 'code', v_item.code, 'note', v_item.note, 'parent_id', v_item.parent_id,
    'category_id', v_item.category_id, 'source_id', v_item.source_id, 'amount', v_item.amount,
    'is_active', v_item.is_active, 'sort_order', v_item.sort_order,
    'fiscal_year_id', v_item.fiscal_year_id,
    'year_be', (select year_be from public.fiscal_years where id = v_item.fiscal_year_id),
    'year_open', (select status = 'open' from public.fiscal_years where id = v_item.fiscal_year_id),
    'owner_unit_id', v_item.org_unit_id, 'owner_unit_name', v_row.owner_unit_name, 'owned', v_row.owned,
    'received', v_row.received, 'allocated', v_row.allocated, 'remaining', v_row.remaining,
    'can_edit_unit', public.can_edit_budget(p_unit),
    'can_edit_item', public.can_edit_budget(v_item.org_unit_id),
    'has_allocations', exists (select 1 from public.budget_allocations a where a.item_id = v_item.id and a.is_active),
    'pending_transfers', (select count(*) from public.budget_transfers t
                          where (t.from_item_id = v_item.id or t.to_item_id = v_item.id) and t.status in ('pending', 'returned')));
end;
$$;

-- การจัดสรรของรายการในมุมมองของหน่วย: out = หน่วยนี้จัดสรรออก / in = หน่วยนี้ได้รับ
create function public.budget_allocation_rows(p_item uuid, p_unit uuid)
returns table (
  id uuid, direction text, from_unit_id uuid, from_name text, to_unit_id uuid, to_place_id uuid, to_name text,
  to_detail text, round_no integer, allocated_on date, amount numeric, reference_no text, note text,
  is_active boolean, cancel_reason text, cancelled_at timestamptz, created_at timestamptz, created_by_name text,
  passed_on numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view_budget(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์ดูงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  return query
  select a.id, case when a.from_unit_id = p_unit then 'out' else 'in' end, a.from_unit_id, fu.name,
         a.to_unit_id, a.to_place_id, coalesce(tu.name, pl.name),
         case when a.to_place_id is not null then concat('สำนัก · ', pu.name) else '' end,
         a.round_no, a.allocated_on, a.amount, a.reference_no, a.note, a.is_active, a.cancel_reason, a.cancelled_at,
         a.created_at,
         btrim(concat_ws(' ', nullif(pr.title_prefix, ''), pr.first_name, nullif(pr.monastic_name, ''), nullif(pr.last_name, ''))),
         case when a.to_unit_id is not null then private.budget_out(a.item_id, a.to_unit_id) end
  from public.budget_allocations a
  join public.org_units fu on fu.id = a.from_unit_id
  left join public.org_units tu on tu.id = a.to_unit_id
  left join public.places pl on pl.id = a.to_place_id
  left join public.org_units pu on pu.id = pl.org_unit_id
  left join public.profiles pr on pr.id = a.created_by
  where a.item_id = p_item and (a.from_unit_id = p_unit or a.to_unit_id = p_unit)
  order by a.allocated_on, a.created_at;
end;
$$;

-- ผู้รับการจัดสรรที่เลือกได้: หน่วยใต้สังกัดทุกชั้น และสำนักเรียน / สำนักศาสนศึกษา ในเขต (ค้นด้วยชื่อหรือรหัส)
create function public.budget_recipients(p_unit uuid, p_q text default '', p_limit integer default 30)
returns table (kind text, id uuid, name text, code text, detail text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := '%' || lower(btrim(coalesce(p_q, ''))) || '%';
begin
  if not public.can_edit_budget(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์จัดสรรงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  return query
  (select 'unit'::text, d.id, d.name, d.code,
          case d.level when 'region' then 'ภาค' when 'province' then 'จังหวัด' when 'district' then 'อำเภอ'
                       when 'subdistrict' then 'ตำบล' else '' end
   from public.descendants_of(p_unit) d
   where d.is_active and (lower(d.name) like v_q or lower(d.code) like v_q)
   order by d.depth, d.code
   limit least(greatest(coalesce(p_limit, 30), 1), 100))
  union all
  (select 'place'::text, p.id, p.name, p.code,
          concat(case p.place_type when 'samnak_rian' then 'สำนักเรียน' else 'สำนักศาสนศึกษา' end, ' · ', u.name)
   from public.places p
   join public.org_units u on u.id = p.org_unit_id
   where p.is_active and p.status = 'open' and p.place_type in ('samnak_rian', 'samnak_sasanasuksa')
     and (p.org_unit_id = p_unit or p.org_unit_id in (select x.id from public.descendants_of(p_unit) x))
     and (lower(p.name) like v_q or lower(p.code) like v_q)
   order by p.name
   limit least(greatest(coalesce(p_limit, 30), 1), 100));
end;
$$;

-- ประวัติของรายการ
create function public.budget_item_history(p_item uuid)
returns table (
  id uuid, created_at timestamptz, action text, amount_before numeric, amount_after numeric, detail jsonb,
  reason text, actor_name text, transfer_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.budget_items i where i.id = p_item and public.can_view_budget(i.org_unit_id)) then
    raise exception 'ท่านไม่มีสิทธิ์ดูประวัติของรายการนี้' using errcode = '42501';
  end if;
  return query
  select c.id, c.created_at, c.action, c.amount_before, c.amount_after, c.detail, c.reason,
         btrim(concat_ws(' ', nullif(p.title_prefix, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, ''))),
         c.transfer_id
  from public.budget_item_changes c
  left join public.profiles p on p.id = c.actor_id
  where c.item_id = p_item
  order by c.created_at, c.id;
end;
$$;

-- คำขอโอนของหน่วยเจ้าของงบ
create function public.budget_transfer_rows(p_year uuid, p_unit uuid)
returns table (
  id uuid, from_item_id uuid, to_item_id uuid, from_path text, to_path text, amount numeric, reason text,
  status text, request_id uuid, request_no text, created_at timestamptz, requester_name text, applied_at timestamptz,
  is_mine boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view_budget(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์ดูงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  return query
  select t.id, t.from_item_id, t.to_item_id, private.budget_item_path(t.from_item_id), private.budget_item_path(t.to_item_id),
         t.amount, t.reason, t.status, t.request_id, r.request_no, t.created_at,
         btrim(concat_ws(' ', nullif(p.title_prefix, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, ''))),
         t.applied_at, t.created_by = auth.uid()
  from public.budget_transfers t
  left join public.requests r on r.id = t.request_id
  left join public.profiles p on p.id = t.created_by
  where t.fiscal_year_id = p_year and t.org_unit_id = p_unit
  order by t.created_at desc;
end;
$$;

-- ---------------------------------------------------------------
-- 14) นำเข้าแผนงบจาก Excel (หน่วยเจ้าของ + ปีที่เลือก)
--     คอลัมน์: แผนงาน, โครงการหรือกิจกรรม, หมวดรายจ่าย, วงเงิน, แหล่งเงิน, หมายเหตุ
--     แผนงานและโครงการที่ยังไม่มีสร้างให้ หมวดรายจ่ายที่มีแล้ว: วงเงินเท่าเดิม = ข้าม / ต่าง = ปรับ (เฉพาะที่ยังไม่จัดสรร)
--     ผิดแถวเดียวไม่บันทึกทั้งชุด
-- ---------------------------------------------------------------
create function private.budget_plan_eval(p_year uuid, p_unit uuid, p_rows jsonb)
returns table (row_no integer, status text, message text, program text, project text, category_id uuid,
               source_id uuid, amount numeric, note text, item_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_seen jsonb := '{}'::jsonb;
  v_key text;
  v_amount_text text;
  v_program uuid;
  v_project uuid;
  v_item public.budget_items%rowtype;
begin
  for r in
    select * from jsonb_to_recordset(p_rows) as x(row_no integer, program text, project text, category text,
                                                   amount text, source text, note text)
  loop
    row_no := r.row_no; status := 'error'; message := ''; item_id := null;
    program := btrim(regexp_replace(coalesce(r.program, ''), '\s+', ' ', 'g'));
    project := btrim(regexp_replace(coalesce(r.project, ''), '\s+', ' ', 'g'));
    note := btrim(coalesce(r.note, ''));
    category_id := null; source_id := null; amount := null;

    if program = '' or project = '' then
      message := 'ต้องกรอกแผนงาน และโครงการหรือกิจกรรม'; return next; continue;
    end if;
    if length(program) > 200 or length(project) > 200 or length(note) > 500 then
      message := 'มีช่องที่ยาวเกินกำหนด (ชื่อไม่เกิน 200 หมายเหตุไม่เกิน 500 ตัวอักษร)'; return next; continue;
    end if;
    select c.id into category_id from public.budget_categories c
    where c.is_active and lower(btrim(c.name)) = lower(btrim(coalesce(r.category, '')));
    if category_id is null then
      message := format('ไม่พบหมวดรายจ่าย "%s" ในระบบ', btrim(coalesce(r.category, ''))); return next; continue;
    end if;
    select s.id into source_id from public.budget_sources s
    where s.is_active and lower(btrim(s.name)) = lower(btrim(coalesce(r.source, '')));
    if source_id is null then
      message := format('ไม่พบแหล่งเงิน "%s" ในระบบ', btrim(coalesce(r.source, ''))); return next; continue;
    end if;
    v_amount_text := regexp_replace(coalesce(r.amount, ''), '[,\s]', '', 'g');
    if v_amount_text !~ '^\d{1,12}(\.\d{1,2})?$' then
      message := 'วงเงินต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง'; return next; continue;
    end if;
    amount := v_amount_text::numeric(14,2);

    v_key := lower(program) || '|' || lower(project) || '|' || category_id || '|' || source_id;
    if v_seen ? v_key then
      message := format('ซ้ำกับแถวที่ %s (แผนงาน โครงการ หมวดรายจ่าย และแหล่งเงินเดียวกัน)', v_seen ->> v_key);
      return next; continue;
    end if;
    v_seen := v_seen || jsonb_build_object(v_key, r.row_no);

    select i.id into v_program from public.budget_items i
    where i.fiscal_year_id = p_year and i.org_unit_id = p_unit and i.kind = 'program' and i.is_active
      and lower(btrim(i.name)) = lower(program);
    v_project := null;
    if v_program is not null then
      select i.id into v_project from public.budget_items i
      where i.parent_id = v_program and i.kind = 'project' and i.is_active and lower(btrim(i.name)) = lower(project);
    end if;
    v_item := null;
    if v_project is not null then
      select * into v_item from public.budget_items i
      where i.parent_id = v_project and i.kind = 'category' and i.is_active
        and i.category_id = budget_plan_eval.category_id and i.source_id = budget_plan_eval.source_id;
    end if;
    if v_item.id is null then
      status := 'new';
      message := case
        when v_program is null then 'เพิ่มใหม่ (สร้างแผนงานและโครงการด้วย)'
        when v_project is null then 'เพิ่มใหม่ (สร้างโครงการด้วย)'
        else 'เพิ่มใหม่' end;
      return next; continue;
    end if;
    item_id := v_item.id;
    if v_item.amount = amount then
      status := 'skip'; message := 'มีในระบบแล้ว วงเงินเท่าเดิม'; return next; continue;
    end if;
    if exists (select 1 from public.budget_allocations a where a.item_id = v_item.id and a.is_active) then
      message := 'รายการนี้เริ่มจัดสรรแล้ว เปลี่ยนวงเงินต้องยื่นคำขอโอนเปลี่ยนแปลง'; return next; continue;
    end if;
    status := 'update';
    message := format('ปรับวงเงินจาก %s เป็น %s บาท', to_char(v_item.amount, 'FM999,999,999,990.00'),
                      to_char(amount, 'FM999,999,999,990.00'));
    return next;
  end loop;
end;
$$;
revoke all on function private.budget_plan_eval(uuid, uuid, jsonb) from public, anon, authenticated;

create function public.check_budget_plan_import(p_year uuid, p_unit uuid, p_rows jsonb)
returns table (row_no integer, status text, message text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_edit_budget(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์แก้ไขงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  perform private.budget_year_open(p_year);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 2,000 แถว' using errcode = 'P0001';
  end if;
  return query select e.row_no, e.status, e.message from private.budget_plan_eval(p_year, p_unit, p_rows) e order by e.row_no;
end;
$$;

create function public.import_budget_plan(p_year uuid, p_unit uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  v_err integer;
  v_program uuid;
  v_project uuid;
  v_new_items integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_programs integer := 0;
  v_projects integer := 0;
  v_id uuid;
  v_old numeric;
begin
  if not public.can_edit_budget(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์แก้ไขงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  perform private.budget_year_open(p_year);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 2,000 แถว' using errcode = 'P0001';
  end if;
  select count(*) filter (where x.status = 'error') into v_err from private.budget_plan_eval(p_year, p_unit, p_rows) x;
  if v_err > 0 then
    raise exception 'ยังมีแถวที่ผิด % แถว กรุณาแก้ไฟล์แล้วอัปโหลดใหม่', v_err using errcode = 'P0001';
  end if;

  for e in select * from private.budget_plan_eval(p_year, p_unit, p_rows) x order by x.row_no loop
    if e.status = 'skip' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if e.status = 'update' then
      select amount into v_old from public.budget_items where id = e.item_id for update;
      update public.budget_items set amount = e.amount where id = e.item_id;
      insert into public.budget_item_changes (item_id, action, amount_before, amount_after, detail)
      values (e.item_id, 'import', v_old, e.amount, jsonb_build_object('row_no', e.row_no));
      v_updated := v_updated + 1;
      continue;
    end if;
    -- new: หาแผนงาน / โครงการ (แถวก่อนหน้าอาจสร้างไว้แล้ว)
    select i.id into v_program from public.budget_items i
    where i.fiscal_year_id = p_year and i.org_unit_id = p_unit and i.kind = 'program' and i.is_active
      and lower(btrim(i.name)) = lower(e.program);
    if v_program is null then
      insert into public.budget_items (fiscal_year_id, org_unit_id, kind, name, sort_order)
      values (p_year, p_unit, 'program', e.program,
              (select coalesce(max(i.sort_order), 0) + 1 from public.budget_items i
               where i.fiscal_year_id = p_year and i.org_unit_id = p_unit and i.parent_id is null))
      returning id into v_program;
      insert into public.budget_item_changes (item_id, action, detail)
      values (v_program, 'import', jsonb_build_object('row_no', e.row_no, 'label', e.program));
      v_programs := v_programs + 1;
    end if;
    select i.id into v_project from public.budget_items i
    where i.parent_id = v_program and i.kind = 'project' and i.is_active and lower(btrim(i.name)) = lower(e.project);
    if v_project is null then
      insert into public.budget_items (fiscal_year_id, org_unit_id, parent_id, kind, name, sort_order)
      values (p_year, p_unit, v_program, 'project', e.project,
              (select coalesce(max(i.sort_order), 0) + 1 from public.budget_items i where i.parent_id = v_program))
      returning id into v_project;
      insert into public.budget_item_changes (item_id, action, detail)
      values (v_project, 'import', jsonb_build_object('row_no', e.row_no, 'label', e.project));
      v_projects := v_projects + 1;
    end if;
    insert into public.budget_items (fiscal_year_id, org_unit_id, parent_id, kind, category_id, source_id, amount, note, sort_order)
    values (p_year, p_unit, v_project, 'category', e.category_id, e.source_id, e.amount, e.note,
            (select coalesce(max(i.sort_order), 0) + 1 from public.budget_items i where i.parent_id = v_project))
    returning id into v_id;
    insert into public.budget_item_changes (item_id, action, amount_after, detail)
    values (v_id, 'import', e.amount, jsonb_build_object('row_no', e.row_no, 'label', private.budget_item_label(v_id)));
    v_new_items := v_new_items + 1;
  end loop;

  if v_new_items + v_updated = 0 then
    raise exception 'ไม่มีรายการใหม่หรือรายการที่ต้องปรับ (ทุกแถวมีในระบบแล้ว)' using errcode = 'P0001';
  end if;
  return jsonb_build_object('programs', v_programs, 'projects', v_projects, 'items', v_new_items,
                            'updated', v_updated, 'skipped', v_skipped);
end;
$$;

-- ---------------------------------------------------------------
-- 15) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke execute on function public.save_budget_item(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, numeric, text, integer) from public, anon;
revoke execute on function public.set_budget_item_active(uuid, boolean, text) from public, anon;
revoke execute on function public.allocate_budget(uuid, uuid, uuid, uuid, integer, date, numeric, text, text) from public, anon;
revoke execute on function public.cancel_budget_allocation(uuid, text) from public, anon;
revoke execute on function public.submit_budget_transfer(uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.resubmit_budget_transfer(uuid, numeric, text) from public, anon;
revoke execute on function public.budget_tree(uuid, uuid, boolean) from public, anon;
revoke execute on function public.budget_item_detail(uuid, uuid) from public, anon;
revoke execute on function public.budget_allocation_rows(uuid, uuid) from public, anon;
revoke execute on function public.budget_recipients(uuid, text, integer) from public, anon;
revoke execute on function public.budget_item_history(uuid) from public, anon;
revoke execute on function public.budget_transfer_rows(uuid, uuid) from public, anon;
revoke execute on function public.check_budget_plan_import(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.import_budget_plan(uuid, uuid, jsonb) from public, anon;

grant execute on function public.save_budget_item(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, numeric, text, integer) to authenticated;
grant execute on function public.set_budget_item_active(uuid, boolean, text) to authenticated;
grant execute on function public.allocate_budget(uuid, uuid, uuid, uuid, integer, date, numeric, text, text) to authenticated;
grant execute on function public.cancel_budget_allocation(uuid, text) to authenticated;
grant execute on function public.submit_budget_transfer(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.resubmit_budget_transfer(uuid, numeric, text) to authenticated;
grant execute on function public.budget_tree(uuid, uuid, boolean) to authenticated;
grant execute on function public.budget_item_detail(uuid, uuid) to authenticated;
grant execute on function public.budget_allocation_rows(uuid, uuid) to authenticated;
grant execute on function public.budget_recipients(uuid, text, integer) to authenticated;
grant execute on function public.budget_item_history(uuid) to authenticated;
grant execute on function public.budget_transfer_rows(uuid, uuid) to authenticated;
grant execute on function public.check_budget_plan_import(uuid, uuid, jsonb) to authenticated;
grant execute on function public.import_budget_plan(uuid, uuid, jsonb) to authenticated;
