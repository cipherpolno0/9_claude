-- บทที่ 23: ขออนุมัติใช้งบ เบิกจ่าย และทะเบียนคุม (ระบบที่ 6)
-- คำขอใช้งบ (ชนิดคำขอ budget_use) > อนุมัติ = ผูกพันเงิน > เบิกจ่ายหลายงวด / รายการปรับปรุง > คืนเงินเหลือจ่าย (ปลดผูกพัน)
-- ยอดคงเหลือของรายการต่อหน่วย = ได้รับ - จัดสรรต่อ - ผูกพันสุทธิ (ผูกพัน - คืน) ; การเบิกจ่ายตัดจากยอดผูกพัน ไม่ตัดคงเหลือซ้ำ

-- ---------------------------------------------------------------
-- 1) วงเงินอนุมัติตามตำแหน่ง (ผู้ดูแลระบบตั้งที่ /app/admin/budget-limits)
--    max_amount ว่าง = ตำแหน่งนี้อนุมัติไม่ได้ ต้องส่งต่อชั้นถัดไป (ผู้สั่งงานเลือก) ส่วนกลาง (central_staff) อนุมัติได้ไม่จำกัด
-- ---------------------------------------------------------------
create table public.budget_approval_limits (
  id          uuid primary key default gen_random_uuid(),
  level       public.org_level not null check (level <> 'central'),
  role_key    text not null references public.roles (key) check (role_key in ('chief', 'deputy_chief')),
  max_amount  numeric(14,2) check (max_amount > 0),
  updated_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (level, role_key)
);
comment on table public.budget_approval_limits is 'วงเงินที่เจ้าคณะ/รองเจ้าคณะแต่ละชั้นอนุมัติคำขอใช้งบได้ ว่าง = อนุมัติไม่ได้ ส่งต่อชั้นถัดไป';
insert into public.budget_approval_limits (level, role_key)
select l.level::public.org_level, r.role_key
from (values ('subdistrict'), ('district'), ('province'), ('region')) l(level)
cross join (values ('chief'), ('deputy_chief')) r(role_key);

create function public.budget_approval_limits_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.level <> old.level or new.role_key <> old.role_key then
    raise exception 'เปลี่ยนชั้นหรือตำแหน่งของแถวเดิมไม่ได้ แก้ได้เฉพาะวงเงิน' using errcode = 'P0001';
  end if;
  if new.max_amount is not null and new.max_amount <> round(new.max_amount, 2) then
    raise exception 'วงเงินมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง' using errcode = 'P0001';
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke execute on function public.budget_approval_limits_stamp() from public, anon, authenticated;
create trigger budget_approval_limits_stamp before update on public.budget_approval_limits
  for each row execute function public.budget_approval_limits_stamp();
create trigger budget_approval_limits_set_updated_at before update on public.budget_approval_limits
  for each row execute function public.set_updated_at();
create trigger budget_approval_limits_audit after insert or update or delete on public.budget_approval_limits
  for each row execute function public.audit_row_change();

alter table public.budget_approval_limits enable row level security;
create policy budget_approval_limits_read on public.budget_approval_limits for select to authenticated using (true);
create policy budget_approval_limits_admin_update on public.budget_approval_limits for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.budget_approval_limits from anon;
revoke insert, delete, truncate on public.budget_approval_limits from authenticated;
grant select, update on public.budget_approval_limits to authenticated;

-- ---------------------------------------------------------------
-- 2) คำขอใช้งบประมาณ (หนึ่งแถวต่อคำขอในเครื่องอนุมัติกลาง ชนิด budget_use)
--    org_unit_id = หน่วยที่ถือรายการ (เจ้าของหรือได้รับจัดสรร) และเป็นผู้ใช้เงิน
--    lines = รายละเอียดค่าใช้จ่าย [{description, quantity, unit, unit_price, amount}] amount = ผลรวม
--    status: pending รอพิจารณา / returned ส่งกลับ / approved อนุมัติแล้ว (ผูกพันเงิน) / rejected / cancelled /
--            closed ปิดแล้ว (คืนเงินเหลือจ่ายแล้ว)
-- ---------------------------------------------------------------
create table public.budget_use_requests (
  id               uuid primary key default gen_random_uuid(),
  fiscal_year_id   uuid not null references public.fiscal_years (id),
  item_id          uuid not null references public.budget_items (id),
  org_unit_id      uuid not null references public.org_units (id),
  purpose          text not null check (length(btrim(purpose)) between 3 and 1000),
  lines            jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  amount           numeric(14,2) not null check (amount > 0),
  status           text not null default 'pending'
                     check (status in ('pending', 'returned', 'approved', 'rejected', 'cancelled', 'closed')),
  request_id       uuid references public.requests (id),
  committed_amount numeric(14,2) not null default 0 check (committed_amount >= 0),
  approved_at      timestamptz,
  released_amount  numeric(14,2) not null default 0 check (released_amount >= 0),
  released_at      timestamptz,
  released_by      uuid references public.profiles (id),
  release_reason   text not null default '' check (length(release_reason) <= 1000),
  created_by       uuid default auth.uid() references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint budget_use_requests_release check (released_amount <= committed_amount)
);
comment on table public.budget_use_requests is 'คำขอใช้งบประมาณ อนุมัติแล้วผูกพันเงิน (committed_amount) คืนเงินเหลือจ่าย = released_amount แล้วปิด';
create index budget_use_requests_item_idx on public.budget_use_requests (item_id, org_unit_id);
create index budget_use_requests_unit_idx on public.budget_use_requests (fiscal_year_id, org_unit_id);
create unique index budget_use_requests_request_unique on public.budget_use_requests (request_id) where request_id is not null;

create trigger budget_use_requests_set_updated_at before update on public.budget_use_requests
  for each row execute function public.set_updated_at();
create trigger budget_use_requests_audit after insert or update or delete on public.budget_use_requests
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- 3) การเบิกจ่าย (ระบบเขียนเท่านั้น แก้ไขหรือลบไม่ได้)
--    kind payment = จ่ายจริง (จำนวนเงินบวก) / adjustment = รายการปรับปรุงของงวดที่จ่ายแล้ว (บวกหรือลบ ต้องมีเหตุผล)
--    asset_receipt_ref = ช่องเผื่ออ้างอิงรายการรับเข้าของระบบพัสดุ (ระบบที่ 7 บทที่ 25-26) ใช้กับค่าวัสดุ ค่าครุภัณฑ์
-- ---------------------------------------------------------------
create table public.budget_disbursements (
  id                 uuid primary key default gen_random_uuid(),
  use_request_id     uuid not null references public.budget_use_requests (id),
  fiscal_year_id     uuid not null references public.fiscal_years (id),
  item_id            uuid not null references public.budget_items (id),
  org_unit_id        uuid not null references public.org_units (id),
  kind               text not null check (kind in ('payment', 'adjustment')),
  installment_no     integer not null check (installment_no between 1 and 999),  -- งวดที่
  adjusts_id         uuid references public.budget_disbursements (id),
  paid_on            date not null,
  payee              text not null default '' check (length(payee) <= 200),
  amount             numeric(14,2) not null check (amount <> 0),
  voucher_no         text not null default '' check (length(voucher_no) <= 100),  -- เลขที่ใบสำคัญ
  note               text not null default '' check (length(note) <= 500),
  reason             text not null default '' check (length(reason) <= 1000),
  asset_receipt_ref  uuid,
  created_by         uuid default auth.uid() references public.profiles (id),
  created_at         timestamptz not null default now(),
  constraint budget_disbursements_kind check (
    (kind = 'payment' and amount > 0 and adjusts_id is null and btrim(payee) <> '')
    or (kind = 'adjustment' and adjusts_id is not null and length(btrim(reason)) >= 3)
  )
);
comment on table public.budget_disbursements is 'เบิกจ่ายจริงตามคำขอใช้งบที่อนุมัติ (หลายงวด) แก้ไขไม่ได้ ใช้รายการปรับปรุง (adjustment) พร้อมเหตุผลแทน';
comment on column public.budget_disbursements.asset_receipt_ref is 'เผื่ออ้างอิงรายการรับเข้าพัสดุ (ระบบที่ 7) ยังไม่ผูก foreign key';
create index budget_disbursements_request_idx on public.budget_disbursements (use_request_id, created_at);
create index budget_disbursements_item_idx on public.budget_disbursements (item_id, org_unit_id);

-- กันการแก้ไขหรือลบรายการเบิกจ่าย (ผู้ใช้ไม่มีสิทธิ์อยู่แล้ว กันซ้ำถึงฟังก์ชันระบบด้วย)
create function public.budget_disbursements_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'รายการเบิกจ่ายแก้ไขหรือลบไม่ได้ ให้ทำรายการปรับปรุงพร้อมเหตุผลแทน' using errcode = 'P0001';
end;
$$;
revoke execute on function public.budget_disbursements_immutable() from public, anon, authenticated;
create trigger budget_disbursements_immutable before update or delete on public.budget_disbursements
  for each row execute function public.budget_disbursements_immutable();
create trigger budget_disbursements_audit after insert on public.budget_disbursements
  for each row execute function public.audit_row_change();

alter table public.budget_use_requests enable row level security;
alter table public.budget_disbursements enable row level security;
create policy budget_use_requests_read on public.budget_use_requests for select to authenticated
  using (created_by = auth.uid() or public.can_view_budget(org_unit_id));
create policy budget_disbursements_read on public.budget_disbursements for select to authenticated
  using (public.can_view_budget(org_unit_id));
revoke all on public.budget_use_requests, public.budget_disbursements from anon;
revoke insert, update, delete, truncate on public.budget_use_requests, public.budget_disbursements from authenticated;
grant select on public.budget_use_requests, public.budget_disbursements to authenticated;

-- ---------------------------------------------------------------
-- 4) ยอดผูกพันและยอดใช้ของหน่วย
-- ---------------------------------------------------------------
-- ผูกพันสุทธิ = ผูกพันเมื่ออนุมัติ - คืนเงินเหลือจ่าย
create function private.budget_committed(p_item uuid, p_unit uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(u.committed_amount - u.released_amount), 0)::numeric(14,2)
  from public.budget_use_requests u
  where u.item_id = p_item and u.org_unit_id = p_unit and u.status in ('approved', 'closed');
$$;

-- เบิกจ่ายสุทธิ (รวมรายการปรับปรุง)
create function private.budget_disbursed(p_item uuid, p_unit uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(d.amount), 0)::numeric(14,2)
  from public.budget_disbursements d
  where d.item_id = p_item and d.org_unit_id = p_unit;
$$;

-- ยอดที่ใช้ไปแล้วของหน่วย = จัดสรรต่อ + ผูกพันสุทธิ (ต้องไม่เกินยอดที่ได้รับ)
create function private.budget_used(p_item uuid, p_unit uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select (private.budget_out(p_item, p_unit) + private.budget_committed(p_item, p_unit))::numeric(14,2);
$$;

-- รายการนี้มีการใช้แล้วหรือยัง (จัดสรร หรือคำขอใช้งบที่ยังไม่ยกเลิก)
create function private.budget_item_in_use(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.budget_allocations a where a.item_id = p_item and a.is_active)
      or exists (select 1 from public.budget_use_requests u
                 where u.item_id = p_item and u.status in ('pending', 'returned', 'approved', 'closed'));
$$;

revoke all on function private.budget_committed(uuid, uuid) from public, anon, authenticated;
revoke all on function private.budget_disbursed(uuid, uuid) from public, anon, authenticated;
revoke all on function private.budget_used(uuid, uuid) from public, anon, authenticated;
revoke all on function private.budget_item_in_use(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 5) ปรับกติกาเดิมของบทที่ 22 ให้นับยอดผูกพันด้วย (ยอดที่ใช้ = จัดสรรต่อ + ผูกพันสุทธิ ต้องไม่เกินยอดที่ได้รับ)
-- ---------------------------------------------------------------

create or replace function public.budget_items_rules()
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
    v_allocated := private.budget_item_in_use(new.id);
    if v_allocated and (new.category_id <> old.category_id or new.source_id <> old.source_id) then
      raise exception 'รายการที่เริ่มจัดสรรหรือขอใช้งบแล้ว เปลี่ยนหมวดรายจ่ายหรือแหล่งเงินไม่ได้' using errcode = 'P0001';
    end if;
    if new.amount <> old.amount then
      if v_allocated and coalesce(current_setting('app.budget_transfer', true), '') <> '1' then
        raise exception 'รายการที่เริ่มจัดสรรหรือขอใช้งบแล้ว เปลี่ยนวงเงินได้ผ่านคำขอโอนเปลี่ยนแปลงที่อนุมัติแล้วเท่านั้น' using errcode = 'P0001';
      end if;
      if new.amount < private.budget_used(new.id, new.org_unit_id) then
        raise exception 'วงเงินน้อยกว่ายอดที่จัดสรรและผูกพันไปแล้ว (%)', to_char(private.budget_used(new.id, new.org_unit_id), 'FM999,999,999,990.00')
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.is_active and not new.is_active then
    if exists (select 1 from public.budget_items c where c.parent_id = new.id and c.is_active) then
      raise exception 'ยังมีรายการย่อยที่ใช้งานอยู่ ต้องปิดใช้งานรายการย่อยก่อน' using errcode = 'P0001';
    end if;
    if private.budget_item_in_use(new.id) then
      raise exception 'รายการนี้มีการจัดสรรหรือคำขอใช้งบแล้ว ปิดใช้งานไม่ได้' using errcode = 'P0001';
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

create or replace function public.allocate_budget(
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
    v_out := private.budget_used(p_item, p_from_unit);
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
       and private.budget_received(p_item, p_to_unit) + p_amount < private.budget_used(p_item, p_to_unit) then
      raise exception 'ปรับลดไม่ได้ เพราะผู้รับจัดสรรต่อหรือผูกพันไปแล้ว % บาท', to_char(private.budget_used(p_item, p_to_unit), 'FM999,999,999,990.00')
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

create or replace function public.cancel_budget_allocation(p_id uuid, p_reason text)
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
         < private.budget_used(v_alloc.item_id, v_alloc.to_unit_id) then
    raise exception 'ยกเลิกไม่ได้ เพราะผู้รับจัดสรรต่อหรือผูกพันไปแล้ว % บาท',
      to_char(private.budget_used(v_alloc.item_id, v_alloc.to_unit_id), 'FM999,999,999,990.00') using errcode = 'P0001';
  end if;
  if v_alloc.amount < 0
     and private.budget_used(v_alloc.item_id, v_alloc.from_unit_id) - v_alloc.amount
         > private.budget_received(v_alloc.item_id, v_alloc.from_unit_id) then
    raise exception 'ยกเลิกการปรับลดไม่ได้ เพราะยอดจัดสรรจะเกินยอดที่หน่วยได้รับ' using errcode = 'P0001';
  end if;
  update public.budget_allocations
     set is_active = false, cancel_reason = btrim(p_reason), cancelled_at = now(), cancelled_by = auth.uid()
   where id = p_id;
end;
$$;

create or replace function private.budget_transfer_check(p_from uuid, p_to uuid, p_amount numeric, p_reason text)
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
  v_free := v_from.amount - private.budget_used(p_from, v_from.org_unit_id);
  if p_amount > v_free then
    raise exception 'ยอดคงเหลือ (ยังไม่จัดสรรหรือผูกพัน) ของรายการต้นทางไม่พอ คงเหลือ % บาท', to_char(v_free, 'FM999,999,999,990.00')
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

create or replace function public.requests_sync_budget_transfer()
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
  if v_from.amount - v_t.amount < private.budget_used(v_from.id, v_from.org_unit_id) then
    raise exception 'อนุมัติไม่ได้: ยอดคงเหลือ (ยังไม่จัดสรรหรือผูกพัน) ของรายการต้นทางเหลือ % บาท ไม่พอโอน',
      to_char(v_from.amount - private.budget_used(v_from.id, v_from.org_unit_id), 'FM999,999,999,990.00')
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

create or replace function public.budget_tree(p_year uuid, p_unit uuid, p_include_inactive boolean default false)
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
           private.budget_received(l.id, p_unit) as rec, private.budget_out(l.id, p_unit) as alloc,
           private.budget_committed(l.id, p_unit) as com
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
         x.rec::numeric(14,2), x.alloc::numeric(14,2), (x.rec - x.alloc - x.com)::numeric(14,2)
  from nodes n
  join public.budget_items i on i.id = n.id
  join public.org_units u on u.id = i.org_unit_id
  left join public.budget_categories c on c.id = i.category_id
  left join public.budget_sources s on s.id = i.source_id
  cross join lateral (
    select coalesce(sum(lv.rec), 0) as rec, coalesce(sum(lv.alloc), 0) as alloc, coalesce(sum(lv.com), 0) as com
    from leaf_vals lv
    where (i.kind = 'category' and lv.id = i.id)
       or (i.kind = 'project' and lv.parent_id = i.id)
       or (i.kind = 'program' and lv.program_id = i.id)
  ) x
  order by i.sort_order, i.created_at;
end;
$$;

create or replace function public.budget_item_detail(p_item uuid, p_unit uuid)
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
    'has_allocations', private.budget_item_in_use(v_item.id),
    'committed', private.budget_committed(v_item.id, p_unit),
    'disbursed', private.budget_disbursed(v_item.id, p_unit),
    'pending_transfers', (select count(*) from public.budget_transfers t
                          where (t.from_item_id = v_item.id or t.to_item_id = v_item.id) and t.status in ('pending', 'returned')));
end;
$$;

create or replace function private.budget_plan_eval(p_year uuid, p_unit uuid, p_rows jsonb)
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
    if private.budget_item_in_use(v_item.id) then
      message := 'รายการนี้เริ่มจัดสรรหรือขอใช้งบแล้ว เปลี่ยนวงเงินต้องยื่นคำขอโอนเปลี่ยนแปลง'; return next; continue;
    end if;
    status := 'update';
    message := format('ปรับวงเงินจาก %s เป็น %s บาท', to_char(v_item.amount, 'FM999,999,999,990.00'),
                      to_char(amount, 'FM999,999,999,990.00'));
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- 6) คำขอใช้งบ: ชนิดคำขอ budget_use ในเครื่องอนุมัติกลาง
--    เส้นทาง: เริ่มที่หน่วยที่ใช้เงิน แล้วเห็นชอบทีละชั้นขึ้นไปจนถึงชั้นแรกที่มีตำแหน่งวงเงินพอ (ผู้สั่งงานเลือก)
--    ถ้าไม่มีชั้นใดพอ = ส่วนกลาง (central_staff ไม่จำกัดวงเงิน) ผู้ยื่นพิจารณาคำขอของตนเองไม่ได้ (เครื่องอนุมัติกลาง)
-- ---------------------------------------------------------------
insert into public.request_types (key, code, name, route_levels, start_at_own_unit, decider_roles, central_roles)
values ('budget_use', 'USE', 'คำขอใช้งบประมาณ', '{subdistrict,district,province,region,central}', true,
        '{chief,deputy_chief}', '{central_staff}');

create function private.budget_use_route(p_unit uuid, p_amount numeric)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_route uuid[] := '{}';
begin
  for r in
    select u.id, u.level from public.ancestors_or_self(p_unit) a join public.org_units u on u.id = a.id order by a.depth
  loop
    v_route := v_route || r.id;
    if r.level = 'central' then
      return v_route;
    end if;
    if exists (select 1 from public.budget_approval_limits l
               where l.level = r.level and l.max_amount is not null and l.max_amount >= p_amount) then
      return v_route;
    end if;
  end loop;
  raise exception 'ไม่พบชั้นที่มีวงเงินอนุมัติพอสำหรับจำนวนนี้ (ไม่มีหน่วยส่วนกลางในสาย)' using errcode = 'P0001';
end;
$$;

-- ตรวจรายละเอียดค่าใช้จ่าย คืน {lines, total}
create function private.budget_use_lines(p_lines jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  r record;
  v_out jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_amount numeric;
  v_n integer := 0;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'กรุณากรอกรายละเอียดค่าใช้จ่ายอย่างน้อย 1 รายการ' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'รายละเอียดค่าใช้จ่ายได้ไม่เกิน 50 รายการ' using errcode = 'P0001';
  end if;
  for r in select * from jsonb_to_recordset(p_lines) as x(description text, quantity text, unit text, unit_price text) loop
    v_n := v_n + 1;
    if coalesce(btrim(r.description), '') = '' or length(r.description) > 200 then
      raise exception 'รายการที่ % : กรุณากรอกรายการค่าใช้จ่าย (ไม่เกิน 200 ตัวอักษร)', v_n using errcode = 'P0001';
    end if;
    if coalesce(r.quantity, '') !~ '^\d{1,9}(\.\d{1,2})?$' or r.quantity::numeric <= 0 then
      raise exception 'รายการที่ % : จำนวนต้องมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง', v_n using errcode = 'P0001';
    end if;
    if coalesce(r.unit_price, '') !~ '^\d{1,12}(\.\d{1,2})?$' then
      raise exception 'รายการที่ % : ราคาต่อหน่วยต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง', v_n using errcode = 'P0001';
    end if;
    if length(coalesce(r.unit, '')) > 30 then
      raise exception 'รายการที่ % : หน่วยนับยาวเกิน 30 ตัวอักษร', v_n using errcode = 'P0001';
    end if;
    v_amount := round(r.quantity::numeric * r.unit_price::numeric, 2);
    v_total := v_total + v_amount;
    v_out := v_out || jsonb_build_object('description', btrim(r.description), 'quantity', r.quantity::numeric,
                                         'unit', btrim(coalesce(r.unit, '')), 'unit_price', r.unit_price::numeric,
                                         'amount', v_amount);
  end loop;
  if v_total <= 0 then
    raise exception 'จำนวนเงินรวมต้องมากกว่า 0' using errcode = 'P0001';
  end if;
  if v_total > 999999999999.99 then
    raise exception 'จำนวนเงินรวมเกินกำหนด' using errcode = 'P0001';
  end if;
  return jsonb_build_object('lines', v_out, 'total', v_total);
end;
$$;

-- ตรวจคำขอใช้งบ คืนข้อมูลสำหรับสร้างหรือส่งใหม่
create function private.budget_use_check(p_item uuid, p_unit uuid, p_purpose text, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.budget_items%rowtype;
  v_lines jsonb;
  v_amount numeric;
  v_free numeric;
begin
  select * into v_item from public.budget_items where id = p_item for update;
  if not found or v_item.kind <> 'category' then
    raise exception 'ขอใช้งบได้เฉพาะรายการชั้นหมวดรายจ่าย' using errcode = 'P0001';
  end if;
  if not v_item.is_active then
    raise exception 'รายการนี้ถูกปิดใช้งานแล้ว' using errcode = 'P0001';
  end if;
  perform private.budget_year_open(v_item.fiscal_year_id);
  if not public.can_edit_budget(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์ขอใช้งบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  if v_item.org_unit_id <> p_unit and not exists (
       select 1 from public.budget_allocations a where a.item_id = p_item and a.to_unit_id = p_unit and a.is_active) then
    raise exception 'หน่วยนี้ไม่ได้เป็นเจ้าของหรือได้รับจัดสรรรายการนี้' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_purpose, ''))) < 3 or length(btrim(p_purpose)) > 1000 then
    raise exception 'กรุณาระบุวัตถุประสงค์ (3 ถึง 1,000 ตัวอักษร)' using errcode = 'P0001';
  end if;
  v_lines := private.budget_use_lines(p_lines);
  v_amount := (v_lines ->> 'total')::numeric;
  v_free := private.budget_received(p_item, p_unit) - private.budget_used(p_item, p_unit);
  if v_amount > v_free then
    raise exception 'จำนวนเงินเกินยอดคงเหลือของรายการ (คงเหลือ % บาท)', to_char(v_free, 'FM999,999,999,990.00')
      using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'title', 'ขอใช้งบประมาณ ' || private.budget_item_label(p_item) || ' ' || to_char(v_amount, 'FM999,999,999,990.00') || ' บาท',
    'fiscal_year_id', v_item.fiscal_year_id,
    'amount', v_amount,
    'lines', v_lines -> 'lines',
    'payload', jsonb_build_object(
      'year_be', (select year_be from public.fiscal_years where id = v_item.fiscal_year_id),
      'unit_name', (select name from public.org_units where id = p_unit),
      'item_id', p_item,
      'item_path', private.budget_item_path(p_item),
      'owner_unit_name', (select name from public.org_units where id = v_item.org_unit_id),
      'amount', v_amount,
      'available', v_free,
      'lines', v_lines -> 'lines',
      'detail', btrim(p_purpose)));
end;
$$;

create function public.submit_budget_use(p_item uuid, p_unit uuid, p_purpose text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chk jsonb;
  v_id uuid;
  v_req uuid;
  v_route uuid[];
begin
  v_chk := private.budget_use_check(p_item, p_unit, p_purpose, p_lines);
  v_route := private.budget_use_route(p_unit, (v_chk ->> 'amount')::numeric);
  insert into public.budget_use_requests (fiscal_year_id, item_id, org_unit_id, purpose, lines, amount)
  values ((v_chk ->> 'fiscal_year_id')::uuid, p_item, p_unit, btrim(p_purpose), v_chk -> 'lines', (v_chk ->> 'amount')::numeric)
  returning id into v_id;
  perform set_config('app.budget_use_request', '1', true);
  v_req := private.create_request('budget_use', p_unit, v_chk ->> 'title',
                                  (v_chk -> 'payload') || jsonb_build_object('use_id', v_id), v_route);
  perform set_config('app.budget_use_request', '', true);
  update public.budget_use_requests set request_id = v_req where id = v_id;
  return v_id;
end;
$$;

-- ส่งใหม่หลังถูกส่งกลับ: เส้นทางเดิม จำนวนเงินต้องไม่มากกว่าเดิม (ถ้าเพิ่มให้ยกเลิกแล้วยื่นใหม่)
create function public.resubmit_budget_use(p_id uuid, p_purpose text, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.budget_use_requests%rowtype;
  v_chk jsonb;
begin
  select * into v_u from public.budget_use_requests where id = p_id for update;
  if not found then
    raise exception 'ไม่พบคำขอใช้งบ' using errcode = 'P0001';
  end if;
  if v_u.created_by <> auth.uid() then
    raise exception 'ส่งใหม่ได้เฉพาะผู้ยื่นคำขอ' using errcode = '42501';
  end if;
  if v_u.status <> 'returned' then
    raise exception 'ส่งใหม่ได้เฉพาะคำขอที่ถูกส่งกลับแก้ไข' using errcode = 'P0001';
  end if;
  v_chk := private.budget_use_check(v_u.item_id, v_u.org_unit_id, p_purpose, p_lines);
  if (v_chk ->> 'amount')::numeric > v_u.amount then
    raise exception 'จำนวนเงินมากกว่าคำขอเดิม (% บาท) กรุณายกเลิกคำขอนี้แล้วยื่นใหม่', to_char(v_u.amount, 'FM999,999,999,990.00')
      using errcode = 'P0001';
  end if;
  update public.budget_use_requests
     set purpose = btrim(p_purpose), lines = v_chk -> 'lines', amount = (v_chk ->> 'amount')::numeric
   where id = p_id;
  perform set_config('app.budget_use_request', '1', true);
  perform public.resubmit_request(v_u.request_id, v_chk ->> 'title', (v_chk -> 'payload') || jsonb_build_object('use_id', p_id));
  perform set_config('app.budget_use_request', '', true);
end;
$$;

create function public.requests_guard_budget_use()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.type_key = 'budget_use' or (tg_op = 'UPDATE' and old.type_key = 'budget_use'))
     and coalesce(current_setting('app.budget_use_request', true), '') <> '1' then
    raise exception 'คำขอใช้งบประมาณต้องยื่นจากหน้า งบประมาณ เท่านั้น' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.requests_guard_budget_use() from public, anon, authenticated;
create trigger requests_guard_budget_use before insert or update of payload, title, type_key on public.requests
  for each row execute function public.requests_guard_budget_use();

-- ขั้นสุดท้าย: ผู้อนุมัติต้องมีวงเงินพอ (ขั้นก่อนหน้าเป็นการเห็นชอบ เจ้าคณะหรือรองเจ้าคณะของชั้นนั้นทำได้)
create function public.request_steps_budget_use_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;
  select u.amount into v_amount
  from public.requests r join public.budget_use_requests u on u.request_id = r.id
  where r.id = new.request_id and r.type_key = 'budget_use';
  if v_amount is null then
    return new;
  end if;
  if new.step_no < (select max(s.step_no) from public.request_steps s where s.request_id = new.request_id) then
    return new;
  end if;
  if not exists (
    select 1 from public.my_role_rows() m
    where m.effective and (
      (new.level = 'central' and m.role_key = 'central_staff')
      or (new.level <> 'central' and m.org_unit_id = new.org_unit_id and m.role_key in ('chief', 'deputy_chief')
          and exists (select 1 from public.budget_approval_limits l
                      where l.level = new.level and l.role_key = m.role_key and l.max_amount >= v_amount))
    )
  ) then
    raise exception 'วงเงินอนุมัติของตำแหน่งท่านไม่พอสำหรับ % บาท (ผู้ดูแลระบบตั้งวงเงินที่หน้า วงเงินอนุมัติงบประมาณ)',
      to_char(v_amount, 'FM999,999,999,990.00') using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.request_steps_budget_use_limit() from public, anon, authenticated;
create trigger request_steps_budget_use_limit before update of status on public.request_steps
  for each row execute function public.request_steps_budget_use_limit();

-- ผลพิจารณา: อนุมัติ = ตรวจยอดซ้ำแล้วผูกพันเงินทันที / สถานะอื่นตามคำขอ
create function public.requests_sync_budget_use()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.budget_use_requests%rowtype;
  v_free numeric;
begin
  if new.type_key <> 'budget_use' or new.status = old.status then
    return new;
  end if;
  select * into v_u from public.budget_use_requests where request_id = new.id for update;
  if not found or v_u.status in ('approved', 'closed') then
    return new;
  end if;
  if new.status <> 'approved' then
    update public.budget_use_requests set status = new.status where id = v_u.id;
    return new;
  end if;
  perform 1 from public.budget_items where id = v_u.item_id for update;
  v_free := private.budget_received(v_u.item_id, v_u.org_unit_id) - private.budget_used(v_u.item_id, v_u.org_unit_id);
  if v_u.amount > v_free then
    raise exception 'อนุมัติไม่ได้: ยอดคงเหลือของรายการเหลือ % บาท ไม่พอผูกพัน', to_char(v_free, 'FM999,999,999,990.00')
      using errcode = 'P0001';
  end if;
  update public.budget_use_requests
     set status = 'approved', committed_amount = v_u.amount, approved_at = now()
   where id = v_u.id;
  return new;
end;
$$;
revoke execute on function public.requests_sync_budget_use() from public, anon, authenticated;
create trigger requests_sync_budget_use after update of status on public.requests
  for each row execute function public.requests_sync_budget_use();

-- ---------------------------------------------------------------
-- 7) เบิกจ่าย รายการปรับปรุง และคืนเงินเหลือจ่าย
-- ---------------------------------------------------------------
create function public.record_disbursement(
  p_use uuid, p_paid_on date, p_payee text, p_amount numeric, p_voucher text default '', p_note text default '',
  p_asset_ref uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.budget_use_requests%rowtype;
  v_paid numeric;
  v_id uuid;
begin
  select * into v_u from public.budget_use_requests where id = p_use for update;
  if not found then
    raise exception 'ไม่พบคำขอใช้งบ' using errcode = 'P0001';
  end if;
  if not public.can_edit_budget(v_u.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์บันทึกเบิกจ่ายของหน่วยนี้' using errcode = '42501';
  end if;
  if v_u.status <> 'approved' then
    raise exception 'เบิกจ่ายได้เฉพาะคำขอที่อนุมัติแล้วและยังไม่ปิด' using errcode = 'P0001';
  end if;
  perform private.budget_year_open(v_u.fiscal_year_id);
  if p_paid_on is null then
    raise exception 'กรุณากรอกวันที่จ่าย' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_payee), '') = '' then
    raise exception 'กรุณากรอกผู้รับเงิน' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'จำนวนเงินต้องมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง' using errcode = 'P0001';
  end if;
  select coalesce(sum(d.amount), 0) into v_paid from public.budget_disbursements d where d.use_request_id = p_use;
  if v_paid + p_amount > v_u.committed_amount then
    raise exception 'ยอดเบิกจ่ายรวมเกินยอดที่อนุมัติ (เบิกได้อีก % บาท)', to_char(v_u.committed_amount - v_paid, 'FM999,999,999,990.00')
      using errcode = 'P0001';
  end if;
  insert into public.budget_disbursements (use_request_id, fiscal_year_id, item_id, org_unit_id, kind, installment_no, paid_on,
                                           payee, amount, voucher_no, note, asset_receipt_ref)
  values (p_use, v_u.fiscal_year_id, v_u.item_id, v_u.org_unit_id, 'payment',
          (select count(*) + 1 from public.budget_disbursements d where d.use_request_id = p_use and d.kind = 'payment'),
          p_paid_on, btrim(p_payee), p_amount, btrim(coalesce(p_voucher, '')), btrim(coalesce(p_note, '')), p_asset_ref)
  returning id into v_id;
  return v_id;
end;
$$;

-- รายการปรับปรุงของงวดที่จ่ายแล้ว (จำนวนบวก = จ่ายเพิ่ม / ลบ = ลดยอด) ต้องมีเหตุผล
create function public.adjust_disbursement(p_id uuid, p_amount numeric, p_reason text, p_paid_on date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d public.budget_disbursements%rowtype;
  v_u public.budget_use_requests%rowtype;
  v_line numeric;
  v_paid numeric;
  v_id uuid;
begin
  select * into v_d from public.budget_disbursements where id = p_id;
  if not found or v_d.kind <> 'payment' then
    raise exception 'ปรับปรุงได้เฉพาะงวดที่จ่ายจริง' using errcode = 'P0001';
  end if;
  select * into v_u from public.budget_use_requests where id = v_d.use_request_id for update;
  if not public.can_edit_budget(v_u.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์บันทึกเบิกจ่ายของหน่วยนี้' using errcode = '42501';
  end if;
  if v_u.status <> 'approved' then
    raise exception 'คำขอนี้ปิดแล้ว ปรับปรุงไม่ได้' using errcode = 'P0001';
  end if;
  perform private.budget_year_open(v_u.fiscal_year_id);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'กรุณาระบุเหตุผลการปรับปรุง (อย่างน้อย 3 ตัวอักษร)' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount = 0 or p_amount <> round(p_amount, 2) then
    raise exception 'จำนวนเงินที่ปรับปรุงต้องไม่เป็นศูนย์ ทศนิยมไม่เกิน 2 ตำแหน่ง' using errcode = 'P0001';
  end if;
  select coalesce(sum(d.amount), 0) into v_line from public.budget_disbursements d where d.id = p_id or d.adjusts_id = p_id;
  if v_line + p_amount < 0 then
    raise exception 'ปรับลดเกินยอดของงวดนี้ (ยอดสุทธิ % บาท)', to_char(v_line, 'FM999,999,999,990.00') using errcode = 'P0001';
  end if;
  select coalesce(sum(d.amount), 0) into v_paid from public.budget_disbursements d where d.use_request_id = v_u.id;
  if v_paid + p_amount > v_u.committed_amount then
    raise exception 'ยอดเบิกจ่ายรวมเกินยอดที่อนุมัติ (เบิกได้อีก % บาท)', to_char(v_u.committed_amount - v_paid, 'FM999,999,999,990.00')
      using errcode = 'P0001';
  end if;
  insert into public.budget_disbursements (use_request_id, fiscal_year_id, item_id, org_unit_id, kind, installment_no, adjusts_id,
                                           paid_on, payee, amount, voucher_no, note, reason)
  values (v_u.id, v_u.fiscal_year_id, v_u.item_id, v_u.org_unit_id, 'adjustment', v_d.installment_no, p_id,
          coalesce(p_paid_on, (now() at time zone 'Asia/Bangkok')::date), v_d.payee, p_amount, v_d.voucher_no, '', btrim(p_reason))
  returning id into v_id;
  return v_id;
end;
$$;

-- คืนเงินเหลือจ่าย: ปลดยอดผูกพันส่วนที่ยังไม่เบิกกลับเข้ารายการ แล้วปิดคำขอ
create function public.close_budget_use(p_use uuid, p_reason text default '')
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.budget_use_requests%rowtype;
  v_paid numeric;
begin
  select * into v_u from public.budget_use_requests where id = p_use for update;
  if not found then
    raise exception 'ไม่พบคำขอใช้งบ' using errcode = 'P0001';
  end if;
  if not public.can_edit_budget(v_u.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์บันทึกเบิกจ่ายของหน่วยนี้' using errcode = '42501';
  end if;
  if v_u.status <> 'approved' then
    raise exception 'คืนเงินได้เฉพาะคำขอที่อนุมัติแล้วและยังไม่ปิด' using errcode = 'P0001';
  end if;
  perform private.budget_year_open(v_u.fiscal_year_id);
  select coalesce(sum(d.amount), 0) into v_paid from public.budget_disbursements d where d.use_request_id = p_use;
  update public.budget_use_requests
     set status = 'closed', released_amount = committed_amount - v_paid, released_at = now(), released_by = auth.uid(),
         release_reason = left(btrim(coalesce(p_reason, '')), 1000)
   where id = p_use;
  return v_u.committed_amount - v_paid;
end;
$$;

-- ---------------------------------------------------------------
-- 8) ฟังก์ชันอ่าน
-- ---------------------------------------------------------------
create function public.budget_use_rows(p_year uuid, p_unit uuid)
returns table (
  id uuid, item_id uuid, item_path text, purpose text, amount numeric, status text, request_id uuid, request_no text,
  committed numeric, disbursed numeric, released numeric, outstanding numeric, created_at timestamptz,
  approved_at timestamptz, requester_name text
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
  select u.id, u.item_id, private.budget_item_path(u.item_id), u.purpose, u.amount, u.status, u.request_id, r.request_no,
         u.committed_amount, coalesce(d.paid, 0)::numeric(14,2), u.released_amount,
         case when u.status = 'approved' then (u.committed_amount - coalesce(d.paid, 0)) else 0 end::numeric(14,2),
         u.created_at, u.approved_at,
         btrim(concat_ws(' ', nullif(p.title_prefix, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, '')))
  from public.budget_use_requests u
  left join public.requests r on r.id = u.request_id
  left join public.profiles p on p.id = u.created_by
  left join lateral (select sum(x.amount) as paid from public.budget_disbursements x where x.use_request_id = u.id) d on true
  where u.fiscal_year_id = p_year and u.org_unit_id = p_unit
  order by u.created_at desc;
end;
$$;

create function public.budget_use_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_u public.budget_use_requests%rowtype;
  v_paid numeric;
begin
  select * into v_u from public.budget_use_requests where id = p_id;
  if not found or not (v_u.created_by = auth.uid() or public.can_view_budget(v_u.org_unit_id)) then
    raise exception 'ไม่พบคำขอใช้งบ หรือท่านไม่มีสิทธิ์ดู' using errcode = '42501';
  end if;
  select coalesce(sum(d.amount), 0) into v_paid from public.budget_disbursements d where d.use_request_id = p_id;
  return jsonb_build_object(
    'id', v_u.id, 'item_id', v_u.item_id, 'item_path', private.budget_item_path(v_u.item_id),
    'category_name', (select c.name from public.budget_items i join public.budget_categories c on c.id = i.category_id where i.id = v_u.item_id),
    'org_unit_id', v_u.org_unit_id, 'unit_name', (select name from public.org_units where id = v_u.org_unit_id),
    'year_be', (select year_be from public.fiscal_years where id = v_u.fiscal_year_id),
    'year_open', (select status = 'open' from public.fiscal_years where id = v_u.fiscal_year_id),
    'purpose', v_u.purpose, 'lines', v_u.lines, 'amount', v_u.amount, 'status', v_u.status,
    'request_id', v_u.request_id, 'request_no', (select request_no from public.requests where id = v_u.request_id),
    'committed', v_u.committed_amount, 'disbursed', v_paid, 'released', v_u.released_amount,
    'outstanding', case when v_u.status = 'approved' then v_u.committed_amount - v_paid else 0 end,
    'approved_at', v_u.approved_at, 'released_at', v_u.released_at, 'release_reason', v_u.release_reason,
    'created_at', v_u.created_at, 'is_mine', v_u.created_by = auth.uid(),
    'can_edit', public.can_edit_budget(v_u.org_unit_id));
end;
$$;

create function public.budget_disbursement_rows(p_use uuid)
returns table (
  id uuid, kind text, installment_no integer, adjusts_id uuid, paid_on date, payee text, amount numeric, voucher_no text,
  note text, reason text, asset_receipt_ref uuid, created_at timestamptz, created_by_name text, attachment_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.budget_use_requests u
                 where u.id = p_use and (u.created_by = auth.uid() or public.can_view_budget(u.org_unit_id))) then
    raise exception 'ท่านไม่มีสิทธิ์ดูการเบิกจ่ายนี้' using errcode = '42501';
  end if;
  return query
  select d.id, d.kind, d.installment_no, d.adjusts_id, d.paid_on, d.payee, d.amount, d.voucher_no, d.note, d.reason,
         d.asset_receipt_ref, d.created_at,
         btrim(concat_ws(' ', nullif(p.title_prefix, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, ''))),
         (select count(*)::integer from public.attachments a
          where a.entity_table = 'budget_disbursements' and a.entity_id = d.id::text and a.is_active)
  from public.budget_disbursements d
  left join public.profiles p on p.id = d.created_by
  where d.use_request_id = p_use
  order by d.installment_no, d.created_at;
end;
$$;

-- ยอดผูกพันและเบิกจ่ายต่อรายการของหน่วย (ใช้คู่กับ budget_tree)
create function public.budget_spend_summary(p_year uuid, p_unit uuid)
returns table (item_id uuid, committed numeric, disbursed numeric)
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
  select u.item_id, sum(u.committed_amount - u.released_amount)::numeric(14,2),
         coalesce((select sum(d.amount) from public.budget_disbursements d where d.item_id = u.item_id and d.org_unit_id = p_unit), 0)::numeric(14,2)
  from public.budget_use_requests u
  where u.fiscal_year_id = p_year and u.org_unit_id = p_unit and u.status in ('approved', 'closed')
  group by u.item_id;
end;
$$;

-- ทะเบียนคุมงบประมาณของรายการในมุมมองของหน่วย (ยอดสะสม)
--   ได้รับจัดสรร: เจ้าของ = วงเงินตั้งต้นและการเปลี่ยนแปลง (แก้ไข นำเข้า โอน) / หน่วยอื่น = การจัดสรรที่ได้รับ ; จัดสรรต่อ = ติดลบ
--   ผูกพัน: อนุมัติคำขอใช้งบ (+) คืนเงินเหลือจ่าย (-) ; เบิกจ่าย: แสดงยอด ไม่หักคงเหลือซ้ำ (หักไปแล้วตอนผูกพัน)
--   คงเหลือ = ผลรวมสะสมของ (ได้รับจัดสรร - ผูกพัน)
create function public.budget_ledger(p_item uuid, p_unit uuid)
returns table (
  happened_on date, happened_at timestamptz, kind text, description text, ref_no text,
  received numeric, committed numeric, disbursed numeric, balance numeric, outstanding numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item public.budget_items%rowtype;
begin
  select * into v_item from public.budget_items where id = p_item;
  if not found or v_item.kind <> 'category' or not public.can_view_budget(p_unit) then
    raise exception 'ไม่พบรายการ หรือท่านไม่มีสิทธิ์ดูทะเบียนคุมของหน่วยนี้' using errcode = '42501';
  end if;
  return query
  with ev as (
    -- เจ้าของ: การเปลี่ยนวงเงินของรายการ
    select (c.created_at at time zone 'Asia/Bangkok')::date as d, c.created_at as ts, 'budget'::text as k,
           case c.action
             when 'create' then 'ตั้งวงเงิน'
             when 'import' then 'ตั้งวงเงิน (นำเข้าจาก Excel)'
             when 'edit' then 'แก้ไขวงเงิน'
             when 'transfer_in' then 'รับโอนจาก ' || coalesce(c.detail ->> 'other', '')
             when 'transfer_out' then 'โอนออกไป ' || coalesce(c.detail ->> 'other', '')
             else c.action end as descr,
           coalesce(c.detail ->> 'request_no', '') as ref,
           (coalesce(c.amount_after, 0) - coalesce(c.amount_before, 0))::numeric as rec, 0::numeric as com, 0::numeric as dis
    from public.budget_item_changes c
    where v_item.org_unit_id = p_unit and c.item_id = p_item
      and coalesce(c.amount_after, 0) <> coalesce(c.amount_before, 0)
      and c.action in ('create', 'import', 'edit', 'transfer_in', 'transfer_out')
    union all
    -- ได้รับจัดสรรจากหน่วยเหนือ
    select a.allocated_on, a.created_at, 'allocation_in',
           case when a.amount < 0 then 'ถูกปรับลดการจัดสรรจาก ' else 'ได้รับจัดสรรจาก ' end || fu.name || ' ครั้งที่ ' || a.round_no,
           a.reference_no, a.amount, 0, 0
    from public.budget_allocations a join public.org_units fu on fu.id = a.from_unit_id
    where a.item_id = p_item and a.to_unit_id = p_unit and a.is_active
    union all
    -- จัดสรรต่อ
    select a.allocated_on, a.created_at, 'allocation_out',
           case when a.amount < 0 then 'ปรับลดการจัดสรรให้ ' else 'จัดสรรให้ ' end || coalesce(tu.name, pl.name, '') || ' ครั้งที่ ' || a.round_no,
           a.reference_no, -a.amount, 0, 0
    from public.budget_allocations a
    left join public.org_units tu on tu.id = a.to_unit_id
    left join public.places pl on pl.id = a.to_place_id
    where a.item_id = p_item and a.from_unit_id = p_unit and a.is_active
    union all
    -- ผูกพัน
    select (u.approved_at at time zone 'Asia/Bangkok')::date, u.approved_at, 'commit',
           'ผูกพันตามคำขอใช้งบ: ' || left(u.purpose, 120), coalesce(r.request_no, ''), 0, u.committed_amount, 0
    from public.budget_use_requests u left join public.requests r on r.id = u.request_id
    where u.item_id = p_item and u.org_unit_id = p_unit and u.status in ('approved', 'closed')
    union all
    -- เบิกจ่าย
    select d.paid_on, d.created_at, 'disburse',
           case when d.kind = 'payment' then 'เบิกจ่ายงวดที่ ' || d.installment_no || ' ' || d.payee
                else 'ปรับปรุงงวดที่ ' || d.installment_no || ': ' || left(d.reason, 120) end,
           concat_ws(' ', nullif(d.voucher_no, ''), '(' || r.request_no || ')'), 0, 0, d.amount
    from public.budget_disbursements d
    join public.budget_use_requests u on u.id = d.use_request_id
    left join public.requests r on r.id = u.request_id
    where d.item_id = p_item and d.org_unit_id = p_unit
    union all
    -- คืนเงินเหลือจ่าย
    select (u.released_at at time zone 'Asia/Bangkok')::date, u.released_at, 'release',
           'คืนเงินเหลือจ่าย' || case when u.release_reason <> '' then ': ' || left(u.release_reason, 120) else '' end,
           coalesce(r.request_no, ''), 0, -u.released_amount, 0
    from public.budget_use_requests u left join public.requests r on r.id = u.request_id
    where u.item_id = p_item and u.org_unit_id = p_unit and u.status = 'closed' and u.released_amount > 0
  )
  select ev.d, ev.ts, ev.k, ev.descr, ev.ref, ev.rec::numeric(14,2), ev.com::numeric(14,2), ev.dis::numeric(14,2),
         (sum(ev.rec - ev.com) over w)::numeric(14,2),
         (sum(ev.com - ev.dis) over w)::numeric(14,2)
  from ev
  window w as (order by ev.d, ev.ts, ev.k rows between unbounded preceding and current row)
  order by ev.d, ev.ts, ev.k;
end;
$$;

-- ---------------------------------------------------------------
-- 9) ไฟล์แนบของรายการเบิกจ่าย (ใบเสร็จ): เห็นได้เมื่อดูงบของหน่วยได้ แนบได้เมื่อแก้ไขงบของหน่วยได้
--    และเขตของไฟล์ต้องเป็นหน่วยของรายการเบิกจ่ายนั้น
-- ---------------------------------------------------------------
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
      else org_unit_id is null or public.can_access(org_unit_id)
    end
  );

-- คำขอโอนและคำขอใช้งบ เห็นได้เฉพาะผู้ยื่น ผู้มีสิทธิ์ดูงบของหน่วย และผู้พิจารณาในเส้นทาง
alter policy requests_read on public.requests
  using (
    requester_id = auth.uid()
    or case
      when type_key in ('budget_transfer', 'budget_use') then
        public.can_view_budget(org_unit_id) or public.is_request_decider(id)
      when public.is_personnel_request(type_key) then
        public.can_view_personnel(org_unit_id)
        or public.can_view_request_steps(id)
        or public.is_request_subject(payload)
      else public.can_access(org_unit_id)
    end
  );

-- ---------------------------------------------------------------
-- 10) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke all on function private.budget_use_route(uuid, numeric) from public, anon, authenticated;
revoke all on function private.budget_use_lines(jsonb) from public, anon, authenticated;
revoke all on function private.budget_use_check(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.submit_budget_use(uuid, uuid, text, jsonb) from public, anon;
revoke execute on function public.resubmit_budget_use(uuid, text, jsonb) from public, anon;
revoke execute on function public.record_disbursement(uuid, date, text, numeric, text, text, uuid) from public, anon;
revoke execute on function public.adjust_disbursement(uuid, numeric, text, date) from public, anon;
revoke execute on function public.close_budget_use(uuid, text) from public, anon;
revoke execute on function public.budget_use_rows(uuid, uuid) from public, anon;
revoke execute on function public.budget_use_detail(uuid) from public, anon;
revoke execute on function public.budget_disbursement_rows(uuid) from public, anon;
revoke execute on function public.budget_spend_summary(uuid, uuid) from public, anon;
revoke execute on function public.budget_ledger(uuid, uuid) from public, anon;
grant execute on function public.submit_budget_use(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.resubmit_budget_use(uuid, text, jsonb) to authenticated;
grant execute on function public.record_disbursement(uuid, date, text, numeric, text, text, uuid) to authenticated;
grant execute on function public.adjust_disbursement(uuid, numeric, text, date) to authenticated;
grant execute on function public.close_budget_use(uuid, text) to authenticated;
grant execute on function public.budget_use_rows(uuid, uuid) to authenticated;
grant execute on function public.budget_use_detail(uuid) to authenticated;
grant execute on function public.budget_disbursement_rows(uuid) to authenticated;
grant execute on function public.budget_spend_summary(uuid, uuid) to authenticated;
grant execute on function public.budget_ledger(uuid, uuid) to authenticated;
