-- บทที่ 27: ทะเบียนหนังสือรับ-ส่ง ออกเลข แนบไฟล์ (ระบบที่ 8 สารบรรณ)
-- เลขทะเบียนรับ = ต่อหน่วย ต่อปี พ.ศ. เริ่ม 1 ใหม่ทุกปี
-- เลขที่หนังสือส่ง = แบบงานสารบรรณ (ผู้สั่งงานเลือก) แยก 4 ชุดต่อหน่วยต่อปี พ.ศ.:
--   หนังสือภายนอกและภายใน "รหัส/ลำดับ"  หนังสือเวียน "รหัส/ว ลำดับ"  คำสั่ง "ลำดับ/ปี"  ประกาศ "ลำดับ/ปี"
-- ออกเลขผ่านฟังก์ชันเท่านั้น ล็อกตัวนับก่อนทุกครั้ง (ไม่ซ้ำ ไม่ข้าม) ยกเลิกได้แต่ต้องมีเหตุผล เลขเดิมไม่นำกลับมาใช้
-- ชั้นความลับ ลับ / ลับมาก / ลับที่สุด เห็นเฉพาะผู้ที่ระบุชื่อและผู้ลงทะเบียน (ผู้สั่งงานเลือก)

-- ---------------------------------------------------------------
-- 1) ขอบเขตสารบรรณของแต่ละบทบาท: เฉพาะหน่วยตน (ผู้สั่งงานกำหนด: เห็นเฉพาะหนังสือของหน่วยตนและที่ส่งถึงตน)
--    ดู = เห็นทะเบียนรับ ส่ง ร่าง ของหน่วย / ลงทะเบียน = ลงรับ ร่าง ออกเลข ส่ง ยกเลิก ตั้งค่าหัวหนังสือ
--    ผู้ดูแลระบบไม่เห็นตัวหนังสือ (ตั้งค่าหัวหนังสือได้ทุกหน่วย)
-- ---------------------------------------------------------------
alter table public.roles
  add column docs_view text not null default 'none' check (docs_view in ('none', 'own')),
  add column docs_edit text not null default 'none' check (docs_edit in ('none', 'own'));

update public.roles set docs_view = 'own', docs_edit = 'own' where key = 'saraban_officer';
update public.roles set docs_view = 'own' where key in ('chief', 'deputy_chief', 'secretary');

alter table public.roles
  add constraint roles_docs_edit_within_view
    check (public.personnel_scope_rank(docs_edit) <= public.personnel_scope_rank(docs_view));
comment on column public.roles.docs_view is 'สารบรรณ: ดูทะเบียนหนังสือของหน่วยตน none / own';
comment on column public.roles.docs_edit is 'สารบรรณ: ลงรับ ร่าง ออกเลข ส่ง ยกเลิก ของหน่วยตน none / own (ไม่กว้างกว่า docs_view)';

create function public.can_view_docs(p_org_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org_unit_id is not null and exists (
    select 1 from public.my_role_rows() m join public.roles r on r.key = m.role_key
    where m.effective and r.docs_view = 'own' and m.org_unit_id = p_org_unit_id
  );
$$;

create function public.can_edit_docs(p_org_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org_unit_id is not null and exists (
    select 1 from public.my_role_rows() m join public.roles r on r.key = m.role_key
    where m.effective and r.docs_edit = 'own' and m.org_unit_id = p_org_unit_id
  );
$$;

-- ---------------------------------------------------------------
-- 2) ค่าตั้งหัวหนังสือต่อหน่วย (ตรา = ไฟล์แนบรูปภาพ entity_table doc_unit_settings, entity_id = รหัสหน่วย)
-- ---------------------------------------------------------------
create table public.doc_unit_settings (
  org_unit_id  uuid primary key references public.org_units (id),
  code_prefix  text not null default '' check (code_prefix = btrim(code_prefix) and length(code_prefix) <= 40 and code_prefix !~ '/'),
  agency_name  text not null default '' check (length(agency_name) <= 200),
  address      text not null default '' check (length(address) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.doc_unit_settings is 'หัวหนังสือของหน่วย: รหัสหนังสือ (เช่น พศ 0001) ชื่อส่วนงาน ที่อยู่ (ตรา = ไฟล์แนบ entity_table doc_unit_settings)';
create trigger doc_unit_settings_set_updated_at before update on public.doc_unit_settings
  for each row execute function public.set_updated_at();
create trigger doc_unit_settings_audit after insert or update or delete on public.doc_unit_settings
  for each row execute function public.audit_row_change();
alter table public.doc_unit_settings enable row level security;
create policy doc_unit_settings_read on public.doc_unit_settings for select to authenticated
  using (public.can_view_docs(org_unit_id) or public.has_role('admin'));
create policy doc_unit_settings_insert on public.doc_unit_settings for insert to authenticated
  with check (public.can_edit_docs(org_unit_id) or public.has_role('admin'));
create policy doc_unit_settings_update on public.doc_unit_settings for update to authenticated
  using (public.can_edit_docs(org_unit_id) or public.has_role('admin'))
  with check (public.can_edit_docs(org_unit_id) or public.has_role('admin'));
revoke all on public.doc_unit_settings from anon;
revoke delete, truncate on public.doc_unit_settings from authenticated;
grant select, insert, update on public.doc_unit_settings to authenticated;

-- ---------------------------------------------------------------
-- 3) ตัวนับเลข (ระบบเขียนเท่านั้น): ชุด receive / main / circular / order / announcement ต่อหน่วยต่อปี พ.ศ.
-- ---------------------------------------------------------------
create table public.doc_counters (
  id           uuid primary key default gen_random_uuid(),
  org_unit_id  uuid not null references public.org_units (id),
  series       text not null check (series in ('receive', 'main', 'circular', 'order', 'announcement')),
  year_be      integer not null check (year_be between 2500 and 2700),
  last_no      integer not null default 0 check (last_no >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_unit_id, series, year_be)
);
comment on table public.doc_counters is 'ตัวนับเลขทะเบียนรับและเลขที่หนังสือส่ง ต่อหน่วย ต่อชุด ต่อปี พ.ศ. (เพิ่มได้ทีละ 1 ผ่านฟังก์ชันออกเลขเท่านั้น)';
create trigger doc_counters_set_updated_at before update on public.doc_counters
  for each row execute function public.set_updated_at();
create trigger doc_counters_audit after insert or update or delete on public.doc_counters
  for each row execute function public.audit_row_change();
alter table public.doc_counters enable row level security;
revoke all on public.doc_counters from anon, authenticated;

-- ---------------------------------------------------------------
-- 4) หนังสือ: หนึ่งแถว = หนึ่งรายการในทะเบียนรับ หรือหนึ่งหนังสือส่ง (รวมร่าง)
-- ---------------------------------------------------------------
create table public.documents (
  id                  uuid primary key default gen_random_uuid(),
  org_unit_id         uuid not null references public.org_units (id),
  direction           text not null check (direction in ('receive', 'send')),
  kind                text not null check (kind in ('external', 'internal', 'order', 'announcement', 'circular')),
  status              text not null check (status in ('draft', 'issued', 'sent', 'received', 'cancelled')),
  series              text check (series in ('receive', 'main', 'circular', 'order', 'announcement')),
  number_year         integer check (number_year between 2500 and 2700),
  seq_no              integer check (seq_no > 0),
  doc_no              text not null default '' check (length(doc_no) <= 80),
  doc_date            date,
  from_text           text not null default '' check (length(from_text) <= 300),
  to_text             text not null default '' check (length(to_text) <= 300),
  to_unit_ids         uuid[] not null default '{}' check (cardinality(to_unit_ids) <= 50),
  subject             text not null check (btrim(subject) <> '' and length(subject) <= 500),
  urgency             text not null default 'normal' check (urgency in ('normal', 'urgent', 'very_urgent', 'most_urgent')),
  classification      text not null default 'normal' check (classification in ('normal', 'confidential', 'secret', 'top_secret')),
  salutation          text not null default '' check (length(salutation) <= 100),
  body                text not null default '' check (length(body) <= 20000),
  closing             text not null default '' check (length(closing) <= 100),
  signer_name         text not null default '' check (length(signer_name) <= 200),
  signer_position     text not null default '' check (length(signer_position) <= 300),
  note                text not null default '' check (length(note) <= 1000),
  received_at         timestamptz,
  source_document_id  uuid references public.documents (id),
  registered_by       uuid default auth.uid() references public.profiles (id),
  issued_by           uuid references public.profiles (id),
  issued_at           timestamptz,
  sent_by             uuid references public.profiles (id),
  sent_at             timestamptz,
  cancel_reason       text check (cancel_reason is null or length(cancel_reason) <= 500),
  cancelled_by        uuid references public.profiles (id),
  cancelled_at        timestamptz,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint documents_direction_status check (
    (direction = 'receive' and status in ('received', 'cancelled'))
    or (direction = 'send' and status in ('draft', 'issued', 'sent', 'cancelled'))
  ),
  -- ร่าง = ยังไม่มีเลข / ทุกสถานะอื่นมีเลขครบ (ชุด ปี ลำดับ)
  constraint documents_numbered check (
    (status = 'draft') = (seq_no is null) and (seq_no is null) = (series is null) and (seq_no is null) = (number_year is null)
  ),
  constraint documents_series_match check (
    series is null
    or (direction = 'receive' and series = 'receive')
    or (direction = 'send' and series = case kind when 'external' then 'main' when 'internal' then 'main' else kind end)
  ),
  constraint documents_cancel_reason check ((status = 'cancelled') = (cancel_reason is not null)),
  constraint documents_receive_fields check (direction = 'send' or (received_at is not null and doc_date is not null)),
  constraint documents_only_drafts_inactive check (is_active or status = 'draft')
);
comment on table public.documents is 'ทะเบียนหนังสือรับ-ส่ง: direction receive/send, kind external/internal/order/announcement/circular, status draft/issued/sent/received/cancelled (เขียนผ่านฟังก์ชันเท่านั้น)';
comment on column public.documents.seq_no is 'เลขทะเบียนรับ (receive) หรือเลขลำดับของเลขที่หนังสือส่ง ต่อหน่วย ต่อชุด ต่อปี พ.ศ.';
comment on column public.documents.doc_no is 'เลขที่หนังสือ: หนังสือส่ง = ระบบออกให้ / หนังสือรับ = เลขที่ของต้นทาง';
comment on column public.documents.to_unit_ids is 'หน่วยในระบบที่ส่งถึง (เมื่อกดส่ง ระบบสร้าง document_deliveries ให้ปลายทางลงรับ)';
create unique index documents_number_unique on public.documents (org_unit_id, series, number_year, seq_no) where seq_no is not null;
create index documents_unit_idx on public.documents (org_unit_id, direction, status);
create index documents_source_idx on public.documents (source_document_id) where source_document_id is not null;
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- ประวัติการแก้ไขของหนังสือลับไม่เก็บเนื้อหา (ผู้ดูแลระบบอ่าน audit_logs ได้ แต่ต้องไม่เห็นหนังสือลับ)
create function private.audit_document_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_mask jsonb := jsonb_build_object(
    'subject', '[ปกปิดตามชั้นความลับ]', 'body', '', 'salutation', '', 'closing', '',
    'from_text', '', 'to_text', '', 'note', '', 'signer_name', '', 'signer_position', '');
begin
  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old);
    if old.classification <> 'normal' or (tg_op = 'UPDATE' and new.classification <> 'normal') then v_old := v_old || v_mask; end if;
  end if;
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
    if new.classification <> 'normal' or (tg_op = 'UPDATE' and old.classification <> 'normal') then v_new := v_new || v_mask; end if;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return new;
  end if;
  insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id'), v_old, v_new);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger documents_audit after insert or update or delete on public.documents
  for each row execute function private.audit_document_change();

-- ผู้ที่ระบุชื่อให้เห็นหนังสือลับ (ปิดใช้งานแทนการลบ)
create table public.document_viewers (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id),
  user_id      uuid not null references public.profiles (id),
  is_active    boolean not null default true,
  added_by     uuid default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (document_id, user_id)
);
comment on table public.document_viewers is 'รายชื่อผู้มีสิทธิ์เห็นหนังสือลับ (นอกจากผู้ลงทะเบียน) เขียนผ่านฟังก์ชันเท่านั้น';
create trigger document_viewers_set_updated_at before update on public.document_viewers
  for each row execute function public.set_updated_at();
create trigger document_viewers_audit after insert or update or delete on public.document_viewers
  for each row execute function public.audit_row_change();

-- การส่งถึงหน่วยในระบบ: pending รอลงรับ / received ลงรับแล้ว / cancelled ต้นทางยกเลิก
create table public.document_deliveries (
  id                    uuid primary key default gen_random_uuid(),
  document_id           uuid not null references public.documents (id),
  to_unit_id            uuid not null references public.org_units (id),
  status                text not null default 'pending' check (status in ('pending', 'received', 'cancelled')),
  received_document_id  uuid references public.documents (id),
  received_by           uuid references public.profiles (id),
  received_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (document_id, to_unit_id),
  constraint document_deliveries_received check ((status = 'received') = (received_document_id is not null))
);
comment on table public.document_deliveries is 'หนังสือส่งถึงหน่วยในระบบ หน่วยปลายทางกดลงรับแล้วได้เลขทะเบียนรับของตน (เขียนผ่านฟังก์ชันเท่านั้น)';
create index document_deliveries_unit_idx on public.document_deliveries (to_unit_id, status);
create trigger document_deliveries_set_updated_at before update on public.document_deliveries
  for each row execute function public.set_updated_at();
create trigger document_deliveries_audit after insert or update or delete on public.document_deliveries
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- 5) การมองเห็น
--    หนังสือทั่วไป: ผู้มีสิทธิ์ดูสารบรรณของหน่วยเจ้าของ
--    หนังสือลับ: ต้องมีสิทธิ์ดูของหน่วยนั้น และเป็นผู้ลงทะเบียน หรือถูกระบุชื่อ
--    ไฟล์แนบของหนังสือต้นทาง: เห็นได้ด้วยเมื่อเห็นฉบับที่หน่วยปลายทางลงรับไว้
-- ---------------------------------------------------------------
create function private.doc_visible(d public.documents)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select d.is_active
    and public.can_view_docs(d.org_unit_id)
    and (
      d.classification = 'normal'
      or d.registered_by = auth.uid()
      or exists (select 1 from public.document_viewers v
                 where v.document_id = d.id and v.user_id = auth.uid() and v.is_active)
    );
$$;

create function public.can_view_document(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.documents d where d.id = p_id and private.doc_visible(d));
$$;

create function public.can_view_document_files(p_entity_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      exists (select 1 from public.documents d where d.id = p_entity_id::uuid and private.doc_visible(d))
      or exists (select 1 from public.documents c
                 where c.source_document_id = p_entity_id::uuid and c.status = 'received' and private.doc_visible(c))
    );
$$;

alter table public.documents enable row level security;
create policy documents_read on public.documents for select to authenticated
  using (public.can_view_document(id));
revoke all on public.documents from anon;
revoke insert, update, delete, truncate on public.documents from authenticated;
grant select on public.documents to authenticated;

alter table public.document_viewers enable row level security;
create policy document_viewers_read on public.document_viewers for select to authenticated
  using (public.can_view_document(document_id));
revoke all on public.document_viewers from anon;
revoke insert, update, delete, truncate on public.document_viewers from authenticated;
grant select on public.document_viewers to authenticated;

alter table public.document_deliveries enable row level security;
create policy document_deliveries_read on public.document_deliveries for select to authenticated
  using (public.can_view_document(document_id) or public.can_view_docs(to_unit_id));
revoke all on public.document_deliveries from anon;
revoke insert, update, delete, truncate on public.document_deliveries from authenticated;
grant select on public.document_deliveries to authenticated;

-- ---------------------------------------------------------------
-- 6) ตัวช่วยภายใน
-- ---------------------------------------------------------------
create function private.doc_year_be(p_date date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select extract(year from p_date)::integer + 543;
$$;

create function private.doc_text(p jsonb, p_key text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(btrim(coalesce(p ->> p_key, '')), p_max);
$$;

-- ออกเลขถัดไป: ล็อกแถวตัวนับ (ผู้ออกเลขพร้อมกันต้องรอกัน) ถ้าธุรกรรมล้มเหลว เลขย้อนกลับด้วย จึงไม่ข้ามเลข
create function private.doc_next_no(p_unit uuid, p_series text, p_year integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no integer;
begin
  insert into public.doc_counters (org_unit_id, series, year_be) values (p_unit, p_series, p_year)
  on conflict (org_unit_id, series, year_be) do nothing;
  update public.doc_counters set last_no = last_no + 1
   where org_unit_id = p_unit and series = p_series and year_be = p_year
  returning last_no into v_no;
  return v_no;
end;
$$;

create function private.doc_unit_name(p_unit uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select name from public.org_units where id = p_unit;
$$;

-- ผู้ใช้ที่มีสิทธิ์ดูสารบรรณของหน่วย (ใช้ทั้งตรวจรายชื่อผู้เห็นหนังสือลับ และรายการให้เลือก)
create function private.doc_unit_viewer_ids(p_unit uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct ur.user_id
  from public.user_roles ur
  join public.roles ro on ro.key = ur.role_key
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where ur.org_unit_id = p_unit and ro.docs_view = 'own'
    and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date);
$$;

create function private.docs_notify_editors(p_unit uuid, p_title text, p_body text, p_link text)
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
    and ro.docs_edit = 'own' and ur.org_unit_id = p_unit;
$$;

create function private.doc_check_choices(p_kind text, p_urgency text, p_classification text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_kind is null or p_kind not in ('external', 'internal', 'order', 'announcement', 'circular') then
    raise exception 'กรุณาเลือกชนิดหนังสือ' using errcode = 'P0001';
  end if;
  if p_urgency is null or p_urgency not in ('normal', 'urgent', 'very_urgent', 'most_urgent') then
    raise exception 'กรุณาเลือกชั้นความเร็ว' using errcode = 'P0001';
  end if;
  if p_classification is null or p_classification not in ('normal', 'confidential', 'secret', 'top_secret') then
    raise exception 'กรุณาเลือกชั้นความลับ' using errcode = 'P0001';
  end if;
end;
$$;

-- ตั้งรายชื่อผู้เห็นหนังสือลับ: ต้องเป็นผู้มีสิทธิ์ดูสารบรรณของหน่วยนั้น แจ้งเตือนผู้ที่เพิ่มใหม่
create function private.doc_apply_viewers(p_doc public.documents, p_viewers uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_viewers, '{}')) x where x is not null);
  v_new uuid;
begin
  if p_doc.classification = 'normal' then
    if cardinality(v_ids) > 0 then
      raise exception 'ระบุชื่อผู้เห็นได้เฉพาะหนังสือที่มีชั้นความลับ' using errcode = 'P0001';
    end if;
    return;
  end if;
  if cardinality(v_ids) > 30 then
    raise exception 'ระบุชื่อผู้เห็นหนังสือลับได้ไม่เกิน 30 คน' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_ids) x where x not in (select private.doc_unit_viewer_ids(p_doc.org_unit_id))) then
    raise exception 'ผู้ที่ระบุชื่อต้องเป็นผู้มีสิทธิ์ดูหนังสือของหน่วยนี้' using errcode = 'P0001';
  end if;
  update public.document_viewers set is_active = false
   where document_id = p_doc.id and is_active and user_id <> all (v_ids);
  for v_new in
    select x from unnest(v_ids) x
    where not exists (select 1 from public.document_viewers v where v.document_id = p_doc.id and v.user_id = x and v.is_active)
  loop
    insert into public.document_viewers (document_id, user_id) values (p_doc.id, v_new)
    on conflict (document_id, user_id) do update set is_active = true, added_by = auth.uid();
    if v_new is distinct from auth.uid() then
      perform public.notify_user(v_new, 'ท่านได้รับสิทธิ์เปิดหนังสือลับ',
        'หนังสือของ' || private.doc_unit_name(p_doc.org_unit_id), '/app/docs/' || p_doc.id);
    end if;
  end loop;
end;
$$;

-- ล็อกหนังสือเพื่อแก้ไข: ต้องเห็นหนังสือนั้นและมีสิทธิ์ลงทะเบียนของหน่วย
create function private.doc_lock(p_id uuid)
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
  return v;
end;
$$;

-- ---------------------------------------------------------------
-- 7) ทะเบียนหนังสือรับ
-- ---------------------------------------------------------------
-- p: kind, doc_no, doc_date, from_text, to_text, subject, urgency, classification, note, viewers[]
create function public.register_received_document(p_unit uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := private.today_bangkok();
  v_year integer := private.doc_year_be(private.today_bangkok());
  v_date date;
  v_doc public.documents%rowtype;
begin
  if not public.can_edit_docs(p_unit) then
    raise exception 'ท่านไม่มีสิทธิ์ลงทะเบียนหนังสือของหน่วยนี้' using errcode = '42501';
  end if;
  perform private.doc_check_choices(p ->> 'kind', coalesce(p ->> 'urgency', 'normal'), coalesce(p ->> 'classification', 'normal'));
  begin
    v_date := nullif(p ->> 'doc_date', '')::date;
  exception when others then
    v_date := null;
  end;
  if v_date is null or v_date > v_today then
    raise exception 'กรุณากรอกวันที่ของหนังสือ (ลงวันที่) และต้องไม่เกินวันนี้' using errcode = 'P0001';
  end if;
  if private.doc_text(p, 'from_text', 300) = '' then
    raise exception 'กรุณากรอกว่าหนังสือมาจากที่ใด' using errcode = 'P0001';
  end if;
  if private.doc_text(p, 'subject', 500) = '' then
    raise exception 'กรุณากรอกเรื่อง' using errcode = 'P0001';
  end if;
  insert into public.documents (
    org_unit_id, direction, kind, status, series, number_year, seq_no, doc_no, doc_date,
    from_text, to_text, subject, urgency, classification, note, received_at)
  values (
    p_unit, 'receive', p ->> 'kind', 'received', 'receive', v_year, private.doc_next_no(p_unit, 'receive', v_year),
    private.doc_text(p, 'doc_no', 80), v_date, private.doc_text(p, 'from_text', 300), private.doc_text(p, 'to_text', 300),
    private.doc_text(p, 'subject', 500), coalesce(p ->> 'urgency', 'normal'), coalesce(p ->> 'classification', 'normal'),
    private.doc_text(p, 'note', 1000), now())
  returning * into v_doc;
  perform private.doc_apply_viewers(v_doc,
    array(select jsonb_array_elements_text(coalesce(p -> 'viewers', '[]'::jsonb))::uuid));
  return v_doc.id;
end;
$$;

-- แก้รายละเอียดของหนังสือรับ (เลขทะเบียนรับและวันเวลารับแก้ไม่ได้)
create function public.update_received_document(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
  v_date date;
begin
  v := private.doc_lock(p_id);
  if v.direction <> 'receive' or v.status <> 'received' then
    raise exception 'แก้ได้เฉพาะหนังสือรับที่ยังไม่ยกเลิก' using errcode = 'P0001';
  end if;
  perform private.doc_check_choices(p ->> 'kind', p ->> 'urgency', p ->> 'classification');
  begin
    v_date := nullif(p ->> 'doc_date', '')::date;
  exception when others then
    v_date := null;
  end;
  if v_date is null or v_date > private.today_bangkok() then
    raise exception 'กรุณากรอกวันที่ของหนังสือ (ลงวันที่) และต้องไม่เกินวันนี้' using errcode = 'P0001';
  end if;
  if private.doc_text(p, 'from_text', 300) = '' or private.doc_text(p, 'subject', 500) = '' then
    raise exception 'กรุณากรอกว่าหนังสือมาจากที่ใด และเรื่อง' using errcode = 'P0001';
  end if;
  update public.documents
     set kind = p ->> 'kind', doc_no = private.doc_text(p, 'doc_no', 80), doc_date = v_date,
         from_text = private.doc_text(p, 'from_text', 300), to_text = private.doc_text(p, 'to_text', 300),
         subject = private.doc_text(p, 'subject', 500), urgency = p ->> 'urgency',
         classification = p ->> 'classification', note = private.doc_text(p, 'note', 1000)
   where id = v.id
  returning * into v;
  if v.classification = 'normal' then
    update public.document_viewers set is_active = false where document_id = v.id and is_active;
  end if;
end;
$$;

-- หนังสือที่หน่วยอื่นในระบบส่งถึง รอลงรับ: ลงรับแล้วได้เลขทะเบียนรับของหน่วยตน
create function public.receive_document_delivery(p_delivery uuid, p_viewers uuid[], p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d public.document_deliveries%rowtype;
  v_src public.documents%rowtype;
  v_doc public.documents%rowtype;
  v_year integer := private.doc_year_be(private.today_bangkok());
begin
  select * into v_d from public.document_deliveries where id = p_delivery for update;
  if not found or v_d.status <> 'pending' then
    raise exception 'ไม่พบหนังสือที่รอลงรับ (อาจลงรับไปแล้วหรือต้นทางยกเลิก)' using errcode = 'P0001';
  end if;
  if not public.can_edit_docs(v_d.to_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์ลงรับหนังสือของหน่วยนี้' using errcode = '42501';
  end if;
  select * into v_src from public.documents where id = v_d.document_id;
  if v_src.status <> 'sent' then
    raise exception 'หนังสือนี้ถูกยกเลิกแล้ว' using errcode = 'P0001';
  end if;
  insert into public.documents (
    org_unit_id, direction, kind, status, series, number_year, seq_no, doc_no, doc_date,
    from_text, to_text, subject, urgency, classification, note, received_at, source_document_id)
  values (
    v_d.to_unit_id, 'receive', v_src.kind, 'received', 'receive', v_year,
    private.doc_next_no(v_d.to_unit_id, 'receive', v_year),
    v_src.doc_no, v_src.doc_date, left(coalesce(nullif(v_src.from_text, ''), private.doc_unit_name(v_src.org_unit_id)), 300),
    v_src.to_text, v_src.subject, v_src.urgency, v_src.classification, left(btrim(coalesce(p_note, '')), 1000), now(), v_src.id)
  returning * into v_doc;
  perform private.doc_apply_viewers(v_doc, p_viewers);
  update public.document_deliveries
     set status = 'received', received_document_id = v_doc.id, received_by = auth.uid(), received_at = now()
   where id = v_d.id;
  if v_src.registered_by is not null and v_src.registered_by is distinct from auth.uid() then
    perform public.notify_user(v_src.registered_by, 'หน่วยปลายทางลงรับหนังสือแล้ว',
      private.doc_unit_name(v_d.to_unit_id) || ' ลงรับหนังสือที่ ' || v_src.doc_no, '/app/docs/' || v_src.id);
  end if;
  return v_doc.id;
end;
$$;

-- ---------------------------------------------------------------
-- 8) หนังสือส่ง: ร่าง > ออกเลข > ส่ง (ยกเลิกเลขได้ ต้องมีเหตุผล)
-- ---------------------------------------------------------------
-- p: kind, to_text, to_units[], subject, urgency, classification, salutation, body, closing, signer_name, signer_position, note, viewers[]
create function public.save_document_draft(p_id uuid, p_unit uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
  v_units uuid[];
  v_unit uuid;
  v_series text;
begin
  perform private.doc_check_choices(p ->> 'kind', coalesce(p ->> 'urgency', 'normal'), coalesce(p ->> 'classification', 'normal'));
  if private.doc_text(p, 'subject', 500) = '' then
    raise exception 'กรุณากรอกเรื่อง' using errcode = 'P0001';
  end if;
  if p_id is null then
    v_unit := p_unit;
    if not public.can_edit_docs(v_unit) then
      raise exception 'ท่านไม่มีสิทธิ์ร่างหนังสือของหน่วยนี้' using errcode = '42501';
    end if;
  else
    v := private.doc_lock(p_id);
    v_unit := v.org_unit_id;
    if v.direction <> 'send' or v.status not in ('draft', 'issued') then
      raise exception 'แก้ได้เฉพาะร่างและหนังสือที่ออกเลขแล้วแต่ยังไม่ส่ง' using errcode = 'P0001';
    end if;
    v_series := case (p ->> 'kind') when 'external' then 'main' when 'internal' then 'main' else (p ->> 'kind') end;
    if v.status = 'issued' and v.series <> v_series then
      raise exception 'หนังสือที่ออกเลขแล้วเปลี่ยนชนิดข้ามชุดเลขไม่ได้ (ยกเลิกเลขแล้วร่างใหม่)' using errcode = 'P0001';
    end if;
  end if;
  v_units := array(
    select distinct x::uuid from jsonb_array_elements_text(coalesce(p -> 'to_units', '[]'::jsonb)) x);
  if cardinality(v_units) > 50 then
    raise exception 'ส่งถึงหน่วยในระบบได้ไม่เกิน 50 หน่วยต่อฉบับ' using errcode = 'P0001';
  end if;
  if v_unit = any (v_units) then
    raise exception 'หน่วยที่ส่งถึงต้องไม่ใช่หน่วยของท่านเอง' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_units) x
             where not exists (select 1 from public.org_units u where u.id = x and u.is_active)) then
    raise exception 'หน่วยที่ส่งถึงต้องเป็นหน่วยที่ใช้งานอยู่' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.documents (
      org_unit_id, direction, kind, status, to_text, to_unit_ids, subject, urgency, classification,
      salutation, body, closing, signer_name, signer_position, note)
    values (
      v_unit, 'send', p ->> 'kind', 'draft', private.doc_text(p, 'to_text', 300), v_units, private.doc_text(p, 'subject', 500),
      coalesce(p ->> 'urgency', 'normal'), coalesce(p ->> 'classification', 'normal'),
      private.doc_text(p, 'salutation', 100), left(coalesce(p ->> 'body', ''), 20000), private.doc_text(p, 'closing', 100),
      private.doc_text(p, 'signer_name', 200), private.doc_text(p, 'signer_position', 300), private.doc_text(p, 'note', 1000))
    returning * into v;
  else
    update public.documents
       set kind = p ->> 'kind', to_text = private.doc_text(p, 'to_text', 300), to_unit_ids = v_units,
           subject = private.doc_text(p, 'subject', 500), urgency = coalesce(p ->> 'urgency', 'normal'),
           classification = coalesce(p ->> 'classification', 'normal'),
           salutation = private.doc_text(p, 'salutation', 100), body = left(coalesce(p ->> 'body', ''), 20000),
           closing = private.doc_text(p, 'closing', 100), signer_name = private.doc_text(p, 'signer_name', 200),
           signer_position = private.doc_text(p, 'signer_position', 300), note = private.doc_text(p, 'note', 1000)
     where id = v.id
    returning * into v;
  end if;
  perform private.doc_apply_viewers(v,
    array(select jsonb_array_elements_text(coalesce(p -> 'viewers', '[]'::jsonb))::uuid));
  return v.id;
end;
$$;

-- ออกเลขที่หนังสือ: วันที่หนังสือต้องไม่เกินวันนี้ และไม่ก่อนหนังสือเลขก่อนหน้าในชุดเดียวกัน
create function public.issue_document_number(p_id uuid, p_doc_date date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
  v_series text;
  v_year integer;
  v_last date;
  v_prefix text;
  v_agency text;
  v_no integer;
  v_doc_no text;
begin
  v := private.doc_lock(p_id);
  if v.direction <> 'send' or v.status <> 'draft' then
    raise exception 'ออกเลขได้เฉพาะร่างหนังสือส่ง' using errcode = 'P0001';
  end if;
  if p_doc_date is null or p_doc_date > private.today_bangkok() then
    raise exception 'กรุณากรอกวันที่ของหนังสือ และต้องไม่เกินวันนี้' using errcode = 'P0001';
  end if;
  if v.kind in ('external', 'internal', 'circular') and btrim(v.to_text) = '' then
    raise exception 'กรุณากรอกผู้รับ (ถึง) ก่อนออกเลข' using errcode = 'P0001';
  end if;
  v_series := case v.kind when 'external' then 'main' when 'internal' then 'main' else v.kind end;
  v_year := private.doc_year_be(p_doc_date);
  select max(d.doc_date) into v_last from public.documents d
   where d.org_unit_id = v.org_unit_id and d.series = v_series and d.number_year = v_year;
  if v_last is not null and p_doc_date < v_last then
    raise exception 'วันที่ของหนังสือต้องไม่ก่อนวันที่ของหนังสือเลขก่อนหน้าในชุดเดียวกัน (%)',
      to_char(v_last, 'DD/MM/') || (extract(year from v_last)::integer + 543) using errcode = 'P0001';
  end if;
  select s.code_prefix, s.agency_name into v_prefix, v_agency from public.doc_unit_settings s where s.org_unit_id = v.org_unit_id;
  if v_series in ('main', 'circular') and coalesce(v_prefix, '') = '' then
    raise exception 'หน่วยนี้ยังไม่ได้ตั้งรหัสหนังสือ ให้ตั้งที่ ตั้งค่าหัวหนังสือ ก่อน' using errcode = 'P0001';
  end if;
  v_no := private.doc_next_no(v.org_unit_id, v_series, v_year);
  v_doc_no := case v_series
    when 'main' then v_prefix || '/' || v_no
    when 'circular' then v_prefix || '/ว ' || v_no
    else v_no || '/' || v_year
  end;
  update public.documents
     set status = 'issued', series = v_series, number_year = v_year, seq_no = v_no, doc_no = v_doc_no,
         doc_date = p_doc_date, from_text = left(coalesce(nullif(v_agency, ''), private.doc_unit_name(v.org_unit_id)), 300),
         issued_by = auth.uid(), issued_at = now()
   where id = v.id;
  return v_doc_no;
end;
$$;

-- ส่ง: หน่วยในระบบที่ระบุได้รายการรอลงรับ (ผู้รับภายนอกส่งตามช่องทางปกติ)
create function public.send_document(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
  v_unit uuid;
  v_count integer := 0;
begin
  v := private.doc_lock(p_id);
  if v.direction <> 'send' or v.status <> 'issued' then
    raise exception 'ส่งได้เฉพาะหนังสือที่ออกเลขแล้วและยังไม่ส่ง' using errcode = 'P0001';
  end if;
  update public.documents set status = 'sent', sent_by = auth.uid(), sent_at = now() where id = v.id;
  foreach v_unit in array v.to_unit_ids loop
    insert into public.document_deliveries (document_id, to_unit_id) values (v.id, v_unit);
    v_count := v_count + 1;
    perform private.docs_notify_editors(v_unit,
      'มีหนังสือเข้ารอลงรับ ที่ ' || v.doc_no,
      'จาก' || private.doc_unit_name(v.org_unit_id) || case when v.classification = 'normal' then ' เรื่อง ' || v.subject else ' (หนังสือลับ)' end,
      '/app/docs?tab=receive&unit=' || v_unit);
  end loop;
  return v_count;
end;
$$;

-- ยกเลิกเลข (เลขเดิมไม่นำกลับมาใช้) หนังสือส่งที่หน่วยปลายทางลงรับแล้วยกเลิกไม่ได้
-- ยกเลิกหนังสือรับที่ลงรับจากหน่วยในระบบ: รายการกลับไปรอลงรับใหม่
create function public.cancel_document(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
begin
  v := private.doc_lock(p_id);
  if v.status not in ('issued', 'sent', 'received') then
    raise exception 'ยกเลิกได้เฉพาะหนังสือที่มีเลขแล้ว (ร่างให้ใช้ ทิ้งร่าง)' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'กรุณาระบุเหตุผลที่ยกเลิก (อย่างน้อย 3 ตัวอักษร)' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.document_deliveries d where d.document_id = v.id and d.status = 'received') then
    raise exception 'หน่วยปลายทางลงรับหนังสือนี้แล้ว ยกเลิกไม่ได้' using errcode = 'P0001';
  end if;
  update public.document_deliveries set status = 'cancelled' where document_id = v.id and status = 'pending';
  update public.document_deliveries
     set status = 'pending', received_document_id = null, received_by = null, received_at = null
   where received_document_id = v.id;
  update public.documents
     set status = 'cancelled', cancel_reason = left(btrim(p_reason), 500), cancelled_by = auth.uid(), cancelled_at = now()
   where id = v.id;
end;
$$;

-- ทิ้งร่าง (ปิดใช้งาน ไม่ลบจริง)
create function public.discard_document_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
begin
  v := private.doc_lock(p_id);
  if v.status <> 'draft' then
    raise exception 'ทิ้งได้เฉพาะร่างที่ยังไม่ออกเลข' using errcode = 'P0001';
  end if;
  update public.documents set is_active = false where id = v.id;
end;
$$;

create function public.set_document_viewers(p_id uuid, p_viewers uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
begin
  v := private.doc_lock(p_id);
  if v.classification = 'normal' then
    raise exception 'ระบุชื่อผู้เห็นได้เฉพาะหนังสือที่มีชั้นความลับ' using errcode = 'P0001';
  end if;
  if v.status = 'cancelled' then
    raise exception 'หนังสือนี้ยกเลิกแล้ว' using errcode = 'P0001';
  end if;
  perform private.doc_apply_viewers(v, p_viewers);
end;
$$;

-- ---------------------------------------------------------------
-- 9) ฟังก์ชันอ่าน
-- ---------------------------------------------------------------
-- หน่วยที่ผู้ใช้ดูสารบรรณได้
create function public.docs_units()
returns table (id uuid, name text, code text, level public.org_level, can_edit boolean)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.name, u.code, u.level, public.can_edit_docs(u.id)
  from public.org_units u
  where u.id in (select m.org_unit_id from public.my_role_rows() m join public.roles r on r.key = m.role_key
                 where m.effective and r.docs_view = 'own')
  order by u.code;
$$;

-- ทะเบียนของหน่วย: p_tab receive / send / draft หนังสือลับที่ผู้ใช้ไม่มีสิทธิ์เห็น แสดงเลขและวันที่ ปิดเรื่องและคู่หนังสือ
create function public.document_rows(
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
            when 'receive' then d.direction = 'receive' and d.number_year = p_year
            when 'send' then d.direction = 'send' and d.status <> 'draft' and d.number_year = p_year
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
         (select count(*)::integer from public.document_deliveries x where x.document_id = s.id and x.status <> 'cancelled'),
         (select count(*)::integer from public.document_deliveries x where x.document_id = s.id and x.status = 'received'),
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

-- ปี พ.ศ. ที่มีหนังสือของหน่วย (รวมปีปัจจุบันเสมอ)
create function public.document_years(p_unit uuid)
returns setof integer
language sql
stable
security definer
set search_path = public
as $$
  select y from (
    select distinct d.number_year as y from public.documents d
    where public.can_view_docs(p_unit) and d.org_unit_id = p_unit and d.number_year is not null
    union
    select private.doc_year_be(private.today_bangkok())
  ) t
  order by y desc;
$$;

-- หนังสือจากหน่วยอื่นในระบบที่รอหน่วยนี้ลงรับ (หนังสือลับ: ผู้ไม่มีสิทธิ์ลงทะเบียนไม่เห็นเรื่อง)
create function public.incoming_documents(p_unit uuid)
returns table (
  delivery_id uuid, document_id uuid, from_unit_name text, doc_no text, doc_date date, subject text,
  kind text, urgency text, classification text, sent_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select x.id, d.id, u.name, d.doc_no, d.doc_date,
         case when d.classification = 'normal' or public.can_edit_docs(p_unit) then d.subject else '' end,
         d.kind, d.urgency, d.classification, d.sent_at
  from public.document_deliveries x
  join public.documents d on d.id = x.document_id
  join public.org_units u on u.id = d.org_unit_id
  where public.can_view_docs(p_unit) and x.to_unit_id = p_unit and x.status = 'pending' and d.status = 'sent'
  order by d.sent_at;
$$;

-- รายละเอียดหนังสือ (ต้องเห็นหนังสือนั้น)
create function public.document_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
  v_out jsonb;
begin
  select * into v from public.documents where id = p_id;
  if not found or not private.doc_visible(v) then
    return null;
  end if;
  select to_jsonb(v) - 'to_unit_ids' || jsonb_build_object(
    'org_unit_name', private.doc_unit_name(v.org_unit_id),
    'can_edit', public.can_edit_docs(v.org_unit_id),
    'registered_by_name', private.inv_person_name(v.registered_by),
    'issued_by_name', private.inv_person_name(v.issued_by),
    'sent_by_name', private.inv_person_name(v.sent_by),
    'cancelled_by_name', private.inv_person_name(v.cancelled_by),
    'to_units', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by u.code)
                          from public.org_units u where u.id = any (v.to_unit_ids)), '[]'::jsonb),
    'viewers', coalesce((select jsonb_agg(jsonb_build_object('user_id', w.user_id, 'name', private.inv_person_name(w.user_id))
                                          order by w.created_at)
                         from public.document_viewers w where w.document_id = v.id and w.is_active), '[]'::jsonb),
    'deliveries', coalesce((select jsonb_agg(jsonb_build_object(
                              'id', x.id, 'unit_name', u.name, 'status', x.status, 'received_at', x.received_at,
                              'receive_no', r.seq_no, 'receive_year', r.number_year) order by u.code)
                            from public.document_deliveries x
                            join public.org_units u on u.id = x.to_unit_id
                            left join public.documents r on r.id = x.received_document_id
                            where x.document_id = v.id), '[]'::jsonb),
    'source', case when v.source_document_id is null then null else (
                select jsonb_build_object('id', s.id, 'unit_name', private.doc_unit_name(s.org_unit_id), 'doc_no', s.doc_no)
                from public.documents s where s.id = v.source_document_id) end,
    'letterhead', (select jsonb_build_object('code_prefix', s.code_prefix, 'agency_name', s.agency_name, 'address', s.address)
                   from public.doc_unit_settings s where s.org_unit_id = v.org_unit_id)
  ) into v_out;
  return v_out;
end;
$$;

-- รายชื่อที่เลือกเป็นผู้เห็นหนังสือลับได้ (ผู้มีสิทธิ์ดูสารบรรณของหน่วย) เฉพาะผู้ลงทะเบียนของหน่วยเรียกได้
create function public.doc_viewer_candidates(p_unit uuid)
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select i, private.inv_person_name(i)
  from private.doc_unit_viewer_ids(p_unit) i
  where public.can_edit_docs(p_unit)
  order by 2;
$$;

-- ---------------------------------------------------------------
-- 10) ไฟล์แนบ: หนังสือ (entity_table documents) และตราของหน่วย (doc_unit_settings)
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
      when entity_table = 'stock_receipts' then
        uploaded_by = auth.uid() or public.can_view_inventory(org_unit_id)
      when entity_table = 'items' then
        uploaded_by = auth.uid() or exists (select 1 from public.items i where i.id::text = attachments.entity_id)
      when entity_table = 'assets' then
        uploaded_by = auth.uid() or exists (select 1 from public.assets a where a.id::text = attachments.entity_id)
      when entity_table = 'documents' then public.can_view_document_files(entity_id)
      when entity_table = 'doc_unit_settings' then public.can_view_docs(org_unit_id) or public.has_role('admin')
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
      when entity_table = 'documents' then
        public.can_edit_docs(org_unit_id)
        and exists (select 1 from public.documents d
                    where d.id::text = attachments.entity_id and d.org_unit_id = attachments.org_unit_id
                      and d.status <> 'cancelled' and d.is_active)
      when entity_table = 'doc_unit_settings' then
        (public.can_edit_docs(org_unit_id) or public.has_role('admin'))
        and entity_id = org_unit_id::text and mime_type in ('image/png', 'image/jpeg')
      else org_unit_id is null or public.can_access(org_unit_id)
    end
  );

-- ---------------------------------------------------------------
-- 11) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke all on function private.audit_document_change() from public, anon, authenticated;
revoke all on function private.doc_visible(public.documents) from public, anon, authenticated;
revoke all on function private.doc_year_be(date) from public, anon, authenticated;
revoke all on function private.doc_text(jsonb, text, integer) from public, anon, authenticated;
revoke all on function private.doc_next_no(uuid, text, integer) from public, anon, authenticated;
revoke all on function private.doc_unit_name(uuid) from public, anon, authenticated;
revoke all on function private.doc_unit_viewer_ids(uuid) from public, anon, authenticated;
revoke all on function private.docs_notify_editors(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.doc_check_choices(text, text, text) from public, anon, authenticated;
revoke all on function private.doc_apply_viewers(public.documents, uuid[]) from public, anon, authenticated;
revoke all on function private.doc_lock(uuid) from public, anon, authenticated;

revoke execute on function public.can_view_docs(uuid) from public, anon;
revoke execute on function public.can_edit_docs(uuid) from public, anon;
revoke execute on function public.can_view_document(uuid) from public, anon;
revoke execute on function public.can_view_document_files(text) from public, anon;
revoke execute on function public.register_received_document(uuid, jsonb) from public, anon;
revoke execute on function public.update_received_document(uuid, jsonb) from public, anon;
revoke execute on function public.receive_document_delivery(uuid, uuid[], text) from public, anon;
revoke execute on function public.save_document_draft(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.issue_document_number(uuid, date) from public, anon;
revoke execute on function public.send_document(uuid) from public, anon;
revoke execute on function public.cancel_document(uuid, text) from public, anon;
revoke execute on function public.discard_document_draft(uuid) from public, anon;
revoke execute on function public.set_document_viewers(uuid, uuid[]) from public, anon;
revoke execute on function public.docs_units() from public, anon;
revoke execute on function public.document_rows(uuid, text, integer, text, text, text, text, text, text, integer, integer) from public, anon;
revoke execute on function public.document_years(uuid) from public, anon;
revoke execute on function public.incoming_documents(uuid) from public, anon;
revoke execute on function public.document_detail(uuid) from public, anon;
revoke execute on function public.doc_viewer_candidates(uuid) from public, anon;

grant execute on function public.can_view_docs(uuid) to authenticated;
grant execute on function public.can_edit_docs(uuid) to authenticated;
grant execute on function public.can_view_document(uuid) to authenticated;
grant execute on function public.can_view_document_files(text) to authenticated;
grant execute on function public.register_received_document(uuid, jsonb) to authenticated;
grant execute on function public.update_received_document(uuid, jsonb) to authenticated;
grant execute on function public.receive_document_delivery(uuid, uuid[], text) to authenticated;
grant execute on function public.save_document_draft(uuid, uuid, jsonb) to authenticated;
grant execute on function public.issue_document_number(uuid, date) to authenticated;
grant execute on function public.send_document(uuid) to authenticated;
grant execute on function public.cancel_document(uuid, text) to authenticated;
grant execute on function public.discard_document_draft(uuid) to authenticated;
grant execute on function public.set_document_viewers(uuid, uuid[]) to authenticated;
grant execute on function public.docs_units() to authenticated;
grant execute on function public.document_rows(uuid, text, integer, text, text, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.document_years(uuid) to authenticated;
grant execute on function public.incoming_documents(uuid) to authenticated;
grant execute on function public.document_detail(uuid) to authenticated;
grant execute on function public.doc_viewer_candidates(uuid) to authenticated;
