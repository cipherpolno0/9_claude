-- บทที่ 25: คลังวัสดุ รับเข้า เบิก อนุมัติ โอน (ระบบที่ 7)
-- ยอดคงเหลือ = ผลรวม stock_moves.quantity ต่อคลังต่อวัสดุ (ไม่มีตารางยอดแยก) ทุกการเขียนผ่านฟังก์ชันที่ล็อกคลังก่อนตรวจ

-- ---------------------------------------------------------------
-- 1) ขอบเขตพัสดุของแต่ละบทบาท (ตั้งที่หน้า สิทธิ์ตามบทบาท)
--    ดู = เห็นคลังและยื่นใบเบิก (ผู้สั่งงานเลือก: ยื่นได้เฉพาะผู้มีสิทธิ์พัสดุ) / แก้ไข = รับเข้า จ่ายของ โอน ปรับยอด
--    ค่าเริ่มต้น: เจ้าหน้าที่พัสดุ ดูและแก้ไขหน่วยตนและใต้สังกัด / เจ้าคณะ รองเจ้าคณะ ดู / ผู้ดูแลระบบทุกเขต
-- ---------------------------------------------------------------
alter table public.roles
  add column inventory_view text not null default 'none'
    check (inventory_view in ('none', 'own', 'subtree', 'all')),
  add column inventory_edit text not null default 'none'
    check (inventory_edit in ('none', 'own', 'subtree', 'all'));

update public.roles set inventory_view = 'all', inventory_edit = 'all' where key = 'admin';
update public.roles set inventory_view = 'subtree', inventory_edit = 'subtree' where key = 'supplies_officer';
update public.roles set inventory_view = 'subtree' where key in ('chief', 'deputy_chief');

alter table public.roles
  add constraint roles_inventory_edit_within_view
    check (public.personnel_scope_rank(inventory_edit) <= public.personnel_scope_rank(inventory_view)),
  add constraint roles_admin_full_inventory
    check (key <> 'admin' or (inventory_view = 'all' and inventory_edit = 'all'));
comment on column public.roles.inventory_view is 'ขอบเขตการดูคลังวัสดุและยื่นใบเบิก: none / own / subtree / all';
comment on column public.roles.inventory_edit is 'ขอบเขตการรับเข้า จ่าย โอน ปรับยอด: none / own / subtree / all (ไม่กว้างกว่า inventory_view)';

create function public.can_view_inventory(p_org_unit_id uuid)
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
      r.inventory_view = 'all'
      or (r.inventory_view = 'own' and m.org_unit_id = p_org_unit_id)
      or (r.inventory_view = 'subtree'
          and m.org_unit_id in (select a.id from public.ancestors_or_self(p_org_unit_id) a))
    )
  );
$$;

create function public.can_edit_inventory(p_org_unit_id uuid)
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
      r.inventory_edit = 'all'
      or (r.inventory_edit = 'own' and m.org_unit_id = p_org_unit_id)
      or (r.inventory_edit = 'subtree'
          and m.org_unit_id in (select a.id from public.ancestors_or_self(p_org_unit_id) a))
    )
  );
$$;

-- มีสิทธิ์แก้ไขพัสดุอย่างน้อยหนึ่งเขต (ใช้กับทะเบียนวัสดุกลาง)
create function public.can_edit_any_inventory()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.my_role_rows() m join public.roles r on r.key = m.role_key
    where m.effective and (r.inventory_edit = 'all' or (r.inventory_edit <> 'none' and m.org_unit_id is not null))
  );
$$;
revoke execute on function public.can_view_inventory(uuid) from public, anon;
revoke execute on function public.can_edit_inventory(uuid) from public, anon;
revoke execute on function public.can_edit_any_inventory() from public, anon;
grant execute on function public.can_view_inventory(uuid) to authenticated;
grant execute on function public.can_edit_inventory(uuid) to authenticated;
grant execute on function public.can_edit_any_inventory() to authenticated;

-- เมนู พัสดุ-ครุภัณฑ์ ย้ายไป /app/inventory (ผู้สั่งงานเลือก) สิทธิ์เมนูเดิมของทุกบทบาทยกตามไป
update public.role_menus set menu_href = '/app/inventory' where menu_href = '/app/assets';

-- ---------------------------------------------------------------
-- 2) หมวดวัสดุ (ผู้ดูแลระบบกรอกเอง เริ่มว่าง ผู้สั่งงานเลือก)
-- ---------------------------------------------------------------
create table public.inventory_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> '' and length(name) <= 100),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index inventory_categories_name_unique on public.inventory_categories (lower(btrim(name)));
create trigger inventory_categories_set_updated_at before update on public.inventory_categories
  for each row execute function public.set_updated_at();
create trigger inventory_categories_audit after insert or update or delete on public.inventory_categories
  for each row execute function public.audit_row_change();
alter table public.inventory_categories enable row level security;
create policy inventory_categories_read on public.inventory_categories for select to authenticated using (true);
create policy inventory_categories_admin_insert on public.inventory_categories for insert to authenticated
  with check (public.has_role('admin'));
create policy inventory_categories_admin_update on public.inventory_categories for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.inventory_categories from anon;
revoke delete, truncate on public.inventory_categories from authenticated;
grant select, insert, update on public.inventory_categories to authenticated;

-- ---------------------------------------------------------------
-- 3) ทะเบียนวัสดุกลาง (ชุดเดียวทั้งระบบ ผู้สั่งงานเลือก) รูปเก็บเป็นไฟล์แนบ entity_table = items
-- ---------------------------------------------------------------
create table public.items (
  id             uuid primary key default gen_random_uuid(),
  code           text not null check (btrim(code) <> '' and length(code) <= 40),
  name           text not null check (btrim(name) <> '' and length(name) <= 200),
  category_id    uuid references public.inventory_categories (id),
  unit           text not null check (btrim(unit) <> '' and length(unit) <= 30),
  reorder_point  numeric(12,2) not null default 0 check (reorder_point >= 0),
  note           text not null default '' check (length(note) <= 500),
  is_active      boolean not null default true,
  created_by     uuid default auth.uid() references public.profiles (id),
  updated_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.items is 'ทะเบียนวัสดุกลาง: รหัส ชื่อ หมวด หน่วยนับ จุดสั่งซื้อขั้นต่ำ (รูป = ไฟล์แนบ entity_table items)';
create unique index items_code_unique on public.items (lower(btrim(code)));
create index items_name_idx on public.items (name);

create function public.items_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.code := btrim(new.code);
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.unit := btrim(new.unit);
  new.note := btrim(new.note);
  if new.category_id is not null and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not exists (select 1 from public.inventory_categories c where c.id = new.category_id and c.is_active) then
    raise exception 'หมวดวัสดุนี้ถูกปิดใช้งานแล้ว' using errcode = 'P0001';
  end if;
  if new.reorder_point <> round(new.reorder_point, 2) then
    raise exception 'จุดสั่งซื้อมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if new.unit <> old.unit and exists (select 1 from public.stock_moves m where m.item_id = new.id) then
      raise exception 'วัสดุที่มีความเคลื่อนไหวแล้ว เปลี่ยนหน่วยนับไม่ได้' using errcode = 'P0001';
    end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke execute on function public.items_rules() from public, anon, authenticated;
create trigger items_rules before insert or update on public.items
  for each row execute function public.items_rules();
create trigger items_set_updated_at before update on public.items
  for each row execute function public.set_updated_at();
create trigger items_audit after insert or update or delete on public.items
  for each row execute function public.audit_row_change();

alter table public.items enable row level security;
create policy items_read on public.items for select to authenticated
  using (public.can_edit_any_inventory() or exists (
    select 1 from public.my_role_rows() m join public.roles r on r.key = m.role_key
    where m.effective and r.inventory_view <> 'none'));
create policy items_insert on public.items for insert to authenticated
  with check (public.can_edit_any_inventory());
create policy items_update on public.items for update to authenticated
  using (public.can_edit_any_inventory()) with check (public.can_edit_any_inventory());
revoke all on public.items from anon;
revoke delete, truncate on public.items from authenticated;
grant select, insert, update on public.items to authenticated;

-- ---------------------------------------------------------------
-- 4) คลัง: คลังกลาง (main) ของหน่วยหลัก และคลังย่อย (sub) ของหน่วยในสังกัด ผูกกับคลังกลางที่เป็นหน่วยเหนือ
-- ---------------------------------------------------------------
create table public.warehouses (
  id           uuid primary key default gen_random_uuid(),
  org_unit_id  uuid not null references public.org_units (id),
  kind         text not null check (kind in ('main', 'sub')),
  parent_id    uuid references public.warehouses (id),
  code         text not null check (btrim(code) <> '' and length(code) <= 40),
  name         text not null check (btrim(name) <> '' and length(name) <= 200),
  note         text not null default '' check (length(note) <= 500),
  is_active    boolean not null default true,
  created_by   uuid default auth.uid() references public.profiles (id),
  updated_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint warehouses_parent check ((kind = 'sub') = (parent_id is not null))
);
comment on table public.warehouses is 'คลังวัสดุ: main = คลังกลางของหน่วย, sub = คลังย่อยของหน่วยในสังกัด (parent_id = คลังกลาง)';
create unique index warehouses_code_unique on public.warehouses (lower(btrim(code)));
create index warehouses_unit_idx on public.warehouses (org_unit_id);

create function public.warehouses_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent public.warehouses%rowtype;
begin
  new.code := btrim(new.code);
  new.name := btrim(new.name);
  if tg_op = 'UPDATE' and (new.org_unit_id <> old.org_unit_id or new.kind <> old.kind
                           or new.parent_id is distinct from old.parent_id) then
    raise exception 'เปลี่ยนหน่วย ประเภท หรือคลังกลางของคลังเดิมไม่ได้ (ให้ปิดใช้งานแล้วสร้างใหม่)' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.org_units u where u.id = new.org_unit_id and u.is_active) then
    raise exception 'หน่วยนี้ถูกปิดใช้งานแล้ว' using errcode = 'P0001';
  end if;
  if new.kind = 'sub' then
    select * into v_parent from public.warehouses where id = new.parent_id;
    if not found or v_parent.kind <> 'main' or not v_parent.is_active then
      raise exception 'คลังย่อยต้องอยู่ใต้คลังกลางที่ใช้งานอยู่' using errcode = 'P0001';
    end if;
    if new.org_unit_id <> v_parent.org_unit_id
       and not exists (select 1 from public.descendants_of(v_parent.org_unit_id) d where d.id = new.org_unit_id) then
      raise exception 'หน่วยของคลังย่อยต้องเป็นหน่วยเดียวกันหรือหน่วยใต้สังกัดของคลังกลาง' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.is_active and not new.is_active then
    if exists (select 1 from public.stock_moves m where m.warehouse_id = new.id group by m.item_id having sum(m.quantity) <> 0) then
      raise exception 'คลังนี้ยังมีวัสดุคงเหลือ ปิดใช้งานไม่ได้' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.warehouses s where s.parent_id = new.id and s.is_active) then
      raise exception 'คลังกลางนี้ยังมีคลังย่อยที่ใช้งานอยู่' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.stock_transfers t where (t.to_warehouse_id = new.id or t.from_warehouse_id = new.id) and t.status = 'sent') then
      raise exception 'คลังนี้ยังมีใบโอนที่รอรับ ให้รับหรือยกเลิกก่อน' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.requisitions q where q.warehouse_id = new.id and q.status in ('pending', 'returned', 'approved')) then
      raise exception 'คลังนี้ยังมีใบเบิกที่ยังไม่จบ ให้จ่ายของหรือยกเลิกก่อน' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke execute on function public.warehouses_rules() from public, anon, authenticated;
create trigger warehouses_rules before insert or update on public.warehouses
  for each row execute function public.warehouses_rules();
create trigger warehouses_set_updated_at before update on public.warehouses
  for each row execute function public.set_updated_at();
create trigger warehouses_audit after insert or update or delete on public.warehouses
  for each row execute function public.audit_row_change();

alter table public.warehouses enable row level security;
create policy warehouses_read on public.warehouses for select to authenticated
  using (public.can_view_inventory(org_unit_id));
create policy warehouses_insert on public.warehouses for insert to authenticated
  with check (public.can_edit_inventory(org_unit_id));
create policy warehouses_update on public.warehouses for update to authenticated
  using (public.can_edit_inventory(org_unit_id)) with check (public.can_edit_inventory(org_unit_id));
revoke all on public.warehouses from anon;
revoke delete, truncate on public.warehouses from authenticated;
grant select, insert, update on public.warehouses to authenticated;

-- ---------------------------------------------------------------
-- 5) เอกสารรับเข้า ใบโอน ใบเบิก และความเคลื่อนไหว (ระบบเขียนผ่านฟังก์ชันเท่านั้น)
-- ---------------------------------------------------------------
create sequence public.stock_receipt_no_seq;
create sequence public.stock_transfer_no_seq;
revoke all on sequence public.stock_receipt_no_seq, public.stock_transfer_no_seq from public, anon, authenticated;

-- รับเข้า: จากการจัดซื้อหรือรับบริจาค (ใบส่งของแนบเป็นไฟล์ entity_table = stock_receipts) อ้างอิงงวดเบิกจ่ายงบ (ระบบที่ 6) ได้
create table public.stock_receipts (
  id               uuid primary key default gen_random_uuid(),
  receipt_no       text not null unique,
  warehouse_id     uuid not null references public.warehouses (id),
  org_unit_id      uuid not null references public.org_units (id),
  source           text not null check (source in ('purchase', 'donation')),
  received_on      date not null,
  document_no      text not null default '' check (length(document_no) <= 100),
  supplier         text not null default '' check (length(supplier) <= 200),
  disbursement_id  uuid references public.budget_disbursements (id),
  note             text not null default '' check (length(note) <= 500),
  created_by       uuid default auth.uid() references public.profiles (id),
  created_at       timestamptz not null default now()
);
comment on table public.stock_receipts is 'เอกสารรับวัสดุเข้าคลัง (รายการวัสดุอยู่ใน stock_moves ชนิด receive) แก้ไขไม่ได้';
create index stock_receipts_warehouse_idx on public.stock_receipts (warehouse_id, received_on);
create index stock_receipts_disbursement_idx on public.stock_receipts (disbursement_id) where disbursement_id is not null;

-- โอนจากคลังกลางไปคลังย่อย: sent = ต้นทางโอนออกแล้ว รอรับ / received = ปลายทางรับแล้ว / cancelled = ต้นทางยกเลิก ของคืนต้นทาง
create table public.stock_transfers (
  id                 uuid primary key default gen_random_uuid(),
  transfer_no        text not null unique,
  from_warehouse_id  uuid not null references public.warehouses (id),
  to_warehouse_id    uuid not null references public.warehouses (id),
  from_unit_id       uuid not null references public.org_units (id),
  to_unit_id         uuid not null references public.org_units (id),
  status             text not null default 'sent' check (status in ('sent', 'received', 'cancelled')),
  sent_on            date not null,
  received_on        date,
  note               text not null default '' check (length(note) <= 500),
  cancel_reason      text not null default '' check (length(cancel_reason) <= 500),
  created_by         uuid default auth.uid() references public.profiles (id),
  received_by        uuid references public.profiles (id),
  received_at        timestamptz,
  cancelled_by       uuid references public.profiles (id),
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint stock_transfers_two_warehouses check (from_warehouse_id <> to_warehouse_id)
);
comment on table public.stock_transfers is 'ใบโอนวัสดุจากคลังกลางไปคลังย่อย (รายการอยู่ใน stock_moves ชนิด transfer_out / transfer_in)';
create index stock_transfers_from_idx on public.stock_transfers (from_warehouse_id, status);
create index stock_transfers_to_idx on public.stock_transfers (to_warehouse_id, status);

-- ใบเบิก: หลายรายการในใบเดียว lines = [{item_id, quantity (ขอ), approved (อนุมัติ), issued (จ่ายจริง)}]
--   status: pending / returned / approved / rejected / cancelled / issued (จ่ายของแล้ว ตัดสต็อกแล้ว)
create table public.requisitions (
  id            uuid primary key default gen_random_uuid(),
  warehouse_id  uuid not null references public.warehouses (id),
  org_unit_id   uuid not null references public.org_units (id),
  purpose       text not null check (length(btrim(purpose)) between 3 and 1000),
  lines         jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  status        text not null default 'pending'
                  check (status in ('pending', 'returned', 'approved', 'rejected', 'cancelled', 'issued')),
  request_id    uuid references public.requests (id),
  approved_at   timestamptz,
  issued_on     date,
  issued_by     uuid references public.profiles (id),
  issued_at     timestamptz,
  issue_note    text not null default '' check (length(issue_note) <= 500),
  created_by    uuid default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.requisitions is 'ใบเบิกวัสดุ (ชนิดคำขอ requisition ในเครื่องอนุมัติกลาง) ตัดสต็อกเมื่อจ่ายของ';
create index requisitions_warehouse_idx on public.requisitions (warehouse_id, status);
create index requisitions_creator_idx on public.requisitions (created_by, created_at);
create unique index requisitions_request_unique on public.requisitions (request_id) where request_id is not null;

-- ความเคลื่อนไหว: แหล่งเดียวของยอดคงเหลือ (ผลรวม quantity) บันทึกแล้วแก้ไขหรือลบไม่ได้
create table public.stock_moves (
  id              uuid primary key default gen_random_uuid(),
  warehouse_id    uuid not null references public.warehouses (id),
  org_unit_id     uuid not null references public.org_units (id),
  item_id         uuid not null references public.items (id),
  kind            text not null check (kind in ('receive', 'issue', 'transfer_out', 'transfer_in', 'adjust')),
  quantity        numeric(12,2) not null check (quantity <> 0),
  unit_price      numeric(14,2) check (unit_price >= 0),
  moved_on        date not null,
  reference_no    text not null default '' check (length(reference_no) <= 100),
  note            text not null default '' check (length(note) <= 500),
  receipt_id      uuid references public.stock_receipts (id),
  requisition_id  uuid references public.requisitions (id),
  transfer_id     uuid references public.stock_transfers (id),
  created_by      uuid default auth.uid() references public.profiles (id),
  created_at      timestamptz not null default now(),
  constraint stock_moves_sign check (
    (kind in ('receive', 'transfer_in') and quantity > 0)
    or (kind in ('issue', 'transfer_out') and quantity < 0)
    or kind = 'adjust'
  ),
  constraint stock_moves_links check (
    (kind = 'receive') = (receipt_id is not null)
    and (kind = 'issue') = (requisition_id is not null)
    and (kind in ('transfer_out', 'transfer_in')) = (transfer_id is not null)
  )
);
comment on table public.stock_moves is 'ความเคลื่อนไหวของวัสดุ ยอดคงเหลือ = ผลรวม quantity ต่อคลังต่อวัสดุ (ห้ามเก็บยอดแยก) แก้ไขหรือลบไม่ได้';
create index stock_moves_balance_idx on public.stock_moves (warehouse_id, item_id, moved_on, created_at);
create index stock_moves_item_idx on public.stock_moves (item_id);

create function public.stock_moves_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'ความเคลื่อนไหวของวัสดุแก้ไขหรือลบไม่ได้ ให้ทำรายการปรับยอดพร้อมเหตุผลแทน' using errcode = 'P0001';
end;
$$;
revoke execute on function public.stock_moves_immutable() from public, anon, authenticated;
create trigger stock_moves_immutable before update or delete on public.stock_moves
  for each row execute function public.stock_moves_immutable();
create trigger stock_moves_audit after insert on public.stock_moves
  for each row execute function public.audit_row_change();
create trigger stock_receipts_immutable before update or delete on public.stock_receipts
  for each row execute function public.stock_moves_immutable();
create trigger stock_receipts_audit after insert on public.stock_receipts
  for each row execute function public.audit_row_change();
create trigger stock_transfers_set_updated_at before update on public.stock_transfers
  for each row execute function public.set_updated_at();
create trigger stock_transfers_audit after insert or update or delete on public.stock_transfers
  for each row execute function public.audit_row_change();
create trigger requisitions_set_updated_at before update on public.requisitions
  for each row execute function public.set_updated_at();
create trigger requisitions_audit after insert or update or delete on public.requisitions
  for each row execute function public.audit_row_change();

alter table public.stock_receipts enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.requisitions enable row level security;
alter table public.stock_moves enable row level security;
create policy stock_receipts_read on public.stock_receipts for select to authenticated
  using (public.can_view_inventory(org_unit_id));
create policy stock_transfers_read on public.stock_transfers for select to authenticated
  using (public.can_view_inventory(from_unit_id) or public.can_view_inventory(to_unit_id));
create policy requisitions_read on public.requisitions for select to authenticated
  using (created_by = auth.uid() or public.can_view_inventory(org_unit_id) or public.is_request_decider(request_id));
create policy stock_moves_read on public.stock_moves for select to authenticated
  using (public.can_view_inventory(org_unit_id));
revoke all on public.stock_receipts, public.stock_transfers, public.requisitions, public.stock_moves from anon;
revoke insert, update, delete, truncate on public.stock_receipts, public.stock_transfers, public.requisitions, public.stock_moves from authenticated;
grant select on public.stock_receipts, public.stock_transfers, public.requisitions, public.stock_moves to authenticated;

-- ---------------------------------------------------------------
-- 6) ชนิดคำขอใบเบิก: ขั้นเดียวที่หน่วยเจ้าของคลัง เจ้าคณะหรือรองเจ้าคณะพิจารณา คลังส่วนกลาง = เจ้าหน้าที่ส่วนกลาง (ผู้สั่งงานเลือก)
-- ---------------------------------------------------------------
insert into public.request_types (key, code, name, route_levels, start_at_own_unit, decider_roles, central_roles)
values ('requisition', 'MAT', 'ใบเบิกวัสดุ', '{subdistrict,district,province,region,central}', true,
        '{chief,deputy_chief}', '{central_staff}');

-- ---------------------------------------------------------------
-- 7) ตัวช่วย: ยอดคงเหลือ และตรวจรายการวัสดุ
-- ---------------------------------------------------------------
create function private.inv_balance(p_warehouse uuid, p_item uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(m.quantity), 0)::numeric(12,2)
  from public.stock_moves m where m.warehouse_id = p_warehouse and m.item_id = p_item;
$$;

-- คลังที่ใช้งานอยู่ (ล็อกแถวคลังไว้จนจบรายการ กันการตัดสต็อกพร้อมกันจนติดลบ)
create function private.inv_lock_warehouse(p_id uuid)
returns public.warehouses
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.warehouses%rowtype;
begin
  select * into v from public.warehouses where id = p_id for update;
  if not found then
    raise exception 'ไม่พบคลัง' using errcode = 'P0001';
  end if;
  if not v.is_active then
    raise exception 'คลัง % ถูกปิดใช้งานแล้ว', v.name using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- ตรวจรายการ [{item_id, <ช่องจำนวน>, unit_price?}] คืน [{item_id, code, name, unit, quantity, unit_price}]
create function private.inv_lines(p_lines jsonb, p_qty_key text, p_with_price boolean, p_allow_zero boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_item public.items%rowtype;
  v_out jsonb := '[]'::jsonb;
  v_seen uuid[] := '{}';
  v_n integer := 0;
  v_qty text;
  v_price text;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'กรุณาเลือกวัสดุอย่างน้อย 1 รายการ' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'ทำรายการได้ครั้งละไม่เกิน 100 รายการ' using errcode = 'P0001';
  end if;
  for r in select e from jsonb_array_elements(p_lines) as x(e) loop
    v_n := v_n + 1;
    if coalesce(r.e ->> 'item_id', '') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'รายการที่ % : กรุณาเลือกวัสดุ', v_n using errcode = 'P0001';
    end if;
    select * into v_item from public.items where id = (r.e ->> 'item_id')::uuid;
    if not found or not v_item.is_active then
      raise exception 'รายการที่ % : ไม่พบวัสดุ หรือวัสดุถูกปิดใช้งานแล้ว', v_n using errcode = 'P0001';
    end if;
    if v_item.id = any (v_seen) then
      raise exception 'รายการที่ % : วัสดุ % ซ้ำกับรายการก่อนหน้า', v_n, v_item.name using errcode = 'P0001';
    end if;
    v_seen := v_seen || v_item.id;
    v_qty := btrim(coalesce(r.e ->> p_qty_key, ''));
    if v_qty !~ '^\d{1,9}(\.\d{1,2})?$' or (not p_allow_zero and v_qty::numeric <= 0) then
      raise exception 'รายการที่ % (%) : จำนวนต้องเป็นตัวเลข% ทศนิยมไม่เกิน 2 ตำแหน่ง', v_n, v_item.name,
        case when p_allow_zero then 'ไม่ติดลบ' else 'มากกว่า 0' end using errcode = 'P0001';
    end if;
    v_price := btrim(coalesce(r.e ->> 'unit_price', ''));
    if p_with_price and v_price !~ '^\d{1,12}(\.\d{1,2})?$' then
      raise exception 'รายการที่ % (%) : ราคาต่อหน่วยต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง', v_n, v_item.name using errcode = 'P0001';
    end if;
    v_out := v_out || jsonb_build_object('item_id', v_item.id, 'code', v_item.code, 'name', v_item.name, 'unit', v_item.unit,
                                         'quantity', v_qty::numeric,
                                         'unit_price', case when p_with_price then v_price::numeric end);
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------
-- 8) รับเข้า และปรับยอด
-- ---------------------------------------------------------------
create function public.receive_stock(
  p_warehouse uuid, p_source text, p_received_on date, p_document_no text, p_supplier text,
  p_disbursement uuid, p_note text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w public.warehouses%rowtype;
  v_lines jsonb;
  v_id uuid;
  v_no text;
  r record;
begin
  v_w := private.inv_lock_warehouse(p_warehouse);
  if not public.can_edit_inventory(v_w.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์รับวัสดุเข้าคลังนี้' using errcode = '42501';
  end if;
  if p_source not in ('purchase', 'donation') then
    raise exception 'กรุณาเลือกที่มา (จัดซื้อ หรือ รับบริจาค)' using errcode = 'P0001';
  end if;
  if p_received_on is null then
    raise exception 'กรุณากรอกวันที่รับ' using errcode = 'P0001';
  end if;
  if p_disbursement is not null and not exists (
       select 1 from public.budget_disbursements d
       where d.id = p_disbursement and d.kind = 'payment'
         and d.org_unit_id in (select a.id from public.ancestors_or_self(v_w.org_unit_id) a)) then
    raise exception 'ไม่พบรายการเบิกจ่ายงบที่อ้างอิง (ต้องเป็นงวดจ่ายของหน่วยนี้หรือหน่วยเหนือ)' using errcode = 'P0001';
  end if;
  v_lines := private.inv_lines(p_lines, 'quantity', true);
  v_no := 'RCV-' || public.fiscal_year_be(p_received_on) || '-' || lpad(nextval('public.stock_receipt_no_seq')::text, 5, '0');
  insert into public.stock_receipts (receipt_no, warehouse_id, org_unit_id, source, received_on, document_no, supplier,
                                     disbursement_id, note)
  values (v_no, v_w.id, v_w.org_unit_id, p_source, p_received_on, btrim(coalesce(p_document_no, '')),
          btrim(coalesce(p_supplier, '')), p_disbursement, btrim(coalesce(p_note, '')))
  returning id into v_id;
  for r in select * from jsonb_to_recordset(v_lines) as x(item_id uuid, quantity numeric, unit_price numeric) loop
    insert into public.stock_moves (warehouse_id, org_unit_id, item_id, kind, quantity, unit_price, moved_on, reference_no, note, receipt_id)
    values (v_w.id, v_w.org_unit_id, r.item_id, 'receive', r.quantity, r.unit_price, p_received_on,
            v_no, case when p_source = 'donation' then 'รับบริจาค' else 'จัดซื้อ' end
                  || case when btrim(coalesce(p_supplier, '')) <> '' then ' จาก ' || btrim(p_supplier) else '' end,
            v_id);
  end loop;
  return v_id;
end;
$$;

-- ปรับยอด (นับสต็อกแล้วไม่ตรง ชำรุด สูญหาย ฯลฯ) จำนวนบวก = เพิ่ม ลบ = ลด ต้องมีเหตุผล ยอดหลังปรับห้ามติดลบ
create function public.adjust_stock(p_warehouse uuid, p_item uuid, p_quantity numeric, p_reason text, p_moved_on date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w public.warehouses%rowtype;
  v_bal numeric;
  v_id uuid;
begin
  v_w := private.inv_lock_warehouse(p_warehouse);
  if not public.can_edit_inventory(v_w.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์ปรับยอดคลังนี้' using errcode = '42501';
  end if;
  if not exists (select 1 from public.items i where i.id = p_item) then
    raise exception 'ไม่พบวัสดุ' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity = 0 or p_quantity <> round(p_quantity, 2) then
    raise exception 'จำนวนที่ปรับต้องไม่เป็นศูนย์ ทศนิยมไม่เกิน 2 ตำแหน่ง' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'กรุณาระบุเหตุผลการปรับยอด (อย่างน้อย 3 ตัวอักษร)' using errcode = 'P0001';
  end if;
  v_bal := private.inv_balance(v_w.id, p_item);
  if v_bal + p_quantity < 0 then
    raise exception 'ปรับลดเกินยอดคงเหลือ (คงเหลือ %)', v_bal using errcode = 'P0001';
  end if;
  insert into public.stock_moves (warehouse_id, org_unit_id, item_id, kind, quantity, moved_on, note)
  values (v_w.id, v_w.org_unit_id, p_item, 'adjust', p_quantity,
          coalesce(p_moved_on, (now() at time zone 'Asia/Bangkok')::date), left(btrim(p_reason), 500))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------
-- 9) ใบเบิก (เครื่องอนุมัติกลาง ชนิด requisition)
-- ---------------------------------------------------------------
create function private.requisition_payload(p_w public.warehouses, p_purpose text, p_lines jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'warehouse_id', p_w.id, 'warehouse_name', p_w.name,
    'unit_name', (select name from public.org_units where id = p_w.org_unit_id),
    'lines', p_lines, 'line_count', jsonb_array_length(p_lines), 'detail', btrim(p_purpose));
$$;

create function public.submit_requisition(p_warehouse uuid, p_purpose text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w public.warehouses%rowtype;
  v_lines jsonb;
  v_id uuid;
  v_req uuid;
begin
  select * into v_w from public.warehouses where id = p_warehouse;
  if not found or not v_w.is_active then
    raise exception 'ไม่พบคลัง หรือคลังถูกปิดใช้งานแล้ว' using errcode = 'P0001';
  end if;
  if not public.can_view_inventory(v_w.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์เบิกวัสดุจากคลังนี้' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_purpose, ''))) < 3 or length(btrim(p_purpose)) > 1000 then
    raise exception 'กรุณาระบุวัตถุประสงค์การเบิก (3 ถึง 1,000 ตัวอักษร)' using errcode = 'P0001';
  end if;
  v_lines := private.inv_lines(p_lines, 'quantity', false);
  insert into public.requisitions (warehouse_id, org_unit_id, purpose, lines)
  values (v_w.id, v_w.org_unit_id, btrim(p_purpose), v_lines)
  returning id into v_id;
  perform set_config('app.requisition', '1', true);
  v_req := private.create_request('requisition', v_w.org_unit_id,
             'เบิกวัสดุ ' || jsonb_array_length(v_lines) || ' รายการ จาก' || v_w.name,
             private.requisition_payload(v_w, p_purpose, v_lines) || jsonb_build_object('requisition_id', v_id),
             array[v_w.org_unit_id]);
  perform set_config('app.requisition', '', true);
  update public.requisitions set request_id = v_req where id = v_id;
  return v_id;
end;
$$;

-- ส่งใหม่หลังถูกส่งกลับ (เฉพาะผู้ยื่น) แก้วัตถุประสงค์และรายการได้ คลังเดิม
create function public.resubmit_requisition(p_id uuid, p_purpose text, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.requisitions%rowtype;
  v_w public.warehouses%rowtype;
  v_lines jsonb;
begin
  select * into v_r from public.requisitions where id = p_id for update;
  if not found or v_r.created_by <> auth.uid() then
    raise exception 'ส่งใหม่ได้เฉพาะผู้ยื่นใบเบิก' using errcode = '42501';
  end if;
  if v_r.status <> 'returned' then
    raise exception 'ส่งใหม่ได้เฉพาะใบเบิกที่ถูกส่งกลับแก้ไข' using errcode = 'P0001';
  end if;
  select * into v_w from public.warehouses where id = v_r.warehouse_id;
  if length(btrim(coalesce(p_purpose, ''))) < 3 or length(btrim(p_purpose)) > 1000 then
    raise exception 'กรุณาระบุวัตถุประสงค์การเบิก (3 ถึง 1,000 ตัวอักษร)' using errcode = 'P0001';
  end if;
  v_lines := private.inv_lines(p_lines, 'quantity', false);
  update public.requisitions set purpose = btrim(p_purpose), lines = v_lines where id = p_id;
  perform set_config('app.requisition', '1', true);
  perform public.resubmit_request(v_r.request_id, 'เบิกวัสดุ ' || jsonb_array_length(v_lines) || ' รายการ จาก' || v_w.name,
            private.requisition_payload(v_w, p_purpose, v_lines) || jsonb_build_object('requisition_id', p_id));
  perform set_config('app.requisition', '', true);
end;
$$;

-- ผู้พิจารณาขั้นปัจจุบันปรับจำนวนที่อนุมัติรายรายการ (ไม่เกินที่ขอ) ก่อนกดเห็นชอบ
create function public.set_requisition_approval(p_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.requisitions%rowtype;
  v_new jsonb := '[]'::jsonb;
  l jsonb;
  v_val text;
  v_total numeric := 0;
begin
  select * into v_r from public.requisitions where id = p_id for update;
  if not found or v_r.status <> 'pending' then
    raise exception 'ปรับจำนวนได้เฉพาะใบเบิกที่รอพิจารณา' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.request_steps s join public.requests q on q.id = s.request_id
                 where q.id = v_r.request_id and s.step_no = q.current_step and public.can_decide_step(s.id)) then
    raise exception 'ท่านไม่ใช่ผู้พิจารณาใบเบิกนี้' using errcode = '42501';
  end if;
  for l in select e from jsonb_array_elements(v_r.lines) as x(e) loop
    select btrim(coalesce(x.e ->> 'approved', '')) into v_val
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as x(e) where x.e ->> 'item_id' = l ->> 'item_id';
    if v_val is null or v_val = '' then
      v_val := (l ->> 'quantity');
    end if;
    if v_val !~ '^\d{1,9}(\.\d{1,2})?$' then
      raise exception 'จำนวนที่อนุมัติของ % ต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง', l ->> 'name' using errcode = 'P0001';
    end if;
    if v_val::numeric > (l ->> 'quantity')::numeric then
      raise exception 'จำนวนที่อนุมัติของ % มากกว่าที่ขอ (%)', l ->> 'name', l ->> 'quantity' using errcode = 'P0001';
    end if;
    v_total := v_total + v_val::numeric;
    v_new := v_new || (l || jsonb_build_object('approved', v_val::numeric));
    v_val := null;
  end loop;
  if v_total <= 0 then
    raise exception 'จำนวนที่อนุมัติเป็นศูนย์ทุกรายการ ถ้าไม่อนุมัติให้กด ไม่อนุมัติ' using errcode = 'P0001';
  end if;
  update public.requisitions set lines = v_new where id = p_id;
end;
$$;

create function public.requests_guard_requisition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.type_key = 'requisition' or (tg_op = 'UPDATE' and old.type_key = 'requisition'))
     and coalesce(current_setting('app.requisition', true), '') <> '1' then
    raise exception 'ใบเบิกวัสดุต้องยื่นจากหน้า พัสดุ-ครุภัณฑ์ เท่านั้น' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.requests_guard_requisition() from public, anon, authenticated;
create trigger requests_guard_requisition before insert or update of payload, title, type_key on public.requests
  for each row execute function public.requests_guard_requisition();

-- ผลพิจารณา: อนุมัติ = จำนวนอนุมัติเท่าที่ปรับไว้ (ไม่ปรับ = เท่าที่ขอ) / สถานะอื่นตามคำขอ (ตัดสต็อกตอนจ่ายของ)
create function public.requests_sync_requisition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.requisitions%rowtype;
begin
  if new.type_key <> 'requisition' or new.status = old.status then
    return new;
  end if;
  select * into v_r from public.requisitions where request_id = new.id for update;
  if not found or v_r.status = 'issued' then
    return new;
  end if;
  if new.status = 'approved' then
    update public.requisitions
       set status = 'approved', approved_at = now(),
           lines = (select coalesce(jsonb_agg(e || jsonb_build_object('approved', coalesce((e ->> 'approved')::numeric, (e ->> 'quantity')::numeric))
                                              order by o), '[]'::jsonb)
                    from jsonb_array_elements(v_r.lines) with ordinality as x(e, o))
     where id = v_r.id;
    perform private.inv_notify_editors(v_r.org_unit_id, 'ใบเบิก ' || new.request_no || ' อนุมัติแล้ว รอจ่ายของ',
              (select name from public.warehouses where id = v_r.warehouse_id), '/app/inventory/requisitions/' || v_r.id);
  else
    update public.requisitions set status = new.status where id = v_r.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.requests_sync_requisition() from public, anon, authenticated;
create trigger requests_sync_requisition after update of status on public.requests
  for each row execute function public.requests_sync_requisition();

-- จ่ายของตามใบเบิกที่อนุมัติแล้ว: จำนวนจ่ายไม่เกินที่อนุมัติ (เว้นว่าง = เท่าที่อนุมัติ) ตัดสต็อกทันที ห้ามติดลบ
create function public.issue_requisition(p_id uuid, p_lines jsonb, p_issued_on date, p_note text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.requisitions%rowtype;
  v_w public.warehouses%rowtype;
  v_new jsonb := '[]'::jsonb;
  l jsonb;
  v_val text;
  v_qty numeric;
  v_bal numeric;
  v_total numeric := 0;
  v_no text;
begin
  select * into v_r from public.requisitions where id = p_id for update;
  if not found then
    raise exception 'ไม่พบใบเบิก' using errcode = 'P0001';
  end if;
  v_w := private.inv_lock_warehouse(v_r.warehouse_id);
  if not public.can_edit_inventory(v_w.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์จ่ายวัสดุจากคลังนี้' using errcode = '42501';
  end if;
  if v_r.status <> 'approved' then
    raise exception 'จ่ายของได้เฉพาะใบเบิกที่อนุมัติแล้วและยังไม่จ่าย' using errcode = 'P0001';
  end if;
  if p_issued_on is null then
    raise exception 'กรุณากรอกวันที่จ่าย' using errcode = 'P0001';
  end if;
  v_no := coalesce((select request_no from public.requests where id = v_r.request_id), '');
  for l in select e from jsonb_array_elements(v_r.lines) as x(e) loop
    select btrim(coalesce(x.e ->> 'issued', '')) into v_val
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as x(e) where x.e ->> 'item_id' = l ->> 'item_id';
    if v_val is null or v_val = '' then
      v_val := (l ->> 'approved');
    end if;
    if v_val !~ '^\d{1,9}(\.\d{1,2})?$' then
      raise exception 'จำนวนที่จ่ายของ % ต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง', l ->> 'name' using errcode = 'P0001';
    end if;
    v_qty := v_val::numeric;
    if v_qty > (l ->> 'approved')::numeric then
      raise exception 'จำนวนที่จ่ายของ % มากกว่าที่อนุมัติ (%)', l ->> 'name', l ->> 'approved' using errcode = 'P0001';
    end if;
    if v_qty > 0 then
      v_bal := private.inv_balance(v_w.id, (l ->> 'item_id')::uuid);
      if v_bal < v_qty then
        raise exception 'วัสดุ % คงเหลือ % % ไม่พอจ่าย %', l ->> 'name', v_bal, l ->> 'unit', v_qty using errcode = 'P0001';
      end if;
      insert into public.stock_moves (warehouse_id, org_unit_id, item_id, kind, quantity, moved_on, reference_no, note, requisition_id)
      values (v_w.id, v_w.org_unit_id, (l ->> 'item_id')::uuid, 'issue', -v_qty, p_issued_on, v_no,
              'จ่ายตามใบเบิก ' || left(v_r.purpose, 100), v_r.id);
    end if;
    v_total := v_total + v_qty;
    v_new := v_new || (l || jsonb_build_object('issued', v_qty));
    v_val := null;
  end loop;
  if v_total <= 0 then
    raise exception 'ต้องจ่ายอย่างน้อย 1 รายการ' using errcode = 'P0001';
  end if;
  update public.requisitions
     set status = 'issued', lines = v_new, issued_on = p_issued_on, issued_by = auth.uid(), issued_at = now(),
         issue_note = left(btrim(coalesce(p_note, '')), 500)
   where id = p_id;
  perform public.notify_user(v_r.created_by, 'จ่ายวัสดุตามใบเบิก ' || v_no || ' แล้ว',
                             'รับของได้ที่' || v_w.name, '/app/inventory/requisitions/' || v_r.id);
end;
$$;

-- ---------------------------------------------------------------
-- 10) โอนจากคลังกลางไปคลังย่อย
-- ---------------------------------------------------------------
create function public.send_transfer(p_from uuid, p_to uuid, p_sent_on date, p_note text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.warehouses%rowtype;
  v_to public.warehouses%rowtype;
  v_lines jsonb;
  v_id uuid;
  v_no text;
  v_bal numeric;
  r record;
begin
  v_from := private.inv_lock_warehouse(p_from);
  if not public.can_edit_inventory(v_from.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์โอนวัสดุออกจากคลังนี้' using errcode = '42501';
  end if;
  select * into v_to from public.warehouses where id = p_to;
  if not found or not v_to.is_active then
    raise exception 'ไม่พบคลังปลายทาง หรือคลังปลายทางถูกปิดใช้งานแล้ว' using errcode = 'P0001';
  end if;
  if v_from.kind <> 'main' or v_to.kind <> 'sub' or v_to.parent_id <> v_from.id then
    raise exception 'โอนได้จากคลังกลางไปคลังย่อยของคลังนั้นเท่านั้น' using errcode = 'P0001';
  end if;
  if p_sent_on is null then
    raise exception 'กรุณากรอกวันที่โอน' using errcode = 'P0001';
  end if;
  v_lines := private.inv_lines(p_lines, 'quantity', false);
  v_no := 'TRF-' || public.fiscal_year_be(p_sent_on) || '-' || lpad(nextval('public.stock_transfer_no_seq')::text, 5, '0');
  insert into public.stock_transfers (transfer_no, from_warehouse_id, to_warehouse_id, from_unit_id, to_unit_id, sent_on, note)
  values (v_no, v_from.id, v_to.id, v_from.org_unit_id, v_to.org_unit_id, p_sent_on, btrim(coalesce(p_note, '')))
  returning id into v_id;
  for r in select * from jsonb_to_recordset(v_lines) as x(item_id uuid, name text, unit text, quantity numeric) loop
    v_bal := private.inv_balance(v_from.id, r.item_id);
    if v_bal < r.quantity then
      raise exception 'วัสดุ % คงเหลือ % % ไม่พอโอน %', r.name, v_bal, r.unit, r.quantity using errcode = 'P0001';
    end if;
    insert into public.stock_moves (warehouse_id, org_unit_id, item_id, kind, quantity, moved_on, reference_no, note, transfer_id)
    values (v_from.id, v_from.org_unit_id, r.item_id, 'transfer_out', -r.quantity, p_sent_on, v_no, 'โอนไป' || v_to.name, v_id);
  end loop;
  perform private.inv_notify_editors(v_to.org_unit_id, 'มีวัสดุโอนเข้า' || v_to.name || ' รอรับ',
            'ใบโอน ' || v_no || ' จาก' || v_from.name, '/app/inventory/transfers/' || v_id);
  return v_id;
end;
$$;

create function public.receive_transfer(p_id uuid, p_received_on date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.stock_transfers%rowtype;
  v_to public.warehouses%rowtype;
  v_from_name text;
  r record;
begin
  select * into v_t from public.stock_transfers where id = p_id for update;
  if not found then
    raise exception 'ไม่พบใบโอน' using errcode = 'P0001';
  end if;
  v_to := private.inv_lock_warehouse(v_t.to_warehouse_id);
  if not public.can_edit_inventory(v_to.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์รับวัสดุเข้าคลังปลายทาง' using errcode = '42501';
  end if;
  if v_t.status <> 'sent' then
    raise exception 'ใบโอนนี้รับหรือยกเลิกไปแล้ว' using errcode = 'P0001';
  end if;
  if p_received_on is null or p_received_on < v_t.sent_on then
    raise exception 'วันที่รับต้องไม่ก่อนวันที่โอน' using errcode = 'P0001';
  end if;
  select name into v_from_name from public.warehouses where id = v_t.from_warehouse_id;
  for r in select m.item_id, -m.quantity as qty from public.stock_moves m where m.transfer_id = p_id and m.kind = 'transfer_out' loop
    insert into public.stock_moves (warehouse_id, org_unit_id, item_id, kind, quantity, moved_on, reference_no, note, transfer_id)
    values (v_to.id, v_to.org_unit_id, r.item_id, 'transfer_in', r.qty, p_received_on, v_t.transfer_no, 'รับโอนจาก' || v_from_name, p_id);
  end loop;
  update public.stock_transfers
     set status = 'received', received_on = p_received_on, received_by = auth.uid(), received_at = now()
   where id = p_id;
end;
$$;

-- ยกเลิกใบโอนที่ปลายทางยังไม่รับ: ของคืนเข้าคลังต้นทาง (บันทึกเป็นโอนเข้าที่ต้นทาง)
create function public.cancel_transfer(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.stock_transfers%rowtype;
  v_from public.warehouses%rowtype;
  r record;
begin
  select * into v_t from public.stock_transfers where id = p_id for update;
  if not found then
    raise exception 'ไม่พบใบโอน' using errcode = 'P0001';
  end if;
  v_from := private.inv_lock_warehouse(v_t.from_warehouse_id);
  if not public.can_edit_inventory(v_from.org_unit_id) then
    raise exception 'ยกเลิกได้เฉพาะผู้มีสิทธิ์ของคลังต้นทาง' using errcode = '42501';
  end if;
  if v_t.status <> 'sent' then
    raise exception 'ยกเลิกได้เฉพาะใบโอนที่ปลายทางยังไม่รับ' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'กรุณาระบุเหตุผลที่ยกเลิก (อย่างน้อย 3 ตัวอักษร)' using errcode = 'P0001';
  end if;
  for r in select m.item_id, -m.quantity as qty from public.stock_moves m where m.transfer_id = p_id and m.kind = 'transfer_out' loop
    insert into public.stock_moves (warehouse_id, org_unit_id, item_id, kind, quantity, moved_on, reference_no, note, transfer_id)
    values (v_from.id, v_from.org_unit_id, r.item_id, 'transfer_in', r.qty, (now() at time zone 'Asia/Bangkok')::date,
            v_t.transfer_no, 'ยกเลิกการโอน: ' || left(btrim(p_reason), 200), p_id);
  end loop;
  update public.stock_transfers
     set status = 'cancelled', cancel_reason = left(btrim(p_reason), 500), cancelled_by = auth.uid(), cancelled_at = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------
-- 11) ตัวช่วยแจ้งเตือนและชื่อบุคคล
-- ---------------------------------------------------------------
-- แจ้งผู้ที่บทบาทมีสิทธิ์แก้ไขพัสดุ (own / subtree) ครอบคลุมหน่วยนั้น ไม่รวมบทบาทขอบเขตทุกเขต และไม่แจ้งผู้ทำรายการเอง
create function private.inv_notify_editors(p_unit uuid, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, title, body, link)
  select distinct ur.user_id, p_title, coalesce(p_body, ''), p_link
  from public.user_roles ur
  join public.roles ro on ro.key = ur.role_key
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
    and ur.user_id is distinct from auth.uid()
    and ((ro.inventory_edit = 'own' and ur.org_unit_id = p_unit)
         or (ro.inventory_edit = 'subtree' and ur.org_unit_id in (select a.id from public.ancestors_or_self(p_unit) a)));
$$;

create function private.inv_person_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select btrim(concat_ws(' ', nullif(p.title_prefix, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, '')))
  from public.profiles p where p.id = p_id;
$$;

-- ผู้ใช้เป็นผู้พิจารณาขั้นปัจจุบันของใบเบิก
create function private.inv_can_decide(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.request_steps s join public.requests q on q.id = s.request_id
                 where q.id = p_request_id and q.status = 'pending' and s.step_no = q.current_step
                   and public.can_decide_step(s.id));
$$;

-- ---------------------------------------------------------------
-- 12) ฟังก์ชันอ่าน (security definer ตรวจสิทธิ์พัสดุเอง)
-- ---------------------------------------------------------------
-- ยอดคงเหลือต่อวัสดุของคลัง (วัสดุที่ใช้งานทุกรายการ + วัสดุที่ปิดใช้งานแต่ยังมียอด)
create function public.inventory_stock(p_warehouse uuid)
returns table (
  item_id uuid, code text, name text, category_id uuid, category_name text, unit text, reorder_point numeric,
  balance numeric, last_moved_on date, has_moves boolean, is_active boolean, is_low boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_w public.warehouses%rowtype;
begin
  select * into v_w from public.warehouses w where w.id = p_warehouse;
  if not found or not public.can_view_inventory(v_w.org_unit_id) then
    raise exception 'ไม่พบคลัง หรือท่านไม่มีสิทธิ์ดูคลังนี้' using errcode = '42501';
  end if;
  return query
  select i.id, i.code, i.name, i.category_id, c.name, i.unit, i.reorder_point,
         coalesce(m.bal, 0)::numeric(12,2), m.last_on, m.item_id is not null, i.is_active,
         (m.item_id is not null and i.reorder_point > 0 and coalesce(m.bal, 0) < i.reorder_point)
  from public.items i
  left join public.inventory_categories c on c.id = i.category_id
  left join (select x.item_id, sum(x.quantity) as bal, max(x.moved_on) as last_on
             from public.stock_moves x where x.warehouse_id = p_warehouse group by x.item_id) m on m.item_id = i.id
  where i.is_active or coalesce(m.bal, 0) <> 0
  order by coalesce(c.sort_order, 2147483647), c.name nulls last, i.code;
end;
$$;

-- วัสดุต่ำกว่าจุดสั่งซื้อ ทุกคลังที่ผู้ใช้เห็น (เฉพาะวัสดุที่เคยเคลื่อนไหวในคลังนั้น)
create function public.inventory_low_stock()
returns table (
  warehouse_id uuid, warehouse_name text, warehouse_code text, item_id uuid, code text, name text, unit text,
  balance numeric, reorder_point numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with w as (
    select w.* from public.warehouses w where w.is_active and public.can_view_inventory(w.org_unit_id)
  ), s as (
    select m.warehouse_id, m.item_id, sum(m.quantity) as bal
    from public.stock_moves m where m.warehouse_id in (select id from w) group by m.warehouse_id, m.item_id
  )
  select w.id, w.name, w.code, i.id, i.code, i.name, i.unit, s.bal::numeric(12,2), i.reorder_point
  from s join w on w.id = s.warehouse_id join public.items i on i.id = s.item_id
  where i.is_active and i.reorder_point > 0 and s.bal < i.reorder_point
  order by w.name, i.code
  limit 500;
$$;

-- Stock Card: ทุกความเคลื่อนไหวของวัสดุในคลัง เรียงตามวันที่ แล้วเวลาบันทึก พร้อมยอดคงเหลือสะสม
create function public.stock_card(p_warehouse uuid, p_item uuid)
returns table (
  id uuid, moved_on date, kind text, reference_no text, note text, received numeric, issued numeric, balance numeric,
  unit_price numeric, receipt_id uuid, requisition_id uuid, transfer_id uuid, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_w public.warehouses%rowtype;
begin
  select * into v_w from public.warehouses w where w.id = p_warehouse;
  if not found or not public.can_view_inventory(v_w.org_unit_id) then
    raise exception 'ไม่พบคลัง หรือท่านไม่มีสิทธิ์ดูคลังนี้' using errcode = '42501';
  end if;
  return query
  select m.id, m.moved_on, m.kind, m.reference_no, m.note,
         case when m.quantity > 0 then m.quantity else 0 end::numeric(12,2),
         case when m.quantity < 0 then -m.quantity else 0 end::numeric(12,2),
         sum(m.quantity) over (order by m.moved_on, m.created_at, m.id)::numeric(12,2),
         m.unit_price, m.receipt_id, m.requisition_id, m.transfer_id, m.created_at
  from public.stock_moves m
  where m.warehouse_id = p_warehouse and m.item_id = p_item
  order by m.moved_on, m.created_at, m.id;
end;
$$;

-- รายการใบเบิก: mine = ของฉัน / approve = รอฉันพิจารณา / issue = อนุมัติแล้วรอฉันจ่ายของ / all = ทุกใบในเขตที่เห็น
create function public.requisition_rows(p_tab text)
returns table (
  id uuid, request_id uuid, request_no text, warehouse_id uuid, warehouse_name text, unit_name text, purpose text,
  line_count integer, status text, created_at timestamptz, approved_at timestamptz, issued_on date,
  requester_name text, is_mine boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_tab not in ('mine', 'approve', 'issue', 'all') then
    raise exception 'ไม่รู้จักแท็บ %', p_tab using errcode = 'P0001';
  end if;
  return query
  select r.id, r.request_id, q.request_no, r.warehouse_id, w.name, u.name, r.purpose,
         jsonb_array_length(r.lines), r.status, r.created_at, r.approved_at, r.issued_on,
         private.inv_person_name(r.created_by), r.created_by = auth.uid()
  from public.requisitions r
  join public.warehouses w on w.id = r.warehouse_id
  join public.org_units u on u.id = r.org_unit_id
  left join public.requests q on q.id = r.request_id
  where case p_tab
          when 'mine' then r.created_by = auth.uid()
          when 'approve' then r.status = 'pending' and private.inv_can_decide(r.request_id)
          when 'issue' then r.status = 'approved' and public.can_edit_inventory(r.org_unit_id)
          else r.created_by = auth.uid() or public.can_view_inventory(r.org_unit_id)
        end
  order by r.created_at desc
  limit 500;
end;
$$;

create function public.requisition_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_r public.requisitions%rowtype;
  v_w public.warehouses%rowtype;
  v_q public.requests%rowtype;
begin
  select * into v_r from public.requisitions where id = p_id;
  if not found or not (v_r.created_by = auth.uid() or public.can_view_inventory(v_r.org_unit_id)
                       or public.is_request_decider(v_r.request_id)) then
    raise exception 'ไม่พบใบเบิก หรือท่านไม่มีสิทธิ์ดู' using errcode = '42501';
  end if;
  select * into v_w from public.warehouses where id = v_r.warehouse_id;
  select * into v_q from public.requests where id = v_r.request_id;
  return jsonb_build_object(
    'id', v_r.id, 'request_id', v_r.request_id, 'request_no', v_q.request_no, 'request_status', v_q.status,
    'warehouse_id', v_w.id, 'warehouse_name', v_w.name, 'warehouse_code', v_w.code, 'warehouse_kind', v_w.kind,
    'org_unit_id', v_r.org_unit_id, 'unit_name', (select name from public.org_units where id = v_r.org_unit_id),
    'purpose', v_r.purpose, 'status', v_r.status,
    'lines', (select coalesce(jsonb_agg(e || jsonb_build_object('balance', private.inv_balance(v_r.warehouse_id, (e ->> 'item_id')::uuid))
                                        order by o), '[]'::jsonb)
              from jsonb_array_elements(v_r.lines) with ordinality as x(e, o)),
    'created_at', v_r.created_at, 'approved_at', v_r.approved_at,
    'issued_on', v_r.issued_on, 'issued_at', v_r.issued_at, 'issue_note', v_r.issue_note,
    'requester_name', private.inv_person_name(v_r.created_by),
    'issued_by_name', private.inv_person_name(v_r.issued_by),
    'is_mine', v_r.created_by = auth.uid(),
    'can_decide', v_r.status = 'pending' and private.inv_can_decide(v_r.request_id),
    'can_issue', v_r.status = 'approved' and public.can_edit_inventory(v_r.org_unit_id),
    'can_resubmit', v_r.status = 'returned' and v_r.created_by = auth.uid()
  );
end;
$$;

-- ใบโอน (ต้นทางหรือปลายทางอยู่ในเขตที่เห็น) p_warehouse = เฉพาะที่เกี่ยวกับคลังนั้น
create function public.transfer_rows(p_warehouse uuid default null)
returns table (
  id uuid, transfer_no text, from_warehouse_id uuid, from_name text, to_warehouse_id uuid, to_name text,
  status text, sent_on date, received_on date, line_count integer, can_receive boolean, can_cancel boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.transfer_no, t.from_warehouse_id, f.name, t.to_warehouse_id, d.name, t.status, t.sent_on, t.received_on,
         (select count(*)::integer from public.stock_moves m where m.transfer_id = t.id and m.kind = 'transfer_out'),
         t.status = 'sent' and public.can_edit_inventory(t.to_unit_id),
         t.status = 'sent' and public.can_edit_inventory(t.from_unit_id)
  from public.stock_transfers t
  join public.warehouses f on f.id = t.from_warehouse_id
  join public.warehouses d on d.id = t.to_warehouse_id
  where (public.can_view_inventory(t.from_unit_id) or public.can_view_inventory(t.to_unit_id))
    and (p_warehouse is null or t.from_warehouse_id = p_warehouse or t.to_warehouse_id = p_warehouse)
  order by t.created_at desc
  limit 500;
$$;

create function public.transfer_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t public.stock_transfers%rowtype;
begin
  select * into v_t from public.stock_transfers where id = p_id;
  if not found or not (public.can_view_inventory(v_t.from_unit_id) or public.can_view_inventory(v_t.to_unit_id)) then
    raise exception 'ไม่พบใบโอน หรือท่านไม่มีสิทธิ์ดู' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'id', v_t.id, 'transfer_no', v_t.transfer_no, 'status', v_t.status,
    'from_warehouse_id', v_t.from_warehouse_id, 'from_name', (select name from public.warehouses where id = v_t.from_warehouse_id),
    'to_warehouse_id', v_t.to_warehouse_id, 'to_name', (select name from public.warehouses where id = v_t.to_warehouse_id),
    'from_unit_name', (select name from public.org_units where id = v_t.from_unit_id),
    'to_unit_name', (select name from public.org_units where id = v_t.to_unit_id),
    'sent_on', v_t.sent_on, 'received_on', v_t.received_on, 'note', v_t.note, 'cancel_reason', v_t.cancel_reason,
    'created_by_name', private.inv_person_name(v_t.created_by),
    'received_by_name', private.inv_person_name(v_t.received_by),
    'cancelled_by_name', private.inv_person_name(v_t.cancelled_by),
    'cancelled_at', v_t.cancelled_at, 'received_at', v_t.received_at,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'code', i.code, 'name', i.name, 'unit', i.unit,
                                                           'quantity', -m.quantity) order by i.code), '[]'::jsonb)
              from public.stock_moves m join public.items i on i.id = m.item_id
              where m.transfer_id = p_id and m.kind = 'transfer_out'),
    'can_receive', v_t.status = 'sent' and public.can_edit_inventory(v_t.to_unit_id),
    'can_cancel', v_t.status = 'sent' and public.can_edit_inventory(v_t.from_unit_id)
  );
end;
$$;

-- เอกสารรับเข้าของคลัง
create function public.receipt_rows(p_warehouse uuid)
returns table (
  id uuid, receipt_no text, source text, received_on date, document_no text, supplier text,
  line_count integer, total_value numeric, has_disbursement boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_w public.warehouses%rowtype;
begin
  select * into v_w from public.warehouses w where w.id = p_warehouse;
  if not found or not public.can_view_inventory(v_w.org_unit_id) then
    raise exception 'ไม่พบคลัง หรือท่านไม่มีสิทธิ์ดูคลังนี้' using errcode = '42501';
  end if;
  return query
  select r.id, r.receipt_no, r.source, r.received_on, r.document_no, r.supplier,
         (select count(*)::integer from public.stock_moves m where m.receipt_id = r.id),
         (select coalesce(sum(m.quantity * coalesce(m.unit_price, 0)), 0)::numeric(14,2) from public.stock_moves m where m.receipt_id = r.id),
         r.disbursement_id is not null
  from public.stock_receipts r
  where r.warehouse_id = p_warehouse
  order by r.received_on desc, r.created_at desc
  limit 500;
end;
$$;

create function public.receipt_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_r public.stock_receipts%rowtype;
  v_disb jsonb;
begin
  select * into v_r from public.stock_receipts where id = p_id;
  if not found or not public.can_view_inventory(v_r.org_unit_id) then
    raise exception 'ไม่พบเอกสารรับเข้า หรือท่านไม่มีสิทธิ์ดู' using errcode = '42501';
  end if;
  if v_r.disbursement_id is not null then
    select jsonb_build_object('id', d.id, 'request_no', q.request_no, 'installment_no', d.installment_no,
                              'paid_on', d.paid_on, 'amount', d.amount, 'voucher_no', d.voucher_no, 'purpose', u.purpose)
      into v_disb
    from public.budget_disbursements d
    join public.budget_use_requests u on u.id = d.use_request_id
    left join public.requests q on q.id = u.request_id
    where d.id = v_r.disbursement_id;
  end if;
  return jsonb_build_object(
    'id', v_r.id, 'receipt_no', v_r.receipt_no, 'source', v_r.source, 'received_on', v_r.received_on,
    'document_no', v_r.document_no, 'supplier', v_r.supplier, 'note', v_r.note,
    'warehouse_id', v_r.warehouse_id, 'warehouse_name', (select name from public.warehouses where id = v_r.warehouse_id),
    'org_unit_id', v_r.org_unit_id, 'unit_name', (select name from public.org_units where id = v_r.org_unit_id),
    'created_by_name', private.inv_person_name(v_r.created_by), 'created_at', v_r.created_at,
    'disbursement', v_disb,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'code', i.code, 'name', i.name, 'unit', i.unit,
                                                           'quantity', m.quantity, 'unit_price', m.unit_price,
                                                           'amount', (m.quantity * coalesce(m.unit_price, 0))::numeric(14,2))
                                        order by m.created_at, i.code), '[]'::jsonb)
              from public.stock_moves m join public.items i on i.id = m.item_id where m.receipt_id = p_id),
    'can_attach', public.can_edit_inventory(v_r.org_unit_id)
  );
end;
$$;

-- งวดจ่ายของงบ (ระบบที่ 6) ที่อ้างอิงได้ตอนรับเข้า: ของหน่วยเจ้าของคลังหรือหน่วยเหนือ 200 รายการล่าสุด
create function public.inventory_disbursement_options(p_warehouse uuid)
returns table (id uuid, label text, paid_on date, amount numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_w public.warehouses%rowtype;
begin
  select * into v_w from public.warehouses w where w.id = p_warehouse;
  if not found or not public.can_edit_inventory(v_w.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์รับวัสดุเข้าคลังนี้' using errcode = '42501';
  end if;
  return query
  select d.id,
         coalesce(q.request_no, 'คำขอใช้งบ') || ' งวดที่ ' || d.installment_no
           || case when d.voucher_no <> '' then ' ใบสำคัญ ' || d.voucher_no else '' end
           || ' : ' || left(u.purpose, 80),
         d.paid_on, d.amount
  from public.budget_disbursements d
  join public.budget_use_requests u on u.id = d.use_request_id
  left join public.requests q on q.id = u.request_id
  where d.kind = 'payment' and d.org_unit_id in (select a.id from public.ancestors_or_self(v_w.org_unit_id) a)
  order by d.paid_on desc, d.created_at desc
  limit 200;
end;
$$;

-- ตัวเลขสรุปของหน้า พัสดุ-ครุภัณฑ์
create function public.inventory_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_open', (select count(*) from public.requisitions r
                where r.created_by = auth.uid() and r.status in ('pending', 'returned', 'approved')),
    'to_approve', (select count(*) from public.requisitions r
                   where r.status = 'pending' and private.inv_can_decide(r.request_id)),
    'to_issue', (select count(*) from public.requisitions r
                 where r.status = 'approved' and public.can_edit_inventory(r.org_unit_id)),
    'incoming', (select count(*) from public.stock_transfers t
                 where t.status = 'sent' and public.can_edit_inventory(t.to_unit_id)),
    'low_stock', (select count(*) from public.inventory_low_stock())
  );
$$;

-- หน่วยที่ผู้ใช้สร้างคลังได้ (ขอบเขตแก้ไขพัสดุ) พร้อมหน่วยเหนือที่ใช้ไล่ชั้นในตัวเลือก (selectable = false)
create function public.inventory_edit_units()
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
    select r.inventory_edit, m.org_unit_id
    from public.my_role_rows() m
    join public.roles r on r.key = m.role_key
    where m.effective and r.inventory_edit <> 'none'
  ),
  everything as (
    select exists (select 1 from mine where inventory_edit = 'all') as yes
  ),
  reachable as (
    select org_unit_id as id from mine where org_unit_id is not null
    union
    select d.id from mine x cross join lateral public.descendants_of(x.org_unit_id) d
    where x.inventory_edit = 'subtree' and x.org_unit_id is not null
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

-- ---------------------------------------------------------------
-- 13) คำขอ ใบเบิก เห็นได้เฉพาะผู้ยื่น ผู้มีสิทธิ์ดูคลังของหน่วย และผู้พิจารณาในเส้นทาง
--     ไฟล์แนบ: ใบส่งของ (stock_receipts) และรูปวัสดุ (items)
-- ---------------------------------------------------------------
alter policy requests_read on public.requests
  using (
    requester_id = auth.uid()
    or case
      when type_key in ('budget_transfer', 'budget_use') then
        public.can_view_budget(org_unit_id) or public.is_request_decider(id)
      when type_key = 'requisition' then
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
      else org_unit_id is null or public.can_access(org_unit_id)
    end
  );

-- ---------------------------------------------------------------
-- 14) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke all on function private.inv_balance(uuid, uuid) from public, anon, authenticated;
revoke all on function private.inv_lock_warehouse(uuid) from public, anon, authenticated;
revoke all on function private.inv_lines(jsonb, text, boolean, boolean) from public, anon, authenticated;
revoke all on function private.requisition_payload(public.warehouses, text, jsonb) from public, anon, authenticated;
revoke all on function private.inv_notify_editors(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.inv_person_name(uuid) from public, anon, authenticated;
revoke all on function private.inv_can_decide(uuid) from public, anon, authenticated;

revoke execute on function public.receive_stock(uuid, text, date, text, text, uuid, text, jsonb) from public, anon;
revoke execute on function public.adjust_stock(uuid, uuid, numeric, text, date) from public, anon;
revoke execute on function public.submit_requisition(uuid, text, jsonb) from public, anon;
revoke execute on function public.resubmit_requisition(uuid, text, jsonb) from public, anon;
revoke execute on function public.set_requisition_approval(uuid, jsonb) from public, anon;
revoke execute on function public.issue_requisition(uuid, jsonb, date, text) from public, anon;
revoke execute on function public.send_transfer(uuid, uuid, date, text, jsonb) from public, anon;
revoke execute on function public.receive_transfer(uuid, date) from public, anon;
revoke execute on function public.cancel_transfer(uuid, text) from public, anon;
revoke execute on function public.inventory_stock(uuid) from public, anon;
revoke execute on function public.inventory_low_stock() from public, anon;
revoke execute on function public.stock_card(uuid, uuid) from public, anon;
revoke execute on function public.requisition_rows(text) from public, anon;
revoke execute on function public.requisition_detail(uuid) from public, anon;
revoke execute on function public.transfer_rows(uuid) from public, anon;
revoke execute on function public.transfer_detail(uuid) from public, anon;
revoke execute on function public.receipt_rows(uuid) from public, anon;
revoke execute on function public.receipt_detail(uuid) from public, anon;
revoke execute on function public.inventory_disbursement_options(uuid) from public, anon;
revoke execute on function public.inventory_summary() from public, anon;
revoke execute on function public.inventory_edit_units() from public, anon;

grant execute on function public.receive_stock(uuid, text, date, text, text, uuid, text, jsonb) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, numeric, text, date) to authenticated;
grant execute on function public.submit_requisition(uuid, text, jsonb) to authenticated;
grant execute on function public.resubmit_requisition(uuid, text, jsonb) to authenticated;
grant execute on function public.set_requisition_approval(uuid, jsonb) to authenticated;
grant execute on function public.issue_requisition(uuid, jsonb, date, text) to authenticated;
grant execute on function public.send_transfer(uuid, uuid, date, text, jsonb) to authenticated;
grant execute on function public.receive_transfer(uuid, date) to authenticated;
grant execute on function public.cancel_transfer(uuid, text) to authenticated;
grant execute on function public.inventory_stock(uuid) to authenticated;
grant execute on function public.inventory_low_stock() to authenticated;
grant execute on function public.stock_card(uuid, uuid) to authenticated;
grant execute on function public.requisition_rows(text) to authenticated;
grant execute on function public.requisition_detail(uuid) to authenticated;
grant execute on function public.transfer_rows(uuid) to authenticated;
grant execute on function public.transfer_detail(uuid) to authenticated;
grant execute on function public.receipt_rows(uuid) to authenticated;
grant execute on function public.receipt_detail(uuid) to authenticated;
grant execute on function public.inventory_disbursement_options(uuid) to authenticated;
grant execute on function public.inventory_summary() to authenticated;
grant execute on function public.inventory_edit_units() to authenticated;
