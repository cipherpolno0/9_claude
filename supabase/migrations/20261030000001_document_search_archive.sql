-- บทที่ 29: ค้นหา ติดตาม และเชื่อมกับระบบอื่น (ระบบที่ 8)
-- 1) ค้นหาหนังสือ (docs_search) รวมเนื้อความ (ไม่ค้นเนื้อความของหนังสือลับ) และเลือกรวมคลังเก็บได้
-- 2) ติดตามหนังสือ: document_detail เพิ่มข้อมูลปิดเรื่อง ประวัติปิด/เปิด และเวลาของเส้นทางที่ส่งมาถึง (หน้าเว็บสร้างเส้นเวลาเอง)
-- 3) document_request_links = หนังสือ <-> คำขอของระบบที่ 1, 4, 6, 7 (เห็นเฉพาะเมื่อเห็นทั้งหนังสือและคำขอ)
-- 4) คำขอของระบบที่ 4 อนุมัติหรือไม่อนุมัติขั้นสุดท้าย = สร้างร่างหนังสือแจ้งผลที่หน่วยผู้พิจารณาขั้นสุดท้าย ถึงผู้ยื่น
-- 5) รายงาน: ทะเบียนรับ-ส่งรายเดือน / หนังสือค้างดำเนินการ / เวลาเฉลี่ยจากลงรับถึงปิดเรื่องต่อหน่วย (ปีงบประมาณ)
-- 6) จัดเก็บ: อายุการเก็บตามชนิดหนังสือ (ผู้ดูแลระบบกรอกเอง เริ่มว่าง) ปิดเรื่อง = ย้ายเข้าคลังเก็บ เปิดเรื่องใหม่ต้องมีเหตุผล
-- ผู้สั่งงานเลือก: อายุการเก็บผู้ดูแลระบบกรอกเอง / เจ้าหน้าที่กดปิดเรื่องเอง / ร่างแจ้งผลอยู่ที่หน่วยที่อนุมัติขั้นสุดท้าย
--   / สร้างร่างทั้งกรณีอนุมัติและไม่อนุมัติ

-- ---------------------------------------------------------------
-- 0) ตัวช่วย
-- ---------------------------------------------------------------
create function private.doc_thai_date(p_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_date is null then '' else
    extract(day from p_date)::integer || ' '
    || (array['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
              'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'])[extract(month from p_date)::integer]
    || ' ' || (extract(year from p_date)::integer + 543) end;
$$;

-- วันที่ตามเวลาประเทศไทยของเวลาบันทึก
create function private.doc_bkk_date(p_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Bangkok')::date;
$$;

-- เห็นคำขอ: ต้องตรงกับ policy requests_read (แก้ที่ใดให้แก้อีกที่ด้วย)
create function private.request_visible(r public.requests)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select r.requester_id = auth.uid() or case
    when r.type_key in ('budget_transfer', 'budget_use') then public.can_view_budget(r.org_unit_id) or public.is_request_decider(r.id)
    when r.type_key in ('requisition', 'asset_disposal') then public.can_view_inventory(r.org_unit_id) or public.is_request_decider(r.id)
    when public.is_personnel_request(r.type_key) then
      public.can_view_personnel(r.org_unit_id) or public.can_view_request_steps(r.id) or public.is_request_subject(r.payload)
    else public.can_access(r.org_unit_id)
  end;
$$;

-- คำขอที่อ้างอิงหนังสือได้: ระบบที่ 1 (บุคลากร) 4 (สถานที่ สนามสอบ) 6 (งบประมาณ) 7 (พัสดุ)
create function private.doc_linkable_request_type(p_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type in (
    'profile_edit', 'transfer', 'resign', 'death_notice', 'disrobe_notice', 'other_exit_notice',
    'samnak_establish', 'samnak_dissolve', 'venue_open', 'venue_close', 'venue_move',
    'budget_transfer', 'budget_use',
    'requisition', 'asset_disposal');
$$;

-- ---------------------------------------------------------------
-- 1) อายุการเก็บตามชนิดหนังสือ (ผู้ดูแลระบบกรอกเอง เริ่มว่าง: ไม่มีแถว = ไม่กำหนด)
-- ---------------------------------------------------------------
create table public.doc_retention_rules (
  kind        text primary key check (kind in ('external', 'internal', 'order', 'announcement', 'circular')),
  years       integer check (years is null or years between 1 and 100),
  note        text not null default '' check (length(note) <= 500),
  updated_by  uuid default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.doc_retention_rules is 'อายุการเก็บหนังสือตามชนิด (ปี นับจากวันปิดเรื่อง ว่าง = ไม่กำหนด) ผู้ดูแลระบบกรอกตามระเบียบ';
create trigger doc_retention_rules_set_updated_at before update on public.doc_retention_rules
  for each row execute function public.set_updated_at();
create trigger doc_retention_rules_audit after insert or update or delete on public.doc_retention_rules
  for each row execute function public.audit_row_change();
alter table public.doc_retention_rules enable row level security;
create policy doc_retention_rules_read on public.doc_retention_rules for select to authenticated using (true);
create policy doc_retention_rules_insert on public.doc_retention_rules for insert to authenticated
  with check (public.has_role('admin'));
create policy doc_retention_rules_update on public.doc_retention_rules for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.doc_retention_rules from anon;
revoke delete, truncate on public.doc_retention_rules from authenticated;
grant select, insert, update on public.doc_retention_rules to authenticated;

-- ---------------------------------------------------------------
-- 2) ปิดเรื่อง (คลังเก็บ) และประวัติปิด/เปิดเรื่อง
-- ---------------------------------------------------------------
alter table public.documents
  add column closed_at timestamptz,
  add column closed_by uuid references public.profiles (id),
  add column close_note text check (close_note is null or length(close_note) <= 1000),
  add constraint documents_closed_status check (closed_at is null or status in ('sent', 'received'));
comment on column public.documents.closed_at is 'ปิดเรื่องแล้ว = อยู่ในคลังเก็บ (ไม่แสดงในแท็บทะเบียนรับ/ส่ง แก้ไขหรือสั่งการไม่ได้จนกว่าจะเปิดเรื่องใหม่)';
create index documents_closed_idx on public.documents (org_unit_id, closed_at) where closed_at is not null;

create table public.document_close_events (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id),
  action       text not null check (action in ('close', 'reopen')),
  note         text not null default '' check (length(note) <= 1000),
  actor_id     uuid default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.document_close_events is 'ประวัติปิดเรื่องและเปิดเรื่องใหม่ของหนังสือ (ระบบเขียนเท่านั้น)';
create index document_close_events_doc_idx on public.document_close_events (document_id, created_at);
create trigger document_close_events_set_updated_at before update on public.document_close_events
  for each row execute function public.set_updated_at();
create trigger document_close_events_audit after insert or update or delete on public.document_close_events
  for each row execute function public.audit_row_change();
alter table public.document_close_events enable row level security;
create policy document_close_events_read on public.document_close_events for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id));
revoke all on public.document_close_events from anon;
revoke insert, update, delete, truncate on public.document_close_events from authenticated;
grant select on public.document_close_events to authenticated;

-- วันครบอายุการเก็บ (ว่าง = ยังไม่ปิดเรื่อง หรือชนิดนี้ยังไม่กำหนดอายุ)
create function private.doc_retain_until(d public.documents)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select case when d.closed_at is null then null
              else (private.doc_bkk_date(d.closed_at) + make_interval(years => r.years))::date end
  from (select 1) x
  left join public.doc_retention_rules r on r.kind = d.kind and r.years is not null;
$$;

-- ล็อกหนังสือ (บทที่ 27, 28) เพิ่ม: หนังสือที่ปิดเรื่องแล้วแก้ ส่ง ยกเลิก ส่งต่อ เตือน ไม่ได้
create or replace function private.doc_lock(p_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
begin
  select * into v from public.documents where id = p_id for update;
  if not found or not private.doc_visible(v) then
    raise exception 'ไม่พบหนังสือ หรือท่านไม่มีสิทธิ์เห็นหนังสือนี้' using errcode = 'P0001';
  end if;
  if not public.can_edit_docs(v.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์ลงทะเบียนหนังสือของหน่วยนี้' using errcode = '42501';
  end if;
  if v.closed_at is not null then
    raise exception 'หนังสือนี้ปิดเรื่องแล้ว (อยู่ในคลังเก็บ) ต้องเปิดเรื่องใหม่ก่อน' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

create or replace function private.doc_lock_visible(p_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
begin
  select * into v from public.documents where id = p_id for update;
  if not found or not private.doc_visible(v) then
    raise exception 'ไม่พบหนังสือ หรือท่านไม่มีสิทธิ์เห็นหนังสือนี้' using errcode = 'P0001';
  end if;
  if v.status = 'cancelled' then
    raise exception 'หนังสือนี้ยกเลิกแล้ว' using errcode = 'P0001';
  end if;
  if v.closed_at is not null then
    raise exception 'หนังสือนี้ปิดเรื่องแล้ว (อยู่ในคลังเก็บ) ต้องเปิดเรื่องใหม่ก่อน' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- งานภายในที่ยังค้าง (เสนอรอสั่งการ มอบหมายรอรายงานผล) ต้องจบก่อนปิดเรื่อง
create function private.doc_open_work(p_doc uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.document_routes r
  where r.document_id = p_doc and r.action in ('propose', 'act') and r.status in ('pending', 'read');
$$;

-- ปิดเรื่อง: ผู้ลงทะเบียนของหน่วย หนังสือส่งที่ส่งแล้ว หรือหนังสือรับที่ลงรับแล้ว
create function public.close_document(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
  v_open integer;
begin
  v := private.doc_lock(p_id);
  if v.status not in ('sent', 'received') then
    raise exception 'ปิดเรื่องได้เฉพาะหนังสือส่งที่ส่งแล้ว หรือหนังสือรับที่ลงรับแล้ว' using errcode = 'P0001';
  end if;
  v_open := private.doc_open_work(v.id);
  if v_open > 0 then
    raise exception 'ยังมีงานที่เสนอหรือมอบหมายค้างอยู่ % รายการ ต้องดำเนินการให้จบ (หรือยกเลิก) ก่อนปิดเรื่อง', v_open
      using errcode = 'P0001';
  end if;
  update public.documents
     set closed_at = now(), closed_by = auth.uid(), close_note = nullif(left(btrim(coalesce(p_note, '')), 1000), '')
   where id = v.id;
  insert into public.document_close_events (document_id, action, note)
  values (v.id, 'close', left(btrim(coalesce(p_note, '')), 1000));
end;
$$;

-- เปิดเรื่องใหม่ (ออกจากคลังเก็บ) ต้องมีเหตุผลอย่างน้อย 3 ตัวอักษร
create function public.reopen_document(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
begin
  select * into v from public.documents where id = p_id for update;
  if not found or not private.doc_visible(v) then
    raise exception 'ไม่พบหนังสือ หรือท่านไม่มีสิทธิ์เห็นหนังสือนี้' using errcode = 'P0001';
  end if;
  if not public.can_edit_docs(v.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์ลงทะเบียนหนังสือของหน่วยนี้' using errcode = '42501';
  end if;
  if v.closed_at is null then
    raise exception 'หนังสือนี้ยังไม่ได้ปิดเรื่อง' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'กรุณาระบุเหตุผลที่เปิดเรื่องใหม่ (อย่างน้อย 3 ตัวอักษร)' using errcode = 'P0001';
  end if;
  update public.documents set closed_at = null, closed_by = null, close_note = null where id = v.id;
  insert into public.document_close_events (document_id, action, note)
  values (v.id, 'reopen', left(btrim(p_reason), 1000));
end;
$$;

-- ทะเบียน (บทที่ 28) เพิ่ม: แท็บรับ/ส่งไม่แสดงหนังสือที่ปิดเรื่องแล้ว (ดูที่แท็บคลังเก็บ)
create or replace function public.document_rows(
  p_unit uuid, p_tab text, p_year integer, p_kind text, p_urgency text, p_status text,
  p_q text, p_sort text, p_dir text, p_limit integer, p_offset integer)
returns table (
  id uuid, kind text, status text, series text, number_year integer, seq_no integer, doc_no text, doc_date date,
  from_text text, to_text text, subject text, urgency text, classification text,
  received_at timestamptz, issued_at timestamptz, sent_at timestamptz, updated_at timestamptz,
  is_copy boolean, delivery_total integer, delivery_received integer, attachment_count integer, masked boolean,
  total_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select d.*, private.doc_visible(d) as vis
    from public.documents d
    where public.can_view_docs(p_unit) and d.org_unit_id = p_unit and d.is_active
      and case p_tab
            when 'receive' then d.direction = 'receive' and d.number_year = p_year and d.closed_at is null
            when 'send' then d.direction = 'send' and d.status <> 'draft' and d.number_year = p_year and d.closed_at is null
            when 'draft' then d.status = 'draft'
            else false
          end
      and (coalesce(p_kind, '') = '' or d.kind = p_kind)
      and (coalesce(p_urgency, '') = '' or d.urgency = p_urgency)
      and (coalesce(p_status, '') = '' or d.status = p_status)
  ),
  shown as (
    select b.*, count(*) over () as total
    from base b
    where coalesce(p_q, '') = ''
       or b.doc_no ilike '%' || p_q || '%'
       or (b.vis and (b.subject ilike '%' || p_q || '%' or b.from_text ilike '%' || p_q || '%' or b.to_text ilike '%' || p_q || '%'))
  )
  select s.id, s.kind, s.status, s.series, s.number_year, s.seq_no, s.doc_no, s.doc_date,
         case when s.vis then s.from_text else '' end,
         case when s.vis then s.to_text else '' end,
         case when s.vis then s.subject else '' end,
         s.urgency, s.classification, s.received_at, s.issued_at, s.sent_at, s.updated_at,
         s.source_document_id is not null,
         (select count(*)::integer from public.document_routes x where x.document_id = s.id and x.action = 'forward' and x.status <> 'cancelled'),
         (select count(*)::integer from public.document_routes x where x.document_id = s.id and x.action = 'forward' and x.status = 'received'),
         case when s.vis then (select count(*)::integer from public.attachments a
                               where a.entity_table = 'documents' and a.entity_id = s.id::text and a.is_active) else 0 end,
         not s.vis,
         s.total
  from shown s
  order by
    case when p_sort = 'no' and p_dir = 'asc' then s.seq_no end asc nulls last,
    case when p_sort = 'no' and p_dir <> 'asc' then s.seq_no end desc nulls last,
    case when p_sort = 'date' and p_dir = 'asc' then s.doc_date end asc nulls last,
    case when p_sort = 'date' and p_dir <> 'asc' then s.doc_date end desc nulls last,
    case when p_sort = 'subject' and p_dir = 'asc' then case when s.vis then s.subject end end asc nulls last,
    case when p_sort = 'subject' and p_dir <> 'asc' then case when s.vis then s.subject end end desc nulls last,
    s.seq_no desc nulls last, s.updated_at desc
  limit greatest(least(coalesce(p_limit, 10), 5000), 1) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- คลังเก็บของหน่วย (ทุกปี) p_expired = เฉพาะที่ครบอายุการเก็บแล้ว
create function public.document_archive_rows(
  p_unit uuid, p_kind text, p_direction text, p_expired boolean,
  p_q text, p_sort text, p_dir text, p_limit integer, p_offset integer)
returns table (
  id uuid, direction text, kind text, status text, series text, number_year integer, seq_no integer, doc_no text,
  doc_date date, from_text text, to_text text, subject text, urgency text, classification text,
  received_at timestamptz, closed_at timestamptz, closed_by_name text, close_note text,
  retention_years integer, retain_until date, masked boolean, total_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select d.*, private.doc_visible(d) as vis, r.years as ryears,
           case when r.years is null then null
                else (private.doc_bkk_date(d.closed_at) + make_interval(years => r.years))::date end as until
    from public.documents d
    left join public.doc_retention_rules r on r.kind = d.kind and r.years is not null
    where public.can_view_docs(p_unit) and d.org_unit_id = p_unit and d.is_active and d.closed_at is not null
      and (coalesce(p_kind, '') = '' or d.kind = p_kind)
      and (coalesce(p_direction, '') = '' or d.direction = p_direction)
  ),
  shown as (
    select b.*, count(*) over () as total
    from base b
    where (not coalesce(p_expired, false) or (b.until is not null and b.until <= private.today_bangkok()))
      and (coalesce(p_q, '') = ''
           or b.doc_no ilike '%' || p_q || '%'
           or (b.vis and (b.subject ilike '%' || p_q || '%' or b.from_text ilike '%' || p_q || '%' or b.to_text ilike '%' || p_q || '%')))
  )
  select s.id, s.direction, s.kind, s.status, s.series, s.number_year, s.seq_no, s.doc_no, s.doc_date,
         case when s.vis then s.from_text else '' end,
         case when s.vis then s.to_text else '' end,
         case when s.vis then s.subject else '' end,
         s.urgency, s.classification, s.received_at, s.closed_at, private.inv_person_name(s.closed_by),
         case when s.vis then coalesce(s.close_note, '') else '' end,
         s.ryears, s.until, not s.vis, s.total
  from shown s
  order by
    case when p_sort = 'closed' and p_dir = 'asc' then s.closed_at end asc nulls last,
    case when p_sort = 'until' and p_dir = 'asc' then s.until end asc nulls last,
    case when p_sort = 'until' and p_dir <> 'asc' then s.until end desc nulls last,
    case when p_sort = 'subject' and p_dir = 'asc' then case when s.vis then s.subject end end asc nulls last,
    case when p_sort = 'subject' and p_dir <> 'asc' then case when s.vis then s.subject end end desc nulls last,
    s.closed_at desc
  limit greatest(least(coalesce(p_limit, 10), 5000), 1) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------
-- 3) ค้นหาหนังสือ: เฉพาะหนังสือที่ผู้ใช้เห็น (ฝั่งเจ้าของ) ทุกหน่วยที่ดูได้ หรือหน่วยที่เลือก
--    เนื้อความ = body ของหนังสือส่ง / ฉบับลงรับจากระบบใช้เนื้อความของต้นฉบับ (เฉพาะหนังสือที่ไม่ลับ)
-- ---------------------------------------------------------------
create function public.docs_search(
  p_unit uuid, p_doc_no text, p_subject text, p_from text, p_to text, p_date_from date, p_date_to date,
  p_kind text, p_urgency text, p_direction text, p_body text, p_archive boolean, p_limit integer, p_offset integer)
returns table (
  id uuid, org_unit_id uuid, unit_name text, direction text, kind text, status text, seq_no integer, number_year integer,
  doc_no text, doc_date date, received_at timestamptz, from_text text, to_text text, subject text,
  urgency text, classification text, closed_at timestamptz, snippet text, total_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select nullif(btrim(coalesce(p_doc_no, '')), '') as doc_no, nullif(btrim(coalesce(p_subject, '')), '') as subject,
           nullif(btrim(coalesce(p_from, '')), '') as frm, nullif(btrim(coalesce(p_to, '')), '') as dest,
           nullif(btrim(coalesce(p_body, '')), '') as body
  ),
  base as (
    select d.*, case when d.classification <> 'normal' then null
                     when d.direction = 'send' then d.body
                     else (select s.body from public.documents s
                           where s.id = d.source_document_id and s.classification = 'normal' and s.is_active) end as text_body
    from public.documents d
    where d.is_active
      and (p_unit is null or d.org_unit_id = p_unit)
      and (coalesce(p_archive, false) or d.closed_at is null)
      and (coalesce(p_kind, '') = '' or d.kind = p_kind)
      and (coalesce(p_urgency, '') = '' or d.urgency = p_urgency)
      and (coalesce(p_direction, '') = '' or d.direction = p_direction)
      and (p_date_from is null or d.doc_date >= p_date_from)
      and (p_date_to is null or d.doc_date <= p_date_to)
      and private.doc_visible(d)
  ),
  hits as (
    select b.*, count(*) over () as total, q.body as qbody
    from base b, q
    where (q.doc_no is null or b.doc_no ilike '%' || q.doc_no || '%'
           or (b.direction = 'receive' and (b.seq_no || '/' || b.number_year) = q.doc_no))
      and (q.subject is null or b.subject ilike '%' || q.subject || '%')
      and (q.frm is null or b.from_text ilike '%' || q.frm || '%')
      and (q.dest is null or b.to_text ilike '%' || q.dest || '%')
      and (q.body is null or b.text_body ilike '%' || q.body || '%')
  )
  select h.id, h.org_unit_id, private.doc_unit_name(h.org_unit_id), h.direction, h.kind, h.status, h.seq_no, h.number_year,
         h.doc_no, h.doc_date, h.received_at, h.from_text, h.to_text, h.subject, h.urgency, h.classification, h.closed_at,
         case when h.qbody is null then ''
              else (case when strpos(lower(h.text_body), lower(h.qbody)) > 61 then '…' else '' end)
                   || substr(h.text_body, greatest(1, strpos(lower(h.text_body), lower(h.qbody)) - 60), 200)
                   || case when length(h.text_body) > strpos(lower(h.text_body), lower(h.qbody)) + 139 then '…' else '' end end,
         h.total
  from hits h
  order by coalesce(h.doc_date, private.doc_bkk_date(h.created_at)) desc, h.seq_no desc nulls last, h.created_at desc
  limit greatest(least(coalesce(p_limit, 20), 200), 1) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------
-- 4) หนังสือ <-> คำขอ
-- ---------------------------------------------------------------
create table public.document_request_links (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id),
  request_id   uuid not null references public.requests (id),
  source       text not null default 'manual' check (source in ('manual', 'auto')),
  created_by   uuid default auth.uid() references public.profiles (id),
  is_active    boolean not null default true,
  removed_by   uuid references public.profiles (id),
  removed_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.document_request_links is 'หนังสืออ้างอิงของคำขอ (ระบบที่ 1, 4, 6, 7) source auto = ร่างแจ้งผลที่ระบบสร้าง ยกเลิกการอ้างอิง = is_active false (เขียนผ่านฟังก์ชันเท่านั้น)';
create unique index document_request_links_unique on public.document_request_links (document_id, request_id) where is_active;
create index document_request_links_request_idx on public.document_request_links (request_id) where is_active;
create trigger document_request_links_set_updated_at before update on public.document_request_links
  for each row execute function public.set_updated_at();
create trigger document_request_links_audit after insert or update or delete on public.document_request_links
  for each row execute function public.audit_row_change();

create function public.can_view_document_request_link(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.document_request_links l
    join public.documents d on d.id = l.document_id
    join public.requests r on r.id = l.request_id
    where l.id = p_id and private.doc_visible(d) and private.request_visible(r)
  );
$$;

alter table public.document_request_links enable row level security;
create policy document_request_links_read on public.document_request_links for select to authenticated
  using (public.can_view_document_request_link(id));
revoke all on public.document_request_links from anon;
revoke insert, update, delete, truncate on public.document_request_links from authenticated;
grant select on public.document_request_links to authenticated;

-- อ้างอิง: ผู้ที่เห็นทั้งหนังสือ (ที่มีเลขแล้ว) และคำขอ
create function public.link_document_request(p_doc uuid, p_request uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d public.documents%rowtype;
  v_r public.requests%rowtype;
  v_id uuid;
begin
  select * into v_r from public.requests where id = p_request;
  if not found or not private.request_visible(v_r) then
    raise exception 'ไม่พบคำขอ หรือท่านไม่มีสิทธิ์เห็นคำขอนี้' using errcode = 'P0001';
  end if;
  if not private.doc_linkable_request_type(v_r.type_key) then
    raise exception 'คำขอชนิดนี้อ้างอิงหนังสือไม่ได้ (ได้เฉพาะคำขอของบุคลากร ทะเบียนสถานที่ งบประมาณ และพัสดุ)' using errcode = 'P0001';
  end if;
  select * into v_d from public.documents where id = p_doc;
  if not found or not private.doc_visible(v_d) then
    raise exception 'ไม่พบหนังสือ หรือท่านไม่มีสิทธิ์เห็นหนังสือนี้' using errcode = 'P0001';
  end if;
  if v_d.status not in ('issued', 'sent', 'received') then
    raise exception 'อ้างอิงได้เฉพาะหนังสือที่มีเลขแล้วและยังไม่ยกเลิก' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.document_request_links l where l.document_id = v_d.id and l.request_id = v_r.id and l.is_active) then
    raise exception 'คำขอนี้อ้างอิงหนังสือนี้อยู่แล้ว' using errcode = 'P0001';
  end if;
  if (select count(*) from public.document_request_links l where l.request_id = v_r.id and l.is_active) >= 50 then
    raise exception 'คำขอหนึ่งอ้างอิงหนังสือได้ไม่เกิน 50 ฉบับ' using errcode = 'P0001';
  end if;
  insert into public.document_request_links (document_id, request_id) values (v_d.id, v_r.id) returning id into v_id;
  return v_id;
end;
$$;

-- ยกเลิกการอ้างอิง: ผู้ที่สร้าง ผู้ยื่นคำขอ หรือผู้ลงทะเบียนของหน่วยเจ้าของหนังสือ
create function private.doc_link_can_remove(l public.document_request_links)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select l.is_active and exists (
    select 1 from public.documents d join public.requests r on r.id = l.request_id
    where d.id = l.document_id and private.doc_visible(d) and private.request_visible(r)
      and (l.created_by = auth.uid() or r.requester_id = auth.uid() or public.can_edit_docs(d.org_unit_id))
  );
$$;

create function public.unlink_document_request(p_link uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.document_request_links%rowtype;
begin
  select * into v from public.document_request_links where id = p_link for update;
  if not found or not private.doc_link_can_remove(v) then
    raise exception 'ไม่พบการอ้างอิง หรือท่านไม่มีสิทธิ์ยกเลิก' using errcode = 'P0001';
  end if;
  update public.document_request_links set is_active = false, removed_by = auth.uid(), removed_at = now() where id = v.id;
end;
$$;

-- หนังสืออ้างอิงของคำขอ (หน้าคำขอกลาง) หนังสือที่ผู้ใช้ไม่เห็นนับเป็น hidden ไม่แสดงรายละเอียด
create function public.request_document_links(p_request uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_r public.requests%rowtype;
begin
  select * into v_r from public.requests where id = p_request;
  if not found or not private.request_visible(v_r) then
    return null;
  end if;
  return jsonb_build_object(
    'linkable', private.doc_linkable_request_type(v_r.type_key),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'link_id', l.id, 'document_id', d.id, 'unit_name', private.doc_unit_name(d.org_unit_id),
               'direction', d.direction, 'kind', d.kind, 'status', d.status, 'doc_no', d.doc_no, 'doc_date', d.doc_date,
               'seq_no', d.seq_no, 'number_year', d.number_year, 'subject', d.subject,
               'urgency', d.urgency, 'classification', d.classification, 'closed_at', d.closed_at, 'source', l.source,
               'created_by_name', private.inv_person_name(l.created_by), 'created_at', l.created_at,
               'can_remove', private.doc_link_can_remove(l))
             order by l.created_at)
      from public.document_request_links l join public.documents d on d.id = l.document_id
      where l.request_id = v_r.id and l.is_active and private.doc_visible(d)), '[]'::jsonb),
    'hidden', (select count(*)::integer from public.document_request_links l join public.documents d on d.id = l.document_id
               where l.request_id = v_r.id and l.is_active and not private.doc_visible(d))
  );
end;
$$;

-- ค้นหนังสือที่อ้างอิงได้ (เลขที่ เลขรับ หรือเรื่อง) จากหนังสือที่ผู้ใช้เห็น ไม่รวมที่อ้างอิงแล้ว
create function public.doc_link_candidates(p_request uuid, p_q text)
returns table (id uuid, unit_name text, direction text, doc_no text, doc_date date, seq_no integer, number_year integer,
               subject text, classification text)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, private.doc_unit_name(d.org_unit_id), d.direction, d.doc_no, d.doc_date, d.seq_no, d.number_year,
         d.subject, d.classification
  from public.documents d
  where length(btrim(coalesce(p_q, ''))) >= 2
    and exists (select 1 from public.requests r where r.id = p_request and private.request_visible(r)
                and private.doc_linkable_request_type(r.type_key))
    and d.is_active and d.status in ('issued', 'sent', 'received')
    and (d.doc_no ilike '%' || btrim(p_q) || '%' or d.subject ilike '%' || btrim(p_q) || '%'
         or (d.direction = 'receive' and (d.seq_no || '/' || d.number_year) = btrim(p_q)))
    and private.doc_visible(d)
    and not exists (select 1 from public.document_request_links l where l.document_id = d.id and l.request_id = p_request and l.is_active)
  order by coalesce(d.doc_date, private.doc_bkk_date(d.created_at)) desc, d.created_at desc
  limit 20;
$$;

-- ---------------------------------------------------------------
-- 5) ร่างหนังสือแจ้งผลคำขอของระบบที่ 4 (อนุมัติ หรือ ไม่อนุมัติ ขั้นสุดท้าย)
--    หน่วยของร่าง = หน่วยของขั้นที่ตัดสินสุดท้าย / ถึง = ผู้ยื่น ที่หน่วยของผู้ยื่น
--    (หน่วยแรกที่ผู้ยื่นมีบทบาท ไล่จากเขตของคำขอขึ้นไป ถ้าไม่พบใช้เขตของคำขอ)
-- ---------------------------------------------------------------
create function private.request_requester_unit(p_req public.requests)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive up as (
    select u.id, u.parent_id, 0 as depth from public.org_units u where u.id = p_req.org_unit_id
    union all
    select p.id, p.parent_id, up.depth + 1 from public.org_units p join up on p.id = up.parent_id where up.depth < 10
  )
  select coalesce((
    select up.id from up
    where exists (select 1 from public.user_roles ur
                  where ur.user_id = p_req.requester_id and ur.org_unit_id = up.id
                    and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date))
    order by up.depth limit 1), p_req.org_unit_id);
$$;

create function private.requests_result_notice_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step public.request_steps%rowtype;
  v_type text;
  v_to_unit uuid;
  v_requester text;
  v_unit_name text;
  v_result text;
  v_doc uuid;
  v_name text;
begin
  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    return new;
  end if;
  if exists (select 1 from public.document_request_links l where l.request_id = new.id and l.source = 'auto') then
    return new;
  end if;
  select * into v_step from public.request_steps
  where request_id = new.id and status = new.status and decided_at is not null
  order by step_no desc limit 1;
  if not found then
    return new;
  end if;
  select t.name into v_type from public.request_types t where t.key = new.type_key;
  v_to_unit := private.request_requester_unit(new);
  v_requester := coalesce(private.inv_person_name(new.requester_id), '');
  v_unit_name := private.doc_unit_name(v_step.org_unit_id);
  v_result := case when new.status = 'approved' then 'อนุมัติตามคำขอ' else 'ไม่อนุมัติ' end;
  v_name := nullif(btrim(coalesce(new.payload ->> 'name', '')), '');
  insert into public.documents (
    org_unit_id, direction, kind, status, to_text, to_unit_ids, subject, urgency, classification, body, note)
  values (
    v_step.org_unit_id, 'send', 'external', 'draft',
    left(btrim(v_requester || ' (' || coalesce(private.doc_unit_name(v_to_unit), '') || ')'), 300),
    case when v_to_unit = v_step.org_unit_id then '{}'::uuid[] else array[v_to_unit] end,
    left('แจ้งผลการพิจารณา' || coalesce(v_type, 'คำขอ') || coalesce(' ' || v_name, ''), 500),
    'normal', 'normal',
    left(
      'ตามที่ท่านได้ยื่น' || coalesce(v_type, 'คำขอ') || ' เลขที่ ' || new.request_no || ' เรื่อง ' || new.title
      || ' เมื่อวันที่ ' || private.doc_thai_date(private.doc_bkk_date(new.submitted_at)) || ' นั้น'
      || E'\n' || v_unit_name || ' ได้พิจารณาแล้ว ' || v_result
      || ' เมื่อวันที่ ' || private.doc_thai_date(private.doc_bkk_date(coalesce(new.decided_at, now())))
      || case when new.status = 'rejected' and v_step.comment is not null then ' ด้วยเหตุผลว่า ' || v_step.comment else '' end
      || E'\n' || 'จึงแจ้งมาเพื่อทราบ', 20000),
    'ร่างอัตโนมัติจากคำขอ ' || new.request_no || ' (ตรวจคำขึ้นต้น ผู้ลงนาม แล้วออกเลขและส่ง)')
  returning id into v_doc;
  insert into public.document_request_links (document_id, request_id, source) values (v_doc, new.id, 'auto');
  perform private.docs_notify_editors(v_step.org_unit_id,
    'มีร่างหนังสือแจ้งผลคำขอ ' || new.request_no,
    'ตรวจร่าง ออกเลข แล้วส่งถึงผู้ยื่น: ' || new.title, '/app/docs/' || v_doc);
  return new;
end;
$$;
create trigger requests_result_notice_draft after update of status on public.requests
  for each row when (public.is_place_request_type(new.type_key) and new.status is distinct from old.status)
  execute function private.requests_result_notice_draft();

-- ---------------------------------------------------------------
-- 6) รายละเอียดหนังสือ (บทที่ 28) เพิ่ม: ปิดเรื่อง อายุการเก็บ ประวัติปิด/เปิด คำขอที่เกี่ยวข้อง เวลาของเส้นทางที่ส่งมาถึง
-- ---------------------------------------------------------------
create or replace function public.document_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
  v_owner boolean;
  v_out jsonb;
begin
  select * into v from public.documents where id = p_id;
  if not found then
    return null;
  end if;
  v_owner := private.doc_visible(v);
  if not v_owner and not private.doc_route_visible(v) then
    return null;
  end if;
  select to_jsonb(v) - 'to_unit_ids' || jsonb_build_object(
    'scope', case when v_owner then 'owner' else 'recipient' end,
    'org_unit_name', private.doc_unit_name(v.org_unit_id),
    'can_edit', v_owner and public.can_edit_docs(v.org_unit_id),
    'can_command', v_owner and public.can_command_docs(v.org_unit_id),
    'can_view_unit', public.can_view_docs(v.org_unit_id),
    'registered_by_name', private.inv_person_name(v.registered_by),
    'issued_by_name', private.inv_person_name(v.issued_by),
    'sent_by_name', private.inv_person_name(v.sent_by),
    'cancelled_by_name', private.inv_person_name(v.cancelled_by),
    'closed_by_name', private.inv_person_name(v.closed_by),
    'open_work', private.doc_open_work(v.id),
    'retention_years', (select r.years from public.doc_retention_rules r where r.kind = v.kind),
    'retain_until', private.doc_retain_until(v),
    'close_events', case when v_owner then coalesce((
                      select jsonb_agg(jsonb_build_object('action', e.action, 'note', e.note, 'at', e.created_at,
                                                          'actor_name', private.inv_person_name(e.actor_id)) order by e.created_at)
                      from public.document_close_events e where e.document_id = v.id), '[]'::jsonb) else '[]'::jsonb end,
    'requests', case when v_owner then coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'link_id', l.id, 'request_id', r.id, 'request_no', r.request_no, 'title', r.title,
                           'type_name', t.name, 'status', r.status, 'source', l.source,
                           'can_remove', private.doc_link_can_remove(l)) order by l.created_at)
                  from public.document_request_links l
                  join public.requests r on r.id = l.request_id
                  join public.request_types t on t.key = r.type_key
                  where l.document_id = v.id and l.is_active and private.request_visible(r)), '[]'::jsonb) else '[]'::jsonb end,
    'requests_hidden', case when v_owner then (
                  select count(*)::integer from public.document_request_links l join public.requests r on r.id = l.request_id
                  where l.document_id = v.id and l.is_active and not private.request_visible(r)) else 0 end,
    'to_units', case when v_owner then coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by u.code)
                          from public.org_units u where u.id = any (v.to_unit_ids)), '[]'::jsonb) else '[]'::jsonb end,
    'viewers', case when v_owner then coalesce((select jsonb_agg(jsonb_build_object('user_id', w.user_id, 'name', private.inv_person_name(w.user_id))
                                          order by w.created_at)
                         from public.document_viewers w where w.document_id = v.id and w.is_active), '[]'::jsonb) else '[]'::jsonb end,
    'deliveries', '[]'::jsonb,
    'routes', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', r.id, 'action', r.action, 'status', r.status, 'message', r.message, 'due_on', r.due_on,
                  'from_user_id', r.from_user_id, 'from_name', private.inv_person_name(r.from_user_id),
                  'from_unit_name', private.doc_unit_name(r.from_unit_id),
                  'to_user_id', r.to_user_id, 'to_name', coalesce(private.inv_person_name(r.to_user_id), private.doc_unit_name(r.to_unit_id)),
                  'to_unit_id', r.to_unit_id, 'parent_route_id', r.parent_route_id,
                  'sent_at', r.sent_at, 'read_at', r.read_at, 'received_at', r.received_at,
                  'receive_no', rd.seq_no, 'receive_year', rd.number_year,
                  'reply_text', r.reply_text, 'replied_at', r.replied_at, 'replied_by_name', private.inv_person_name(r.replied_by),
                  'done_note', r.done_note, 'done_at', r.done_at,
                  'mine', r.to_user_id = auth.uid() or (r.action = 'forward' and public.can_view_docs(r.to_unit_id)),
                  'can_cancel', r.from_user_id = auth.uid() and r.action in ('propose', 'act', 'inform') and r.status in ('pending', 'read'),
                  'file_count', (select count(*)::integer from public.attachments a
                                 where a.entity_table = 'document_routes' and a.entity_id = r.id::text and a.is_active))
                order by r.sent_at, r.created_at)
              from public.document_routes r
              left join public.documents rd on rd.id = r.received_document_id
              where r.document_id = v.id
                and (v_owner or r.to_user_id = auth.uid() or (r.action = 'forward' and public.can_view_docs(r.to_unit_id)))), '[]'::jsonb),
    -- ฉบับที่ลงรับ: เส้นทางที่ส่งมาถึง (ใช้ตอบกลับและเส้นเวลา) และหนังสือต้นทาง
    'source_route', (select jsonb_build_object('id', r.id, 'reply_required', s.reply_required, 'reply_due_on', s.reply_due_on,
                              'reply_text', r.reply_text, 'replied_at', r.replied_at, 'message', r.message,
                              'from_unit_name', private.doc_unit_name(r.from_unit_id), 'to_unit_id', r.to_unit_id,
                              'from_name', private.inv_person_name(r.from_user_id),
                              'source_doc_date', s.doc_date, 'source_issued_at', s.issued_at,
                              'sent_at', r.sent_at, 'read_at', r.read_at, 'received_at', r.received_at)
                     from public.document_routes r join public.documents s on s.id = r.document_id
                     where r.received_document_id = v.id and r.status = 'received' limit 1),
    'source', case when v.source_document_id is null then null else (
                select jsonb_build_object('id', s.id, 'unit_name', private.doc_unit_name(s.org_unit_id), 'doc_no', s.doc_no)
                from public.documents s where s.id = v.source_document_id) end,
    'letterhead', (select jsonb_build_object('code_prefix', s.code_prefix, 'agency_name', s.agency_name, 'address', s.address)
                   from public.doc_unit_settings s where s.org_unit_id = v.org_unit_id)
  ) into v_out;
  if not v_owner then
    v_out := v_out || jsonb_build_object('note', '', 'registered_by_name', null, 'issued_by_name', null, 'sent_by_name', null,
                                         'closed_at', null, 'closed_by', null, 'closed_by_name', null, 'close_note', null,
                                         'retain_until', null, 'open_work', 0);
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------
-- 7) รายงาน
-- ---------------------------------------------------------------
-- ทะเบียนหนังสือรับ / ส่ง รายเดือน (รับ = เดือนที่ลงรับ, ส่ง = เดือนของวันที่หนังสือ) รวมที่ยกเลิกและปิดเรื่องแล้ว
create function public.docs_report_register(p_unit uuid, p_direction text, p_year integer, p_month integer)
returns table (
  id uuid, kind text, status text, series text, seq_no integer, number_year integer, doc_no text, doc_date date,
  received_at timestamptz, from_text text, to_text text, subject text, urgency text, classification text,
  action_text text, note text, masked boolean)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.kind, d.status, d.series, d.seq_no, d.number_year, d.doc_no, d.doc_date, d.received_at,
         case when v.vis then d.from_text else '' end,
         case when v.vis then d.to_text else '' end,
         case when v.vis then d.subject else '' end,
         d.urgency, d.classification,
         case when not v.vis then ''
              when d.status = 'cancelled' then 'ยกเลิก: ' || coalesce(d.cancel_reason, '')
              else concat_ws(' · ',
                (select 'สั่งการ: ' || o.message from public.document_routes o
                 where o.document_id = d.id and o.action = 'order' and o.status <> 'cancelled'
                 order by o.sent_at desc limit 1),
                (select 'ส่งถึงหน่วยในระบบ ' || count(*) || ' หน่วย ลงรับแล้ว ' || count(*) filter (where f.status = 'received')
                 from public.document_routes f where f.document_id = d.id and f.action = 'forward' and f.status <> 'cancelled'
                 having count(*) > 0),
                case when d.closed_at is not null then 'ปิดเรื่อง ' || to_char(private.doc_bkk_date(d.closed_at), 'DD/MM/')
                       || (extract(year from private.doc_bkk_date(d.closed_at))::integer + 543)
                       || coalesce(' ' || d.close_note, '') end) end,
         case when v.vis then d.note else '' end,
         not v.vis
  from public.documents d
  cross join lateral (select private.doc_visible(d) as vis) v
  where public.can_view_docs(p_unit) and d.org_unit_id = p_unit and d.is_active
    and p_direction in ('receive', 'send') and d.direction = p_direction and d.status <> 'draft'
    and p_month between 1 and 12
    and case when p_direction = 'receive'
             then extract(year from private.doc_bkk_date(d.received_at)) = p_year - 543
                  and extract(month from private.doc_bkk_date(d.received_at)) = p_month
             else extract(year from d.doc_date) = p_year - 543 and extract(month from d.doc_date) = p_month end
  order by d.series, d.seq_no;
$$;

-- หนังสือค้างดำเนินการ (ยังไม่ปิดเรื่อง) เรียงจากค้างนานสุด: วันที่ตั้งต้น = ลงรับ (รับ) หรือออกเลข (ส่ง)
create function public.docs_report_pending(p_unit uuid)
returns table (
  id uuid, direction text, kind text, status text, seq_no integer, number_year integer, doc_no text, doc_date date,
  subject text, urgency text, classification text, started_at timestamptz, days integer,
  act_open integer, act_overdue integer, propose_open integer, forward_unreceived integer, reply_waiting integer,
  holders text, masked boolean)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.direction, d.kind, d.status, d.seq_no, d.number_year, d.doc_no, d.doc_date,
         case when v.vis then d.subject else '' end, d.urgency, d.classification,
         coalesce(d.received_at, d.issued_at, d.created_at),
         private.today_bangkok() - private.doc_bkk_date(coalesce(d.received_at, d.issued_at, d.created_at)),
         w.act_open, w.act_overdue, w.propose_open, w.forward_unreceived, w.reply_waiting,
         case when v.vis then coalesce(w.holders, '') else '' end,
         not v.vis
  from public.documents d
  cross join lateral (select private.doc_visible(d) as vis) v
  cross join lateral (
    select count(*) filter (where r.action = 'act' and r.status in ('pending', 'read'))::integer as act_open,
           count(*) filter (where r.action = 'act' and r.status in ('pending', 'read') and r.due_on < private.today_bangkok())::integer as act_overdue,
           count(*) filter (where r.action = 'propose' and r.status in ('pending', 'read'))::integer as propose_open,
           count(*) filter (where r.action = 'forward' and r.status in ('pending', 'read'))::integer as forward_unreceived,
           count(*) filter (where r.action = 'forward' and r.status <> 'cancelled' and d.reply_required and r.reply_text is null)::integer as reply_waiting,
           string_agg(distinct private.inv_person_name(r.to_user_id), ', ')
             filter (where r.action in ('act', 'propose') and r.status in ('pending', 'read')) as holders
    from public.document_routes r where r.document_id = d.id
  ) w
  where public.can_view_docs(p_unit) and d.org_unit_id = p_unit and d.is_active and d.closed_at is null
    and d.status in ('sent', 'received', 'issued')
  order by 13 desc, d.seq_no
  limit 5000;
$$;

-- เวลาดำเนินการต่อหน่วย (ทุกหน่วยที่ผู้ใช้ดูสารบรรณได้) ปีงบประมาณ = วันปิดเรื่อง / วันรายงานผล อยู่ในปีงบ
--   หนังสือรับ: ลงรับ > ปิดเรื่อง / งานที่มอบหมาย: มอบหมาย > รายงานผล
create function public.docs_report_duration(p_fiscal_year integer)
returns table (
  org_unit_id uuid, unit_name text, unit_code text, received_count integer, closed_count integer,
  avg_days numeric, min_days numeric, max_days numeric, open_count integer,
  act_done integer, act_avg_days numeric, act_late integer)
language sql
stable
security definer
set search_path = public
as $$
  with units as (
    select u.id, u.name, u.code from public.docs_units() u
  ),
  rng as (
    select make_date(p_fiscal_year - 544, 10, 1) as d1, make_date(p_fiscal_year - 543, 9, 30) as d2
  ),
  closed as (
    select d.org_unit_id, extract(epoch from (d.closed_at - d.received_at)) / 86400.0 as days
    from public.documents d, rng
    where d.org_unit_id in (select id from units) and d.direction = 'receive' and d.is_active and d.status = 'received'
      and d.closed_at is not null and private.doc_bkk_date(d.closed_at) between rng.d1 and rng.d2
  ),
  acts as (
    select d.org_unit_id, extract(epoch from (r.done_at - r.sent_at)) / 86400.0 as days,
           r.due_on is not null and private.doc_bkk_date(r.done_at) > r.due_on as late
    from public.document_routes r join public.documents d on d.id = r.document_id, rng
    where d.org_unit_id in (select id from units) and r.action = 'act' and r.status = 'done' and d.is_active
      and private.doc_bkk_date(r.done_at) between rng.d1 and rng.d2
  )
  select u.id, u.name, u.code,
         (select count(*)::integer from public.documents d, rng
          where d.org_unit_id = u.id and d.direction = 'receive' and d.is_active and d.status = 'received'
            and private.doc_bkk_date(d.received_at) between rng.d1 and rng.d2),
         (select count(*)::integer from closed c where c.org_unit_id = u.id),
         (select round(avg(c.days)::numeric, 1) from closed c where c.org_unit_id = u.id),
         (select round(min(c.days)::numeric, 1) from closed c where c.org_unit_id = u.id),
         (select round(max(c.days)::numeric, 1) from closed c where c.org_unit_id = u.id),
         (select count(*)::integer from public.documents d
          where d.org_unit_id = u.id and d.is_active and d.closed_at is null and d.status in ('sent', 'received')),
         (select count(*)::integer from acts a where a.org_unit_id = u.id),
         (select round(avg(a.days)::numeric, 1) from acts a where a.org_unit_id = u.id),
         (select count(*)::integer from acts a where a.org_unit_id = u.id and a.late)
  from units u
  order by u.code;
$$;

-- ---------------------------------------------------------------
-- 8) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke all on function private.doc_thai_date(date) from public, anon, authenticated;
revoke all on function private.doc_bkk_date(timestamptz) from public, anon, authenticated;
revoke all on function private.request_visible(public.requests) from public, anon, authenticated;
revoke all on function private.doc_linkable_request_type(text) from public, anon, authenticated;
revoke all on function private.doc_retain_until(public.documents) from public, anon, authenticated;
revoke all on function private.doc_open_work(uuid) from public, anon, authenticated;
revoke all on function private.doc_link_can_remove(public.document_request_links) from public, anon, authenticated;
revoke all on function private.request_requester_unit(public.requests) from public, anon, authenticated;
revoke all on function private.requests_result_notice_draft() from public, anon, authenticated;

revoke execute on function public.close_document(uuid, text) from public, anon;
revoke execute on function public.reopen_document(uuid, text) from public, anon;
revoke execute on function public.document_archive_rows(uuid, text, text, boolean, text, text, text, integer, integer) from public, anon;
revoke execute on function public.docs_search(uuid, text, text, text, text, date, date, text, text, text, text, boolean, integer, integer) from public, anon;
revoke execute on function public.can_view_document_request_link(uuid) from public, anon;
revoke execute on function public.link_document_request(uuid, uuid) from public, anon;
revoke execute on function public.unlink_document_request(uuid) from public, anon;
revoke execute on function public.request_document_links(uuid) from public, anon;
revoke execute on function public.doc_link_candidates(uuid, text) from public, anon;
revoke execute on function public.docs_report_register(uuid, text, integer, integer) from public, anon;
revoke execute on function public.docs_report_pending(uuid) from public, anon;
revoke execute on function public.docs_report_duration(integer) from public, anon;

grant execute on function public.close_document(uuid, text) to authenticated;
grant execute on function public.reopen_document(uuid, text) to authenticated;
grant execute on function public.document_archive_rows(uuid, text, text, boolean, text, text, text, integer, integer) to authenticated;
grant execute on function public.docs_search(uuid, text, text, text, text, date, date, text, text, text, text, boolean, integer, integer) to authenticated;
grant execute on function public.can_view_document_request_link(uuid) to authenticated;
grant execute on function public.link_document_request(uuid, uuid) to authenticated;
grant execute on function public.unlink_document_request(uuid) to authenticated;
grant execute on function public.request_document_links(uuid) to authenticated;
grant execute on function public.doc_link_candidates(uuid, text) to authenticated;
grant execute on function public.docs_report_register(uuid, text, integer, integer) to authenticated;
grant execute on function public.docs_report_pending(uuid) to authenticated;
grant execute on function public.docs_report_duration(integer) to authenticated;
