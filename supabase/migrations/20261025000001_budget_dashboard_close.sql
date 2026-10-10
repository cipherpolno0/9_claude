-- บทที่ 24: แดชบอร์ดและรายงานงบประมาณ ปิดปีงบประมาณ และแจ้งเตือน (ระบบที่ 6)

-- ---------------------------------------------------------------
-- 1) ปีงบประมาณ: เป้าการเบิกจ่ายสะสมรายไตรมาส (ผู้ดูแลระบบตั้ง ผู้สั่งงานเลือก) และการปิดสิ้นปี
--    เป้าเป็นร้อยละสะสมของวงเงินที่หน่วยใช้เอง ว่างทั้ง 4 ช่อง = ยังไม่ตั้ง (ไม่แสดงเส้นแผน)
--    year_end_closed_at = ปิดสิ้นปีด้วย close_fiscal_year แล้ว (เปิดอีกไม่ได้) ต่างจาก status closed ที่ผู้ดูแลระบบล็อกชั่วคราวได้
-- ---------------------------------------------------------------
alter table public.fiscal_years
  add column target_q1 numeric(5,2) check (target_q1 between 0 and 100),
  add column target_q2 numeric(5,2) check (target_q2 between 0 and 100),
  add column target_q3 numeric(5,2) check (target_q3 between 0 and 100),
  add column target_q4 numeric(5,2) check (target_q4 between 0 and 100),
  add column year_end_closed_at timestamptz,
  add column year_end_closed_by uuid references public.profiles (id),
  add column year_end_note text not null default '' check (length(year_end_note) <= 1000);
alter table public.fiscal_years
  add constraint fiscal_years_targets check (
    num_nulls(target_q1, target_q2, target_q3, target_q4) in (0, 4)
    and (target_q1 is null or (target_q1 <= target_q2 and target_q2 <= target_q3 and target_q3 <= target_q4))
  );
comment on column public.fiscal_years.target_q1 is 'เป้าเบิกจ่ายสะสม (ร้อยละ) สิ้นไตรมาส 1 (ธ.ค.) ว่าง = ไม่ตั้งเป้า';

create function public.fiscal_years_year_end_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.year_end_closed_at is not null then
    if new.status <> 'closed' then
      raise exception 'ปีงบประมาณนี้ปิดสิ้นปีแล้ว เปิดอีกไม่ได้' using errcode = 'P0001';
    end if;
  end if;
  if (new.year_end_closed_at is distinct from old.year_end_closed_at
      or new.year_end_closed_by is distinct from old.year_end_closed_by
      or new.year_end_note is distinct from old.year_end_note)
     and coalesce(current_setting('app.budget_year_close', true), '') <> '1' then
    raise exception 'ปิดสิ้นปีงบประมาณได้จากหน้า ปิดปีงบประมาณ เท่านั้น' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.fiscal_years_year_end_guard() from public, anon, authenticated;
create trigger fiscal_years_year_end_guard before update on public.fiscal_years
  for each row execute function public.fiscal_years_year_end_guard();

-- ---------------------------------------------------------------
-- 2) ยกยอดผูกพันข้ามปี: คำขอเดิมเป็นสถานะ carried (ยกไปปีถัดไป) และมีคำขอต่อเนื่องในปีใหม่ (carried_from_id)
--    ยอดผูกพันของปีเดิมยังนับเต็ม (เงินถูกกันไว้แล้ว) ยอดค้างเบิกย้ายไปปีใหม่
-- ---------------------------------------------------------------
alter table public.budget_use_requests
  add column carried_amount numeric(14,2) not null default 0 check (carried_amount >= 0),
  add column carried_at timestamptz,
  add column carried_to_id uuid references public.budget_use_requests (id),
  add column carried_from_id uuid references public.budget_use_requests (id);
alter table public.budget_use_requests drop constraint budget_use_requests_status_check;
alter table public.budget_use_requests add constraint budget_use_requests_status_check
  check (status in ('pending', 'returned', 'approved', 'rejected', 'cancelled', 'closed', 'carried'));
alter table public.budget_use_requests drop constraint budget_use_requests_release;
alter table public.budget_use_requests add constraint budget_use_requests_release
  check (released_amount + carried_amount <= committed_amount);
create unique index budget_use_requests_carried_from_unique on public.budget_use_requests (carried_from_id)
  where carried_from_id is not null;

alter table public.budget_items add column carried_from_year integer;
comment on column public.budget_items.carried_from_year is 'รายการกันเงินเหลื่อมปีที่ระบบสร้างตอนปิดปี (ปี พ.ศ. ต้นทาง)';

-- ---------------------------------------------------------------
-- 3) สรุปยอดตอนปิดปี (ระบบเขียนเท่านั้น) หนึ่งแถวต่อหน่วยต่อหมวดรายจ่าย ในมุมมองของหน่วยนั้น
-- ---------------------------------------------------------------
create table public.budget_year_closings (
  id              uuid primary key default gen_random_uuid(),
  fiscal_year_id  uuid not null references public.fiscal_years (id),
  org_unit_id     uuid not null references public.org_units (id),
  item_id         uuid not null references public.budget_items (id),
  received        numeric(14,2) not null default 0,
  allocated       numeric(14,2) not null default 0,
  committed       numeric(14,2) not null default 0,
  disbursed       numeric(14,2) not null default 0,
  released        numeric(14,2) not null default 0,
  carried         numeric(14,2) not null default 0,
  remaining       numeric(14,2) not null default 0,
  created_by      uuid default auth.uid() references public.profiles (id),
  created_at      timestamptz not null default now(),
  unique (fiscal_year_id, org_unit_id, item_id)
);
comment on table public.budget_year_closings is 'สรุปยอดงบประมาณตอนปิดสิ้นปี (ระบบเขียนเท่านั้น)';
create trigger budget_year_closings_audit after insert or update or delete on public.budget_year_closings
  for each row execute function public.audit_row_change();
alter table public.budget_year_closings enable row level security;
create policy budget_year_closings_read on public.budget_year_closings for select to authenticated
  using (public.can_view_budget(org_unit_id));
revoke all on public.budget_year_closings from anon;
revoke insert, update, delete, truncate on public.budget_year_closings from authenticated;
grant select on public.budget_year_closings to authenticated;

-- ---------------------------------------------------------------
-- 4) แจ้งเตือนงบเหลือน้อย: แจ้งครั้งเดียวต่อปีต่อหน่วยต่อรายการ (ระบบเขียนเท่านั้น)
-- ---------------------------------------------------------------
create table public.budget_alerts (
  id              uuid primary key default gen_random_uuid(),
  fiscal_year_id  uuid not null references public.fiscal_years (id),
  org_unit_id     uuid not null references public.org_units (id),
  item_id         uuid not null references public.budget_items (id),
  kind            text not null check (kind in ('low_balance')),
  percent_left    numeric(6,2) not null,
  created_at      timestamptz not null default now(),
  unique (fiscal_year_id, org_unit_id, item_id, kind)
);
comment on table public.budget_alerts is 'บันทึกการแจ้งเตือนงบเหลือน้อย (กันแจ้งซ้ำ)';
create trigger budget_alerts_audit after insert or update or delete on public.budget_alerts
  for each row execute function public.audit_row_change();
alter table public.budget_alerts enable row level security;
create policy budget_alerts_read on public.budget_alerts for select to authenticated
  using (public.can_view_budget(org_unit_id));
revoke all on public.budget_alerts from anon;
revoke insert, update, delete, truncate on public.budget_alerts from authenticated;
grant select on public.budget_alerts to authenticated;

insert into public.app_settings (key, value_int, description) values
  ('budget_low_balance_percent', 10, 'แจ้งเตือนเมื่องบของรายการเหลือน้อยกว่าร้อยละเท่านี้ของวงเงินที่หน่วยใช้เอง (1-100)'),
  ('budget_request_overdue_days', 7, 'แจ้งเตือนผู้พิจารณาเมื่อคำของบประมาณ (ใช้งบ โอน) ค้างพิจารณาเกินกี่วัน');

-- ---------------------------------------------------------------
-- 5) ปรับฟังก์ชันบทที่ 23 ให้รู้จักสถานะ carried (ยกไปปีถัดไป)
-- ---------------------------------------------------------------
create or replace function private.budget_committed(p_item uuid, p_unit uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(u.committed_amount - u.released_amount), 0)::numeric(14,2)
  from public.budget_use_requests u
  where u.item_id = p_item and u.org_unit_id = p_unit and u.status in ('approved', 'closed', 'carried');
$$;

create or replace function private.budget_item_in_use(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.budget_allocations a where a.item_id = p_item and a.is_active)
      or exists (select 1 from public.budget_use_requests u
                 where u.item_id = p_item and u.status in ('pending', 'returned', 'approved', 'closed', 'carried'));
$$;

create or replace function public.budget_spend_summary(p_year uuid, p_unit uuid)
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
  where u.fiscal_year_id = p_year and u.org_unit_id = p_unit and u.status in ('approved', 'closed', 'carried')
  group by u.item_id;
end;
$$;

create or replace function public.budget_use_detail(p_id uuid)
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
    'carried', v_u.carried_amount, 'carried_at', v_u.carried_at, 'carried_to_id', v_u.carried_to_id,
    'carried_to_year', (select f.year_be from public.budget_use_requests x join public.fiscal_years f on f.id = x.fiscal_year_id where x.id = v_u.carried_to_id),
    'carried_from_id', v_u.carried_from_id,
    'carried_from_year', (select f.year_be from public.budget_use_requests x join public.fiscal_years f on f.id = x.fiscal_year_id where x.id = v_u.carried_from_id),
    'carried_from_no', (select r.request_no from public.budget_use_requests x join public.requests r on r.id = x.request_id where x.id = v_u.carried_from_id),
    'created_at', v_u.created_at, 'is_mine', v_u.created_by = auth.uid(),
    'can_edit', public.can_edit_budget(v_u.org_unit_id));
end;
$$;

-- ทะเบียนคุม: เพิ่มรายการยกยอดผูกพันไปปีถัดไป (ลดยอดค้างเบิก ไม่เปลี่ยนคงเหลือ) และวงเงินที่ยกมาจากปีก่อน
create or replace function public.budget_ledger(p_item uuid, p_unit uuid)
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
           case
             when c.detail ? 'carry_from_year' then 'ยกยอดผูกพันมาจากปีงบประมาณ ' || (c.detail ->> 'carry_from_year')
             when c.action = 'create' then 'ตั้งวงเงิน'
             when c.action = 'import' then 'ตั้งวงเงิน (นำเข้าจาก Excel)'
             when c.action = 'edit' then 'แก้ไขวงเงิน'
             when c.action = 'transfer_in' then 'รับโอนจาก ' || coalesce(c.detail ->> 'other', '')
             when c.action = 'transfer_out' then 'โอนออกไป ' || coalesce(c.detail ->> 'other', '')
             else c.action end as descr,
           coalesce(c.detail ->> 'request_no', '') as ref,
           (coalesce(c.amount_after, 0) - coalesce(c.amount_before, 0))::numeric as rec, 0::numeric as com, 0::numeric as dis,
           0::numeric as car
    from public.budget_item_changes c
    where v_item.org_unit_id = p_unit and c.item_id = p_item
      and coalesce(c.amount_after, 0) <> coalesce(c.amount_before, 0)
      and c.action in ('create', 'import', 'edit', 'transfer_in', 'transfer_out')
    union all
    -- ได้รับจัดสรรจากหน่วยเหนือ
    select a.allocated_on, a.created_at, 'allocation_in',
           case when a.amount < 0 then 'ถูกปรับลดการจัดสรรจาก ' else 'ได้รับจัดสรรจาก ' end || fu.name || ' ครั้งที่ ' || a.round_no,
           a.reference_no, a.amount, 0, 0, 0
    from public.budget_allocations a join public.org_units fu on fu.id = a.from_unit_id
    where a.item_id = p_item and a.to_unit_id = p_unit and a.is_active
    union all
    -- จัดสรรต่อ
    select a.allocated_on, a.created_at, 'allocation_out',
           case when a.amount < 0 then 'ปรับลดการจัดสรรให้ ' else 'จัดสรรให้ ' end || coalesce(tu.name, pl.name, '') || ' ครั้งที่ ' || a.round_no,
           a.reference_no, -a.amount, 0, 0, 0
    from public.budget_allocations a
    left join public.org_units tu on tu.id = a.to_unit_id
    left join public.places pl on pl.id = a.to_place_id
    where a.item_id = p_item and a.from_unit_id = p_unit and a.is_active
    union all
    -- ผูกพัน
    select (u.approved_at at time zone 'Asia/Bangkok')::date, u.approved_at, 'commit',
           case when u.carried_from_id is not null then 'ผูกพันต่อจากปีก่อน: ' else 'ผูกพันตามคำขอใช้งบ: ' end || left(u.purpose, 120),
           coalesce(r.request_no, r0.request_no, ''), 0, u.committed_amount, 0, 0
    from public.budget_use_requests u
    left join public.requests r on r.id = u.request_id
    left join public.budget_use_requests u0 on u0.id = u.carried_from_id
    left join public.requests r0 on r0.id = u0.request_id
    where u.item_id = p_item and u.org_unit_id = p_unit and u.status in ('approved', 'closed', 'carried')
    union all
    -- เบิกจ่าย
    select d.paid_on, d.created_at, 'disburse',
           case when d.kind = 'payment' then 'เบิกจ่ายงวดที่ ' || d.installment_no || ' ' || d.payee
                else 'ปรับปรุงงวดที่ ' || d.installment_no || ': ' || left(d.reason, 120) end,
           concat_ws(' ', nullif(d.voucher_no, ''), '(' || coalesce(r.request_no, r0.request_no) || ')'), 0, 0, d.amount, 0
    from public.budget_disbursements d
    join public.budget_use_requests u on u.id = d.use_request_id
    left join public.requests r on r.id = u.request_id
    left join public.budget_use_requests u0 on u0.id = u.carried_from_id
    left join public.requests r0 on r0.id = u0.request_id
    where d.item_id = p_item and d.org_unit_id = p_unit
    union all
    -- คืนเงินเหลือจ่าย
    select (u.released_at at time zone 'Asia/Bangkok')::date, u.released_at, 'release',
           'คืนเงินเหลือจ่าย' || case when u.release_reason <> '' then ': ' || left(u.release_reason, 120) else '' end,
           coalesce(r.request_no, ''), 0, -u.released_amount, 0, 0
    from public.budget_use_requests u left join public.requests r on r.id = u.request_id
    where u.item_id = p_item and u.org_unit_id = p_unit and u.status = 'closed' and u.released_amount > 0
    union all
    -- ยกยอดผูกพันไปปีถัดไป (ยอดค้างเบิกย้ายไปปีใหม่ คงเหลือของปีนี้ไม่เปลี่ยน)
    select (u.carried_at at time zone 'Asia/Bangkok')::date, u.carried_at, 'carry',
           'ยกยอดผูกพันไปปีงบประมาณ ' || coalesce((select f.year_be::text from public.budget_use_requests x
                                                    join public.fiscal_years f on f.id = x.fiscal_year_id where x.id = u.carried_to_id), '')
             || ' ' || to_char(u.carried_amount, 'FM999,999,999,990.00') || ' บาท',
           coalesce(r.request_no, ''), 0, 0, 0, u.carried_amount
    from public.budget_use_requests u left join public.requests r on r.id = u.request_id
    where u.item_id = p_item and u.org_unit_id = p_unit and u.status = 'carried' and u.carried_amount > 0
  )
  select ev.d, ev.ts, ev.k, ev.descr, ev.ref, ev.rec::numeric(14,2), ev.com::numeric(14,2), ev.dis::numeric(14,2),
         (sum(ev.rec - ev.com) over w)::numeric(14,2),
         (sum(ev.com - ev.dis - ev.car) over w)::numeric(14,2)
  from ev
  window w as (order by ev.d, ev.ts, ev.k rows between unbounded preceding and current row)
  order by ev.d, ev.ts, ev.k;
end;
$$;

-- ---------------------------------------------------------------
-- 6) ฐานของแดชบอร์ดและรายงาน
--    ขอบเขต = หน่วยที่เลือก (+ หน่วยใต้สังกัดทุกชั้นเมื่อ p_sub) เฉพาะหน่วยที่ผู้ใช้ดูงบได้
--    ยอดรวมของขอบเขตตัดการจัดสรรภายในขอบเขตออก (ไม่นับซ้ำ):
--      received  = ยอดที่หน่วยได้รับ - ยอดที่ได้รับจากหน่วยในขอบเขตเดียวกัน
--      allocated = ยอดที่หน่วยจัดสรรออกไปนอกขอบเขต (สำนัก หรือหน่วยที่ไม่อยู่ในขอบเขต)
--      remaining = received - allocated - committed ; วงเงินที่ใช้เอง = received - allocated
-- ---------------------------------------------------------------
create function private.budget_scope_units(p_unit uuid, p_sub boolean)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p_unit where public.can_view_budget(p_unit)
  union
  select d.id from public.descendants_of(p_unit) d where p_sub and public.can_view_budget(d.id);
$$;

create function public.budget_scope_lines(p_year uuid, p_unit uuid, p_sub boolean default true)
returns table (
  org_unit_id uuid, unit_name text, item_id uuid, item_label text, category_name text, source_id uuid, source_name text,
  project_id uuid, project_name text, program_id uuid, program_name text, program_code text, owner_unit_id uuid,
  owner_unit_name text, sort_key text, received numeric, allocated numeric, committed numeric, disbursed numeric,
  remaining numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_units uuid[];
begin
  if not public.can_view_budget(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์ดูงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  v_units := array(select s.id from private.budget_scope_units(p_unit, coalesce(p_sub, true)) s);
  return query
  with pairs as (
    select i.org_unit_id as u, i.id as item
    from public.budget_items i
    where i.fiscal_year_id = p_year and i.kind = 'category' and i.is_active and i.org_unit_id = any (v_units)
    union
    select a.to_unit_id, a.item_id
    from public.budget_allocations a
    where a.fiscal_year_id = p_year and a.is_active and a.to_unit_id = any (v_units)
  ),
  vals as (
    select p.u, p.item,
           private.budget_received(p.item, p.u)
             - coalesce((select sum(a.amount) from public.budget_allocations a
                         where a.item_id = p.item and a.to_unit_id = p.u and a.is_active and a.from_unit_id = any (v_units)), 0) as rec,
           coalesce((select sum(a.amount) from public.budget_allocations a
                     where a.item_id = p.item and a.from_unit_id = p.u and a.is_active
                       and not coalesce(a.to_unit_id = any (v_units), false)), 0) as alloc,
           private.budget_committed(p.item, p.u) as com,
           private.budget_disbursed(p.item, p.u) as dis
    from pairs p
  )
  select v.u, ou.name, i.id, private.budget_item_label(i.id), c.name, s.id, s.name,
         pj.id, pj.name, pg.id, pg.name, pg.code, i.org_unit_id, own.name,
         lpad(pg.sort_order::text, 6, '0') || to_char(pg.created_at, 'YYYYMMDDHH24MISSUS') || '|'
           || lpad(pj.sort_order::text, 6, '0') || to_char(pj.created_at, 'YYYYMMDDHH24MISSUS') || '|'
           || lpad(i.sort_order::text, 6, '0') || to_char(i.created_at, 'YYYYMMDDHH24MISSUS'),
         v.rec::numeric(14,2), v.alloc::numeric(14,2), v.com::numeric(14,2), v.dis::numeric(14,2),
         (v.rec - v.alloc - v.com)::numeric(14,2)
  from vals v
  join public.budget_items i on i.id = v.item
  join public.budget_items pj on pj.id = i.parent_id
  join public.budget_items pg on pg.id = pj.parent_id
  join public.org_units ou on ou.id = v.u
  join public.org_units own on own.id = i.org_unit_id
  left join public.budget_categories c on c.id = i.category_id
  left join public.budget_sources s on s.id = i.source_id
  order by 15, ou.name;
end;
$$;

-- ลำดับเดือนในปีงบประมาณ (0 = ต.ค. ... 11 = ก.ย.) วันที่นอกปีถูกนับเข้าเดือนแรกหรือเดือนสุดท้าย
create function private.budget_month_index(p_starts date, p_day date)
returns integer
language sql
immutable
set search_path = public
as $$
  select least(11, greatest(0,
    (extract(year from p_day)::int * 12 + extract(month from p_day)::int)
    - (extract(year from p_starts)::int * 12 + extract(month from p_starts)::int)));
$$;

-- ยอดผูกพันสุทธิและเบิกจ่ายรายเดือนของขอบเขต (ผูกพันนับเดือนที่อนุมัติ หักคืนเงินในเดือนที่คืน)
create function public.budget_monthly(p_year uuid, p_unit uuid, p_sub boolean default true)
returns table (month_no integer, month_start date, committed numeric, disbursed numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_units uuid[];
  v_starts date;
begin
  if not public.can_view_budget(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์ดูงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  select f.starts_on into v_starts from public.fiscal_years f where f.id = p_year;
  if v_starts is null then
    raise exception 'ไม่พบปีงบประมาณ' using errcode = 'P0001';
  end if;
  v_units := array(select s.id from private.budget_scope_units(p_unit, coalesce(p_sub, true)) s);
  return query
  with ev as (
    select private.budget_month_index(v_starts, (u.approved_at at time zone 'Asia/Bangkok')::date) as m,
           u.committed_amount as com, 0::numeric as dis
    from public.budget_use_requests u
    where u.fiscal_year_id = p_year and u.org_unit_id = any (v_units) and u.status in ('approved', 'closed', 'carried')
    union all
    select private.budget_month_index(v_starts, (u.released_at at time zone 'Asia/Bangkok')::date), -u.released_amount, 0
    from public.budget_use_requests u
    where u.fiscal_year_id = p_year and u.org_unit_id = any (v_units) and u.status = 'closed' and u.released_amount > 0
    union all
    select private.budget_month_index(v_starts, d.paid_on), 0, d.amount
    from public.budget_disbursements d
    where d.fiscal_year_id = p_year and d.org_unit_id = any (v_units)
  )
  select g.m + 1, (v_starts + make_interval(months => g.m))::date,
         coalesce(sum(ev.com), 0)::numeric(14,2), coalesce(sum(ev.dis), 0)::numeric(14,2)
  from generate_series(0, 11) g(m)
  left join ev on ev.m = g.m
  group by g.m
  order by g.m;
end;
$$;

-- รายงานตามหน่วย: แถวของหน่วยที่เลือก (เฉพาะหน่วยนี้) + หน่วยใต้สังกัดชั้นถัดไป (รวมหน่วยใต้สังกัดของแต่ละหน่วย)
create function public.budget_unit_report(p_year uuid, p_unit uuid)
returns table (
  org_unit_id uuid, unit_name text, unit_level text, unit_code text, is_self boolean, has_children boolean,
  received numeric, allocated numeric, committed numeric, disbursed numeric, remaining numeric
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
  select u.id, u.name, u.level::text, u.code, true,
         exists (select 1 from public.org_units c where c.parent_id = u.id and public.can_view_budget(c.id)),
         coalesce(sum(l.received), 0)::numeric(14,2), coalesce(sum(l.allocated), 0)::numeric(14,2),
         coalesce(sum(l.committed), 0)::numeric(14,2), coalesce(sum(l.disbursed), 0)::numeric(14,2),
         coalesce(sum(l.remaining), 0)::numeric(14,2)
  from public.org_units u
  left join lateral public.budget_scope_lines(p_year, u.id, false) l on true
  where u.id = p_unit
  group by u.id, u.name, u.level, u.code
  union all
  select * from (
    select c.id, c.name, c.level::text, c.code, false,
           exists (select 1 from public.org_units g where g.parent_id = c.id and public.can_view_budget(g.id)),
           coalesce(sum(l.received), 0)::numeric(14,2), coalesce(sum(l.allocated), 0)::numeric(14,2),
           coalesce(sum(l.committed), 0)::numeric(14,2), coalesce(sum(l.disbursed), 0)::numeric(14,2),
           coalesce(sum(l.remaining), 0)::numeric(14,2)
    from public.org_units c
    left join lateral public.budget_scope_lines(p_year, c.id, true) l on true
    where c.parent_id = p_unit and public.can_view_budget(c.id)
    group by c.id, c.name, c.level, c.code
    having coalesce(sum(l.received), 0) <> 0 or coalesce(sum(l.committed), 0) <> 0 or coalesce(sum(l.disbursed), 0) <> 0
    order by c.name
  ) ch;
end;
$$;

-- รายละเอียดการเบิกจ่ายรายรายการของขอบเขต (ทุกงวดและรายการปรับปรุง)
create function public.budget_disbursement_report(p_year uuid, p_unit uuid, p_sub boolean default true, p_limit integer default 5000)
returns table (
  id uuid, paid_on date, unit_name text, item_path text, request_no text, purpose text, installment_no integer,
  kind text, payee text, voucher_no text, amount numeric, reason text, note text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_units uuid[];
begin
  if not public.can_view_budget(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์ดูงบประมาณของหน่วยนี้' using errcode = '42501';
  end if;
  v_units := array(select s.id from private.budget_scope_units(p_unit, coalesce(p_sub, true)) s);
  return query
  select d.id, d.paid_on, ou.name, private.budget_item_path(d.item_id), coalesce(r.request_no, r0.request_no, ''),
         u.purpose, d.installment_no, d.kind, d.payee, d.voucher_no, d.amount, d.reason, d.note
  from public.budget_disbursements d
  join public.budget_use_requests u on u.id = d.use_request_id
  join public.org_units ou on ou.id = d.org_unit_id
  left join public.requests r on r.id = u.request_id
  left join public.budget_use_requests u0 on u0.id = u.carried_from_id
  left join public.requests r0 on r0.id = u0.request_id
  where d.fiscal_year_id = p_year and d.org_unit_id = any (v_units)
  order by d.paid_on, d.created_at
  limit least(greatest(coalesce(p_limit, 5000), 1), 5000);
end;
$$;

-- คำขอที่ยังมียอดค้างเบิกของปี (ผู้ดูแลระบบเลือกยกไปปีถัดไปตอนปิดปี)
create function public.budget_close_candidates(p_year uuid)
returns table (
  id uuid, unit_name text, item_path text, request_no text, purpose text, committed numeric, disbursed numeric,
  outstanding numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'ปิดปีงบประมาณได้เฉพาะผู้ดูแลระบบ' using errcode = '42501';
  end if;
  return query
  select u.id, ou.name, private.budget_item_path(u.item_id), coalesce(r.request_no, r0.request_no, ''), u.purpose,
         u.committed_amount, coalesce(p.paid, 0)::numeric(14,2), (u.committed_amount - coalesce(p.paid, 0))::numeric(14,2)
  from public.budget_use_requests u
  join public.org_units ou on ou.id = u.org_unit_id
  left join public.requests r on r.id = u.request_id
  left join public.budget_use_requests u0 on u0.id = u.carried_from_id
  left join public.requests r0 on r0.id = u0.request_id
  left join lateral (select sum(d.amount) as paid from public.budget_disbursements d where d.use_request_id = u.id) p on true
  where u.fiscal_year_id = p_year and u.status = 'approved' and u.committed_amount - coalesce(p.paid, 0) > 0
  order by ou.name, u.created_at;
end;
$$;

-- สรุปยอดปิดปีรายหน่วย (เฉพาะหน่วยที่ดูงบได้)
create function public.budget_year_closing_summary(p_year uuid)
returns table (
  org_unit_id uuid, unit_name text, received numeric, allocated numeric, committed numeric, disbursed numeric,
  released numeric, carried numeric, remaining numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select c.org_unit_id, u.name, sum(c.received), sum(c.allocated), sum(c.committed), sum(c.disbursed),
         sum(c.released), sum(c.carried), sum(c.remaining)
  from public.budget_year_closings c
  join public.org_units u on u.id = c.org_unit_id
  where c.fiscal_year_id = p_year and public.can_view_budget(c.org_unit_id)
  group by c.org_unit_id, u.name
  order by u.name;
$$;

-- ---------------------------------------------------------------
-- 7) ปิดสิ้นปีงบประมาณ (ผู้ดูแลระบบ)
--    - ต้องไม่มีคำขอใช้งบหรือคำขอโอนที่ยังรอพิจารณา / ถูกส่งกลับ
--    - คำขอที่เลือก (p_carry): ยกยอดค้างเบิกไปปีถัดไป สร้างรายการกันเงินเหลื่อมปีของหน่วยที่ใช้เงิน
--      (แผนงานชื่อเดิม > "โครงการเดิม (กันเงินเหลื่อมปี พ.ศ.)" > หมวดรายจ่ายและแหล่งเงินเดิม) แล้วผูกพันต่อให้เบิกได้ทันที
--    - คำขอที่ไม่ได้เลือก: คืนเงินเหลือจ่ายอัตโนมัติ
--    - เก็บสรุปยอดรายหน่วยรายหมวดใน budget_year_closings แล้วปิดปีถาวร
-- ---------------------------------------------------------------
create function public.close_fiscal_year(p_year uuid, p_carry uuid[] default '{}', p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year public.fiscal_years%rowtype;
  v_next public.fiscal_years%rowtype;
  v_carry uuid[] := coalesce(p_carry, '{}');
  v_n integer;
  r record;
  v_out numeric;
  v_item public.budget_items%rowtype;
  v_proj public.budget_items%rowtype;
  v_prog public.budget_items%rowtype;
  v_new_prog uuid;
  v_new_proj uuid;
  v_new_cat uuid;
  v_cat_amount numeric;
  v_new_use uuid;
  v_released numeric := 0;
  v_carried numeric := 0;
  v_released_n integer := 0;
  v_carried_n integer := 0;
begin
  if not public.has_role('admin') then
    raise exception 'ปิดปีงบประมาณได้เฉพาะผู้ดูแลระบบ' using errcode = '42501';
  end if;
  select * into v_year from public.fiscal_years where id = p_year for update;
  if not found then
    raise exception 'ไม่พบปีงบประมาณ' using errcode = 'P0001';
  end if;
  if v_year.year_end_closed_at is not null then
    raise exception 'ปีงบประมาณ % ปิดสิ้นปีไปแล้ว', v_year.year_be using errcode = 'P0001';
  end if;
  select count(*) into v_n from public.budget_use_requests u
  where u.fiscal_year_id = p_year and u.status in ('pending', 'returned');
  if v_n > 0 then
    raise exception 'ยังมีคำขอใช้งบที่รอพิจารณาหรือถูกส่งกลับ % รายการ ต้องพิจารณาหรือยกเลิกก่อนปิดปี', v_n using errcode = 'P0001';
  end if;
  select count(*) into v_n from public.budget_transfers t
  where t.fiscal_year_id = p_year and t.status in ('pending', 'returned');
  if v_n > 0 then
    raise exception 'ยังมีคำขอโอนที่รอพิจารณาหรือถูกส่งกลับ % รายการ ต้องพิจารณาหรือยกเลิกก่อนปิดปี', v_n using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_carry) c(id)
             where not exists (select 1 from public.budget_use_requests u
                               where u.id = c.id and u.fiscal_year_id = p_year and u.status = 'approved')) then
    raise exception 'คำขอที่เลือกยกยอดต้องเป็นคำขอที่อนุมัติแล้วของปีนี้' using errcode = 'P0001';
  end if;
  if cardinality(v_carry) > 0 then
    select * into v_next from public.fiscal_years where year_be = v_year.year_be + 1 for update;
    if not found then
      raise exception 'ยังไม่มีปีงบประมาณ % ในระบบ เพิ่มปีก่อนยกยอด', v_year.year_be + 1 using errcode = 'P0001';
    end if;
    if v_next.status <> 'open' then
      raise exception 'ปีงบประมาณ % ปิดอยู่ ยกยอดไปไม่ได้', v_year.year_be + 1 using errcode = 'P0001';
    end if;
  end if;

  for r in
    select u.*, coalesce((select sum(d.amount) from public.budget_disbursements d where d.use_request_id = u.id), 0) as paid
    from public.budget_use_requests u
    where u.fiscal_year_id = p_year and u.status = 'approved'
    order by u.created_at
    for update of u
  loop
    v_out := r.committed_amount - r.paid;
    if r.id = any (v_carry) and v_out > 0 then
      select * into v_item from public.budget_items where id = r.item_id;
      select * into v_proj from public.budget_items where id = v_item.parent_id;
      select * into v_prog from public.budget_items where id = v_proj.parent_id;
      -- แผนงานชื่อเดิมของหน่วยที่ใช้เงินในปีถัดไป
      select i.id into v_new_prog from public.budget_items i
      where i.fiscal_year_id = v_next.id and i.org_unit_id = r.org_unit_id and i.kind = 'program' and i.is_active
        and lower(btrim(i.name)) = lower(btrim(v_prog.name));
      if v_new_prog is null then
        insert into public.budget_items (fiscal_year_id, org_unit_id, kind, name, code, note, carried_from_year)
        values (v_next.id, r.org_unit_id, 'program', v_prog.name, v_prog.code, '', v_year.year_be)
        returning id into v_new_prog;
        insert into public.budget_item_changes (item_id, action, amount_after, detail)
        values (v_new_prog, 'create', null, jsonb_build_object('label', v_prog.name, 'carry_from_year', v_year.year_be));
      end if;
      select i.id into v_new_proj from public.budget_items i
      where i.parent_id = v_new_prog and i.kind = 'project' and i.is_active
        and lower(btrim(i.name)) = lower(btrim(v_proj.name || ' (กันเงินเหลื่อมปี ' || v_year.year_be || ')'));
      if v_new_proj is null then
        insert into public.budget_items (fiscal_year_id, org_unit_id, parent_id, kind, name, code, note, carried_from_year)
        values (v_next.id, r.org_unit_id, v_new_prog, 'project', left(v_proj.name, 170) || ' (กันเงินเหลื่อมปี ' || v_year.year_be || ')',
                v_proj.code, '', v_year.year_be)
        returning id into v_new_proj;
        insert into public.budget_item_changes (item_id, action, amount_after, detail)
        values (v_new_proj, 'create', null, jsonb_build_object('label', v_proj.name, 'carry_from_year', v_year.year_be));
      end if;
      select i.id, i.amount into v_new_cat, v_cat_amount from public.budget_items i
      where i.parent_id = v_new_proj and i.kind = 'category' and i.is_active
        and i.category_id = v_item.category_id and i.source_id = v_item.source_id
      for update;
      if v_new_cat is null then
        insert into public.budget_items (fiscal_year_id, org_unit_id, parent_id, kind, category_id, source_id, amount, note, carried_from_year)
        values (v_next.id, r.org_unit_id, v_new_proj, 'category', v_item.category_id, v_item.source_id, v_out, '', v_year.year_be)
        returning id into v_new_cat;
        insert into public.budget_item_changes (item_id, action, amount_after, detail)
        values (v_new_cat, 'create', v_out,
                jsonb_build_object('label', private.budget_item_label(v_new_cat), 'carry_from_year', v_year.year_be,
                                   'request_no', (select request_no from public.requests where id = r.request_id)));
      else
        perform set_config('app.budget_transfer', '1', true);
        update public.budget_items set amount = amount + v_out where id = v_new_cat;
        perform set_config('app.budget_transfer', '', true);
        insert into public.budget_item_changes (item_id, action, amount_before, amount_after, detail)
        values (v_new_cat, 'edit', v_cat_amount, v_cat_amount + v_out,
                jsonb_build_object('carry_from_year', v_year.year_be,
                                   'request_no', (select request_no from public.requests where id = r.request_id)));
      end if;
      insert into public.budget_use_requests (fiscal_year_id, item_id, org_unit_id, purpose, lines, amount, status,
                                              committed_amount, approved_at, created_by, carried_from_id)
      values (v_next.id, v_new_cat, r.org_unit_id, r.purpose, r.lines, v_out, 'approved', v_out, now(), r.created_by, r.id)
      returning id into v_new_use;
      update public.budget_use_requests
         set status = 'carried', carried_amount = v_out, carried_at = now(), carried_to_id = v_new_use
       where id = r.id;
      perform public.notify_user(r.created_by, 'ยกยอดผูกพันไปปีงบประมาณ ' || (v_year.year_be + 1),
        coalesce((select request_no from public.requests where id = r.request_id), '') || ' ยอดค้างเบิก '
          || to_char(v_out, 'FM999,999,999,990.00') || ' บาท เบิกต่อได้ในปีงบประมาณ ' || (v_year.year_be + 1),
        '/app/budget/uses/' || v_new_use);
      v_carried := v_carried + v_out;
      v_carried_n := v_carried_n + 1;
      v_new_prog := null; v_new_proj := null; v_new_cat := null;
    else
      update public.budget_use_requests
         set status = 'closed', released_amount = v_out, released_at = now(), released_by = auth.uid(),
             release_reason = 'ปิดปีงบประมาณ ' || v_year.year_be
       where id = r.id;
      v_released := v_released + v_out;
      v_released_n := v_released_n + 1;
    end if;
  end loop;

  -- สรุปยอดปิดปี: ทุกหน่วยที่ถือหมวดรายจ่ายของปีนี้ (เจ้าของหรือได้รับจัดสรร) ในมุมมองของหน่วยนั้น
  insert into public.budget_year_closings (fiscal_year_id, org_unit_id, item_id, received, allocated, committed, disbursed,
                                           released, carried, remaining)
  select p_year, x.u, x.item,
         private.budget_received(x.item, x.u), private.budget_out(x.item, x.u), private.budget_committed(x.item, x.u),
         private.budget_disbursed(x.item, x.u),
         coalesce((select sum(q.released_amount) from public.budget_use_requests q
                   where q.item_id = x.item and q.org_unit_id = x.u and q.status = 'closed'), 0),
         coalesce((select sum(q.carried_amount) from public.budget_use_requests q
                   where q.item_id = x.item and q.org_unit_id = x.u and q.status = 'carried'), 0),
         private.budget_received(x.item, x.u) - private.budget_used(x.item, x.u)
  from (
    select i.org_unit_id as u, i.id as item from public.budget_items i
    where i.fiscal_year_id = p_year and i.kind = 'category' and i.is_active
    union
    select a.to_unit_id, a.item_id from public.budget_allocations a
    where a.fiscal_year_id = p_year and a.is_active and a.to_unit_id is not null
  ) x;

  perform set_config('app.budget_year_close', '1', true);
  update public.fiscal_years
     set status = 'closed', year_end_closed_at = now(), year_end_closed_by = auth.uid(),
         year_end_note = left(btrim(coalesce(p_note, '')), 1000)
   where id = p_year;
  perform set_config('app.budget_year_close', '', true);

  return jsonb_build_object('released', v_released, 'released_count', v_released_n,
                            'carried', v_carried, 'carried_count', v_carried_n,
                            'next_year', case when v_carried_n > 0 then v_year.year_be + 1 end);
end;
$$;

-- ---------------------------------------------------------------
-- 8) แจ้งเตือนงบประมาณ (เรียกเมื่อมีผู้เปิดแดชบอร์ดหรือหน้างบประมาณ ไม่มีตัวตั้งเวลา เรียกซ้ำได้)
--    ก) คำของบประมาณ (ใช้งบ โอน) ค้างพิจารณาเกิน budget_request_overdue_days วัน: แจ้งผู้พิจารณาของขั้นนั้น ไม่เกินวันละครั้ง
--    ข) หมวดรายจ่ายเหลือน้อยกว่า budget_low_balance_percent ของวงเงินที่หน่วยใช้เอง: แจ้งผู้มีสิทธิ์แก้ไขงบของหน่วย
--       (บทบาทที่ตั้งขอบเขต หน่วยตน หรือ หน่วยตนและใต้สังกัด ไม่รวมบทบาทที่เห็นทุกเขต เช่น ผู้ดูแลระบบ) ครั้งเดียวต่อรายการต่อหน่วยต่อปี
-- ---------------------------------------------------------------
create function public.remind_budget_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, coalesce((select s.value_int from public.app_settings s where s.key = 'budget_request_overdue_days'), 7));
  v_pct integer := least(100, greatest(1, coalesce((select s.value_int from public.app_settings s where s.key = 'budget_low_balance_percent'), 10)));
  v_count integer := 0;
  r record;
begin
  if auth.uid() is null then
    return 0;
  end if;
  for r in
    update public.request_steps s
       set overdue_notified_at = now()
      from public.requests q
     where q.id = s.request_id
       and q.type_key in ('budget_use', 'budget_transfer')
       and q.status = 'pending' and s.status = 'pending' and s.step_no = q.current_step
       and s.pending_since + make_interval(days => v_days) < now()
       and (s.overdue_notified_at is null or s.overdue_notified_at < now() - interval '1 day')
    returning s.id, s.org_unit_id, s.level, s.pending_since, q.id as request_id, q.request_no, q.title,
              q.type_key, q.requester_id
  loop
    v_count := v_count + 1;
    insert into public.notifications (user_id, title, body, link)
    select distinct ur.user_id,
           'คำของบประมาณค้างพิจารณาเกิน ' || v_days || ' วัน',
           r.request_no || ' ' || r.title || ' (รอพิจารณามาแล้ว '
             || ((now() at time zone 'Asia/Bangkok')::date - (r.pending_since at time zone 'Asia/Bangkok')::date) || ' วัน)',
           '/app/approvals/' || r.request_id
    from public.request_types t
    join public.user_roles ur
      on ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
     and (
       (r.level = 'central' and ur.role_key = any (t.central_roles))
       or (r.level <> 'central' and ur.org_unit_id = r.org_unit_id and ur.role_key = any (t.decider_roles))
     )
    join public.profiles p on p.id = ur.user_id and p.status = 'active'
    where t.key = r.type_key and ur.user_id <> r.requester_id;
  end loop;

  for r in
    with pairs as (
      select i.fiscal_year_id as y, i.org_unit_id as u, i.id as item
      from public.budget_items i join public.fiscal_years f on f.id = i.fiscal_year_id
      where f.status = 'open' and i.kind = 'category' and i.is_active
      union
      select a.fiscal_year_id, a.to_unit_id, a.item_id
      from public.budget_allocations a join public.fiscal_years f on f.id = a.fiscal_year_id
      where f.status = 'open' and a.is_active and a.to_unit_id is not null
    ),
    vals as (
      select p.y, p.u, p.item,
             private.budget_received(p.item, p.u) - private.budget_out(p.item, p.u) as base,
             private.budget_committed(p.item, p.u) as com
      from pairs p
      where not exists (select 1 from public.budget_alerts b
                        where b.fiscal_year_id = p.y and b.org_unit_id = p.u and b.item_id = p.item and b.kind = 'low_balance')
    )
    select v.*, round((v.base - v.com) * 100 / v.base, 2) as pct
    from vals v
    where v.base > 0 and (v.base - v.com) * 100 < v.base * v_pct
  loop
    insert into public.budget_alerts (fiscal_year_id, org_unit_id, item_id, kind, percent_left)
    values (r.y, r.u, r.item, 'low_balance', r.pct)
    on conflict do nothing;
    if not found then
      continue;
    end if;
    v_count := v_count + 1;
    insert into public.notifications (user_id, title, body, link)
    select distinct ur.user_id,
           'งบประมาณเหลือน้อยกว่าร้อยละ ' || v_pct,
           private.budget_item_path(r.item) || ' ของ ' || (select name from public.org_units where id = r.u)
             || ' คงเหลือ ' || to_char(r.base - r.com, 'FM999,999,999,990.00') || ' บาท (ร้อยละ '
             || to_char(r.pct, 'FM990.00') || ')',
           '/app/budget/plan/items/' || r.item || '?unit=' || r.u
    from public.user_roles ur
    join public.roles ro on ro.key = ur.role_key
    join public.profiles p on p.id = ur.user_id and p.status = 'active'
    where ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
      and ((ro.budget_edit = 'own' and ur.org_unit_id = r.u)
           or (ro.budget_edit = 'subtree' and ur.org_unit_id in (select a.id from public.ancestors_or_self(r.u) a)));
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------
-- 9) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke all on function private.budget_scope_units(uuid, boolean) from public, anon, authenticated;
revoke all on function private.budget_month_index(date, date) from public, anon, authenticated;
revoke execute on function public.budget_scope_lines(uuid, uuid, boolean) from public, anon;
revoke execute on function public.budget_monthly(uuid, uuid, boolean) from public, anon;
revoke execute on function public.budget_unit_report(uuid, uuid) from public, anon;
revoke execute on function public.budget_disbursement_report(uuid, uuid, boolean, integer) from public, anon;
revoke execute on function public.budget_close_candidates(uuid) from public, anon;
revoke execute on function public.budget_year_closing_summary(uuid) from public, anon;
revoke execute on function public.close_fiscal_year(uuid, uuid[], text) from public, anon;
revoke execute on function public.remind_budget_alerts() from public, anon;
grant execute on function public.budget_scope_lines(uuid, uuid, boolean) to authenticated;
grant execute on function public.budget_monthly(uuid, uuid, boolean) to authenticated;
grant execute on function public.budget_unit_report(uuid, uuid) to authenticated;
grant execute on function public.budget_disbursement_report(uuid, uuid, boolean, integer) to authenticated;
grant execute on function public.budget_close_candidates(uuid) to authenticated;
grant execute on function public.budget_year_closing_summary(uuid) to authenticated;
grant execute on function public.close_fiscal_year(uuid, uuid[], text) to authenticated;
grant execute on function public.remind_budget_alerts() to authenticated;
