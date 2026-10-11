-- บทที่ 30: หน้าแรก ติดต่อเรา ดาวน์โหลด ค้นหารวม (ช่วงปิดงาน)
-- 1) ข่าวประกาศ (announcements + ไฟล์แนบ announcement_files) ปักหมุดได้ มีวันเผยแพร่และวันหมดอายุ
-- 2) ปฏิทินงานสอบ = วันจากรอบสมัครสอบของปีการศึกษาปัจจุบัน + รายการที่เพิ่มเอง (exam_calendar_events)
-- 3) ติดต่อเรา: ข้อมูลหน่วยงาน (site_contact แถวเดียว ผู้ดูแลระบบกรอกเอง เริ่มว่าง) หัวข้อ 6 หัวข้อ (contact_topics)
--    ผู้รับต่อหัวข้อ (contact_topic_recipients ผู้ดูแลระบบกำหนด: บทบาท หรือรายชื่อผู้ใช้ ไม่กำหนด = ผู้ดูแลระบบ)
--    ข้อความ (contact_messages) ส่งผ่าน submit_contact_message ที่เรียกได้เฉพาะเซิร์ฟเวอร์ของเว็บ (จำกัด 5 ครั้งต่อชั่วโมงต่อเครื่อง)
-- 4) ดาวน์โหลด (downloads) 5 หมวด ไฟล์อยู่ในที่เก็บสาธารณะ site-files หรือเป็นลิงก์ภายนอก
-- 5) ค้นหารวมในพื้นที่ทำงาน workspace_search (บุคคล สถานที่ สนามสอบ คำขอ หนังสือ ตามสิทธิ์เดิมของแต่ละระบบ)
-- ผู้สั่งงานเลือก: ข้อมูลติดต่อและผู้รับข้อความ ผู้ดูแลระบบกำหนดเอง / ข่าวและดาวน์โหลด ผู้ดูแลระบบและส่วนกลาง
--   / ปฏิทิน = รอบสมัครสอบ + เพิ่มเองได้

-- ---------------------------------------------------------------
-- 0) สิทธิ์จัดการเนื้อหาของเว็บ (ข่าว ดาวน์โหลด ปฏิทิน)
-- ---------------------------------------------------------------
create function public.can_manage_site_content()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin') or public.has_role('central_staff');
$$;

create function private.site_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Bangkok')::date;
$$;

-- ---------------------------------------------------------------
-- 1) ข่าวประกาศ
-- ---------------------------------------------------------------
create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (btrim(title) <> '' and length(title) <= 300),
  body          text not null default '' check (length(body) <= 20000),
  is_pinned     boolean not null default false,
  published_on  date not null default ((now() at time zone 'Asia/Bangkok')::date),
  expires_on    date,
  is_active     boolean not null default true,
  created_by    uuid default auth.uid() references public.profiles (id),
  updated_by    uuid default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint announcements_expires check (expires_on is null or expires_on >= published_on)
);
comment on table public.announcements is 'ข่าวประกาศของเว็บ (หน้าแรก) แสดงเมื่อใช้งาน ถึงวันเผยแพร่ และยังไม่หมดอายุ ปิดใช้งานแทนการลบ';
create index announcements_public_idx on public.announcements (is_pinned desc, published_on desc) where is_active;
create trigger announcements_set_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();
create trigger announcements_audit after insert or update or delete on public.announcements
  for each row execute function public.audit_row_change();
alter table public.announcements enable row level security;
create policy announcements_read on public.announcements for select to authenticated
  using (public.can_manage_site_content());
create policy announcements_insert on public.announcements for insert to authenticated
  with check (public.can_manage_site_content());
create policy announcements_update on public.announcements for update to authenticated
  using (public.can_manage_site_content()) with check (public.can_manage_site_content());
revoke all on public.announcements from anon;
revoke delete, truncate on public.announcements from authenticated;
grant select, insert, update on public.announcements to authenticated;

create table public.announcement_files (
  id               uuid primary key default gen_random_uuid(),
  announcement_id  uuid not null references public.announcements (id),
  storage_path     text not null unique check (storage_path ~ '^announcements/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,5}$'),
  file_name        text not null check (btrim(file_name) <> '' and length(file_name) <= 255),
  mime_type        text not null check (length(mime_type) <= 150),
  size_bytes       integer not null check (size_bytes > 0),
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_by       uuid default auth.uid() references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.announcement_files is 'ไฟล์แนบของข่าวประกาศ (ที่เก็บสาธารณะ site-files ห้ามมีข้อมูลส่วนบุคคล) นำออก = ปิดใช้งาน';
create index announcement_files_idx on public.announcement_files (announcement_id) where is_active;
create trigger announcement_files_set_updated_at before update on public.announcement_files
  for each row execute function public.set_updated_at();
create trigger announcement_files_audit after insert or update or delete on public.announcement_files
  for each row execute function public.audit_row_change();
alter table public.announcement_files enable row level security;
create policy announcement_files_read on public.announcement_files for select to authenticated
  using (public.can_manage_site_content());
create policy announcement_files_insert on public.announcement_files for insert to authenticated
  with check (public.can_manage_site_content() and storage_path like 'announcements/' || announcement_id::text || '/%');
create policy announcement_files_update on public.announcement_files for update to authenticated
  using (public.can_manage_site_content()) with check (public.can_manage_site_content());
revoke all on public.announcement_files from anon;
revoke delete, truncate on public.announcement_files from authenticated;
grant select, insert, update on public.announcement_files to authenticated;

-- ---------------------------------------------------------------
-- 2) ดาวน์โหลด
-- ---------------------------------------------------------------
create table public.downloads (
  id            uuid primary key default gen_random_uuid(),
  category      text not null check (category in ('form', 'template', 'manual', 'calendar', 'regulation')),
  title         text not null check (btrim(title) <> '' and length(title) <= 300),
  description   text not null default '' check (length(description) <= 1000),
  storage_path  text unique check (storage_path ~ '^downloads/[0-9a-f-]{36}\.[a-z0-9]{1,5}$'),
  file_name     text check (file_name is null or (btrim(file_name) <> '' and length(file_name) <= 255)),
  mime_type     text check (mime_type is null or length(mime_type) <= 150),
  size_bytes    integer check (size_bytes is null or size_bytes > 0),
  url           text check (url is null or (url ~ '^https?://' and length(url) <= 1000)),
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_by    uuid default auth.uid() references public.profiles (id),
  updated_by    uuid default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint downloads_target check ((storage_path is null) <> (url is null)),
  constraint downloads_file_fields check ((storage_path is null) = (file_name is null) and (storage_path is null) = (size_bytes is null))
);
comment on table public.downloads is 'รายการหน้าดาวน์โหลด: form แบบฟอร์ม / template แม่แบบ Excel / manual คู่มือ / calendar ปฏิทิน / regulation ระเบียบและประกาศ (ไฟล์ในที่เก็บสาธารณะ หรือลิงก์ภายนอก)';
create index downloads_public_idx on public.downloads (category, sort_order) where is_active;
create trigger downloads_set_updated_at before update on public.downloads
  for each row execute function public.set_updated_at();
create trigger downloads_audit after insert or update or delete on public.downloads
  for each row execute function public.audit_row_change();
alter table public.downloads enable row level security;
create policy downloads_read on public.downloads for select to authenticated
  using (public.can_manage_site_content());
create policy downloads_insert on public.downloads for insert to authenticated
  with check (public.can_manage_site_content());
create policy downloads_update on public.downloads for update to authenticated
  using (public.can_manage_site_content()) with check (public.can_manage_site_content());
revoke all on public.downloads from anon;
revoke delete, truncate on public.downloads from authenticated;
grant select, insert, update on public.downloads to authenticated;

-- ---------------------------------------------------------------
-- 3) ปฏิทินงานสอบ (รายการที่เพิ่มเอง)
-- ---------------------------------------------------------------
create table public.exam_calendar_events (
  id                uuid primary key default gen_random_uuid(),
  academic_year_id  uuid not null references public.academic_years (id),
  starts_on         date not null,
  ends_on           date,
  title             text not null check (btrim(title) <> '' and length(title) <= 300),
  note              text not null default '' check (length(note) <= 1000),
  is_active         boolean not null default true,
  created_by        uuid default auth.uid() references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint exam_calendar_events_range check (ends_on is null or ends_on >= starts_on)
);
comment on table public.exam_calendar_events is 'รายการปฏิทินงานสอบที่เพิ่มเอง (นอกเหนือจากวันในรอบสมัครสอบ) ปิดใช้งานแทนการลบ';
create index exam_calendar_events_year_idx on public.exam_calendar_events (academic_year_id, starts_on) where is_active;
create trigger exam_calendar_events_set_updated_at before update on public.exam_calendar_events
  for each row execute function public.set_updated_at();
create trigger exam_calendar_events_audit after insert or update or delete on public.exam_calendar_events
  for each row execute function public.audit_row_change();
alter table public.exam_calendar_events enable row level security;
create policy exam_calendar_events_read on public.exam_calendar_events for select to authenticated using (true);
create policy exam_calendar_events_insert on public.exam_calendar_events for insert to authenticated
  with check (public.can_manage_site_content());
create policy exam_calendar_events_update on public.exam_calendar_events for update to authenticated
  using (public.can_manage_site_content()) with check (public.can_manage_site_content());
revoke all on public.exam_calendar_events from anon;
revoke delete, truncate on public.exam_calendar_events from authenticated;
grant select, insert, update on public.exam_calendar_events to authenticated;

-- ---------------------------------------------------------------
-- 4) ข้อมูลติดต่อของหน่วยงาน (แถวเดียว ผู้ดูแลระบบกรอกเอง เริ่มว่าง)
-- ---------------------------------------------------------------
create table public.site_contact (
  id            integer primary key default 1 check (id = 1),
  agency_name   text not null default '' check (length(agency_name) <= 300),
  address       text not null default '' check (length(address) <= 1000),
  phone         text not null default '' check (length(phone) <= 200),
  email         text not null default '' check (length(email) <= 200),
  office_hours  text not null default '' check (length(office_hours) <= 500),
  latitude      numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude     numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  map_note      text not null default '' check (length(map_note) <= 300),
  updated_by    uuid default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint site_contact_map_pair check ((latitude is null) = (longitude is null))
);
comment on table public.site_contact is 'ข้อมูลติดต่อของหน่วยงาน (หน้า ติดต่อเรา และส่วนท้ายเว็บ) แถวเดียว ผู้ดูแลระบบแก้';
insert into public.site_contact (id) values (1);
create trigger site_contact_set_updated_at before update on public.site_contact
  for each row execute function public.set_updated_at();
create trigger site_contact_audit after insert or update or delete on public.site_contact
  for each row execute function public.audit_row_change();
alter table public.site_contact enable row level security;
create policy site_contact_read on public.site_contact for select to authenticated using (true);
create policy site_contact_update on public.site_contact for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.site_contact from anon;
revoke insert, delete, truncate on public.site_contact from authenticated;
grant select, update on public.site_contact to authenticated;

-- ---------------------------------------------------------------
-- 5) หัวข้อติดต่อ ผู้รับ และข้อความ
-- ---------------------------------------------------------------
create table public.contact_topics (
  key         text primary key check (key in ('registry', 'exams', 'results', 'requests', 'quiz', 'system')),
  name        text not null,
  sort_order  integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.contact_topics is 'หัวข้อของแบบฟอร์มติดต่อเรา (ตามระบบ กำหนดในคำสั่งบทที่ 30)';
insert into public.contact_topics (key, name, sort_order) values
  ('registry', 'ทะเบียน', 10),
  ('exams', 'สมัครสอบ', 20),
  ('results', 'ผลสอบ', 30),
  ('requests', 'คำขอ', 40),
  ('quiz', 'คลังข้อสอบ', 50),
  ('system', 'การใช้งานระบบ', 60);
create trigger contact_topics_set_updated_at before update on public.contact_topics
  for each row execute function public.set_updated_at();
create trigger contact_topics_audit after insert or update or delete on public.contact_topics
  for each row execute function public.audit_row_change();
alter table public.contact_topics enable row level security;
create policy contact_topics_read on public.contact_topics for select to authenticated using (true);
revoke all on public.contact_topics from anon;
revoke insert, update, delete, truncate on public.contact_topics from authenticated;
grant select on public.contact_topics to authenticated;

create table public.contact_topic_recipients (
  id          uuid primary key default gen_random_uuid(),
  topic_key   text not null references public.contact_topics (key),
  role_key    text references public.roles (key),
  user_id     uuid references public.profiles (id),
  is_active   boolean not null default true,
  created_by  uuid default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint contact_topic_recipients_target check ((role_key is null) <> (user_id is null))
);
comment on table public.contact_topic_recipients is 'ผู้รับข้อความติดต่อต่อหัวข้อ: บทบาท (ทุกคนที่มีบทบาทนั้น) หรือผู้ใช้รายคน หัวข้อที่ไม่กำหนด = ผู้ดูแลระบบ นำออก = ปิดใช้งาน';
create unique index contact_topic_recipients_role_unique on public.contact_topic_recipients (topic_key, role_key) where is_active and role_key is not null;
create unique index contact_topic_recipients_user_unique on public.contact_topic_recipients (topic_key, user_id) where is_active and user_id is not null;
create trigger contact_topic_recipients_set_updated_at before update on public.contact_topic_recipients
  for each row execute function public.set_updated_at();
create trigger contact_topic_recipients_audit after insert or update or delete on public.contact_topic_recipients
  for each row execute function public.audit_row_change();
alter table public.contact_topic_recipients enable row level security;
create policy contact_topic_recipients_read on public.contact_topic_recipients for select to authenticated
  using (public.has_role('admin'));
create policy contact_topic_recipients_insert on public.contact_topic_recipients for insert to authenticated
  with check (public.has_role('admin'));
create policy contact_topic_recipients_update on public.contact_topic_recipients for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.contact_topic_recipients from anon;
revoke delete, truncate on public.contact_topic_recipients from authenticated;
grant select, insert, update on public.contact_topic_recipients to authenticated;

-- ผู้รับของหัวข้อ (บทบาทที่ยังมีผล หรือผู้ใช้ที่ระบุ บัญชีต้องใช้งานอยู่) ไม่กำหนด = ผู้ดูแลระบบทุกคน
create function private.contact_recipient_ids(p_topic text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with conf as (
    select r.role_key, r.user_id from public.contact_topic_recipients r where r.topic_key = p_topic and r.is_active
  ),
  picked as (
    select ur.user_id from public.user_roles ur join conf c on c.role_key = ur.role_key
    where ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
    union
    select c.user_id from conf c where c.user_id is not null
  ),
  fallback as (
    select ur.user_id from public.user_roles ur
    where ur.role_key = 'admin' and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
      and not exists (select 1 from conf)
  )
  select distinct x.user_id
  from (select user_id from picked union select user_id from fallback) x
  join public.profiles p on p.id = x.user_id and p.status = 'active';
$$;

create function public.can_view_contact_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- ตรวจด้วยบทบาทที่มีผล (my_role_rows: ผู้ดูแลระบบต้องยืนยันตัวตน 2 ขั้น) หัวข้อที่ไม่กำหนดผู้รับ = ผู้ดูแลระบบ
  select public.has_role('admin') or exists (
    select 1 from public.contact_topic_recipients r
    where r.topic_key = p_topic and r.is_active
      and ((r.role_key is not null and public.has_role(r.role_key))
           or (r.user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active'))));
$$;

create table public.contact_messages (
  id            uuid primary key default gen_random_uuid(),
  topic_key     text not null references public.contact_topics (key),
  sender_name   text not null check (btrim(sender_name) <> '' and length(sender_name) <= 200),
  sender_email  text not null default '' check (length(sender_email) <= 200),
  sender_phone  text not null default '' check (length(sender_phone) <= 50),
  subject       text not null check (btrim(subject) <> '' and length(subject) <= 300),
  message       text not null check (btrim(message) <> '' and length(message) <= 5000),
  status        text not null default 'new' check (status in ('new', 'in_progress', 'done', 'spam')),
  staff_note    text not null default '' check (length(staff_note) <= 2000),
  read_at       timestamptz,
  read_by       uuid references public.profiles (id),
  handled_at    timestamptz,
  handled_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint contact_messages_reply_to check (sender_email <> '' or sender_phone <> '')
);
comment on table public.contact_messages is 'ข้อความจากแบบฟอร์มติดต่อเรา (มีชื่อ อีเมล เบอร์ของผู้ส่ง เห็นเฉพาะผู้รับของหัวข้อและผู้ดูแลระบบ) เขียนผ่านฟังก์ชันเท่านั้น';
create index contact_messages_topic_idx on public.contact_messages (topic_key, status, created_at desc);
create trigger contact_messages_set_updated_at before update on public.contact_messages
  for each row execute function public.set_updated_at();
create trigger contact_messages_audit after insert or update or delete on public.contact_messages
  for each row execute function public.audit_row_change();
alter table public.contact_messages enable row level security;
create policy contact_messages_read on public.contact_messages for select to authenticated
  using (public.can_view_contact_topic(topic_key));
revoke all on public.contact_messages from anon;
revoke insert, update, delete, truncate on public.contact_messages from authenticated;
grant select on public.contact_messages to authenticated;

-- ตัวนับต่อช่วงเวลา (ชั่วโมง) ใช้ตาราง private.request_hits ชุดเดียวกับการค้นสาธารณะ
create function private.rate_limit_window(p_bucket text, p_client text, p_limit integer, p_unit text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
  v_start timestamptz;
begin
  if coalesce(p_client, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'รหัสเครื่องไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  if p_unit not in ('minute', 'hour', 'day') then
    raise exception 'ช่วงเวลาไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  v_start := date_trunc(p_unit, now());
  insert into private.request_hits as h (bucket, client_hash, window_start, hits)
  values (p_bucket, p_client, v_start, 1)
  on conflict (bucket, client_hash) do update
    set hits = case when h.window_start = excluded.window_start then h.hits + 1 else 1 end,
        window_start = excluded.window_start
  returning h.hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- ส่งข้อความ (เรียกได้เฉพาะ service_role จากเซิร์ฟเวอร์ของเว็บ ซึ่งคำนวณรหัสเครื่องเอง) จำกัด 5 ครั้งต่อชั่วโมงต่อเครื่อง
create function public.submit_contact_message(
  p_topic text, p_name text, p_email text, p_phone text, p_subject text, p_message text, p_client text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_subject text := regexp_replace(btrim(coalesce(p_subject, '')), '\s+', ' ', 'g');
  v_message text := btrim(coalesce(p_message, ''));
  v_topic public.contact_topics%rowtype;
  v_id uuid;
begin
  select * into v_topic from public.contact_topics where key = p_topic;
  if not found then
    raise exception 'กรุณาเลือกหัวข้อ' using errcode = 'P0001';
  end if;
  if v_name = '' or length(v_name) > 200 then
    raise exception 'กรุณากรอกชื่อ (ไม่เกิน 200 ตัวอักษร)' using errcode = 'P0001';
  end if;
  if v_email = '' and v_phone = '' then
    raise exception 'กรุณากรอกอีเมลหรือเบอร์โทรศัพท์อย่างน้อย 1 ช่อง เพื่อให้เจ้าหน้าที่ติดต่อกลับ' using errcode = 'P0001';
  end if;
  if v_email <> '' and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'รูปแบบอีเมลไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  if v_phone <> '' and v_phone !~ '^[0-9+() -]{6,30}$' then
    raise exception 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  if v_subject = '' or length(v_subject) > 300 then
    raise exception 'กรุณากรอกเรื่อง (ไม่เกิน 300 ตัวอักษร)' using errcode = 'P0001';
  end if;
  if length(v_message) < 10 or length(v_message) > 5000 then
    raise exception 'ข้อความต้องยาว 10 ถึง 5,000 ตัวอักษร' using errcode = 'P0001';
  end if;
  if not private.rate_limit_window('contact_message', p_client, 5, 'hour') then
    return jsonb_build_object('ok', false, 'limited', true);
  end if;
  insert into public.contact_messages (topic_key, sender_name, sender_email, sender_phone, subject, message)
  values (v_topic.key, v_name, v_email, v_phone, v_subject, v_message)
  returning id into v_id;
  insert into public.notifications (user_id, title, body, link)
  select i, 'มีข้อความติดต่อใหม่ หัวข้อ' || v_topic.name, v_subject, '/app/messages/' || v_id
  from private.contact_recipient_ids(v_topic.key) i;
  return jsonb_build_object('ok', true, 'limited', false);
end;
$$;

-- เปิดอ่าน (บันทึกครั้งแรก) และเปลี่ยนสถานะ: ผู้รับของหัวข้อและผู้ดูแลระบบ
create function public.mark_contact_message_read(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.contact_messages
     set read_at = now(), read_by = auth.uid(), status = case when status = 'new' then 'in_progress' else status end
   where id = p_id and read_at is null and public.can_view_contact_topic(topic_key);
$$;

create function public.set_contact_message_status(p_id uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.contact_messages%rowtype;
begin
  select * into v from public.contact_messages where id = p_id for update;
  if not found or not public.can_view_contact_topic(v.topic_key) then
    raise exception 'ไม่พบข้อความ หรือท่านไม่ใช่ผู้รับของหัวข้อนี้' using errcode = 'P0001';
  end if;
  if p_status not in ('new', 'in_progress', 'done', 'spam') then
    raise exception 'สถานะไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  update public.contact_messages
     set status = p_status, staff_note = left(btrim(coalesce(p_note, '')), 2000),
         handled_at = now(), handled_by = auth.uid(),
         read_at = coalesce(read_at, now()), read_by = coalesce(read_by, auth.uid())
   where id = v.id;
end;
$$;

-- หัวข้อที่ผู้ใช้เป็นผู้รับ (กล่องข้อความติดต่อ)
create function public.my_contact_topics()
returns table (key text, name text, unread integer)
language sql
stable
security definer
set search_path = public
as $$
  select t.key, t.name,
         (select count(*)::integer from public.contact_messages m where m.topic_key = t.key and m.status = 'new')
  from public.contact_topics t
  where public.can_view_contact_topic(t.key)
  order by t.sort_order;
$$;

-- ---------------------------------------------------------------
-- 6) ฟังก์ชันของหน้าสาธารณะ (anon) คืนเฉพาะข้อมูลที่เผยแพร่ได้
-- ---------------------------------------------------------------
create function public.public_site_contact()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'agency_name', c.agency_name, 'address', c.address, 'phone', c.phone, 'email', c.email,
    'office_hours', c.office_hours, 'latitude', c.latitude, 'longitude', c.longitude, 'map_note', c.map_note,
    'topics', (select jsonb_agg(jsonb_build_object('key', t.key, 'name', t.name) order by t.sort_order) from public.contact_topics t))
  from public.site_contact c where c.id = 1;
$$;

create function public.public_announcements(p_limit integer, p_offset integer)
returns table (id uuid, title text, excerpt text, is_pinned boolean, published_on date, file_count integer, total_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.title, left(regexp_replace(a.body, '\s+', ' ', 'g'), 220), a.is_pinned, a.published_on,
         (select count(*)::integer from public.announcement_files f where f.announcement_id = a.id and f.is_active),
         count(*) over ()
  from public.announcements a
  where a.is_active and a.published_on <= private.site_today()
    and (a.expires_on is null or a.expires_on >= private.site_today())
  order by a.is_pinned desc, a.published_on desc, a.created_at desc
  limit greatest(least(coalesce(p_limit, 10), 50), 1) offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.public_announcement(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', a.id, 'title', a.title, 'body', a.body, 'is_pinned', a.is_pinned, 'published_on', a.published_on,
    'updated_at', a.updated_at,
    'files', coalesce((select jsonb_agg(jsonb_build_object('name', f.file_name, 'path', f.storage_path,
                                                         'mime_type', f.mime_type, 'size_bytes', f.size_bytes)
                                        order by f.sort_order, f.created_at)
                       from public.announcement_files f where f.announcement_id = a.id and f.is_active), '[]'::jsonb))
  from public.announcements a
  where a.id = p_id and a.is_active and a.published_on <= private.site_today()
    and (a.expires_on is null or a.expires_on >= private.site_today());
$$;

create function public.public_downloads()
returns table (id uuid, category text, title text, description text, storage_path text, file_name text,
               mime_type text, size_bytes integer, url text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.category, d.title, d.description, d.storage_path, d.file_name, d.mime_type, d.size_bytes, d.url, d.updated_at
  from public.downloads d
  where d.is_active
  order by d.category, d.sort_order, d.title;
$$;

-- ตัวเลขสรุปหน้าแรก: สำนักเรียน + สำนักศาสนศึกษา ที่เปิดดำเนินการ / สนามสอบที่เปิด / ผู้สมัครสอบปีการศึกษาปัจจุบัน
--   (ผู้สมัครที่นับแล้วในบัญชีที่ส่งแล้ว ตามกติกาเดียวกับสถิติสาธารณะ)
create function public.public_home_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'year_be', (select y.year_be from public.academic_years y where y.is_current),
    'samnak', (select count(*)::integer from public.places p
               where p.is_active and p.status = 'open' and p.place_type in ('samnak_rian', 'samnak_sasanasuksa')),
    'venues', (select count(*)::integer from public.exam_venues v where v.is_active and v.status = 'open'),
    'candidates', (select count(*)::integer from public.candidates c
                   join public.registration_batches b on b.id = c.batch_id
                   join public.exam_rounds r on r.id = b.round_id
                   join public.academic_years y on y.id = r.academic_year_id and y.is_current
                   where c.counted and b.status in ('submitted', 'returned', 'certified') and r.is_active));
$$;

-- ปฏิทินงานสอบของปีการศึกษาปัจจุบัน: kind = opens / closes / exam / results (จากรอบสมัครสอบที่ไม่ใช่ร่าง)
--   / request_deadline (วันปิดรับคำขอสนามสอบ) / custom (เพิ่มเอง)
create function public.public_exam_calendar()
returns table (starts_on date, ends_on date, kind text, exam_type text, level text, title text, note text)
language sql
stable
security definer
set search_path = public
as $$
  with y as (select * from public.academic_years where is_current),
  r as (
    select x.* from public.exam_rounds x join y on y.id = x.academic_year_id
    where x.is_active and x.status <> 'draft'
  )
  select * from (
    select r.opens_on, null::date, 'opens', r.exam_type, r.level, '', '' from r
    union all
    select r.closes_on, null::date, 'closes', r.exam_type, r.level, '', '' from r
    union all
    select r.exam_starts_on, r.exam_ends_on, 'exam', r.exam_type, r.level, '', '' from r where r.exam_starts_on is not null
    union all
    select r.results_announced_on, null::date, 'results', r.exam_type, r.level, '', ''
    from r where r.result_status = 'published' and r.results_announced_on is not null
    union all
    select y.request_deadline, null::date, 'request_deadline', '', '', '', '' from y where y.request_deadline is not null
    union all
    select e.starts_on, e.ends_on, 'custom', '', '', e.title, e.note
    from public.exam_calendar_events e join y on y.id = e.academic_year_id where e.is_active
  ) t (starts_on, ends_on, kind, exam_type, level, title, note)
  order by 1, 3, 4, 5;
$$;

-- ---------------------------------------------------------------
-- 7) ค้นหารวมในพื้นที่ทำงาน (ตามสิทธิ์เดิมของแต่ละระบบ คืนระบบละไม่เกิน 8 รายการ + more)
-- ---------------------------------------------------------------
create function public.workspace_search(p_q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := regexp_replace(btrim(coalesce(p_q, '')), '\s+', ' ', 'g');
  v_like text;
  v_out jsonb := '{}'::jsonb;
  v_rows jsonb;
begin
  if length(v_q) < 2 or length(v_q) > 100 then
    return jsonb_build_object('too_short', true);
  end if;
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  -- บุคคล: ต้องเห็นเมนู บุคลากร และมีสิทธิ์ดูประวัติบุคคลนั้น (ไม่คืนเลขประจำตัว)
  if private.has_menu('/app/personnel') then
    select coalesce(jsonb_agg(j), '[]'::jsonb) into v_rows from (
      select jsonb_build_object('id', p.id, 'name', btrim(concat_ws(' ', nullif(p.title, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, ''))),
                                'unit_name', u.name, 'status', p.status, 'person_type', p.person_type) as j
      from public.persons p join public.org_units u on u.id = p.org_unit_id
      where p.is_active
        and (concat_ws(' ', p.first_name, p.monastic_name, p.last_name) ilike v_like or p.first_name || p.last_name ilike v_like)
        and public.can_view_person(p.id)
      order by p.first_name, p.last_name limit 9) s;
    v_out := v_out || jsonb_build_object('persons', v_rows);
  end if;

  -- สถานที่และสนามสอบ: ต้องเห็นเมนู ทะเบียนสถานที่
  if private.has_menu('/app/places') then
    select coalesce(jsonb_agg(j), '[]'::jsonb) into v_rows from (
      select jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code, 'place_type', p.place_type, 'status', p.status, 'unit_name', u.name) as j
      from public.places p join public.org_units u on u.id = p.org_unit_id
      where p.is_active and (p.name ilike v_like or p.code ilike v_like) and public.can_view_places(p.org_unit_id)
      order by p.name limit 9) s;
    v_out := v_out || jsonb_build_object('places', v_rows);
    select coalesce(jsonb_agg(j), '[]'::jsonb) into v_rows from (
      select jsonb_build_object('id', v.id, 'name', v.name, 'code', v.code, 'venue_type', v.venue_type, 'status', v.status, 'unit_name', u.name) as j
      from public.exam_venues v join public.org_units u on u.id = v.org_unit_id
      where v.is_active and (v.name ilike v_like or v.code ilike v_like) and public.can_view_venues(v.org_unit_id)
      order by v.name limit 9) s;
    v_out := v_out || jsonb_build_object('venues', v_rows);
  end if;

  -- คำขอทุกระบบที่ผู้ใช้เห็น (กติกาเดียวกับ policy requests_read)
  select coalesce(jsonb_agg(j), '[]'::jsonb) into v_rows from (
    select jsonb_build_object('id', r.id, 'request_no', r.request_no, 'title', r.title, 'type_name', t.name,
                              'status', r.status, 'submitted_at', r.submitted_at) as j
    from public.requests r join public.request_types t on t.key = r.type_key
    where (r.request_no ilike v_like or r.title ilike v_like) and private.request_visible(r)
    order by r.submitted_at desc limit 9) s;
  v_out := v_out || jsonb_build_object('requests', v_rows);

  -- หนังสือที่ผู้ใช้เห็น (ฝั่งเจ้าของหนังสือ)
  select coalesce(jsonb_agg(j), '[]'::jsonb) into v_rows from (
    select jsonb_build_object('id', d.id, 'direction', d.direction, 'status', d.status, 'doc_no', d.doc_no,
                              'seq_no', d.seq_no, 'number_year', d.number_year, 'subject', d.subject,
                              'classification', d.classification, 'unit_name', private.doc_unit_name(d.org_unit_id),
                              'doc_date', d.doc_date, 'closed_at', d.closed_at) as j
    from public.documents d
    where d.is_active
      and (d.doc_no ilike v_like or d.subject ilike v_like
           or (d.direction = 'receive' and (d.seq_no || '/' || d.number_year) = v_q))
      and private.doc_visible(d)
    order by coalesce(d.doc_date, private.doc_bkk_date(d.created_at)) desc, d.created_at desc limit 9) s;
  v_out := v_out || jsonb_build_object('documents', v_rows);

  return v_out;
end;
$$;

-- ---------------------------------------------------------------
-- 8) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke all on function private.site_today() from public, anon, authenticated;
revoke all on function private.contact_recipient_ids(text) from public, anon, authenticated;
revoke all on function private.rate_limit_window(text, text, integer, text) from public, anon, authenticated;

revoke execute on function public.can_manage_site_content() from public, anon;
revoke execute on function public.can_view_contact_topic(text) from public, anon;
revoke execute on function public.submit_contact_message(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.mark_contact_message_read(uuid) from public, anon;
revoke execute on function public.set_contact_message_status(uuid, text, text) from public, anon;
revoke execute on function public.my_contact_topics() from public, anon;
revoke execute on function public.public_site_contact() from public;
revoke execute on function public.public_announcements(integer, integer) from public;
revoke execute on function public.public_announcement(uuid) from public;
revoke execute on function public.public_downloads() from public;
revoke execute on function public.public_home_stats() from public;
revoke execute on function public.public_exam_calendar() from public;
revoke execute on function public.workspace_search(text) from public, anon;

grant execute on function public.can_manage_site_content() to authenticated;
grant execute on function public.can_view_contact_topic(text) to authenticated;
grant execute on function public.submit_contact_message(text, text, text, text, text, text, text) to service_role;
grant execute on function public.mark_contact_message_read(uuid) to authenticated;
grant execute on function public.set_contact_message_status(uuid, text, text) to authenticated;
grant execute on function public.my_contact_topics() to authenticated;
grant execute on function public.public_site_contact() to anon, authenticated;
grant execute on function public.public_announcements(integer, integer) to anon, authenticated;
grant execute on function public.public_announcement(uuid) to anon, authenticated;
grant execute on function public.public_downloads() to anon, authenticated;
grant execute on function public.public_home_stats() to anon, authenticated;
grant execute on function public.public_exam_calendar() to anon, authenticated;
grant execute on function public.workspace_search(text) to authenticated;
