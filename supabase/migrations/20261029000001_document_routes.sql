-- บทที่ 28: ส่งต่อ สั่งการ ลงรับ และหนังสือเวียนแจ้งงาน (ระบบที่ 8)
-- document_routes = เส้นทางของหนังสือทุกแบบ:
--   ระหว่างหน่วย  forward (ส่ง/ส่งต่อถึงหน่วย ปลายทางเปิดอ่าน > ลงรับ > ตอบกลับถ้าต้นทางต้องการคำตอบ)
--   ภายในหน่วย   propose (เสนอ) / order (สั่งการ บันทึกคำสั่ง) / act (มอบหมายผู้ดำเนินการ มีกำหนดเสร็จ) / inform (แจ้งเพื่อทราบ)
-- ผู้สั่งงานเลือก: ผู้ดำเนินการ = ทุกคนที่มีบทบาทในหน่วย (เห็นเฉพาะหนังสือที่ได้รับมอบ) / ผู้สั่งการ = เจ้าคณะและรองเจ้าคณะ
--   (roles.docs_command ตั้งเพิ่มได้) / หนังสือเวียนผู้ส่งเลือกชั้นเอง / เตือนก่อนกำหนด 2 วัน ปรับได้ (app_settings docs_due_warn_days)
-- ตาราง document_deliveries ของบทที่ 27 เลิกใช้ ข้อมูลย้ายมาที่นี่ (รหัสเดิม)

-- ---------------------------------------------------------------
-- 1) สิทธิ์สั่งการ และค่าตั้ง
-- ---------------------------------------------------------------
alter table public.roles add column docs_command boolean not null default false;
update public.roles set docs_command = true where key in ('chief', 'deputy_chief');
alter table public.roles
  add constraint roles_docs_command_needs_view check (not docs_command or docs_view = 'own');
comment on column public.roles.docs_command is 'สารบรรณ: สั่งการและมอบหมายผู้ดำเนินการบนหนังสือของหน่วยตน (ต้องดูสารบรรณได้)';

create function public.can_command_docs(p_org_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org_unit_id is not null and exists (
    select 1 from public.my_role_rows() m join public.roles r on r.key = m.role_key
    where m.effective and r.docs_command and r.docs_view = 'own' and m.org_unit_id = p_org_unit_id
  );
$$;

insert into public.app_settings (key, value_int, description) values
  ('docs_due_warn_days', 2, 'สารบรรณ: แจ้งเตือนผู้ได้รับมอบหมายและหน่วยที่ต้องตอบกลับก่อนถึงกำหนดกี่วัน (เกินกำหนดแจ้งอีกครั้ง)');

-- ---------------------------------------------------------------
-- 2) หนังสือที่ต้องการคำตอบ และส่งถึงหน่วยได้มากขึ้น (ทั้งจังหวัด)
-- ---------------------------------------------------------------
alter table public.documents
  add column reply_required boolean not null default false,
  add column reply_due_on date,
  add constraint documents_reply_due check (reply_due_on is null or reply_required);
alter table public.documents drop constraint documents_to_unit_ids_check;
alter table public.documents add constraint documents_to_unit_ids_check check (cardinality(to_unit_ids) <= 2000);
comment on column public.documents.reply_required is 'หนังสือส่งที่ต้องการคำตอบจากหน่วยผู้รับ (ตอบใน document_routes.reply_text)';

-- ---------------------------------------------------------------
-- 3) เส้นทางหนังสือ
-- ---------------------------------------------------------------
create table public.document_routes (
  id                    uuid primary key default gen_random_uuid(),
  document_id           uuid not null references public.documents (id),
  action                text not null check (action in ('propose', 'order', 'forward', 'inform', 'act')),
  from_user_id          uuid default auth.uid() references public.profiles (id),
  from_unit_id          uuid not null references public.org_units (id),
  to_unit_id            uuid references public.org_units (id),
  to_user_id            uuid references public.profiles (id),
  message               text not null default '' check (length(message) <= 2000),
  due_on                date,
  parent_route_id       uuid references public.document_routes (id),
  status                text not null default 'pending' check (status in ('pending', 'read', 'received', 'done', 'cancelled')),
  sent_at               timestamptz not null default now(),
  read_at               timestamptz,
  read_by               uuid references public.profiles (id),
  received_at           timestamptz,
  received_by           uuid references public.profiles (id),
  received_document_id  uuid references public.documents (id),
  reply_text            text check (reply_text is null or length(reply_text) <= 4000),
  replied_at            timestamptz,
  replied_by            uuid references public.profiles (id),
  done_note             text check (done_note is null or length(done_note) <= 2000),
  done_at               timestamptz,
  done_by               uuid references public.profiles (id),
  last_reminded_at      timestamptz,
  due_soon_notified_at  timestamptz,
  overdue_notified_at   timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint document_routes_target check ((to_unit_id is null) <> (to_user_id is null)),
  constraint document_routes_unit_actions check ((to_unit_id is not null) = (action in ('forward', 'order'))),
  constraint document_routes_received check ((status = 'received') = (received_document_id is not null)),
  constraint document_routes_status_kind check (
    (action = 'forward' and status in ('pending', 'read', 'received', 'cancelled'))
    or (action <> 'forward' and status in ('pending', 'read', 'done', 'cancelled'))
  )
);
comment on table public.document_routes is 'เส้นทางหนังสือ: forward ส่งถึงหน่วย / propose เสนอ / order สั่งการ / act มอบหมายผู้ดำเนินการ / inform แจ้งเพื่อทราบ (เขียนผ่านฟังก์ชันเท่านั้น)';
create unique index document_routes_forward_unique on public.document_routes (document_id, to_unit_id)
  where action = 'forward' and status <> 'cancelled';
create index document_routes_doc_idx on public.document_routes (document_id);
create index document_routes_to_user_idx on public.document_routes (to_user_id, status) where to_user_id is not null;
create index document_routes_to_unit_idx on public.document_routes (to_unit_id, status) where to_unit_id is not null;
create index document_routes_from_user_idx on public.document_routes (from_user_id) where action = 'act';
create trigger document_routes_set_updated_at before update on public.document_routes
  for each row execute function public.set_updated_at();
create trigger document_routes_audit after insert or update or delete on public.document_routes
  for each row execute function public.audit_row_change();

-- ย้ายการส่งของบทที่ 27 (รหัสเดิม) แล้วเลิกใช้ตารางเดิม
insert into public.document_routes (
  id, document_id, action, from_user_id, from_unit_id, to_unit_id, status, sent_at,
  received_at, received_by, received_document_id, created_at)
select x.id, x.document_id, 'forward', d.sent_by, d.org_unit_id, x.to_unit_id, x.status, coalesce(d.sent_at, x.created_at),
       x.received_at, x.received_by, x.received_document_id, x.created_at
from public.document_deliveries x
join public.documents d on d.id = x.document_id;
comment on table public.document_deliveries is 'เลิกใช้ตั้งแต่บทที่ 28 ข้อมูลย้ายไป document_routes (รหัสเดิม) ห้ามเขียนเพิ่ม';

-- ---------------------------------------------------------------
-- 4) การมองเห็น
--    เจ้าของหนังสือ (doc_visible): ผู้ดูสารบรรณของหน่วย (หนังสือลับเฉพาะผู้ลงทะเบียนและผู้ที่ระบุชื่อ)
--      + ผู้ที่มีเส้นทางถึงตน (เสนอ มอบหมาย แจ้งเพื่อทราบ) เห็นหนังสือฉบับนั้น
--    หน่วยปลายทาง (doc_route_visible): ผู้ดูสารบรรณของหน่วยที่ส่งถึง เปิดอ่านหนังสือทั่วไปได้ก่อนลงรับ
--      (หนังสือลับเห็นหลังผู้ลงทะเบียนลงรับเท่านั้น) และไม่เห็นข้อมูลภายในของหน่วยต้นทาง
-- ---------------------------------------------------------------
create or replace function private.doc_visible(d public.documents)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select d.is_active and (
    (public.can_view_docs(d.org_unit_id)
     and (
       d.classification = 'normal'
       or d.registered_by = auth.uid()
       or exists (select 1 from public.document_viewers v
                  where v.document_id = d.id and v.user_id = auth.uid() and v.is_active)
     ))
    or exists (select 1 from public.document_routes r
               where r.document_id = d.id and r.to_user_id = auth.uid() and r.status <> 'cancelled')
  );
$$;

create function private.doc_route_visible(d public.documents)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select d.is_active and d.classification = 'normal' and exists (
    select 1 from public.document_routes r
    where r.document_id = d.id and r.action = 'forward' and r.status in ('pending', 'read', 'received')
      and public.can_view_docs(r.to_unit_id)
  );
$$;

create or replace function public.can_view_document_files(p_entity_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      exists (select 1 from public.documents d
              where d.id = p_entity_id::uuid and (private.doc_visible(d) or private.doc_route_visible(d)))
      or exists (select 1 from public.documents c
                 where c.source_document_id = p_entity_id::uuid and c.status = 'received' and private.doc_visible(c))
    );
$$;

-- เห็นเส้นทาง: ฝั่งเจ้าของหนังสือ ผู้ส่ง ผู้รับ และผู้ดูสารบรรณของหน่วยปลายทาง
create function public.can_view_route(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.document_routes r join public.documents d on d.id = r.document_id
    where r.id = p_id and (
      r.to_user_id = auth.uid() or r.from_user_id = auth.uid()
      or (r.to_unit_id is not null and r.action = 'forward' and public.can_view_docs(r.to_unit_id))
      or (public.can_view_docs(d.org_unit_id) and private.doc_visible(d))
    )
  );
$$;

alter table public.document_routes enable row level security;
create policy document_routes_read on public.document_routes for select to authenticated
  using (public.can_view_route(id));
revoke all on public.document_routes from anon;
revoke insert, update, delete, truncate on public.document_routes from authenticated;
grant select on public.document_routes to authenticated;

-- ---------------------------------------------------------------
-- 5) ตัวช่วยภายใน
-- ---------------------------------------------------------------
-- ทุกคนที่มีบทบาท (ยังมีผล) ในหน่วย: ผู้ที่มอบหมายหรือแจ้งเพื่อทราบได้
create function private.doc_unit_member_ids(p_unit uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct ur.user_id
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where ur.org_unit_id = p_unit
    and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date);
$$;

-- ผู้สั่งการได้ของหน่วย (ผู้ที่เสนอถึงได้)
create function private.doc_commander_ids(p_unit uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct ur.user_id
  from public.user_roles ur
  join public.roles ro on ro.key = ur.role_key and ro.docs_command and ro.docs_view = 'own'
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where ur.org_unit_id = p_unit
    and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date);
$$;

create function private.docs_notify_viewers(p_unit uuid, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, title, body, link)
  select i, p_title, coalesce(p_body, ''), p_link
  from private.doc_unit_viewer_ids(p_unit) i
  where i is distinct from auth.uid();
$$;

create function private.doc_route_label(p_doc public.documents)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_doc.doc_no <> '' then 'ที่ ' || p_doc.doc_no || ' ' else '' end
      || case when p_doc.classification = 'normal' then p_doc.subject else '(หนังสือลับ)' end;
$$;

-- ล็อกหนังสือที่ผู้ใช้เห็น (ไม่ต้องมีสิทธิ์ลงทะเบียน) สำหรับเสนอ สั่งการ
create function private.doc_lock_visible(p_id uuid)
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
  return v;
end;
$$;

-- สร้างเส้นทางส่งถึงหน่วย (ใช้ทั้งส่งหนังสือที่ออกเลขแล้ว และส่งต่อหนังสือที่ลงรับแล้ว)
create function private.doc_forward_units(p_doc public.documents, p_units uuid[], p_message text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit uuid;
  v_count integer := 0;
  v_due date := case when p_doc.reply_required then p_doc.reply_due_on end;
begin
  if cardinality(coalesce(p_units, '{}')) > 2000 then
    raise exception 'ส่งถึงหน่วยในระบบได้ไม่เกิน 2,000 หน่วยต่อครั้ง' using errcode = 'P0001';
  end if;
  foreach v_unit in array coalesce(p_units, '{}') loop
    if v_unit = p_doc.org_unit_id then
      raise exception 'หน่วยที่ส่งถึงต้องไม่ใช่หน่วยของท่านเอง' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.org_units u where u.id = v_unit and u.is_active) then
      raise exception 'หน่วยที่ส่งถึงต้องเป็นหน่วยที่ใช้งานอยู่' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.document_routes r
               where r.document_id = p_doc.id and r.to_unit_id = v_unit and r.action = 'forward' and r.status <> 'cancelled') then
      raise exception 'ส่งหนังสือนี้ถึง % แล้ว', private.doc_unit_name(v_unit) using errcode = 'P0001';
    end if;
    insert into public.document_routes (document_id, action, from_unit_id, to_unit_id, message, due_on)
    values (p_doc.id, 'forward', p_doc.org_unit_id, v_unit, left(btrim(coalesce(p_message, '')), 2000), v_due);
    v_count := v_count + 1;
    perform private.docs_notify_editors(v_unit,
      'มีหนังสือเข้ารอลงรับ ' || case when p_doc.doc_no <> '' then 'ที่ ' || p_doc.doc_no else '' end,
      'จาก' || private.doc_unit_name(p_doc.org_unit_id)
        || case when p_doc.classification = 'normal' then ' เรื่อง ' || p_doc.subject else ' (หนังสือลับ)' end,
      '/app/docs/inbox?unit=' || v_unit);
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------
-- 6) ปรับฟังก์ชันบทที่ 27 ให้ใช้เส้นทาง
-- ---------------------------------------------------------------
-- ร่าง: เพิ่ม ต้องการคำตอบ / วันที่ต้องตอบ และส่งถึงหน่วยได้ไม่เกิน 2,000 หน่วย
create or replace function public.save_document_draft(p_id uuid, p_unit uuid, p jsonb)
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
  v_reply boolean := coalesce((p ->> 'reply_required')::boolean, false);
  v_reply_due date;
begin
  perform private.doc_check_choices(p ->> 'kind', coalesce(p ->> 'urgency', 'normal'), coalesce(p ->> 'classification', 'normal'));
  if private.doc_text(p, 'subject', 500) = '' then
    raise exception 'กรุณากรอกเรื่อง' using errcode = 'P0001';
  end if;
  begin
    v_reply_due := nullif(p ->> 'reply_due_on', '')::date;
  exception when others then
    v_reply_due := null;
  end;
  if not v_reply then
    v_reply_due := null;
  elsif v_reply_due is not null and v_reply_due < private.today_bangkok() then
    raise exception 'วันที่ต้องตอบกลับต้องไม่ก่อนวันนี้' using errcode = 'P0001';
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
  if cardinality(v_units) > 2000 then
    raise exception 'ส่งถึงหน่วยในระบบได้ไม่เกิน 2,000 หน่วยต่อฉบับ' using errcode = 'P0001';
  end if;
  if v_unit = any (v_units) then
    raise exception 'หน่วยที่ส่งถึงต้องไม่ใช่หน่วยของท่านเอง' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_units) x
             where not exists (select 1 from public.org_units u where u.id = x and u.is_active)) then
    raise exception 'หน่วยที่ส่งถึงต้องเป็นหน่วยที่ใช้งานอยู่' using errcode = 'P0001';
  end if;
  if v_reply and cardinality(v_units) = 0 then
    raise exception 'หนังสือที่ต้องการคำตอบต้องส่งถึงหน่วยในระบบอย่างน้อย 1 หน่วย' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.documents (
      org_unit_id, direction, kind, status, to_text, to_unit_ids, subject, urgency, classification,
      salutation, body, closing, signer_name, signer_position, note, reply_required, reply_due_on)
    values (
      v_unit, 'send', p ->> 'kind', 'draft', private.doc_text(p, 'to_text', 300), v_units, private.doc_text(p, 'subject', 500),
      coalesce(p ->> 'urgency', 'normal'), coalesce(p ->> 'classification', 'normal'),
      private.doc_text(p, 'salutation', 100), left(coalesce(p ->> 'body', ''), 20000), private.doc_text(p, 'closing', 100),
      private.doc_text(p, 'signer_name', 200), private.doc_text(p, 'signer_position', 300), private.doc_text(p, 'note', 1000),
      v_reply, v_reply_due)
    returning * into v;
  else
    update public.documents
       set kind = p ->> 'kind', to_text = private.doc_text(p, 'to_text', 300), to_unit_ids = v_units,
           subject = private.doc_text(p, 'subject', 500), urgency = coalesce(p ->> 'urgency', 'normal'),
           classification = coalesce(p ->> 'classification', 'normal'),
           salutation = private.doc_text(p, 'salutation', 100), body = left(coalesce(p ->> 'body', ''), 20000),
           closing = private.doc_text(p, 'closing', 100), signer_name = private.doc_text(p, 'signer_name', 200),
           signer_position = private.doc_text(p, 'signer_position', 300), note = private.doc_text(p, 'note', 1000),
           reply_required = v_reply, reply_due_on = v_reply_due
     where id = v.id
    returning * into v;
  end if;
  perform private.doc_apply_viewers(v,
    array(select jsonb_array_elements_text(coalesce(p -> 'viewers', '[]'::jsonb))::uuid));
  return v.id;
end;
$$;

create or replace function public.send_document(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
begin
  v := private.doc_lock(p_id);
  if v.direction <> 'send' or v.status <> 'issued' then
    raise exception 'ส่งได้เฉพาะหนังสือที่ออกเลขแล้วและยังไม่ส่ง' using errcode = 'P0001';
  end if;
  update public.documents set status = 'sent', sent_by = auth.uid(), sent_at = now() where id = v.id;
  return private.doc_forward_units(v, v.to_unit_ids, '');
end;
$$;

-- ลงรับหนังสือที่ส่งถึงหน่วย: ได้เลขทะเบียนรับของหน่วยตน ไฟล์อ้างถึงหนังสือต้นฉบับ (ส่งต่อหลายทอดก็ชี้ต้นฉบับเดียวกัน)
create function public.receive_document_route(p_route uuid, p_viewers uuid[], p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.document_routes%rowtype;
  v_src public.documents%rowtype;
  v_doc public.documents%rowtype;
  v_year integer := private.doc_year_be(private.today_bangkok());
begin
  select * into v_r from public.document_routes where id = p_route for update;
  if not found or v_r.action <> 'forward' or v_r.status not in ('pending', 'read') then
    raise exception 'ไม่พบหนังสือที่รอลงรับ (อาจลงรับไปแล้วหรือต้นทางยกเลิก)' using errcode = 'P0001';
  end if;
  if not public.can_edit_docs(v_r.to_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์ลงรับหนังสือของหน่วยนี้' using errcode = '42501';
  end if;
  select * into v_src from public.documents where id = v_r.document_id;
  if v_src.status = 'cancelled' or not v_src.is_active then
    raise exception 'หนังสือนี้ถูกยกเลิกแล้ว' using errcode = 'P0001';
  end if;
  insert into public.documents (
    org_unit_id, direction, kind, status, series, number_year, seq_no, doc_no, doc_date,
    from_text, to_text, subject, urgency, classification, note, received_at, source_document_id)
  values (
    v_r.to_unit_id, 'receive', v_src.kind, 'received', 'receive', v_year,
    private.doc_next_no(v_r.to_unit_id, 'receive', v_year),
    v_src.doc_no, v_src.doc_date,
    left(case when v_src.direction = 'send' then coalesce(nullif(v_src.from_text, ''), private.doc_unit_name(v_src.org_unit_id))
              else private.doc_unit_name(v_src.org_unit_id) end, 300),
    v_src.to_text, v_src.subject, v_src.urgency, v_src.classification, left(btrim(coalesce(p_note, '')), 1000), now(),
    coalesce(v_src.source_document_id, v_src.id))
  returning * into v_doc;
  perform private.doc_apply_viewers(v_doc, p_viewers);
  update public.document_routes
     set status = 'received', received_document_id = v_doc.id, received_by = auth.uid(), received_at = now(),
         read_at = coalesce(read_at, now()), read_by = coalesce(read_by, auth.uid())
   where id = v_r.id;
  if v_r.from_user_id is not null and v_r.from_user_id is distinct from auth.uid() then
    perform public.notify_user(v_r.from_user_id, 'หน่วยปลายทางลงรับหนังสือแล้ว',
      private.doc_unit_name(v_r.to_unit_id) || ' ลงรับ' || private.doc_route_label(v_src), '/app/docs/' || v_src.id);
  end if;
  return v_doc.id;
end;
$$;

-- ชื่อเดิมของบทที่ 27 (รหัสการส่งเดิมย้ายมาเป็นรหัสเส้นทาง)
create or replace function public.receive_document_delivery(p_delivery uuid, p_viewers uuid[], p_note text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.receive_document_route(p_delivery, p_viewers, p_note);
$$;

-- ยกเลิก: เส้นทางที่ยังไม่จบถูกยกเลิกด้วย / ยกเลิกฉบับที่ลงรับ = เส้นทางกลับไปรอลงรับ
create or replace function public.cancel_document(p_id uuid, p_reason text)
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
  if exists (select 1 from public.document_routes r where r.document_id = v.id and r.action = 'forward' and r.status = 'received') then
    raise exception 'หน่วยปลายทางลงรับหนังสือนี้แล้ว ยกเลิกไม่ได้' using errcode = 'P0001';
  end if;
  update public.document_routes set status = 'cancelled'
   where document_id = v.id and status in ('pending', 'read');
  update public.document_routes
     set status = 'read', received_document_id = null, received_by = null, received_at = null
   where received_document_id = v.id;
  update public.documents
     set status = 'cancelled', cancel_reason = left(btrim(p_reason), 500), cancelled_by = auth.uid(), cancelled_at = now()
   where id = v.id;
end;
$$;

create or replace function public.incoming_documents(p_unit uuid)
returns table (
  delivery_id uuid, document_id uuid, from_unit_name text, doc_no text, doc_date date, subject text,
  kind text, urgency text, classification text, sent_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, d.id, u.name, d.doc_no, d.doc_date,
         case when d.classification = 'normal' or public.can_edit_docs(p_unit) then d.subject else '' end,
         d.kind, d.urgency, d.classification, r.sent_at
  from public.document_routes r
  join public.documents d on d.id = r.document_id
  join public.org_units u on u.id = r.from_unit_id
  where public.can_view_docs(p_unit) and r.to_unit_id = p_unit and r.action = 'forward'
    and r.status in ('pending', 'read') and d.status <> 'cancelled'
  order by r.sent_at;
$$;

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

-- ---------------------------------------------------------------
-- 7) ส่งต่อ เสนอ สั่งการ มอบหมาย แจ้งเพื่อทราบ
-- ---------------------------------------------------------------
-- ส่งต่อหนังสือที่ลงรับแล้วถึงหน่วยอื่นในระบบ (ผู้ลงทะเบียนของหน่วย)
create function public.forward_document(p_doc uuid, p_units uuid[], p_message text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
  v_units uuid[] := array(select distinct x from unnest(coalesce(p_units, '{}')) x where x is not null);
begin
  v := private.doc_lock(p_doc);
  if v.direction <> 'receive' or v.status <> 'received' then
    raise exception 'ส่งต่อได้เฉพาะหนังสือรับที่ลงรับแล้ว (หนังสือส่งให้ใช้ ส่งหนังสือ)' using errcode = 'P0001';
  end if;
  if cardinality(v_units) = 0 then
    raise exception 'กรุณาเลือกหน่วยที่ส่งต่อถึงอย่างน้อย 1 หน่วย' using errcode = 'P0001';
  end if;
  return private.doc_forward_units(v, v_units, p_message);
end;
$$;

-- เสนอ: ผู้ที่เห็นหนังสือเสนอถึงผู้สั่งการของหน่วย
create function public.propose_document(p_doc uuid, p_to_user uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
  v_id uuid;
begin
  v := private.doc_lock_visible(p_doc);
  if p_to_user is null or p_to_user = auth.uid()
     or p_to_user not in (select private.doc_commander_ids(v.org_unit_id)) then
    raise exception 'กรุณาเลือกผู้สั่งการของหน่วยที่จะเสนอถึง' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_message, ''))) = 0 then
    raise exception 'กรุณากรอกข้อความเสนอ' using errcode = 'P0001';
  end if;
  insert into public.document_routes (document_id, action, from_unit_id, to_user_id, message)
  values (v.id, 'propose', v.org_unit_id, p_to_user, left(btrim(p_message), 2000))
  returning id into v_id;
  perform public.notify_user(p_to_user, 'มีหนังสือเสนอถึงท่าน', private.doc_route_label(v), '/app/docs/' || v.id);
  return v_id;
end;
$$;

-- สั่งการ: บันทึกคำสั่งการ มอบหมายผู้ดำเนินการ (กำหนดเสร็จ) และแจ้งเพื่อทราบ ปิดเรื่องที่เสนอมา (ถ้าระบุ)
create function public.order_document(
  p_doc uuid, p_message text, p_assignees uuid[], p_due date, p_inform uuid[], p_parent uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
  v_p public.document_routes%rowtype;
  v_order uuid;
  v_user uuid;
  v_assignees uuid[] := array(select distinct x from unnest(coalesce(p_assignees, '{}')) x where x is not null);
  v_inform uuid[] := array(select distinct x from unnest(coalesce(p_inform, '{}')) x where x is not null);
  v_label text;
begin
  v := private.doc_lock_visible(p_doc);
  if not public.can_command_docs(v.org_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์สั่งการหนังสือของหน่วยนี้' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_message, ''))) = 0 then
    raise exception 'กรุณากรอกคำสั่งการ' using errcode = 'P0001';
  end if;
  if p_due is not null and p_due < private.today_bangkok() then
    raise exception 'กำหนดเสร็จต้องไม่ก่อนวันนี้' using errcode = 'P0001';
  end if;
  if cardinality(v_assignees) + cardinality(v_inform) > 50 then
    raise exception 'มอบหมายและแจ้งเพื่อทราบรวมได้ไม่เกิน 50 คนต่อครั้ง' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_assignees || v_inform) x
             where x not in (select private.doc_unit_member_ids(v.org_unit_id))) then
    raise exception 'ผู้ดำเนินการและผู้รับทราบต้องมีบทบาทในหน่วยของหนังสือ' using errcode = 'P0001';
  end if;
  if p_parent is not null then
    select * into v_p from public.document_routes where id = p_parent for update;
    if not found or v_p.document_id <> v.id or v_p.action <> 'propose' or v_p.to_user_id <> auth.uid()
       or v_p.status not in ('pending', 'read') then
      raise exception 'ไม่พบเรื่องที่เสนอถึงท่าน' using errcode = 'P0001';
    end if;
    update public.document_routes
       set status = 'done', done_at = now(), done_by = auth.uid(), done_note = 'สั่งการแล้ว', read_at = coalesce(read_at, now())
     where id = v_p.id;
  end if;
  v_label := private.doc_route_label(v);
  insert into public.document_routes (document_id, action, from_unit_id, to_unit_id, message, due_on, parent_route_id,
                                      status, done_at, done_by)
  values (v.id, 'order', v.org_unit_id, v.org_unit_id, left(btrim(p_message), 2000), p_due, p_parent, 'done', now(), auth.uid())
  returning id into v_order;
  foreach v_user in array v_assignees loop
    insert into public.document_routes (document_id, action, from_unit_id, to_user_id, message, due_on, parent_route_id)
    values (v.id, 'act', v.org_unit_id, v_user, left(btrim(p_message), 2000), p_due, v_order);
    if v_user is distinct from auth.uid() then
      perform public.notify_user(v_user, 'ท่านได้รับมอบหมายงาน', v_label, '/app/docs/tasks');
    end if;
  end loop;
  foreach v_user in array v_inform loop
    if v_user = any (v_assignees) then continue; end if;
    insert into public.document_routes (document_id, action, from_unit_id, to_user_id, message, parent_route_id)
    values (v.id, 'inform', v.org_unit_id, v_user, left(btrim(p_message), 2000), v_order);
    if v_user is distinct from auth.uid() then
      perform public.notify_user(v_user, 'แจ้งเพื่อทราบ', v_label, '/app/docs/' || v.id);
    end if;
  end loop;
  if p_parent is not null and v_p.from_user_id is distinct from auth.uid() then
    perform public.notify_user(v_p.from_user_id, 'เรื่องที่ท่านเสนอได้รับการสั่งการแล้ว', v_label, '/app/docs/' || v.id);
  end if;
  return v_order;
end;
$$;

-- รายงานผล / รับทราบ: ผู้รับเส้นทาง (มอบหมาย แจ้งเพื่อทราบ) ปิดงานของตน แจ้งผู้สั่ง
create function public.complete_route(p_route uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.document_routes%rowtype;
  v_doc public.documents%rowtype;
begin
  select * into v_r from public.document_routes where id = p_route for update;
  if not found or v_r.to_user_id is distinct from auth.uid() or v_r.action not in ('act', 'inform')
     or v_r.status not in ('pending', 'read') then
    raise exception 'ไม่พบงานที่รอท่านดำเนินการ' using errcode = 'P0001';
  end if;
  if v_r.action = 'act' and length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'กรุณารายงานผลการดำเนินการ' using errcode = 'P0001';
  end if;
  update public.document_routes
     set status = 'done', done_at = now(), done_by = auth.uid(), done_note = nullif(left(btrim(coalesce(p_note, '')), 2000), ''),
         read_at = coalesce(read_at, now()), read_by = coalesce(read_by, auth.uid())
   where id = v_r.id;
  if v_r.action = 'act' and v_r.from_user_id is not null and v_r.from_user_id is distinct from auth.uid() then
    select * into v_doc from public.documents where id = v_r.document_id;
    perform public.notify_user(v_r.from_user_id, 'ผู้ได้รับมอบหมายรายงานผลแล้ว', private.doc_route_label(v_doc), '/app/docs/' || v_doc.id);
  end if;
end;
$$;

-- ยกเลิกเส้นทางภายในหน่วยที่ตนส่งและยังไม่จบ (เสนอผิดคน มอบหมายผิด)
create function public.cancel_route(p_route uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.document_routes%rowtype;
begin
  select * into v_r from public.document_routes where id = p_route for update;
  if not found or v_r.from_user_id is distinct from auth.uid() or v_r.action not in ('propose', 'act', 'inform')
     or v_r.status not in ('pending', 'read') then
    raise exception 'ยกเลิกได้เฉพาะเรื่องที่ท่านส่งและยังไม่ดำเนินการ' using errcode = 'P0001';
  end if;
  update public.document_routes set status = 'cancelled' where id = v_r.id;
end;
$$;

-- เปิดอ่าน: บันทึกเวลาอ่านครั้งแรกของเส้นทางที่ถึงตน หรือถึงหน่วยที่ตนดูสารบรรณได้
create function public.mark_document_read(p_doc uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.document_routes r
     set read_at = now(), read_by = auth.uid(), status = case when r.status = 'pending' then 'read' else r.status end
   where r.document_id = p_doc and r.read_at is null and r.status in ('pending', 'received')
     and (r.to_user_id = auth.uid() or (r.action = 'forward' and public.can_view_docs(r.to_unit_id)));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ตอบกลับ: หน่วยผู้รับตอบหนังสือที่ต้องการคำตอบ (ลงรับแล้ว แก้คำตอบได้จนกว่าต้นทางยกเลิก) ไฟล์ = แนบที่เส้นทาง
create function public.reply_route(p_route uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.document_routes%rowtype;
  v_src public.documents%rowtype;
begin
  select * into v_r from public.document_routes where id = p_route for update;
  if not found or v_r.action <> 'forward' or v_r.status <> 'received' then
    raise exception 'ตอบได้หลังลงรับหนังสือแล้ว' using errcode = 'P0001';
  end if;
  if not public.can_edit_docs(v_r.to_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์ตอบหนังสือในนามหน่วยนี้' using errcode = '42501';
  end if;
  select * into v_src from public.documents where id = v_r.document_id;
  if not v_src.reply_required or v_src.status = 'cancelled' then
    raise exception 'หนังสือนี้ไม่ได้ขอคำตอบ' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_text, ''))) = 0 then
    raise exception 'กรุณากรอกคำตอบ' using errcode = 'P0001';
  end if;
  update public.document_routes
     set reply_text = left(btrim(p_text), 4000), replied_at = now(), replied_by = auth.uid()
   where id = v_r.id;
  if v_r.from_user_id is not null and v_r.from_user_id is distinct from auth.uid() then
    perform public.notify_user(v_r.from_user_id, 'หน่วยปลายทางตอบกลับแล้ว',
      private.doc_unit_name(v_r.to_unit_id) || ' ตอบ' || private.doc_route_label(v_src), '/app/docs/' || v_src.id);
  end if;
end;
$$;

-- เตือนซ้ำ (ผู้ลงทะเบียนของหน่วยต้นทาง) p_kind unread = หน่วยที่ยังไม่เปิดอ่าน / unreplied = หน่วยที่ยังไม่ตอบ
-- เตือนหน่วยเดิมได้ชั่วโมงละครั้ง คืนจำนวนหน่วยที่เตือน
create function public.remind_document_routes(p_doc uuid, p_kind text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.documents%rowtype;
  v_r public.document_routes%rowtype;
  v_count integer := 0;
begin
  v := private.doc_lock(p_doc);
  if p_kind not in ('unread', 'unreplied') then
    raise exception 'ชนิดการเตือนไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  if p_kind = 'unreplied' and not v.reply_required then
    raise exception 'หนังสือนี้ไม่ได้ขอคำตอบ' using errcode = 'P0001';
  end if;
  for v_r in
    select * from public.document_routes r
    where r.document_id = v.id and r.action = 'forward'
      and (r.last_reminded_at is null or r.last_reminded_at < now() - interval '1 hour')
      and case when p_kind = 'unread' then r.status = 'pending'
               else r.status in ('pending', 'read', 'received') and r.reply_text is null end
    for update
  loop
    perform private.docs_notify_viewers(v_r.to_unit_id,
      case when p_kind = 'unread' then 'เตือน: มีหนังสือรอเปิดอ่าน' else 'เตือน: หนังสือรอการตอบกลับ' end,
      'จาก' || private.doc_unit_name(v.org_unit_id) || ' ' || private.doc_route_label(v)
        || case when v.reply_due_on is not null and p_kind = 'unreplied' then ' ตอบภายใน ' || to_char(v.reply_due_on, 'DD/MM/') || (extract(year from v.reply_due_on)::integer + 543) else '' end,
      '/app/docs/inbox?unit=' || v_r.to_unit_id);
    update public.document_routes set last_reminded_at = now() where id = v_r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- เตือนกำหนดเสร็จ (เรียกเมื่อมีผู้เปิดหน้ากล่องหนังสือเข้าหรืองาน) แจ้งครั้งเดียวต่อขั้น:
--   ใกล้กำหนด (ภายใน docs_due_warn_days วัน) และเกินกำหนด (แจ้งผู้สั่งด้วย)
create function public.remind_docs_due()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := private.today_bangkok();
  v_days integer := least(30, greatest(0, coalesce((select s.value_int from public.app_settings s where s.key = 'docs_due_warn_days'), 2)));
  v_r record;
  v_count integer := 0;
begin
  -- งานที่มอบหมาย
  for v_r in
    select r.id, r.to_user_id, r.from_user_id, r.due_on, r.due_soon_notified_at, r.overdue_notified_at, d.id as doc_id,
           private.doc_route_label(d) as label
    from public.document_routes r join public.documents d on d.id = r.document_id
    where r.action = 'act' and r.status in ('pending', 'read') and r.due_on is not null and d.status <> 'cancelled'
      and ((r.due_on < v_today and r.overdue_notified_at is null)
           or (r.due_on >= v_today and r.due_on <= v_today + v_days and r.due_soon_notified_at is null))
    for update of r
  loop
    if v_r.due_on < v_today then
      perform public.notify_user(v_r.to_user_id, 'งานเกินกำหนดเสร็จ', v_r.label, '/app/docs/tasks');
      if v_r.from_user_id is not null and v_r.from_user_id <> v_r.to_user_id then
        perform public.notify_user(v_r.from_user_id, 'งานที่มอบหมายเกินกำหนดเสร็จ', v_r.label, '/app/docs/tasks?tab=ordered');
      end if;
      update public.document_routes set overdue_notified_at = now(), due_soon_notified_at = coalesce(due_soon_notified_at, now())
       where id = v_r.id;
    else
      perform public.notify_user(v_r.to_user_id, 'งานใกล้ครบกำหนดเสร็จ',
        v_r.label || ' กำหนด ' || to_char(v_r.due_on, 'DD/MM/') || (extract(year from v_r.due_on)::integer + 543), '/app/docs/tasks');
      update public.document_routes set due_soon_notified_at = now() where id = v_r.id;
    end if;
    v_count := v_count + 1;
  end loop;
  -- หนังสือที่ต้องตอบกลับ
  for v_r in
    select r.id, r.to_unit_id, r.due_on, d.id as doc_id, private.doc_route_label(d) as label
    from public.document_routes r join public.documents d on d.id = r.document_id
    where r.action = 'forward' and r.status in ('pending', 'read', 'received') and r.reply_text is null
      and r.due_on is not null and d.reply_required and d.status <> 'cancelled'
      and ((r.due_on < v_today and r.overdue_notified_at is null)
           or (r.due_on >= v_today and r.due_on <= v_today + v_days and r.due_soon_notified_at is null))
    for update of r
  loop
    perform private.docs_notify_editors(v_r.to_unit_id,
      case when v_r.due_on < v_today then 'หนังสือเกินกำหนดตอบกลับ' else 'หนังสือใกล้ครบกำหนดตอบกลับ' end,
      v_r.label || ' กำหนด ' || to_char(v_r.due_on, 'DD/MM/') || (extract(year from v_r.due_on)::integer + 543),
      '/app/docs/inbox?unit=' || v_r.to_unit_id);
    if v_r.due_on < v_today then
      update public.document_routes set overdue_notified_at = now(), due_soon_notified_at = coalesce(due_soon_notified_at, now())
       where id = v_r.id;
    else
      update public.document_routes set due_soon_notified_at = now() where id = v_r.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------
-- 8) ฟังก์ชันอ่าน
-- ---------------------------------------------------------------
-- กล่องหนังสือเข้า: หนังสือถึงหน่วยที่ตนดูสารบรรณได้ (รอลงรับ หรือรอตอบกลับ) และเรื่องที่เสนอ/แจ้งถึงตน
create function public.docs_inbox()
returns table (
  route_id uuid, document_id uuid, action text, kind text, doc_no text, doc_date date, subject text,
  urgency text, classification text, from_name text, from_unit_name text, to_unit_id uuid, to_unit_name text,
  message text, due_on date, sent_at timestamptz, read_at timestamptz, status text,
  can_receive boolean, reply_required boolean, replied boolean, received_document_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, d.id, r.action, d.kind, d.doc_no, d.doc_date,
         case when r.to_user_id is not null or d.classification = 'normal' or public.can_edit_docs(r.to_unit_id) then d.subject else '' end,
         d.urgency, d.classification, private.inv_person_name(r.from_user_id), private.doc_unit_name(r.from_unit_id),
         r.to_unit_id, private.doc_unit_name(r.to_unit_id), r.message, r.due_on, r.sent_at, r.read_at, r.status,
         r.to_unit_id is not null and r.status in ('pending', 'read') and public.can_edit_docs(r.to_unit_id),
         d.reply_required, r.reply_text is not null, r.received_document_id
  from public.document_routes r
  join public.documents d on d.id = r.document_id
  where d.status <> 'cancelled' and d.is_active and (
    (r.action = 'forward' and public.can_view_docs(r.to_unit_id)
       and (r.status in ('pending', 'read') or (r.status = 'received' and d.reply_required and r.reply_text is null)))
    or (r.to_user_id = auth.uid() and r.action in ('propose', 'inform') and r.status in ('pending', 'read'))
  )
  order by r.sent_at desc;
$$;

-- จำนวนรายการในกล่องหนังสือเข้าและงานค้างของฉัน (ป้ายบนเมนู)
create function public.docs_counts()
returns table (inbox integer, tasks integer)
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*)::integer from public.docs_inbox()),
         (select count(*)::integer from public.document_routes r join public.documents d on d.id = r.document_id
          where r.to_user_id = auth.uid() and r.action = 'act' and r.status in ('pending', 'read') and d.status <> 'cancelled');
$$;

-- งาน: mine = ที่ได้รับมอบหมาย / ordered = ที่ฉันมอบหมาย
create function public.docs_tasks(p_tab text)
returns table (
  route_id uuid, document_id uuid, doc_no text, subject text, kind text, urgency text, classification text,
  org_unit_id uuid, org_unit_name text, from_name text, to_name text, message text, due_on date, sent_at timestamptz,
  read_at timestamptz, status text, done_at timestamptz, done_note text, overdue boolean, attachment_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, d.id, d.doc_no, d.subject, d.kind, d.urgency, d.classification, d.org_unit_id, private.doc_unit_name(d.org_unit_id),
         private.inv_person_name(r.from_user_id), private.inv_person_name(r.to_user_id), r.message, r.due_on, r.sent_at,
         r.read_at, r.status, r.done_at, r.done_note,
         r.status in ('pending', 'read') and r.due_on is not null and r.due_on < private.today_bangkok(),
         (select count(*)::integer from public.attachments a where a.entity_table = 'document_routes' and a.entity_id = r.id::text and a.is_active)
  from public.document_routes r
  join public.documents d on d.id = r.document_id
  where r.action = 'act' and r.status <> 'cancelled' and d.is_active
    and case p_tab when 'ordered' then r.from_user_id = auth.uid() else r.to_user_id = auth.uid() end
  order by (r.status in ('pending', 'read')) desc, r.due_on nulls last, r.sent_at desc;
$$;

-- ผู้ที่เสนอถึงได้ (ผู้สั่งการของหน่วย) และผู้ที่มอบหมายได้ (ทุกคนที่มีบทบาทในหน่วย)
create function public.doc_route_candidates(p_doc uuid, p_kind text)
returns table (user_id uuid, name text, roles text)
language sql
stable
security definer
set search_path = public
as $$
  select i, private.inv_person_name(i),
         (select string_agg(distinct ro.name, ', ') from public.user_roles ur join public.roles ro on ro.key = ur.role_key
          where ur.user_id = i and ur.org_unit_id = d.org_unit_id
            and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date))
  from public.documents d,
       lateral (select x as i from private.doc_commander_ids(d.org_unit_id) x where p_kind = 'commanders'
                union
                select x from private.doc_unit_member_ids(d.org_unit_id) x
                where p_kind = 'members' and public.can_command_docs(d.org_unit_id)) c
  where d.id = p_doc and private.doc_visible(d)
  order by 2;
$$;

-- รายละเอียดหนังสือ: scope owner = ฝั่งเจ้าของหนังสือ (เห็นทุกอย่าง) / recipient = หน่วยที่ส่งถึง (เห็นเฉพาะตัวหนังสือและเส้นทางถึงหน่วยตน)
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
    -- ฉบับที่ลงรับ: เส้นทางที่ส่งมาถึง (ใช้ตอบกลับ) และหนังสือต้นทาง
    'source_route', (select jsonb_build_object('id', r.id, 'reply_required', s.reply_required, 'reply_due_on', s.reply_due_on,
                              'reply_text', r.reply_text, 'replied_at', r.replied_at, 'message', r.message,
                              'from_unit_name', private.doc_unit_name(r.from_unit_id), 'to_unit_id', r.to_unit_id)
                     from public.document_routes r join public.documents s on s.id = r.document_id
                     where r.received_document_id = v.id and r.status = 'received' limit 1),
    'source', case when v.source_document_id is null then null else (
                select jsonb_build_object('id', s.id, 'unit_name', private.doc_unit_name(s.org_unit_id), 'doc_no', s.doc_no)
                from public.documents s where s.id = v.source_document_id) end,
    'letterhead', (select jsonb_build_object('code_prefix', s.code_prefix, 'agency_name', s.agency_name, 'address', s.address)
                   from public.doc_unit_settings s where s.org_unit_id = v.org_unit_id)
  ) into v_out;
  if not v_owner then
    v_out := v_out || jsonb_build_object('note', '', 'registered_by_name', null, 'issued_by_name', null, 'sent_by_name', null);
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------
-- 9) ไฟล์แนบของเส้นทาง (คำตอบของหน่วยผู้รับ / รายงานผลของผู้ดำเนินการ) entity_table = document_routes
-- ---------------------------------------------------------------
create function public.can_attach_route_file(p_entity_id text, p_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and exists (
    select 1 from public.document_routes r join public.documents d on d.id = r.document_id
    where r.id = p_entity_id::uuid and d.status <> 'cancelled' and (
      (r.action = 'forward' and r.status = 'received' and d.reply_required
         and r.to_unit_id = p_unit and public.can_edit_docs(r.to_unit_id))
      or (r.action = 'act' and r.status in ('pending', 'read') and r.to_user_id = auth.uid() and p_unit = r.from_unit_id)
    )
  );
$$;

create function public.can_view_route_files(p_entity_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.can_view_route(p_entity_id::uuid);
$$;

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
      when entity_table = 'document_routes' then public.can_view_route_files(entity_id)
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
      when entity_table = 'document_routes' then public.can_attach_route_file(entity_id, org_unit_id)
      else org_unit_id is null or public.can_access(org_unit_id)
    end
  );

-- ---------------------------------------------------------------
-- 10) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke all on function private.doc_route_visible(public.documents) from public, anon, authenticated;
revoke all on function private.doc_unit_member_ids(uuid) from public, anon, authenticated;
revoke all on function private.doc_commander_ids(uuid) from public, anon, authenticated;
revoke all on function private.docs_notify_viewers(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.doc_route_label(public.documents) from public, anon, authenticated;
revoke all on function private.doc_lock_visible(uuid) from public, anon, authenticated;
revoke all on function private.doc_forward_units(public.documents, uuid[], text) from public, anon, authenticated;

revoke execute on function public.can_command_docs(uuid) from public, anon;
revoke execute on function public.can_view_route(uuid) from public, anon;
revoke execute on function public.receive_document_route(uuid, uuid[], text) from public, anon;
revoke execute on function public.forward_document(uuid, uuid[], text) from public, anon;
revoke execute on function public.propose_document(uuid, uuid, text) from public, anon;
revoke execute on function public.order_document(uuid, text, uuid[], date, uuid[], uuid) from public, anon;
revoke execute on function public.complete_route(uuid, text) from public, anon;
revoke execute on function public.cancel_route(uuid) from public, anon;
revoke execute on function public.mark_document_read(uuid) from public, anon;
revoke execute on function public.reply_route(uuid, text) from public, anon;
revoke execute on function public.remind_document_routes(uuid, text) from public, anon;
revoke execute on function public.remind_docs_due() from public, anon;
revoke execute on function public.docs_inbox() from public, anon;
revoke execute on function public.docs_counts() from public, anon;
revoke execute on function public.docs_tasks(text) from public, anon;
revoke execute on function public.doc_route_candidates(uuid, text) from public, anon;
revoke execute on function public.can_attach_route_file(text, uuid) from public, anon;
revoke execute on function public.can_view_route_files(text) from public, anon;

grant execute on function public.can_command_docs(uuid) to authenticated;
grant execute on function public.can_view_route(uuid) to authenticated;
grant execute on function public.receive_document_route(uuid, uuid[], text) to authenticated;
grant execute on function public.forward_document(uuid, uuid[], text) to authenticated;
grant execute on function public.propose_document(uuid, uuid, text) to authenticated;
grant execute on function public.order_document(uuid, text, uuid[], date, uuid[], uuid) to authenticated;
grant execute on function public.complete_route(uuid, text) to authenticated;
grant execute on function public.cancel_route(uuid) to authenticated;
grant execute on function public.mark_document_read(uuid) to authenticated;
grant execute on function public.reply_route(uuid, text) to authenticated;
grant execute on function public.remind_document_routes(uuid, text) to authenticated;
grant execute on function public.remind_docs_due() to authenticated;
grant execute on function public.docs_inbox() to authenticated;
grant execute on function public.docs_counts() to authenticated;
grant execute on function public.docs_tasks(text) to authenticated;
grant execute on function public.doc_route_candidates(uuid, text) to authenticated;
grant execute on function public.can_attach_route_file(text, uuid) to authenticated;
grant execute on function public.can_view_route_files(text) to authenticated;
