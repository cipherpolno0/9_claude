-- บทที่ 15 (1/2): คำขอจัดตั้งและยุบสำนักเรียน สำนักศาสนศึกษา (ระบบที่ 4) ใช้เครื่องอนุมัติกลางจากบทที่ 4
--   ชนิดคำขอ 2 ชนิด, กำหนดเวลาพิจารณาต่อชั้น, รายการเอกสารที่ผู้ดูแลระบบตั้งเอง, ด่านกันการแก้ข้อมูลคำขอนอกหน้าคำขอ

-- ---------------------------------------------------------------
-- 1) ชนิดคำขอ และค่าตั้ง
--    เส้นทาง: เขตคณะสงฆ์ของวัดที่ตั้ง ขึ้นไปทุกชั้น ตำบล > อำเภอ > จังหวัด > ภาค > ส่วนกลาง
--    ตำบลถึงภาค: เจ้าคณะหรือรองเจ้าคณะพิจารณา  ส่วนกลาง: เจ้าหน้าที่ส่วนกลาง เป็นขั้นสุดท้าย
-- ---------------------------------------------------------------
insert into public.request_types
  (key, code, name, route_levels, start_at_own_unit, decider_roles, central_roles, max_steps, is_personnel)
values
  ('samnak_establish', 'ESTAB', 'ขอจัดตั้งสำนักเรียน-สำนักศาสนศึกษา',
   '{subdistrict,district,province,region,central}', true, '{chief,deputy_chief}', '{central_staff}', null, false),
  ('samnak_dissolve', 'DISSOLVE', 'ขอยุบสำนักเรียน-สำนักศาสนศึกษา',
   '{subdistrict,district,province,region,central}', true, '{chief,deputy_chief}', '{central_staff}', null, false);

insert into public.app_settings (key, value_int, description) values
  ('place_request_step_days', 15, 'คำขอจัดตั้ง-ยุบสำนัก: กำหนดเวลาพิจารณาต่อชั้น (วัน) เกินกำหนดจะขึ้นป้ายเตือนและแจ้งเตือนผู้พิจารณา');

-- คำขอของระบบที่ 4 (แสดงในหน้า /app/requests)
create function public.is_place_request_type(p_type_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type_key in ('samnak_establish', 'samnak_dissolve');
$$;
revoke execute on function public.is_place_request_type(text) from public, anon;
grant execute on function public.is_place_request_type(text) to authenticated;

-- ---------------------------------------------------------------
-- 2) เครื่องอนุมัติกลาง: เวลาที่ขั้นเริ่มรอพิจารณา และเวลาที่แจ้งเตือนเกินกำหนดครั้งล่าสุด
-- ---------------------------------------------------------------
alter table public.request_steps
  add column pending_since timestamptz,
  add column overdue_notified_at timestamptz;
comment on column public.request_steps.pending_since is 'เวลาที่ขั้นนี้เริ่มรอพิจารณา (ระบบตั้งให้ทุกครั้งที่สถานะเปลี่ยนเป็น pending)';
comment on column public.request_steps.overdue_notified_at is 'เวลาที่แจ้งเตือนผู้พิจารณาว่าเกินกำหนดครั้งล่าสุด';
update public.request_steps set pending_since = updated_at where status = 'pending';

create function public.request_steps_mark_pending()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    new.pending_since := now();
    new.overdue_notified_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.request_steps_mark_pending() from public, anon, authenticated;
create trigger request_steps_mark_pending before insert or update of status on public.request_steps
  for each row execute function public.request_steps_mark_pending();

-- งานรอพิจารณา: เวลาที่เริ่มรอใช้ pending_since (เดิมใช้ updated_at ซึ่งเปลี่ยนเมื่อมีการแจ้งเตือนเกินกำหนด)
create or replace function public.my_pending_requests()
returns table (
  request_id uuid, request_no text, type_name text, title text,
  org_unit_name text, requester_name text, submitted_at timestamptz,
  step_no integer, step_unit_name text, waiting_since timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.request_no, t.name, r.title, u.name,
         btrim(concat_ws(' ', nullif(p.title_prefix, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, ''))),
         r.submitted_at, s.step_no, su.name, coalesce(s.pending_since, s.updated_at)
  from public.request_steps s
  join public.requests r on r.id = s.request_id
  join public.request_types t on t.key = r.type_key
  join public.org_units u on u.id = r.org_unit_id
  join public.org_units su on su.id = s.org_unit_id
  join public.profiles p on p.id = r.requester_id
  where s.status = 'pending' and r.status = 'pending' and public.can_decide_step(s.id)
  order by coalesce(s.pending_since, s.updated_at);
$$;

-- ---------------------------------------------------------------
-- 3) request_document_types: รายการเอกสารแนบของแต่ละชนิดคำขอ ผู้ดูแลระบบตั้งเอง (เริ่มต้นว่าง)
-- ---------------------------------------------------------------
create table public.request_document_types (
  id           uuid primary key default gen_random_uuid(),
  type_key     text not null references public.request_types (key),
  name         text not null check (length(btrim(name)) > 0 and length(name) <= 200),
  is_required  boolean not null default true,            -- บังคับ: ถ้ายังไม่แนบ ผู้พิจารณาเห็นชอบไม่ได้
  sort_order   integer not null default 0,
  is_active    boolean not null default true,            -- ปิดใช้งานแทนการลบ
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint request_document_types_name unique (type_key, name)
);
comment on table public.request_document_types is 'รายการเอกสารแนบของแต่ละชนิดคำขอ ผู้ดูแลระบบเพิ่มและแก้ไขได้ รายการที่บังคับต้องแนบก่อนผู้พิจารณาจึงเห็นชอบได้';
create index request_document_types_type_idx on public.request_document_types (type_key, sort_order);

create trigger request_document_types_set_updated_at before update on public.request_document_types
  for each row execute function public.set_updated_at();
create trigger request_document_types_audit after insert or update or delete on public.request_document_types
  for each row execute function public.audit_row_change();

alter table public.request_document_types enable row level security;
revoke all on public.request_document_types from anon;
revoke delete, truncate on public.request_document_types from authenticated;
create policy request_document_types_read on public.request_document_types
  for select to authenticated using (true);
create policy request_document_types_admin_insert on public.request_document_types
  for insert to authenticated with check (public.has_role('admin'));
create policy request_document_types_admin_update on public.request_document_types
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- ไฟล์แนบของคำขอ: ระบุได้ว่าเป็นเอกสารรายการใด (ว่าง = เอกสารอื่น ๆ)
alter table public.attachments
  add column doc_type_id uuid references public.request_document_types (id);
comment on column public.attachments.doc_type_id is 'รายการเอกสารของคำขอที่ไฟล์นี้แนบให้ (ว่าง = ไฟล์แนบทั่วไป)';
create index attachments_doc_type_idx on public.attachments (doc_type_id) where doc_type_id is not null;

create function public.attachments_doc_type_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.doc_type_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.doc_type_id is not distinct from old.doc_type_id then
    return new;
  end if;
  if new.entity_table <> 'requests' or not exists (
    select 1
    from public.requests r
    join public.request_document_types d on d.type_key = r.type_key
    where r.id::text = new.entity_id and d.id = new.doc_type_id
  ) then
    raise exception 'รายการเอกสารนี้ไม่ใช่ของคำขอชนิดนี้' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.attachments_doc_type_check() from public, anon, authenticated;
create trigger attachments_doc_type_check before insert or update of doc_type_id on public.attachments
  for each row execute function public.attachments_doc_type_check();

-- ---------------------------------------------------------------
-- 4) ด่านกันข้อมูล
--    ก) คำขอจัดตั้ง-ยุบ ต้องยื่นและแก้ไขผ่าน submit_place_request / resubmit_place_request เท่านั้น
--       (ฟังก์ชันชุดนั้นตั้งค่า app.place_request = 1 ไว้ในรายการเดียวกัน)
--    ข) สำนักเรียนและสำนักศาสนศึกษา เปลี่ยนสถานะเป็น ยุบ ได้เมื่อคำขอยุบได้รับอนุมัติเท่านั้น (ผู้ดูแลระบบแก้ตรงได้)
-- ---------------------------------------------------------------
create function public.requests_guard_place_request()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_place_request_type(new.type_key)
     and coalesce(current_setting('app.place_request', true), '') <> '1' then
    raise exception 'คำขอจัดตั้งและยุบสำนัก ต้องยื่นและแก้ไขจากหน้า คำขอ เท่านั้น' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.requests_guard_place_request() from public, anon, authenticated;
create trigger requests_guard_place_request before insert or update of payload, title, type_key on public.requests
  for each row execute function public.requests_guard_place_request();

create function public.places_dissolve_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.place_type in ('samnak_rian', 'samnak_sasanasuksa')
     and new.status = 'dissolved' and old.status <> 'dissolved'
     and coalesce(current_setting('app.place_request', true), '') <> '1'
     and not public.has_role('admin') then
    raise exception 'การยุบสำนักเรียนและสำนักศาสนศึกษา ต้องยื่นคำขอยุบที่เมนู คำขอ' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.places_dissolve_guard() from public, anon, authenticated;
create trigger places_dissolve_guard before update of status on public.places
  for each row execute function public.places_dissolve_guard();
