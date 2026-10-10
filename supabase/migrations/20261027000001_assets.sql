-- บทที่ 26: ทะเบียนครุภัณฑ์ ค่าเสื่อม ตรวจนับ รายงาน (ระบบที่ 7)
-- สิทธิ์ใช้ขอบเขตพัสดุเดิม (can_view_inventory / can_edit_inventory) ค่าเสื่อมคำนวณจากข้อมูลครุภัณฑ์ทุกครั้ง ไม่เก็บยอดแยก

-- ---------------------------------------------------------------
-- 1) ประเภทครุภัณฑ์และอายุการใช้งาน (ผู้ดูแลระบบกรอกเอง เริ่มว่าง)
-- ---------------------------------------------------------------
create table public.asset_types (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (btrim(name) <> '' and length(name) <= 100),
  useful_life_years   integer not null check (useful_life_years between 1 and 100),
  sort_order          integer not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.asset_types is 'ประเภทครุภัณฑ์ และอายุการใช้งาน (ปี) ที่ใช้คิดค่าเสื่อมราคา';
create unique index asset_types_name_unique on public.asset_types (lower(btrim(name)));
create trigger asset_types_set_updated_at before update on public.asset_types
  for each row execute function public.set_updated_at();
create trigger asset_types_audit after insert or update or delete on public.asset_types
  for each row execute function public.audit_row_change();
alter table public.asset_types enable row level security;
create policy asset_types_read on public.asset_types for select to authenticated using (true);
create policy asset_types_admin_insert on public.asset_types for insert to authenticated
  with check (public.has_role('admin'));
create policy asset_types_admin_update on public.asset_types for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.asset_types from anon;
revoke delete, truncate on public.asset_types from authenticated;
grant select, insert, update on public.asset_types to authenticated;

-- ---------------------------------------------------------------
-- 2) ทะเบียนครุภัณฑ์ (รูปถ่าย = ไฟล์แนบ entity_table assets)
--    สภาพ: usable ใช้งานได้ / damaged ชำรุด / pending_disposal รอจำหน่าย / disposed จำหน่ายแล้ว
--    หน่วยที่ครอบครองเปลี่ยนผ่านการโอนเท่านั้น รอจำหน่ายและจำหน่ายแล้วเปลี่ยนผ่านคำขอจำหน่ายเท่านั้น
-- ---------------------------------------------------------------
create table public.assets (
  id                   uuid primary key default gen_random_uuid(),
  asset_no             text not null check (btrim(asset_no) <> '' and length(asset_no) <= 60),
  name                 text not null check (btrim(name) <> '' and length(name) <= 200),
  type_id              uuid not null references public.asset_types (id),
  brand                text not null default '' check (length(brand) <= 100),
  model                text not null default '' check (length(model) <= 100),
  serial_no            text not null default '' check (length(serial_no) <= 100),
  acquired_on          date not null,
  acquire_method       text not null check (acquire_method in ('purchase', 'donation', 'transfer')),
  price                numeric(14,2) not null check (price >= 0),
  source_id            uuid references public.budget_sources (id),
  useful_life_years    integer check (useful_life_years between 1 and 100),
  org_unit_id          uuid not null references public.org_units (id),
  location             text not null default '' check (length(location) <= 200),
  custodian            text not null default '' check (length(custodian) <= 200),
  condition            text not null default 'usable'
                         check (condition in ('usable', 'damaged', 'pending_disposal', 'disposed')),
  disposed_on          date,
  disposal_request_id  uuid references public.requests (id),
  note                 text not null default '' check (length(note) <= 500),
  is_active            boolean not null default true,
  created_by           uuid default auth.uid() references public.profiles (id),
  updated_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint assets_disposed check ((condition = 'disposed') = (disposed_on is not null))
);
comment on table public.assets is 'ทะเบียนครุภัณฑ์: อายุการใช้งานว่าง = ตามประเภท ค่าเสื่อมคำนวณด้วย private.asset_acc_dep';
comment on column public.assets.useful_life_years is 'อายุการใช้งาน (ปี) เฉพาะรายการ ว่าง = ใช้ค่าของประเภท';
create unique index assets_no_unique on public.assets (lower(btrim(asset_no)));
create index assets_unit_idx on public.assets (org_unit_id) where is_active;
create index assets_type_idx on public.assets (type_id);

create function public.assets_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer boolean := coalesce(current_setting('app.asset_transfer', true), '') = '1';
  v_dispose boolean := coalesce(current_setting('app.asset_disposal', true), '') = '1';
begin
  new.asset_no := btrim(new.asset_no);
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.brand := btrim(new.brand);
  new.model := btrim(new.model);
  new.serial_no := btrim(new.serial_no);
  new.location := btrim(new.location);
  new.custodian := btrim(new.custodian);
  new.note := btrim(new.note);
  if new.acquired_on > (now() at time zone 'Asia/Bangkok')::date then
    raise exception 'วันที่ได้มาต้องไม่เป็นวันในอนาคต' using errcode = 'P0001';
  end if;
  if (tg_op = 'INSERT' or new.type_id is distinct from old.type_id)
     and not exists (select 1 from public.asset_types t where t.id = new.type_id and t.is_active) then
    raise exception 'ประเภทครุภัณฑ์นี้ถูกปิดใช้งานแล้ว' using errcode = 'P0001';
  end if;
  if new.source_id is not null and (tg_op = 'INSERT' or new.source_id is distinct from old.source_id)
     and not exists (select 1 from public.budget_sources s where s.id = new.source_id and s.is_active) then
    raise exception 'แหล่งเงินนี้ถูกปิดใช้งานแล้ว' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.org_units u where u.id = new.org_unit_id and u.is_active) then
      raise exception 'หน่วยนี้ถูกปิดใช้งานแล้ว' using errcode = 'P0001';
    end if;
    if new.condition not in ('usable', 'damaged') or new.disposal_request_id is not null then
      raise exception 'ครุภัณฑ์ใหม่ต้องมีสภาพ ใช้งานได้ หรือ ชำรุด' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if old.condition = 'disposed' and not v_dispose then
    raise exception 'ครุภัณฑ์ที่จำหน่ายแล้วแก้ไขไม่ได้' using errcode = 'P0001';
  end if;
  if new.org_unit_id <> old.org_unit_id and not v_transfer then
    raise exception 'เปลี่ยนหน่วยที่ครอบครองได้ด้วยการโอนเท่านั้น' using errcode = 'P0001';
  end if;
  if (new.condition is distinct from old.condition
        and (new.condition in ('pending_disposal', 'disposed') or old.condition in ('pending_disposal', 'disposed'))
      or new.disposed_on is distinct from old.disposed_on
      or new.disposal_request_id is distinct from old.disposal_request_id)
     and not v_dispose then
    raise exception 'สภาพ รอจำหน่าย และ จำหน่ายแล้ว เปลี่ยนได้ผ่านคำขอจำหน่ายเท่านั้น' using errcode = 'P0001';
  end if;
  if old.is_active and not new.is_active then
    if old.condition = 'pending_disposal' then
      raise exception 'ครุภัณฑ์นี้มีคำขอจำหน่ายค้างอยู่' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.asset_transfers t where t.asset_id = new.id and t.status = 'sent')
       or exists (select 1 from public.asset_loans l where l.asset_id = new.id and l.returned_on is null) then
      raise exception 'ครุภัณฑ์นี้มีการโอนที่รอรับ หรือยังถูกยืมอยู่' using errcode = 'P0001';
    end if;
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke execute on function public.assets_rules() from public, anon, authenticated;
create trigger assets_rules before insert or update on public.assets
  for each row execute function public.assets_rules();
create trigger assets_set_updated_at before update on public.assets
  for each row execute function public.set_updated_at();
create trigger assets_audit after insert or update or delete on public.assets
  for each row execute function public.audit_row_change();

alter table public.assets enable row level security;
create policy assets_read on public.assets for select to authenticated
  using (public.can_view_inventory(org_unit_id));
create policy assets_insert on public.assets for insert to authenticated
  with check (public.can_edit_inventory(org_unit_id));
create policy assets_update on public.assets for update to authenticated
  using (public.can_edit_inventory(org_unit_id)) with check (public.can_edit_inventory(org_unit_id));
revoke all on public.assets from anon;
revoke delete, truncate on public.assets from authenticated;
grant select, insert, update on public.assets to authenticated;

-- ---------------------------------------------------------------
-- 3) ประวัติ: โอนย้าย ยืม-คืน ซ่อมบำรุง และการตรวจนับ (เขียนผ่านฟังก์ชันเท่านั้น)
-- ---------------------------------------------------------------
create table public.asset_transfers (
  id             uuid primary key default gen_random_uuid(),
  asset_id       uuid not null references public.assets (id),
  from_unit_id   uuid not null references public.org_units (id),
  to_unit_id     uuid not null references public.org_units (id),
  status         text not null default 'sent' check (status in ('sent', 'received', 'cancelled')),
  sent_on        date not null,
  received_on    date,
  note           text not null default '' check (length(note) <= 500),
  cancel_reason  text not null default '' check (length(cancel_reason) <= 500),
  created_by     uuid default auth.uid() references public.profiles (id),
  received_by    uuid references public.profiles (id),
  received_at    timestamptz,
  cancelled_by   uuid references public.profiles (id),
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint asset_transfers_units check (from_unit_id <> to_unit_id)
);
comment on table public.asset_transfers is 'โอนครุภัณฑ์ข้ามหน่วย: ต้นทางส่ง (sent รอรับ) ปลายทางกดรับจึงเปลี่ยนหน่วยที่ครอบครอง';
create unique index asset_transfers_pending_unique on public.asset_transfers (asset_id) where status = 'sent';
create index asset_transfers_asset_idx on public.asset_transfers (asset_id, created_at);

create table public.asset_loans (
  id            uuid primary key default gen_random_uuid(),
  asset_id      uuid not null references public.assets (id),
  org_unit_id   uuid not null references public.org_units (id),
  borrower      text not null check (length(btrim(borrower)) between 2 and 200),
  loaned_on     date not null,
  due_on        date,
  returned_on   date,
  note          text not null default '' check (length(note) <= 500),
  return_note   text not null default '' check (length(return_note) <= 500),
  created_by    uuid default auth.uid() references public.profiles (id),
  returned_by   uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint asset_loans_dates check ((due_on is null or due_on >= loaned_on) and (returned_on is null or returned_on >= loaned_on))
);
comment on table public.asset_loans is 'ยืม-คืนครุภัณฑ์ (returned_on ว่าง = ยังไม่คืน) ยืมได้ครั้งละ 1 รายการต่อครุภัณฑ์';
create unique index asset_loans_open_unique on public.asset_loans (asset_id) where returned_on is null;
create index asset_loans_asset_idx on public.asset_loans (asset_id, loaned_on);

create table public.asset_repairs (
  id             uuid primary key default gen_random_uuid(),
  asset_id       uuid not null references public.assets (id),
  org_unit_id    uuid not null references public.org_units (id),
  repaired_on    date not null,
  description    text not null check (length(btrim(description)) between 3 and 500),
  cost           numeric(14,2) not null default 0 check (cost >= 0),
  vendor         text not null default '' check (length(vendor) <= 200),
  is_active      boolean not null default true,
  cancel_reason  text not null default '' check (length(cancel_reason) <= 500),
  created_by     uuid default auth.uid() references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.asset_repairs is 'ซ่อมบำรุงครุภัณฑ์ (วันที่ รายการ ค่าใช้จ่าย) บันทึกผิดให้ยกเลิก (is_active false) พร้อมเหตุผล';
create index asset_repairs_asset_idx on public.asset_repairs (asset_id, repaired_on);

create table public.asset_counts (
  id           uuid primary key default gen_random_uuid(),
  org_unit_id  uuid not null references public.org_units (id),
  title        text not null check (length(btrim(title)) between 3 and 200),
  include_sub  boolean not null default true,
  started_on   date not null,
  status       text not null default 'open' check (status in ('open', 'closed')),
  note         text not null default '' check (length(note) <= 500),
  closed_at    timestamptz,
  closed_by    uuid references public.profiles (id),
  created_by   uuid default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.asset_counts is 'รอบตรวจนับครุภัณฑ์ของหน่วย (รวมหน่วยใต้สังกัดเมื่อ include_sub) เปิดได้ครั้งละ 1 รอบต่อหน่วย';
create unique index asset_counts_open_unique on public.asset_counts (org_unit_id) where status = 'open';

create table public.asset_count_items (
  id                  uuid primary key default gen_random_uuid(),
  count_id            uuid not null references public.asset_counts (id),
  asset_id            uuid not null references public.assets (id),
  org_unit_id         uuid not null references public.org_units (id),
  expected_condition  text not null,
  result              text check (result in ('found', 'damaged', 'missing')),
  note                text not null default '' check (length(note) <= 500),
  checked_at          timestamptz,
  checked_by          uuid references public.profiles (id),
  constraint asset_count_items_unique unique (count_id, asset_id)
);
comment on table public.asset_count_items is 'รายการที่ต้องตรวจในรอบ (สร้างตอนเปิดรอบ) result: found พบ / damaged ชำรุด / missing ไม่พบ (ระบบตั้งตอนปิดรอบ)';
create index asset_count_items_asset_idx on public.asset_count_items (asset_id);

create trigger asset_transfers_set_updated_at before update on public.asset_transfers
  for each row execute function public.set_updated_at();
create trigger asset_transfers_audit after insert or update or delete on public.asset_transfers
  for each row execute function public.audit_row_change();
create trigger asset_loans_set_updated_at before update on public.asset_loans
  for each row execute function public.set_updated_at();
create trigger asset_loans_audit after insert or update or delete on public.asset_loans
  for each row execute function public.audit_row_change();
create trigger asset_repairs_set_updated_at before update on public.asset_repairs
  for each row execute function public.set_updated_at();
create trigger asset_repairs_audit after insert or update or delete on public.asset_repairs
  for each row execute function public.audit_row_change();
create trigger asset_counts_set_updated_at before update on public.asset_counts
  for each row execute function public.set_updated_at();
create trigger asset_counts_audit after insert or update or delete on public.asset_counts
  for each row execute function public.audit_row_change();
create trigger asset_count_items_audit after update or delete on public.asset_count_items
  for each row execute function public.audit_row_change();

alter table public.asset_transfers enable row level security;
alter table public.asset_loans enable row level security;
alter table public.asset_repairs enable row level security;
alter table public.asset_counts enable row level security;
alter table public.asset_count_items enable row level security;
create policy asset_transfers_read on public.asset_transfers for select to authenticated
  using (public.can_view_inventory(from_unit_id) or public.can_view_inventory(to_unit_id));
create policy asset_loans_read on public.asset_loans for select to authenticated
  using (public.can_view_inventory(org_unit_id));
create policy asset_repairs_read on public.asset_repairs for select to authenticated
  using (public.can_view_inventory(org_unit_id));
create policy asset_counts_read on public.asset_counts for select to authenticated
  using (public.can_view_inventory(org_unit_id));
create policy asset_count_items_read on public.asset_count_items for select to authenticated
  using (public.can_view_inventory(org_unit_id));
revoke all on public.asset_transfers, public.asset_loans, public.asset_repairs, public.asset_counts, public.asset_count_items from anon;
revoke insert, update, delete, truncate on public.asset_transfers, public.asset_loans, public.asset_repairs, public.asset_counts, public.asset_count_items from authenticated;
grant select on public.asset_transfers, public.asset_loans, public.asset_repairs, public.asset_counts, public.asset_count_items to authenticated;

-- ---------------------------------------------------------------
-- 4) ชนิดคำขอจำหน่ายครุภัณฑ์: ขั้นเดียวที่หน่วยที่ครอบครอง เจ้าคณะหรือรองเจ้าคณะ ส่วนกลาง = เจ้าหน้าที่ส่วนกลาง (ผู้สั่งงานเลือก)
-- ---------------------------------------------------------------
insert into public.request_types (key, code, name, route_levels, start_at_own_unit, decider_roles, central_roles)
values ('asset_disposal', 'DSP', 'ขอจำหน่ายครุภัณฑ์', '{subdistrict,district,province,region,central}', true,
        '{chief,deputy_chief}', '{central_staff}');

-- ---------------------------------------------------------------
-- 5) ค่าเสื่อมราคาเส้นตรงตามวันจริง เหลือซาก 1 บาท (ผู้สั่งงานเลือก)
--    ค่าเสื่อมสะสม ณ วันที่ d = (ราคา - 1) x จำนวนวันตั้งแต่วันที่ได้มาถึง d (นับทั้งสองวัน) / (อายุปี x 365)
--    ปัดทศนิยม 2 ตำแหน่ง ไม่เกิน ราคา - 1 ครุภัณฑ์ที่จำหน่ายแล้วหยุดคิดที่วันจำหน่าย ราคาไม่เกิน 1 บาทไม่คิดค่าเสื่อม
-- ---------------------------------------------------------------
create function private.asset_acc_dep(p_price numeric, p_life integer, p_acquired date, p_until date)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_price is null or p_price <= 1 or p_life is null or p_until is null or p_until < p_acquired then 0::numeric(14,2)
    else least(p_price - 1, round((p_price - 1) * (p_until - p_acquired + 1)::numeric / (p_life * 365), 2))::numeric(14,2)
  end;
$$;

-- ค่าเสื่อมสะสมของครุภัณฑ์ ณ วันที่ (หยุดที่วันจำหน่าย)
create function private.asset_acc(p_asset public.assets, p_until date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select private.asset_acc_dep(p_asset.price,
           coalesce(p_asset.useful_life_years, (select t.useful_life_years from public.asset_types t where t.id = p_asset.type_id)),
           p_asset.acquired_on,
           case when p_asset.disposed_on is not null then least(p_until, p_asset.disposed_on) else p_until end);
$$;

create function private.asset_life(p_asset public.assets)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_asset.useful_life_years, (select t.useful_life_years from public.asset_types t where t.id = p_asset.type_id));
$$;

create function private.fy_start(p_year_be integer)
returns date
language sql
immutable
as $$ select make_date(p_year_be - 544, 10, 1) $$;

create function private.fy_end(p_year_be integer)
returns date
language sql
immutable
as $$ select make_date(p_year_be - 543, 9, 30) $$;


-- ครุภัณฑ์ที่ทำรายการได้ (ล็อกแถว ใช้งาน ยังไม่จำหน่าย ผู้ทำรายการแก้ไขพัสดุของหน่วยที่ครอบครองได้)
create function private.asset_lock(p_id uuid)
returns public.assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.assets%rowtype;
begin
  select * into v from public.assets where id = p_id for update;
  if not found or not v.is_active then
    raise exception 'ไม่พบครุภัณฑ์ หรือครุภัณฑ์ถูกปิดใช้งานแล้ว' using errcode = 'P0001';
  end if;
  if not public.can_edit_inventory(v.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์ทำรายการครุภัณฑ์ของหน่วยนี้' using errcode = '42501';
  end if;
  if v.condition = 'disposed' then
    raise exception 'ครุภัณฑ์นี้จำหน่ายแล้ว' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------
-- 6) โอนย้ายระหว่างหน่วย: ต้นทางส่ง ปลายทางกดรับ (ผู้สั่งงานเลือก) ต้นทางยกเลิกได้ก่อนปลายทางรับ
-- ---------------------------------------------------------------
create function public.send_asset_transfer(p_asset uuid, p_to_unit uuid, p_sent_on date, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.assets%rowtype;
  v_id uuid;
begin
  v := private.asset_lock(p_asset);
  if v.condition = 'pending_disposal' then
    raise exception 'ครุภัณฑ์นี้มีคำขอจำหน่ายค้างอยู่ โอนไม่ได้' using errcode = 'P0001';
  end if;
  if p_to_unit is null or p_to_unit = v.org_unit_id
     or not exists (select 1 from public.org_units u where u.id = p_to_unit and u.is_active) then
    raise exception 'กรุณาเลือกหน่วยปลายทางที่ใช้งานอยู่และไม่ใช่หน่วยเดิม' using errcode = 'P0001';
  end if;
  if p_sent_on is null or p_sent_on < v.acquired_on then
    raise exception 'วันที่โอนต้องไม่ก่อนวันที่ได้มา' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.asset_transfers t where t.asset_id = v.id and t.status = 'sent') then
    raise exception 'ครุภัณฑ์นี้มีการโอนที่รอรับอยู่แล้ว' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.asset_loans l where l.asset_id = v.id and l.returned_on is null) then
    raise exception 'ครุภัณฑ์นี้ยังถูกยืมอยู่ ให้บันทึกคืนก่อน' using errcode = 'P0001';
  end if;
  insert into public.asset_transfers (asset_id, from_unit_id, to_unit_id, sent_on, note)
  values (v.id, v.org_unit_id, p_to_unit, p_sent_on, left(btrim(coalesce(p_note, '')), 500))
  returning id into v_id;
  perform private.inv_notify_editors(p_to_unit, 'มีครุภัณฑ์โอนมารอรับ ' || v.asset_no,
            v.name || ' จาก' || (select name from public.org_units where id = v.org_unit_id), '/app/inventory/assets/' || v.id);
  return v_id;
end;
$$;

create function public.receive_asset_transfer(p_id uuid, p_received_on date, p_location text, p_custodian text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.asset_transfers%rowtype;
begin
  select * into v_t from public.asset_transfers where id = p_id for update;
  if not found or v_t.status <> 'sent' then
    raise exception 'ไม่พบการโอนที่รอรับ' using errcode = 'P0001';
  end if;
  if not public.can_edit_inventory(v_t.to_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์รับครุภัณฑ์เข้าหน่วยปลายทาง' using errcode = '42501';
  end if;
  if p_received_on is null or p_received_on < v_t.sent_on then
    raise exception 'วันที่รับต้องไม่ก่อนวันที่โอน' using errcode = 'P0001';
  end if;
  perform set_config('app.asset_transfer', '1', true);
  update public.assets
     set org_unit_id = v_t.to_unit_id,
         location = left(btrim(coalesce(p_location, '')), 200),
         custodian = left(btrim(coalesce(p_custodian, '')), 200)
   where id = v_t.asset_id;
  perform set_config('app.asset_transfer', '', true);
  update public.asset_transfers
     set status = 'received', received_on = p_received_on, received_by = auth.uid(), received_at = now()
   where id = p_id;
end;
$$;

create function public.cancel_asset_transfer(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.asset_transfers%rowtype;
begin
  select * into v_t from public.asset_transfers where id = p_id for update;
  if not found or v_t.status <> 'sent' then
    raise exception 'ยกเลิกได้เฉพาะการโอนที่ปลายทางยังไม่รับ' using errcode = 'P0001';
  end if;
  if not public.can_edit_inventory(v_t.from_unit_id) then
    raise exception 'ยกเลิกได้เฉพาะผู้มีสิทธิ์ของหน่วยต้นทาง' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'กรุณาระบุเหตุผลที่ยกเลิก (อย่างน้อย 3 ตัวอักษร)' using errcode = 'P0001';
  end if;
  update public.asset_transfers
     set status = 'cancelled', cancel_reason = left(btrim(p_reason), 500), cancelled_by = auth.uid(), cancelled_at = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------
-- 7) ยืม-คืน และซ่อมบำรุง
-- ---------------------------------------------------------------
create function public.lend_asset(p_asset uuid, p_borrower text, p_loaned_on date, p_due_on date, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.assets%rowtype;
  v_id uuid;
begin
  v := private.asset_lock(p_asset);
  if v.condition = 'pending_disposal' then
    raise exception 'ครุภัณฑ์นี้มีคำขอจำหน่ายค้างอยู่ ให้ยืมไม่ได้' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_borrower, ''))) < 2 then
    raise exception 'กรุณากรอกชื่อผู้ยืม' using errcode = 'P0001';
  end if;
  if p_loaned_on is null or (p_due_on is not null and p_due_on < p_loaned_on) then
    raise exception 'กรุณากรอกวันที่ยืม และวันครบกำหนดต้องไม่ก่อนวันที่ยืม' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.asset_loans l where l.asset_id = v.id and l.returned_on is null) then
    raise exception 'ครุภัณฑ์นี้ยังถูกยืมอยู่' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.asset_transfers t where t.asset_id = v.id and t.status = 'sent') then
    raise exception 'ครุภัณฑ์นี้มีการโอนที่รอรับ ให้ยืมไม่ได้' using errcode = 'P0001';
  end if;
  insert into public.asset_loans (asset_id, org_unit_id, borrower, loaned_on, due_on, note)
  values (v.id, v.org_unit_id, left(btrim(p_borrower), 200), p_loaned_on, p_due_on, left(btrim(coalesce(p_note, '')), 500))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.return_asset(p_loan uuid, p_returned_on date, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.asset_loans%rowtype;
begin
  select * into v_l from public.asset_loans where id = p_loan for update;
  if not found or v_l.returned_on is not null then
    raise exception 'ไม่พบรายการยืมที่ยังไม่คืน' using errcode = 'P0001';
  end if;
  perform private.asset_lock(v_l.asset_id);
  if p_returned_on is null or p_returned_on < v_l.loaned_on then
    raise exception 'วันที่คืนต้องไม่ก่อนวันที่ยืม' using errcode = 'P0001';
  end if;
  update public.asset_loans
     set returned_on = p_returned_on, return_note = left(btrim(coalesce(p_note, '')), 500), returned_by = auth.uid()
   where id = p_loan;
end;
$$;

create function public.add_asset_repair(p_asset uuid, p_repaired_on date, p_description text, p_cost numeric, p_vendor text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.assets%rowtype;
  v_id uuid;
begin
  v := private.asset_lock(p_asset);
  if p_repaired_on is null or p_repaired_on < v.acquired_on then
    raise exception 'วันที่ซ่อมต้องไม่ก่อนวันที่ได้มา' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_description, ''))) < 3 then
    raise exception 'กรุณาระบุรายการซ่อม (อย่างน้อย 3 ตัวอักษร)' using errcode = 'P0001';
  end if;
  if p_cost is null or p_cost < 0 or p_cost <> round(p_cost, 2) then
    raise exception 'ค่าใช้จ่ายต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง' using errcode = 'P0001';
  end if;
  insert into public.asset_repairs (asset_id, org_unit_id, repaired_on, description, cost, vendor)
  values (v.id, v.org_unit_id, p_repaired_on, left(btrim(p_description), 500), p_cost, left(btrim(coalesce(p_vendor, '')), 200))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.cancel_asset_repair(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.asset_repairs%rowtype;
begin
  select * into v_r from public.asset_repairs where id = p_id for update;
  if not found or not v_r.is_active then
    raise exception 'ไม่พบรายการซ่อม' using errcode = 'P0001';
  end if;
  perform private.asset_lock(v_r.asset_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'กรุณาระบุเหตุผลที่ยกเลิก (อย่างน้อย 3 ตัวอักษร)' using errcode = 'P0001';
  end if;
  update public.asset_repairs set is_active = false, cancel_reason = left(btrim(p_reason), 500) where id = p_id;
end;
$$;

-- ---------------------------------------------------------------
-- 8) ตรวจนับประจำปี: เปิดรอบ (สร้างรายการที่ต้องตรวจ) > บันทึก พบ / ชำรุด (สแกน QR แล้วกดที่หน้าครุภัณฑ์) > ปิดรอบ (ที่เหลือ = ไม่พบ)
-- ---------------------------------------------------------------
create function public.create_asset_count(p_unit uuid, p_title text, p_include_sub boolean, p_started_on date, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n integer;
begin
  if not public.can_edit_inventory(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์เปิดรอบตรวจนับของหน่วยนี้' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_title, ''))) < 3 then
    raise exception 'กรุณาตั้งชื่อรอบตรวจนับ (อย่างน้อย 3 ตัวอักษร)' using errcode = 'P0001';
  end if;
  if p_started_on is null then
    raise exception 'กรุณากรอกวันที่เริ่มตรวจนับ' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.asset_counts c where c.org_unit_id = p_unit and c.status = 'open') then
    raise exception 'หน่วยนี้มีรอบตรวจนับที่ยังไม่ปิด ให้ปิดรอบเดิมก่อน' using errcode = 'P0001';
  end if;
  insert into public.asset_counts (org_unit_id, title, include_sub, started_on, note)
  values (p_unit, left(btrim(p_title), 200), coalesce(p_include_sub, true), p_started_on, left(btrim(coalesce(p_note, '')), 500))
  returning id into v_id;
  insert into public.asset_count_items (count_id, asset_id, org_unit_id, expected_condition)
  select v_id, a.id, a.org_unit_id, a.condition
  from public.assets a
  where a.is_active and a.condition <> 'disposed'
    and (a.org_unit_id = p_unit
         or (coalesce(p_include_sub, true) and a.org_unit_id in (select d.id from public.descendants_of(p_unit) d)));
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'ไม่มีครุภัณฑ์ในขอบเขตของรอบนี้' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

create function public.record_asset_count(p_count uuid, p_asset uuid, p_result text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.asset_counts%rowtype;
  v_i public.asset_count_items%rowtype;
begin
  select * into v_c from public.asset_counts where id = p_count;
  if not found or v_c.status <> 'open' then
    raise exception 'รอบตรวจนับนี้ปิดแล้วหรือไม่พบ' using errcode = 'P0001';
  end if;
  select * into v_i from public.asset_count_items where count_id = p_count and asset_id = p_asset for update;
  if not found then
    raise exception 'ครุภัณฑ์นี้ไม่อยู่ในรายการของรอบตรวจนับนี้' using errcode = 'P0001';
  end if;
  if not (public.can_edit_inventory(v_c.org_unit_id) or public.can_edit_inventory(v_i.org_unit_id)) then
    raise exception 'ท่านไม่มีสิทธิ์บันทึกผลตรวจนับของรอบนี้' using errcode = '42501';
  end if;
  if p_result not in ('found', 'damaged') then
    raise exception 'ผลตรวจนับต้องเป็น พบ หรือ ชำรุด (ไม่พบ = ระบบบันทึกเมื่อปิดรอบ)' using errcode = 'P0001';
  end if;
  update public.asset_count_items
     set result = p_result, note = left(btrim(coalesce(p_note, '')), 500), checked_at = now(), checked_by = auth.uid()
   where id = v_i.id;
end;
$$;

create function public.close_asset_count(p_count uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.asset_counts%rowtype;
begin
  select * into v_c from public.asset_counts where id = p_count for update;
  if not found or v_c.status <> 'open' then
    raise exception 'รอบตรวจนับนี้ปิดแล้วหรือไม่พบ' using errcode = 'P0001';
  end if;
  if not public.can_edit_inventory(v_c.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์ปิดรอบตรวจนับนี้' using errcode = '42501';
  end if;
  update public.asset_count_items set result = 'missing', checked_at = now(), checked_by = auth.uid()
   where count_id = p_count and result is null;
  update public.asset_counts set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = p_count;
  return (select jsonb_build_object('total', count(*), 'found', count(*) filter (where result = 'found'),
                                    'damaged', count(*) filter (where result = 'damaged'),
                                    'missing', count(*) filter (where result = 'missing'))
          from public.asset_count_items where count_id = p_count);
end;
$$;

-- ---------------------------------------------------------------
-- 9) คำขอจำหน่ายครุภัณฑ์ (เครื่องอนุมัติกลาง ชนิด asset_disposal) เหตุผลอยู่ใน payload.detail รูปแนบที่หน้าคำขอ
-- ---------------------------------------------------------------
create function private.asset_disposal_payload(p_asset public.assets, p_reason text, p_prev text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'asset_id', p_asset.id, 'asset_no', p_asset.asset_no, 'name', p_asset.name,
    'type_name', (select t.name from public.asset_types t where t.id = p_asset.type_id),
    'unit_name', (select u.name from public.org_units u where u.id = p_asset.org_unit_id),
    'acquired_on', p_asset.acquired_on, 'price', p_asset.price,
    'net_value', p_asset.price - private.asset_acc(p_asset, private.today_bangkok()),
    'condition', p_prev, 'prev_condition', p_prev, 'detail', btrim(p_reason));
$$;

create function public.submit_asset_disposal(p_asset uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.assets%rowtype;
  v_req uuid;
begin
  v := private.asset_lock(p_asset);
  if v.condition not in ('usable', 'damaged') then
    raise exception 'ครุภัณฑ์นี้มีคำขอจำหน่ายค้างอยู่แล้ว' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 or length(btrim(p_reason)) > 1000 then
    raise exception 'กรุณาระบุเหตุผลที่ขอจำหน่าย (3 ถึง 1,000 ตัวอักษร)' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.asset_transfers t where t.asset_id = v.id and t.status = 'sent')
     or exists (select 1 from public.asset_loans l where l.asset_id = v.id and l.returned_on is null) then
    raise exception 'ครุภัณฑ์นี้มีการโอนที่รอรับ หรือยังถูกยืมอยู่' using errcode = 'P0001';
  end if;
  perform set_config('app.asset_disposal', '1', true);
  v_req := private.create_request('asset_disposal', v.org_unit_id, 'ขอจำหน่าย ' || v.asset_no || ' ' || v.name,
             private.asset_disposal_payload(v, p_reason, v.condition), array[v.org_unit_id]);
  update public.assets set condition = 'pending_disposal', disposal_request_id = v_req where id = v.id;
  perform set_config('app.asset_disposal', '', true);
  return v_req;
end;
$$;

-- ส่งใหม่หลังถูกส่งกลับ (เฉพาะผู้ยื่น) แก้เหตุผลได้
create function public.resubmit_asset_disposal(p_request uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q public.requests%rowtype;
begin
  select * into v_q from public.requests where id = p_request and type_key = 'asset_disposal';
  if not found or v_q.requester_id <> auth.uid() then
    raise exception 'ส่งใหม่ได้เฉพาะผู้ยื่นคำขอ' using errcode = '42501';
  end if;
  if v_q.status <> 'returned' then
    raise exception 'ส่งใหม่ได้เฉพาะคำขอที่ถูกส่งกลับแก้ไข' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 or length(btrim(p_reason)) > 1000 then
    raise exception 'กรุณาระบุเหตุผลที่ขอจำหน่าย (3 ถึง 1,000 ตัวอักษร)' using errcode = 'P0001';
  end if;
  perform set_config('app.asset_disposal', '1', true);
  perform public.resubmit_request(p_request, v_q.title, v_q.payload || jsonb_build_object('detail', btrim(p_reason)));
  perform set_config('app.asset_disposal', '', true);
end;
$$;

create function public.requests_guard_asset_disposal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.type_key = 'asset_disposal' or (tg_op = 'UPDATE' and old.type_key = 'asset_disposal'))
     and coalesce(current_setting('app.asset_disposal', true), '') <> '1' then
    raise exception 'คำขอจำหน่ายครุภัณฑ์ต้องยื่นจากหน้าครุภัณฑ์เท่านั้น' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.requests_guard_asset_disposal() from public, anon, authenticated;
create trigger requests_guard_asset_disposal before insert or update of payload, title, type_key on public.requests
  for each row execute function public.requests_guard_asset_disposal();

-- อนุมัติ = จำหน่ายแล้ว (วันที่อนุมัติ) / ไม่อนุมัติหรือยกเลิก = กลับเป็นสภาพเดิม / ส่งกลับ = ยังรอจำหน่าย
create function public.requests_sync_asset_disposal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset uuid;
begin
  if new.type_key <> 'asset_disposal' or new.status = old.status then
    return new;
  end if;
  v_asset := (new.payload ->> 'asset_id')::uuid;
  perform set_config('app.asset_disposal', '1', true);
  if new.status = 'approved' then
    update public.assets set condition = 'disposed', disposed_on = private.today_bangkok()
     where id = v_asset and disposal_request_id = new.id and condition = 'pending_disposal';
  elsif new.status in ('rejected', 'cancelled') then
    update public.assets set condition = coalesce(new.payload ->> 'prev_condition', 'usable'), disposal_request_id = null
     where id = v_asset and disposal_request_id = new.id and condition = 'pending_disposal';
  end if;
  perform set_config('app.asset_disposal', '', true);
  return new;
end;
$$;
revoke execute on function public.requests_sync_asset_disposal() from public, anon, authenticated;
create trigger requests_sync_asset_disposal after update of status on public.requests
  for each row execute function public.requests_sync_asset_disposal();

-- ---------------------------------------------------------------
-- 10) ฟังก์ชันอ่าน (security definer ตรวจขอบเขตพัสดุเอง)
-- ---------------------------------------------------------------
-- หน่วยที่ผู้ใช้ดูพัสดุได้ (ใช้กับตัวเลือกเขตของหน้าครุภัณฑ์และรายงาน รูปแบบเดียวกับ inventory_edit_units)
create function public.inventory_view_units()
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
    select r.inventory_view, m.org_unit_id
    from public.my_role_rows() m
    join public.roles r on r.key = m.role_key
    where m.effective and r.inventory_view <> 'none'
  ),
  everything as (
    select exists (select 1 from mine where inventory_view = 'all') as yes
  ),
  reachable as (
    select org_unit_id as id from mine where org_unit_id is not null
    union
    select d.id from mine x cross join lateral public.descendants_of(x.org_unit_id) d
    where x.inventory_view = 'subtree' and x.org_unit_id is not null
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

-- หน่วยในขอบเขต: หน่วยที่เลือก (+ ใต้สังกัดเมื่อ p_sub) เฉพาะที่ผู้ใช้ดูพัสดุได้
create function private.inv_scope_units(p_unit uuid, p_sub boolean)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select x.id from (
    select p_unit as id
    union
    select d.id from public.descendants_of(p_unit) d where p_sub
  ) x
  where public.can_view_inventory(x.id);
$$;

create function private.inv_require_view(p_unit uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_unit is null or not public.can_view_inventory(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์ดูพัสดุของหน่วยนี้' using errcode = '42501';
  end if;
end;
$$;

-- ทะเบียนครุภัณฑ์ในขอบเขต พร้อมค่าเสื่อมสะสมและมูลค่าสุทธิ ณ วันนี้ ผู้ยืม และการโอนที่รอรับ (สูงสุด 5,000 รายการ)
create function public.asset_rows(p_unit uuid, p_sub boolean default true, p_inactive boolean default false)
returns table (
  id uuid, asset_no text, name text, type_id uuid, type_name text, brand text, model text, serial_no text,
  acquired_on date, acquire_method text, price numeric, source_name text, life_years integer,
  org_unit_id uuid, unit_name text, location text, custodian text, condition text, disposed_on date, is_active boolean,
  acc_dep numeric, net_value numeric, borrower text, transfer_to text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform private.inv_require_view(p_unit);
  return query
  select a.id, a.asset_no, a.name, a.type_id, t.name, a.brand, a.model, a.serial_no, a.acquired_on, a.acquire_method, a.price,
         s.name, private.asset_life(a), a.org_unit_id, u.name, a.location, a.custodian, a.condition, a.disposed_on, a.is_active,
         private.asset_acc(a, private.today_bangkok()),
         (a.price - private.asset_acc(a, private.today_bangkok()))::numeric(14,2),
         (select l.borrower from public.asset_loans l where l.asset_id = a.id and l.returned_on is null),
         (select tu.name from public.asset_transfers tr join public.org_units tu on tu.id = tr.to_unit_id
          where tr.asset_id = a.id and tr.status = 'sent')
  from public.assets a
  join public.asset_types t on t.id = a.type_id
  join public.org_units u on u.id = a.org_unit_id
  left join public.budget_sources s on s.id = a.source_id
  where a.org_unit_id in (select x.id from private.inv_scope_units(p_unit, coalesce(p_sub, true)) x)
    and (a.is_active or coalesce(p_inactive, false))
  order by a.asset_no
  limit 5000;
end;
$$;

create function public.asset_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.assets%rowtype;
  v_today date := private.today_bangkok();
  v_end date;
  v_t public.asset_transfers%rowtype;
begin
  select * into v from public.assets where id = p_id;
  if not found then
    raise exception 'ไม่พบครุภัณฑ์' using errcode = 'P0001';
  end if;
  select * into v_t from public.asset_transfers t where t.asset_id = p_id and t.status = 'sent';
  if not (public.can_view_inventory(v.org_unit_id) or (v_t.id is not null and public.can_view_inventory(v_t.to_unit_id))) then
    raise exception 'ไม่พบครุภัณฑ์ หรือท่านไม่มีสิทธิ์ดู' using errcode = '42501';
  end if;
  v_end := coalesce(least(v_today, v.disposed_on), v_today);
  return jsonb_build_object(
    'id', v.id, 'asset_no', v.asset_no, 'name', v.name, 'type_id', v.type_id,
    'type_name', (select t.name from public.asset_types t where t.id = v.type_id),
    'brand', v.brand, 'model', v.model, 'serial_no', v.serial_no, 'acquired_on', v.acquired_on,
    'acquire_method', v.acquire_method, 'price', v.price, 'source_id', v.source_id,
    'source_name', (select s.name from public.budget_sources s where s.id = v.source_id),
    'useful_life_years', v.useful_life_years, 'life_years', private.asset_life(v),
    'org_unit_id', v.org_unit_id, 'unit_name', (select u.name from public.org_units u where u.id = v.org_unit_id),
    'location', v.location, 'custodian', v.custodian, 'condition', v.condition, 'disposed_on', v.disposed_on,
    'note', v.note, 'is_active', v.is_active, 'created_at', v.created_at, 'updated_at', v.updated_at,
    'acc_dep', private.asset_acc(v, v_today), 'net_value', v.price - private.asset_acc(v, v_today),
    'schedule', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'year_be', y,
               'opening', private.asset_acc(v, private.fy_start(y) - 1),
               'depreciation', private.asset_acc(v, private.fy_end(y)) - private.asset_acc(v, private.fy_start(y) - 1),
               'closing', private.asset_acc(v, private.fy_end(y)),
               'net', v.price - private.asset_acc(v, private.fy_end(y))) order by y), '[]'::jsonb)
      from generate_series(public.fiscal_year_be(v.acquired_on), public.fiscal_year_be(v_end)) y),
    'transfers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'status', t.status, 'from_unit_name', fu.name, 'to_unit_name', tu.name,
               'sent_on', t.sent_on, 'received_on', t.received_on, 'note', t.note, 'cancel_reason', t.cancel_reason,
               'created_by_name', private.inv_person_name(t.created_by), 'received_by_name', private.inv_person_name(t.received_by),
               'can_receive', t.status = 'sent' and public.can_edit_inventory(t.to_unit_id),
               'can_cancel', t.status = 'sent' and public.can_edit_inventory(t.from_unit_id)) order by t.created_at desc), '[]'::jsonb)
      from public.asset_transfers t join public.org_units fu on fu.id = t.from_unit_id join public.org_units tu on tu.id = t.to_unit_id
      where t.asset_id = p_id),
    'loans', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', l.id, 'borrower', l.borrower, 'loaned_on', l.loaned_on, 'due_on', l.due_on, 'returned_on', l.returned_on,
               'note', l.note, 'return_note', l.return_note, 'overdue', l.returned_on is null and l.due_on < v_today)
               order by l.loaned_on desc, l.created_at desc), '[]'::jsonb)
      from public.asset_loans l where l.asset_id = p_id),
    'repairs', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'repaired_on', r.repaired_on, 'description', r.description, 'cost', r.cost, 'vendor', r.vendor,
               'is_active', r.is_active, 'cancel_reason', r.cancel_reason, 'created_by_name', private.inv_person_name(r.created_by))
               order by r.repaired_on desc, r.created_at desc), '[]'::jsonb)
      from public.asset_repairs r where r.asset_id = p_id),
    'repair_total', (select coalesce(sum(r.cost), 0) from public.asset_repairs r where r.asset_id = p_id and r.is_active),
    'counts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'count_id', c.id, 'title', c.title, 'status', c.status, 'result', i.result, 'checked_at', i.checked_at,
               'can_record', c.status = 'open' and (public.can_edit_inventory(c.org_unit_id) or public.can_edit_inventory(i.org_unit_id)))
               order by c.created_at desc), '[]'::jsonb)
      from public.asset_count_items i join public.asset_counts c on c.id = i.count_id where i.asset_id = p_id),
    'disposal', (
      select jsonb_build_object('request_id', q.id, 'request_no', q.request_no, 'status', q.status, 'requester_id', q.requester_id)
      from public.requests q where q.id = v.disposal_request_id),
    'can_edit', v.is_active and v.condition <> 'disposed' and public.can_edit_inventory(v.org_unit_id),
    'can_view_unit', public.can_view_inventory(v.org_unit_id)
  );
end;
$$;

-- ค่าเสื่อมราคาประจำปีงบประมาณ ของครุภัณฑ์ในขอบเขต (ที่มีอยู่ในปีนั้น: ได้มาก่อนสิ้นปี และยังไม่จำหน่ายก่อนต้นปี)
create function public.asset_depreciation(p_year_be integer, p_unit uuid, p_sub boolean default true)
returns table (
  id uuid, asset_no text, name text, type_name text, unit_name text, acquired_on date, price numeric, life_years integer,
  opening numeric, depreciation numeric, closing numeric, net_value numeric, condition text, disposed_on date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := private.fy_start(p_year_be);
  v_end date := private.fy_end(p_year_be);
begin
  perform private.inv_require_view(p_unit);
  return query
  select a.id, a.asset_no, a.name, t.name, u.name, a.acquired_on, a.price, private.asset_life(a),
         private.asset_acc(a, v_start - 1),
         (private.asset_acc(a, v_end) - private.asset_acc(a, v_start - 1))::numeric(14,2),
         private.asset_acc(a, v_end),
         (a.price - private.asset_acc(a, v_end))::numeric(14,2),
         a.condition, a.disposed_on
  from public.assets a
  join public.asset_types t on t.id = a.type_id
  join public.org_units u on u.id = a.org_unit_id
  where a.is_active and a.acquired_on <= v_end and (a.disposed_on is null or a.disposed_on >= v_start)
    and a.org_unit_id in (select x.id from private.inv_scope_units(p_unit, coalesce(p_sub, true)) x)
  order by t.name, a.asset_no
  limit 5000;
end;
$$;

-- การโอนครุภัณฑ์ที่รอรับ (ต้นทางหรือปลายทางอยู่ในเขตที่เห็น)
create function public.asset_transfer_rows()
returns table (
  id uuid, asset_id uuid, asset_no text, asset_name text, from_unit_name text, to_unit_name text, sent_on date,
  note text, can_receive boolean, can_cancel boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, a.id, a.asset_no, a.name, fu.name, tu.name, t.sent_on, t.note,
         public.can_edit_inventory(t.to_unit_id), public.can_edit_inventory(t.from_unit_id)
  from public.asset_transfers t
  join public.assets a on a.id = t.asset_id
  join public.org_units fu on fu.id = t.from_unit_id
  join public.org_units tu on tu.id = t.to_unit_id
  where t.status = 'sent' and (public.can_view_inventory(t.from_unit_id) or public.can_view_inventory(t.to_unit_id))
  order by t.sent_on desc, t.created_at desc
  limit 500;
$$;

create function public.asset_count_rows()
returns table (
  id uuid, org_unit_id uuid, unit_name text, title text, include_sub boolean, started_on date, status text, closed_at timestamptz,
  total integer, found integer, damaged integer, missing integer, unchecked integer, can_edit boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.org_unit_id, u.name, c.title, c.include_sub, c.started_on, c.status, c.closed_at,
         (select count(*)::integer from public.asset_count_items i where i.count_id = c.id),
         (select count(*)::integer from public.asset_count_items i where i.count_id = c.id and i.result = 'found'),
         (select count(*)::integer from public.asset_count_items i where i.count_id = c.id and i.result = 'damaged'),
         (select count(*)::integer from public.asset_count_items i where i.count_id = c.id and i.result = 'missing'),
         (select count(*)::integer from public.asset_count_items i where i.count_id = c.id and i.result is null),
         public.can_edit_inventory(c.org_unit_id)
  from public.asset_counts c join public.org_units u on u.id = c.org_unit_id
  where public.can_view_inventory(c.org_unit_id)
  order by c.created_at desc
  limit 500;
$$;

create function public.asset_count_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.asset_counts%rowtype;
begin
  select * into v_c from public.asset_counts where id = p_id;
  if not found or not public.can_view_inventory(v_c.org_unit_id) then
    raise exception 'ไม่พบรอบตรวจนับ หรือท่านไม่มีสิทธิ์ดู' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'id', v_c.id, 'org_unit_id', v_c.org_unit_id, 'unit_name', (select name from public.org_units where id = v_c.org_unit_id),
    'title', v_c.title, 'include_sub', v_c.include_sub, 'started_on', v_c.started_on, 'status', v_c.status, 'note', v_c.note,
    'closed_at', v_c.closed_at, 'closed_by_name', private.inv_person_name(v_c.closed_by),
    'created_by_name', private.inv_person_name(v_c.created_by),
    'can_edit', public.can_edit_inventory(v_c.org_unit_id),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'asset_id', a.id, 'asset_no', a.asset_no, 'name', a.name, 'unit_name', u.name, 'location', a.location,
               'expected_condition', i.expected_condition, 'current_condition', a.condition, 'result', i.result, 'note', i.note,
               'checked_at', i.checked_at, 'checked_by_name', private.inv_person_name(i.checked_by))
               order by u.name, a.asset_no), '[]'::jsonb)
      from public.asset_count_items i join public.assets a on a.id = i.asset_id join public.org_units u on u.id = i.org_unit_id
      where i.count_id = p_id)
  );
end;
$$;

-- รายงานการเบิกวัสดุ: จ่ายของตามใบเบิกในปีงบประมาณ ของคลังในขอบเขต (สูงสุด 5,000 แถว)
create function public.inventory_issue_report(p_year_be integer, p_unit uuid, p_sub boolean default true)
returns table (
  issued_on date, request_no text, warehouse_name text, unit_name text, item_code text, item_name text, item_unit text,
  quantity numeric, requester_name text, purpose text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform private.inv_require_view(p_unit);
  return query
  select m.moved_on, m.reference_no, w.name, u.name, i.code, i.name, i.unit, (-m.quantity)::numeric(12,2),
         private.inv_person_name(r.created_by), r.purpose
  from public.stock_moves m
  join public.requisitions r on r.id = m.requisition_id
  join public.warehouses w on w.id = m.warehouse_id
  join public.org_units u on u.id = m.org_unit_id
  join public.items i on i.id = m.item_id
  where m.kind = 'issue' and m.moved_on between private.fy_start(p_year_be) and private.fy_end(p_year_be)
    and m.org_unit_id in (select x.id from private.inv_scope_units(p_unit, coalesce(p_sub, true)) x)
  order by m.moved_on, m.reference_no, i.code
  limit 5000;
end;
$$;

-- เปรียบเทียบระหว่างหน่วย: แถวหน่วยที่เลือก (เฉพาะหน่วยตน) + หน่วยใต้สังกัดชั้นถัดไป (รวมทั้งสาย) ณ สิ้นปีงบประมาณ
create function public.asset_unit_compare(p_year_be integer, p_unit uuid)
returns table (
  unit_id uuid, unit_name text, is_self boolean, has_children boolean, asset_count integer, cost numeric, acc_dep numeric,
  net_value numeric, year_dep numeric, damaged integer, pending_disposal integer, disposed_in_year integer,
  requisitions_issued integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := private.fy_start(p_year_be);
  v_end date := private.fy_end(p_year_be);
begin
  perform private.inv_require_view(p_unit);
  return query
  with groups as (
    select p_unit as gid, true as self
    union all
    select c.id, false from public.org_units c where c.parent_id = p_unit and c.is_active and public.can_view_inventory(c.id)
  ),
  members as (
    select g.gid, g.self, g.gid as uid from groups g
    union
    select g.gid, g.self, d.id from groups g cross join lateral public.descendants_of(g.gid) d where not g.self
  ),
  a as (
    select m.gid, x.*, private.asset_acc(x, v_end) as acc_end, private.asset_acc(x, v_start - 1) as acc_start
    from members m join public.assets x on x.org_unit_id = m.uid
    where x.is_active and x.acquired_on <= v_end and (x.disposed_on is null or x.disposed_on >= v_start)
  )
  select g.gid, u.name, g.self,
         (not g.self and exists (select 1 from public.org_units c where c.parent_id = g.gid and c.is_active)),
         (select count(*)::integer from a where a.gid = g.gid and (a.disposed_on is null or a.disposed_on > v_end)),
         (select coalesce(sum(a.price), 0)::numeric(14,2) from a where a.gid = g.gid and (a.disposed_on is null or a.disposed_on > v_end)),
         (select coalesce(sum(a.acc_end), 0)::numeric(14,2) from a where a.gid = g.gid and (a.disposed_on is null or a.disposed_on > v_end)),
         (select coalesce(sum(a.price - a.acc_end), 0)::numeric(14,2) from a where a.gid = g.gid and (a.disposed_on is null or a.disposed_on > v_end)),
         (select coalesce(sum(a.acc_end - a.acc_start), 0)::numeric(14,2) from a where a.gid = g.gid),
         (select count(*)::integer from a where a.gid = g.gid and a.condition = 'damaged'),
         (select count(*)::integer from a where a.gid = g.gid and a.condition = 'pending_disposal'),
         (select count(*)::integer from a where a.gid = g.gid and a.disposed_on between v_start and v_end),
         (select count(*)::integer from public.requisitions r
           where r.status = 'issued' and r.issued_on between v_start and v_end
             and r.org_unit_id in (select m.uid from members m where m.gid = g.gid))
  from groups g join public.org_units u on u.id = g.gid
  order by g.self desc, u.code;
end;
$$;

-- ---------------------------------------------------------------
-- 11) คำขอจำหน่ายเห็นได้เฉพาะผู้ยื่น ผู้ดูพัสดุของหน่วย และผู้พิจารณา / รูปครุภัณฑ์ (entity_table assets)
-- ---------------------------------------------------------------
alter policy requests_read on public.requests
  using (
    requester_id = auth.uid()
    or case
      when type_key in ('budget_transfer', 'budget_use') then
        public.can_view_budget(org_unit_id) or public.is_request_decider(id)
      when type_key in ('requisition', 'asset_disposal') then
        public.can_view_inventory(org_unit_id) or public.is_request_decider(id)
      when public.is_personnel_request(type_key) then
        public.can_view_personnel(org_unit_id)
        or public.can_view_request_steps(id)
        or public.is_request_subject(payload)
      else public.can_access(org_unit_id)
    end
  );

alter policy attachments_read on public.attachments
  using (
    case
      when public.is_personnel_entity(entity_table) then public.can_view_personnel(org_unit_id)
      when entity_table = 'places' then public.can_view_places(org_unit_id)
      when entity_table = 'requests' then
        uploaded_by = auth.uid()
        or exists (select 1 from public.requests r where r.id::text = attachments.entity_id)
      when entity_table = 'budget_disbursements' then
        uploaded_by = auth.uid() or public.can_view_budget(org_unit_id)
      when entity_table = 'stock_receipts' then
        uploaded_by = auth.uid() or public.can_view_inventory(org_unit_id)
      when entity_table = 'items' then
        uploaded_by = auth.uid() or exists (select 1 from public.items i where i.id::text = attachments.entity_id)
      when entity_table = 'assets' then
        uploaded_by = auth.uid() or exists (select 1 from public.assets a where a.id::text = attachments.entity_id)
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
      when entity_table = 'budget_disbursements' then
        public.can_edit_budget(org_unit_id)
        and exists (select 1 from public.budget_disbursements d
                    where d.id::text = attachments.entity_id and d.org_unit_id = attachments.org_unit_id)
      when entity_table = 'stock_receipts' then
        public.can_edit_inventory(org_unit_id)
        and exists (select 1 from public.stock_receipts s
                    where s.id::text = attachments.entity_id and s.org_unit_id = attachments.org_unit_id)
      when entity_table = 'items' then
        org_unit_id is null and public.can_edit_any_inventory()
        and exists (select 1 from public.items i where i.id::text = attachments.entity_id)
      when entity_table = 'assets' then
        public.can_edit_inventory(org_unit_id)
        and exists (select 1 from public.assets a
                    where a.id::text = attachments.entity_id and a.org_unit_id = attachments.org_unit_id and a.condition <> 'disposed')
      else org_unit_id is null or public.can_access(org_unit_id)
    end
  );

-- ---------------------------------------------------------------
-- 12) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke all on function private.asset_acc_dep(numeric, integer, date, date) from public, anon, authenticated;
revoke all on function private.asset_acc(public.assets, date) from public, anon, authenticated;
revoke all on function private.asset_life(public.assets) from public, anon, authenticated;
revoke all on function private.fy_start(integer) from public, anon, authenticated;
revoke all on function private.fy_end(integer) from public, anon, authenticated;
revoke all on function private.asset_lock(uuid) from public, anon, authenticated;
revoke all on function private.asset_disposal_payload(public.assets, text, text) from public, anon, authenticated;
revoke all on function private.inv_scope_units(uuid, boolean) from public, anon, authenticated;
revoke all on function private.inv_require_view(uuid) from public, anon, authenticated;

revoke execute on function public.send_asset_transfer(uuid, uuid, date, text) from public, anon;
revoke execute on function public.receive_asset_transfer(uuid, date, text, text) from public, anon;
revoke execute on function public.cancel_asset_transfer(uuid, text) from public, anon;
revoke execute on function public.lend_asset(uuid, text, date, date, text) from public, anon;
revoke execute on function public.return_asset(uuid, date, text) from public, anon;
revoke execute on function public.add_asset_repair(uuid, date, text, numeric, text) from public, anon;
revoke execute on function public.cancel_asset_repair(uuid, text) from public, anon;
revoke execute on function public.create_asset_count(uuid, text, boolean, date, text) from public, anon;
revoke execute on function public.record_asset_count(uuid, uuid, text, text) from public, anon;
revoke execute on function public.close_asset_count(uuid) from public, anon;
revoke execute on function public.submit_asset_disposal(uuid, text) from public, anon;
revoke execute on function public.resubmit_asset_disposal(uuid, text) from public, anon;
revoke execute on function public.inventory_view_units() from public, anon;
revoke execute on function public.asset_rows(uuid, boolean, boolean) from public, anon;
revoke execute on function public.asset_detail(uuid) from public, anon;
revoke execute on function public.asset_depreciation(integer, uuid, boolean) from public, anon;
revoke execute on function public.asset_transfer_rows() from public, anon;
revoke execute on function public.asset_count_rows() from public, anon;
revoke execute on function public.asset_count_detail(uuid) from public, anon;
revoke execute on function public.inventory_issue_report(integer, uuid, boolean) from public, anon;
revoke execute on function public.asset_unit_compare(integer, uuid) from public, anon;

grant execute on function public.send_asset_transfer(uuid, uuid, date, text) to authenticated;
grant execute on function public.receive_asset_transfer(uuid, date, text, text) to authenticated;
grant execute on function public.cancel_asset_transfer(uuid, text) to authenticated;
grant execute on function public.lend_asset(uuid, text, date, date, text) to authenticated;
grant execute on function public.return_asset(uuid, date, text) to authenticated;
grant execute on function public.add_asset_repair(uuid, date, text, numeric, text) to authenticated;
grant execute on function public.cancel_asset_repair(uuid, text) to authenticated;
grant execute on function public.create_asset_count(uuid, text, boolean, date, text) to authenticated;
grant execute on function public.record_asset_count(uuid, uuid, text, text) to authenticated;
grant execute on function public.close_asset_count(uuid) to authenticated;
grant execute on function public.submit_asset_disposal(uuid, text) to authenticated;
grant execute on function public.resubmit_asset_disposal(uuid, text) to authenticated;
grant execute on function public.inventory_view_units() to authenticated;
grant execute on function public.asset_rows(uuid, boolean, boolean) to authenticated;
grant execute on function public.asset_detail(uuid) to authenticated;
grant execute on function public.asset_depreciation(integer, uuid, boolean) to authenticated;
grant execute on function public.asset_transfer_rows() to authenticated;
grant execute on function public.asset_count_rows() to authenticated;
grant execute on function public.asset_count_detail(uuid) to authenticated;
grant execute on function public.inventory_issue_report(integer, uuid, boolean) to authenticated;
grant execute on function public.asset_unit_compare(integer, uuid) to authenticated;
