-- บทที่ 4 (2/3): เครื่องอนุมัติกลาง — ใช้ร่วมกันทุกระบบที่มีการยื่นคำขอและพิจารณาตามลำดับชั้น

-- ---------------------------------------------------------------
-- request_types: ชนิดคำขอ และเส้นทางอนุมัติของแต่ละชนิด
-- ---------------------------------------------------------------
create table public.request_types (
  key                text primary key check (key ~ '^[a-z_]+$'),
  code               text not null unique check (code ~ '^[A-Z0-9]+$'),  -- ตัวย่อนำหน้าเลขที่คำขอ
  name               text not null,
  -- ระดับที่ต้องพิจารณา เรียงจากล่างขึ้นบน
  route_levels       public.org_level[] not null
                       default '{subdistrict,district,province,region,central}',
  -- true = เริ่มพิจารณาที่หน่วยของผู้ยื่นเอง / false = เริ่มที่หน่วยเหนือ
  start_at_own_unit  boolean not null default true,
  -- บทบาทที่พิจารณาได้ในขั้นของภาค จังหวัด อำเภอ ตำบล (ต้องมีบทบาทนั้นที่หน่วยของขั้น)
  decider_roles      text[] not null default '{chief,deputy_chief}',
  -- บทบาทที่พิจารณาได้ในขั้นส่วนกลาง
  central_roles      text[] not null default '{central_staff}',
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.request_types is 'ชนิดคำขอและเส้นทางอนุมัติ ค่าเริ่มต้น: ตำบล > อำเภอ > จังหวัด > ภาค > ส่วนกลาง';

insert into public.request_types (key, code, name, start_at_own_unit)
values ('test', 'TEST', 'คำขอทดสอบ (หน้าสาธิต)', false);

-- ---------------------------------------------------------------
-- requests: คำขอ
-- ---------------------------------------------------------------
create table public.requests (
  id            uuid primary key default gen_random_uuid(),
  type_key      text not null references public.request_types (key),
  request_no    text not null unique,                 -- [ชนิด]-[ปี พ.ศ.]-[ลำดับ]
  requester_id  uuid not null references public.profiles (id),
  org_unit_id   uuid not null references public.org_units (id),  -- หน่วยที่ยื่น
  title         text not null check (length(btrim(title)) > 0),
  payload       jsonb not null default '{}'::jsonb,   -- ข้อมูลคำขอเฉพาะของแต่ละชนิด
  status        text not null default 'pending'
                  check (status in ('pending', 'returned', 'approved', 'rejected', 'cancelled')),
  current_step  integer,                              -- ขั้นที่กำลังรอพิจารณา
  submitted_at  timestamptz not null default now(),
  decided_at    timestamptz,                          -- เวลาที่ได้ผลขั้นสุดท้าย
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.requests is 'คำขอ: pending รอพิจารณา / returned ส่งกลับแก้ไข / approved อนุมัติ / rejected ไม่อนุมัติ / cancelled ยกเลิก';
create index requests_requester_idx on public.requests (requester_id, submitted_at desc);
create index requests_org_unit_idx on public.requests (org_unit_id);
create index requests_status_idx on public.requests (status, type_key);

-- ตัวนับเลขที่คำขอ แยกตามชนิดและปี พ.ศ.
create table public.request_counters (
  type_key  text not null references public.request_types (key),
  year_be   integer not null,
  last_no   integer not null default 0,
  primary key (type_key, year_be)
);

-- ---------------------------------------------------------------
-- request_steps: ขั้นพิจารณาของแต่ละคำขอ (1 แถวต่อ 1 หน่วยในเส้นทาง)
-- ---------------------------------------------------------------
create table public.request_steps (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.requests (id) on delete cascade,
  step_no      integer not null,                      -- ลำดับ
  org_unit_id  uuid not null references public.org_units (id),  -- หน่วยที่พิจารณา
  level        public.org_level not null,
  status       text not null default 'waiting'
                 check (status in ('waiting', 'pending', 'approved', 'rejected', 'returned')),
  decided_by   uuid references public.profiles (id),  -- ผู้พิจารณา
  comment      text,                                  -- ความเห็น
  decided_at   timestamptz,                           -- วันที่
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (request_id, step_no)
);
comment on table public.request_steps is 'ขั้นพิจารณา: waiting ยังไม่ถึง / pending รอพิจารณา / approved เห็นชอบ / rejected ไม่เห็นชอบ / returned ส่งกลับแก้ไข';
create index request_steps_pending_idx on public.request_steps (org_unit_id) where status = 'pending';

-- ---------------------------------------------------------------
-- request_events: ประวัติทุกเหตุการณ์ของคำขอ (ใช้วาดเส้นเวลา)
-- ---------------------------------------------------------------
create table public.request_events (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.requests (id) on delete cascade,
  step_no     integer,
  actor_id    uuid references public.profiles (id),
  action      text not null
                check (action in ('submitted', 'approved', 'rejected', 'returned', 'resubmitted', 'cancelled')),
  comment     text,
  created_at  timestamptz not null default now()
);
create index request_events_request_idx on public.request_events (request_id, created_at);

create trigger request_types_set_updated_at before update on public.request_types
  for each row execute function public.set_updated_at();
create trigger requests_set_updated_at before update on public.requests
  for each row execute function public.set_updated_at();
create trigger request_steps_set_updated_at before update on public.request_steps
  for each row execute function public.set_updated_at();
create trigger request_types_audit after insert or update or delete on public.request_types
  for each row execute function public.audit_row_change();
create trigger requests_audit after insert or update or delete on public.requests
  for each row execute function public.audit_row_change();
create trigger request_steps_audit after insert or update or delete on public.request_steps
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- RLS: อ่านได้เมื่อเป็นผู้ยื่น หรือเข้าถึงหน่วยที่ยื่นได้ (หน่วยเหนือทุกชั้นจึงเห็น)
-- การเขียนทั้งหมดทำผ่านฟังก์ชันด้านล่างเท่านั้น
-- ---------------------------------------------------------------
alter table public.request_types enable row level security;
alter table public.requests enable row level security;
alter table public.request_counters enable row level security;
alter table public.request_steps enable row level security;
alter table public.request_events enable row level security;

revoke all on public.request_types, public.requests, public.request_counters,
  public.request_steps, public.request_events from anon;
revoke insert, update, delete on public.requests, public.request_steps, public.request_events
  from authenticated;
revoke all on public.request_counters from authenticated;
revoke insert, delete on public.request_types from authenticated;

create policy request_types_read on public.request_types for select to authenticated using (true);
create policy request_types_admin_update on public.request_types for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy requests_read on public.requests for select to authenticated
  using (requester_id = auth.uid() or public.can_access(org_unit_id));
create policy request_steps_read on public.request_steps for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_steps.request_id));
create policy request_events_read on public.request_events for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_events.request_id));

-- ---------------------------------------------------------------
-- ฟังก์ชันภายใน
-- ---------------------------------------------------------------

-- ปี พ.ศ. ปัจจุบันตามเวลาประเทศไทย
create function public.current_year_be()
returns integer
language sql
stable
set search_path = public
as $$
  select extract(year from (now() at time zone 'Asia/Bangkok'))::integer + 543;
$$;

-- ผู้ใช้ปัจจุบันพิจารณาขั้นนี้ได้หรือไม่
create function public.can_decide_step(p_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.request_steps s
    join public.requests r on r.id = s.request_id
    join public.request_types t on t.key = r.type_key
    join public.my_role_rows() m on m.effective
    where s.id = p_step_id
      and s.status = 'pending'
      and r.status = 'pending'
      and r.requester_id <> auth.uid()            -- พิจารณาคำขอของตนเองไม่ได้
      and (
        (s.level = 'central' and m.role_key = any (t.central_roles))
        or (s.level <> 'central' and m.org_unit_id = s.org_unit_id and m.role_key = any (t.decider_roles))
      )
  );
$$;

-- แจ้งเตือนผู้พิจารณาทุกคนของขั้นหนึ่ง
create function public.notify_step_deciders(p_step_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, title, body, link)
  select distinct ur.user_id,
         'มีคำขอรอท่านพิจารณา',
         r.request_no || ' ' || r.title,
         '/app/approvals/' || r.id
  from public.request_steps s
  join public.requests r on r.id = s.request_id
  join public.request_types t on t.key = r.type_key
  join public.user_roles ur
    on ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
   and (
     (s.level = 'central' and ur.role_key = any (t.central_roles))
     or (s.level <> 'central' and ur.org_unit_id = s.org_unit_id and ur.role_key = any (t.decider_roles))
   )
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where s.id = p_step_id and ur.user_id <> r.requester_id;
$$;

revoke execute on function public.notify_step_deciders(uuid) from public, anon, authenticated;
revoke execute on function public.can_decide_step(uuid) from public, anon;
grant execute on function public.can_decide_step(uuid) to authenticated;

-- ---------------------------------------------------------------
-- ยื่นคำขอ: ออกเลขที่ สร้างขั้นพิจารณาตามเส้นทางของชนิดคำขอ แจ้งผู้พิจารณาขั้นแรก
-- ---------------------------------------------------------------
create function public.submit_request(p_type_key text, p_org_unit_id uuid, p_title text, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.request_types%rowtype;
  v_year integer := public.current_year_be();
  v_no integer;
  v_id uuid;
  v_steps integer;
  v_first uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'กรุณาเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;
  select * into v_type from public.request_types where key = p_type_key and is_active;
  if not found then
    raise exception 'ไม่พบชนิดคำขอนี้' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'กรุณากรอกเรื่อง' using errcode = 'P0001';
  end if;
  if p_org_unit_id is null or not public.can_access(p_org_unit_id) then
    raise exception 'ท่านยื่นคำขอได้เฉพาะในนามหน่วยที่ท่านดูแล' using errcode = '42501';
  end if;

  -- เลขที่คำขอ: ล็อกตัวนับของชนิดและปีนั้น จึงไม่ซ้ำแม้ยื่นพร้อมกัน
  insert into public.request_counters (type_key, year_be, last_no)
  values (v_type.key, v_year, 1)
  on conflict (type_key, year_be) do update set last_no = public.request_counters.last_no + 1
  returning last_no into v_no;

  insert into public.requests (type_key, request_no, requester_id, org_unit_id, title, payload)
  values (
    v_type.key,
    v_type.code || '-' || v_year || '-' || lpad(v_no::text, 4, '0'),
    auth.uid(), p_org_unit_id, btrim(p_title), coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  -- ขั้นพิจารณา: หน่วยในสายขึ้นไปตามระดับที่กำหนด เรียงจากล่างขึ้นบน
  insert into public.request_steps (request_id, step_no, org_unit_id, level)
  select v_id,
         row_number() over (order by a.depth),
         u.id, u.level
  from public.ancestors_or_self(p_org_unit_id) a
  join public.org_units u on u.id = a.id
  where u.level = any (v_type.route_levels)
    and (v_type.start_at_own_unit or a.depth > 0);
  get diagnostics v_steps = row_count;

  if v_steps = 0 then
    raise exception 'คำขอชนิดนี้ไม่มีหน่วยพิจารณาในสายของหน่วยที่ยื่น' using errcode = 'P0001';
  end if;

  update public.request_steps set status = 'pending'
  where request_id = v_id and step_no = 1
  returning id into v_first;
  update public.requests set current_step = 1 where id = v_id;

  insert into public.request_events (request_id, actor_id, action) values (v_id, auth.uid(), 'submitted');
  perform public.notify_step_deciders(v_first);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------
-- พิจารณา: approved เห็นชอบ / rejected ไม่เห็นชอบ / returned ส่งกลับแก้ไข
-- ---------------------------------------------------------------
create function public.decide_request(p_request_id uuid, p_decision text, p_comment text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.requests%rowtype;
  v_step public.request_steps%rowtype;
  v_next public.request_steps%rowtype;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_label text;
begin
  if p_decision not in ('approved', 'rejected', 'returned') then
    raise exception 'ผลการพิจารณาไม่ถูกต้อง' using errcode = 'P0001';
  end if;

  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.status <> 'pending' then
    raise exception 'คำขอนี้ไม่ได้อยู่ระหว่างรอพิจารณา' using errcode = 'P0001';
  end if;
  select * into v_step from public.request_steps
  where request_id = p_request_id and step_no = v_req.current_step and status = 'pending';
  if not found or not public.can_decide_step(v_step.id) then
    raise exception 'ท่านไม่ใช่ผู้พิจารณาของขั้นนี้' using errcode = '42501';
  end if;
  if p_decision in ('rejected', 'returned') and v_comment is null then
    raise exception 'กรุณาระบุความเห็นหรือเหตุผล' using errcode = 'P0001';
  end if;

  update public.request_steps
  set status = p_decision, decided_by = auth.uid(), comment = v_comment, decided_at = now()
  where id = v_step.id;
  insert into public.request_events (request_id, step_no, actor_id, action, comment)
  values (p_request_id, v_step.step_no, auth.uid(), p_decision, v_comment);

  if p_decision = 'approved' then
    select * into v_next from public.request_steps
    where request_id = p_request_id and step_no = v_step.step_no + 1;
    if found then
      update public.request_steps set status = 'pending' where id = v_next.id;
      update public.requests set current_step = v_next.step_no where id = p_request_id;
      perform public.notify_step_deciders(v_next.id);
      v_label := 'ผ่านการพิจารณาขั้นที่ ' || v_step.step_no || ' แล้ว';
    else
      update public.requests set status = 'approved', current_step = null, decided_at = now() where id = p_request_id;
      v_label := 'ได้รับอนุมัติขั้นสุดท้ายแล้ว';
    end if;
  elsif p_decision = 'rejected' then
    update public.requests set status = 'rejected', current_step = null, decided_at = now() where id = p_request_id;
    v_label := 'ไม่ได้รับความเห็นชอบ';
  else
    update public.requests set status = 'returned' where id = p_request_id;
    v_label := 'ถูกส่งกลับให้แก้ไข';
  end if;

  perform public.notify_user(
    v_req.requester_id, 'คำขอ ' || v_req.request_no || ' ' || v_label,
    v_req.title, '/app/approvals/' || v_req.id
  );
end;
$$;

-- ---------------------------------------------------------------
-- ผู้ยื่นแก้ไขแล้วส่งใหม่ (เริ่มพิจารณาต่อจากขั้นที่ส่งกลับ)
-- ---------------------------------------------------------------
create function public.resubmit_request(p_request_id uuid, p_title text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.requests%rowtype;
  v_step uuid;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.requester_id <> auth.uid() then
    raise exception 'ส่งใหม่ได้เฉพาะคำขอของตนเอง' using errcode = '42501';
  end if;
  if v_req.status <> 'returned' then
    raise exception 'ส่งใหม่ได้เฉพาะคำขอที่ถูกส่งกลับแก้ไข' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'กรุณากรอกเรื่อง' using errcode = 'P0001';
  end if;

  update public.requests
  set status = 'pending', title = btrim(p_title), payload = coalesce(p_payload, payload)
  where id = p_request_id;
  update public.request_steps
  set status = 'pending', decided_by = null, comment = null, decided_at = null
  where request_id = p_request_id and step_no = v_req.current_step
  returning id into v_step;

  insert into public.request_events (request_id, step_no, actor_id, action)
  values (p_request_id, v_req.current_step, auth.uid(), 'resubmitted');
  perform public.notify_step_deciders(v_step);
end;
$$;

-- ---------------------------------------------------------------
-- ผู้ยื่นยกเลิกคำขอ (ก่อนได้ผลขั้นสุดท้าย)
-- ---------------------------------------------------------------
create function public.cancel_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.requests%rowtype;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.requester_id <> auth.uid() then
    raise exception 'ยกเลิกได้เฉพาะคำขอของตนเอง' using errcode = '42501';
  end if;
  if v_req.status not in ('pending', 'returned') then
    raise exception 'คำขอนี้ได้ผลขั้นสุดท้ายแล้ว ยกเลิกไม่ได้' using errcode = 'P0001';
  end if;
  update public.requests set status = 'cancelled', current_step = null, decided_at = now() where id = p_request_id;
  insert into public.request_events (request_id, actor_id, action) values (p_request_id, auth.uid(), 'cancelled');
end;
$$;

-- ---------------------------------------------------------------
-- งานรอพิจารณาของผู้ใช้ปัจจุบัน (กล่องบนแดชบอร์ด)
-- ---------------------------------------------------------------
create function public.my_pending_requests()
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
         r.submitted_at, s.step_no, su.name, s.updated_at
  from public.request_steps s
  join public.requests r on r.id = s.request_id
  join public.request_types t on t.key = r.type_key
  join public.org_units u on u.id = r.org_unit_id
  join public.org_units su on su.id = s.org_unit_id
  join public.profiles p on p.id = r.requester_id
  where s.status = 'pending' and r.status = 'pending' and public.can_decide_step(s.id)
  order by s.updated_at;
$$;

-- ---------------------------------------------------------------
-- สถานะคำขอสำหรับหน้าสาธารณะ: ไม่มีชื่อบุคคล ไม่มีความเห็น ไม่มีรายละเอียดคำขอ
-- ---------------------------------------------------------------
create function public.public_request_status(p_request_no text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'request_no', r.request_no,
    'type_name', t.name,
    'status', r.status,
    'submitted_at', r.submitted_at,
    'decided_at', r.decided_at,
    'steps', (
      select jsonb_agg(jsonb_build_object(
        'step_no', s.step_no, 'level', s.level, 'unit_name', u.name,
        'status', s.status, 'decided_at', s.decided_at
      ) order by s.step_no)
      from public.request_steps s
      join public.org_units u on u.id = s.org_unit_id
      where s.request_id = r.id
    )
  )
  from public.requests r
  join public.request_types t on t.key = r.type_key
  where r.request_no = upper(btrim(p_request_no));
$$;

-- ---------------------------------------------------------------
-- ชื่อผู้ยื่นและผู้พิจารณาของคำขอ (เฉพาะชื่อ ไม่เปิดเผยอีเมลหรือเบอร์ติดต่อ)
-- คืนข้อมูลเฉพาะเมื่อผู้เรียกมองเห็นคำขอนั้น
-- ---------------------------------------------------------------
create function public.request_people(p_request_id uuid)
returns table (user_id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         btrim(concat_ws(' ', nullif(p.title_prefix, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, '')))
  from public.profiles p
  where exists (
      select 1 from public.requests r
      where r.id = p_request_id and (r.requester_id = auth.uid() or public.can_access(r.org_unit_id))
    )
    and p.id in (
      select r.requester_id from public.requests r where r.id = p_request_id
      union select s.decided_by from public.request_steps s where s.request_id = p_request_id
      union select e.actor_id from public.request_events e where e.request_id = p_request_id
    );
$$;
revoke execute on function public.request_people(uuid) from public, anon;
grant execute on function public.request_people(uuid) to authenticated;

revoke execute on function public.submit_request(text, uuid, text, jsonb) from public, anon;
revoke execute on function public.decide_request(uuid, text, text) from public, anon;
revoke execute on function public.resubmit_request(uuid, text, jsonb) from public, anon;
revoke execute on function public.cancel_request(uuid) from public, anon;
revoke execute on function public.my_pending_requests() from public, anon;
grant execute on function public.submit_request(text, uuid, text, jsonb) to authenticated;
grant execute on function public.decide_request(uuid, text, text) to authenticated;
grant execute on function public.resubmit_request(uuid, text, jsonb) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.my_pending_requests() to authenticated;
-- สถานะแบบสาธารณะ: เปิดให้ทุกคนเรียกได้ (จะใช้กับหน้าติดตามคำขอในบทที่ 16)
grant execute on function public.public_request_status(text) to anon, authenticated;
