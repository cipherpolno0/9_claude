-- บทที่ 4 (1/3): ชิ้นส่วนกลาง — เขตปกครองตามสิทธิ์ ไฟล์แนบ แจ้งเตือน

-- ---------------------------------------------------------------
-- เขตปกครองที่ผู้ใช้ปัจจุบันเข้าถึงได้ (ใช้กับตัวเลือกเขตปกครองแบบไล่ชั้น)
-- selectable = เลือกได้จริง / ไม่ใช่ = เป็นหน่วยเหนือที่แสดงไว้ให้ไล่ชั้นลงมาเท่านั้น
-- ---------------------------------------------------------------
create function public.accessible_org_units()
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
    select m.role_key, m.org_unit_id from public.my_role_rows() m where m.effective
  ),
  everything as (
    select exists (select 1 from mine where role_key in ('admin', 'central_staff')) as yes
  ),
  roots as (
    select distinct org_unit_id as id from mine where org_unit_id is not null
  ),
  reachable as (
    select r.id from roots r
    union
    select d.id from roots r cross join lateral public.descendants_of(r.id) d
  ),
  path_only as (
    select a.id from roots r cross join lateral public.ancestors_or_self(r.id) a where a.depth > 0
  )
  select u.id, u.parent_id, u.level, u.sect, u.name, u.code, u.is_active,
         ((select yes from everything) or u.id in (select id from reachable)) as selectable
  from public.org_units u
  where u.is_active
    and (
      (select yes from everything)
      or u.id in (select id from reachable)
      or u.id in (select id from path_only)
    )
  order by u.code;
$$;
revoke execute on function public.accessible_org_units() from public, anon;
grant execute on function public.accessible_org_units() to authenticated;

-- ---------------------------------------------------------------
-- attachments: ไฟล์แนบของรายการใดก็ได้ในระบบ
-- สิทธิ์ดูไฟล์ = ผู้อัปโหลด หรือผู้ที่เข้าถึงเขตปกครองของเรื่องนั้นได้
-- ---------------------------------------------------------------
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  entity_table  text not null check (entity_table ~ '^[a-z_]+$'),  -- ตารางของรายการที่แนบ เช่น requests
  entity_id     text not null,                                      -- รหัสของรายการนั้น
  org_unit_id   uuid references public.org_units (id),              -- เขตปกครองของเรื่อง (กำหนดผู้มีสิทธิ์ดู)
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by   uuid not null default auth.uid() references public.profiles (id),
  is_active     boolean not null default true,                      -- ปิดใช้งานแทนการลบ
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.attachments is 'ไฟล์แนบกลาง: PDF รูปภาพ Excel Word ไม่เกิน 10 MB';
create index attachments_entity_idx on public.attachments (entity_table, entity_id);

create trigger attachments_set_updated_at before update on public.attachments
  for each row execute function public.set_updated_at();
create trigger attachments_audit after insert or update or delete on public.attachments
  for each row execute function public.audit_row_change();

alter table public.attachments enable row level security;
revoke all on public.attachments from anon;
revoke delete on public.attachments from authenticated;

create policy attachments_read on public.attachments for select to authenticated
  using (uploaded_by = auth.uid() or public.has_role('admin') or public.can_access(org_unit_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (org_unit_id is null or public.can_access(org_unit_id))
    and storage_path like auth.uid()::text || '/%'
  );
create policy attachments_update on public.attachments for update to authenticated
  using (uploaded_by = auth.uid() or public.has_role('admin'))
  with check (uploaded_by = auth.uid() or public.has_role('admin'));

-- ---------------------------------------------------------------
-- notifications: แจ้งเตือนในระบบ (กระดิ่งบนแถบบน)
-- ---------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  body        text not null default '',
  link        text,                         -- เส้นทางภายในเว็บ เช่น /app/approvals/...
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
comment on table public.notifications is 'แจ้งเตือนในระบบของผู้ใช้แต่ละคน';
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_read_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_mark_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- สร้างแจ้งเตือน: ใช้ภายในฟังก์ชันฐานข้อมูลเท่านั้น ผู้ใช้เรียกเองไม่ได้
create function public.notify_user(p_user_id uuid, p_title text, p_body text default '', p_link text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, title, body, link)
  select p_user_id, p_title, coalesce(p_body, ''), p_link
  where p_user_id is not null;
$$;
revoke execute on function public.notify_user(uuid, text, text, text) from public, anon, authenticated;

-- แจ้งเตือนทดสอบถึงตนเอง (ใช้ในหน้าสาธิต)
create function public.send_test_notification()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'กรุณาเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;
  perform public.notify_user(
    auth.uid(), 'แจ้งเตือนทดสอบ',
    'ข้อความนี้ส่งจากหน้าสาธิตชิ้นส่วนกลาง', '/app/admin/demo'
  );
end;
$$;
revoke execute on function public.send_test_notification() from public, anon;
grant execute on function public.send_test_notification() to authenticated;
