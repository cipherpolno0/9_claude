-- บทที่ 7 (3/3): คำขอเปลี่ยนสถานะและการแจ้ง ผ่านเครื่องอนุมัติกลาง และตาราง status_changes

-- ---------------------------------------------------------------
-- เครื่องอนุมัติกลาง: คำขอที่มีข้อมูลส่วนบุคคล และเส้นทางพิจารณาแบบกำหนดเอง
-- ---------------------------------------------------------------
alter table public.request_types add column is_personnel boolean not null default false;
comment on column public.request_types.is_personnel is 'คำขอที่มีข้อมูลส่วนบุคคล: เห็นได้เฉพาะผู้ยื่น เจ้าของประวัติ และผู้มีสิทธิ์ดูทะเบียนบุคคลของหน่วยในเส้นทาง';
update public.request_types set is_personnel = true where key = 'profile_edit';

create function public.is_personnel_request(p_type_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select t.is_personnel from public.request_types t where t.key = p_type_key), false);
$$;

-- ผู้ใช้ปัจจุบันมีสิทธิ์ดูทะเบียนบุคคลของหน่วยใดหน่วยหนึ่งในเส้นทางพิจารณาของคำขอนี้หรือไม่
create function public.can_view_request_steps(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.request_steps s
    where s.request_id = p_request_id and public.can_view_personnel(s.org_unit_id)
  );
$$;

-- ผู้ใช้ปัจจุบันเป็นเจ้าของประวัติที่คำขอนี้กล่าวถึงหรือไม่ (payload.person_id)
create function public.is_request_subject(p_payload jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.persons p
    where p.user_id = auth.uid() and p.id::text = p_payload ->> 'person_id'
  );
$$;

revoke execute on function public.is_personnel_request(text) from public, anon;
revoke execute on function public.can_view_request_steps(uuid) from public, anon;
revoke execute on function public.is_request_subject(jsonb) from public, anon;
grant execute on function public.is_personnel_request(text) to authenticated;
grant execute on function public.can_view_request_steps(uuid) to authenticated;
grant execute on function public.is_request_subject(jsonb) to authenticated;

alter policy requests_read on public.requests
  using (
    requester_id = auth.uid()
    or case
      when public.is_personnel_request(type_key) then
        public.can_view_personnel(org_unit_id)
        or public.can_view_request_steps(id)
        or public.is_request_subject(payload)
      else public.can_access(org_unit_id)
    end
  );

-- ชื่อผู้ยื่นและผู้พิจารณา: ให้ผู้พิจารณาในเส้นทางและเจ้าของประวัติเห็นชื่อด้วย
create or replace function public.request_people(p_request_id uuid)
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
      where r.id = p_request_id
        and (
          r.requester_id = auth.uid()
          or public.can_access(r.org_unit_id)
          or public.can_view_request_steps(r.id)
          or public.is_request_subject(r.payload)
        )
    )
    and p.id in (
      select r.requester_id from public.requests r where r.id = p_request_id
      union select s.decided_by from public.request_steps s where s.request_id = p_request_id
      union select e.actor_id from public.request_events e where e.request_id = p_request_id
    );
$$;

-- พิจารณาคำขอที่เกี่ยวกับประวัติของตนเองไม่ได้ (แม้ผู้อื่นเป็นผู้ยื่นแทน)
create or replace function public.can_decide_step(p_step_id uuid)
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
      and not public.is_request_subject(r.payload)
      and (
        (s.level = 'central' and m.role_key = any (t.central_roles))
        or (s.level <> 'central' and m.org_unit_id = s.org_unit_id and m.role_key = any (t.decider_roles))
      )
  );
$$;

-- สร้างคำขอ: p_route = ลำดับหน่วยที่ต้องพิจารณาแบบกำหนดเอง (ว่าง = ใช้เส้นทางตามชนิดคำขอ)
create function private.create_request(p_type_key text, p_org_unit_id uuid, p_title text, p_payload jsonb, p_route uuid[])
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
  select * into v_type from public.request_types where key = p_type_key and is_active;
  if not found then
    raise exception 'ไม่พบชนิดคำขอนี้' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'กรุณากรอกเรื่อง' using errcode = 'P0001';
  end if;

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

  if p_route is not null then
    insert into public.request_steps (request_id, step_no, org_unit_id, level)
    select v_id, r.ord, u.id, u.level
    from unnest(p_route) with ordinality as r(id, ord)
    join public.org_units u on u.id = r.id;
  else
    insert into public.request_steps (request_id, step_no, org_unit_id, level)
    select v_id, x.step_no, x.id, x.level
    from (
      select row_number() over (order by a.depth) as step_no, u.id, u.level
      from public.ancestors_or_self(p_org_unit_id) a
      join public.org_units u on u.id = a.id
      where u.level = any (v_type.route_levels)
        and (v_type.start_at_own_unit or a.depth > 0)
    ) x
    where v_type.max_steps is null or x.step_no <= v_type.max_steps;
  end if;
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
revoke all on function private.create_request(text, uuid, text, jsonb, uuid[]) from public, anon, authenticated;

create or replace function private.create_request(p_type_key text, p_org_unit_id uuid, p_title text, p_payload jsonb)
returns uuid
language sql
security definer
set search_path = public
as $$
  select private.create_request(p_type_key, p_org_unit_id, p_title, p_payload, null::uuid[]);
$$;

-- ---------------------------------------------------------------
-- status_changes: เส้นเวลาสถานะของบุคคล (ระบบบันทึกให้เมื่อคำขออนุมัติหรือการแจ้งได้รับทราบ)
-- change_type: transfer ย้าย / resign ลาออก / death มรณภาพ-ตาย / disrobe ลาสิกขา / other พ้นตำแหน่งด้วยเหตุอื่น
-- เอกสารแนบอยู่กับคำขอที่เกี่ยวข้อง (attachments ของ request_id)
-- ---------------------------------------------------------------
create table public.status_changes (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid not null references public.persons (id),
  change_type       text not null check (change_type in ('transfer', 'resign', 'death', 'disrobe', 'other')),
  effective_on      date not null,                               -- วันที่มีผล
  reason            text not null default '',                    -- เหตุผล
  request_id        uuid references public.requests (id),        -- คำขอที่เกี่ยวข้อง
  from_org_unit_id  uuid references public.org_units (id),       -- ย้าย: หน่วยต้นทาง
  to_org_unit_id    uuid references public.org_units (id),       -- ย้าย: หน่วยปลายทาง
  from_place        text not null default '',                    -- ย้าย: วัดหรือสำนักต้นทาง
  to_place          text not null default '',                    -- ย้าย: วัดหรือสำนักปลายทาง
  status_before     text not null,
  status_after      text not null,
  created_by        uuid default auth.uid() references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.status_changes is 'เส้นเวลาสถานะของบุคคล บันทึกโดยระบบเมื่อคำขออนุมัติหรือการแจ้งได้รับทราบ';
create index status_changes_person_idx on public.status_changes (person_id, effective_on desc);

create trigger status_changes_set_updated_at before update on public.status_changes
  for each row execute function public.set_updated_at();
create trigger status_changes_audit after insert or update or delete on public.status_changes
  for each row execute function public.audit_row_change();

alter table public.status_changes enable row level security;
revoke all on public.status_changes from anon;
revoke insert, update, delete, truncate on public.status_changes from authenticated;
create policy status_changes_read on public.status_changes for select to authenticated
  using (public.can_view_person(person_id));

-- ---------------------------------------------------------------
-- ชนิดคำขอ 5 ชนิด
-- ขอย้าย: เส้นทางกำหนดเองตอนยื่น (สายต้นทางขึ้นถึงหน่วยร่วม แล้วลงสายปลายทาง) พิจารณาโดยเจ้าคณะหรือรองเจ้าคณะ
-- ลาออก: จากหน่วยต้นสังกัดขึ้นไปทุกชั้นถึงภาค พิจารณาโดยเจ้าคณะหรือรองเจ้าคณะ
-- การแจ้ง 3 ชนิด: ขั้นเดียวที่หน่วยเหนือ 1 ชั้น เจ้าคณะ รองเจ้าคณะ หรือเลขานุการ กดรับทราบ (ถ้าหน่วยเหนือคือส่วนกลาง = เจ้าหน้าที่ส่วนกลาง)
-- ---------------------------------------------------------------
insert into public.request_types
  (key, code, name, route_levels, start_at_own_unit, decider_roles, central_roles, max_steps, is_personnel)
values
  ('transfer', 'MOVE', 'ขอย้าย',
   '{subdistrict,district,province,region,central}', true, '{chief,deputy_chief}', '{central_staff}', null, true),
  ('resign', 'RESIGN', 'ขอลาออก',
   '{subdistrict,district,province,region}', true, '{chief,deputy_chief}', '{central_staff}', null, true),
  ('death_notice', 'DEATH', 'แจ้งมรณภาพ-ตาย',
   '{subdistrict,district,province,region,central}', false, '{chief,deputy_chief,secretary}', '{central_staff}', 1, true),
  ('disrobe_notice', 'DISROBE', 'แจ้งลาสิกขา',
   '{subdistrict,district,province,region,central}', false, '{chief,deputy_chief,secretary}', '{central_staff}', 1, true),
  ('other_exit_notice', 'EXIT', 'แจ้งพ้นตำแหน่งด้วยเหตุอื่น',
   '{subdistrict,district,province,region,central}', false, '{chief,deputy_chief,secretary}', '{central_staff}', 1, true);

create function public.is_status_request_type(p_type_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type_key in ('transfer', 'resign', 'death_notice', 'disrobe_notice', 'other_exit_notice');
$$;
revoke execute on function public.is_status_request_type(text) from public, anon;
grant execute on function public.is_status_request_type(text) to authenticated;

-- คำขอและการแจ้งเรื่องสถานะ: เมื่อส่งใหม่ แก้ได้เฉพาะเรื่องและรายละเอียด (เหตุผล) ข้อมูลอื่นแก้ไม่ได้
create function public.requests_lock_status_payload()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_status_request_type(new.type_key)
     and (new.payload - 'detail') is distinct from (old.payload - 'detail') then
    raise exception 'คำขอนี้แก้ได้เฉพาะรายละเอียด ถ้าต้องการเปลี่ยนข้อมูลอื่นให้ยกเลิกแล้วยื่นใหม่' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.requests_lock_status_payload() from public, anon, authenticated;
create trigger requests_lock_status_payload before update of payload on public.requests
  for each row execute function public.requests_lock_status_payload();

-- ---------------------------------------------------------------
-- ยื่นคำขอย้าย / ลาออก หรือบันทึกการแจ้ง มรณภาพ-ตาย / ลาสิกขา / พ้นตำแหน่งด้วยเหตุอื่น
-- p_data: effective_on (วันที่มีผล), detail (เหตุผล), to_unit_id, to_place, from_place (เฉพาะขอย้าย)
-- ผู้ยื่น: ขอย้ายและลาออก = เจ้าของประวัติ หรือเลขานุการของหน่วยต้นสังกัด / การแจ้ง = เลขานุการของหน่วยต้นสังกัด
-- ---------------------------------------------------------------
create function public.submit_status_request(p_person_id uuid, p_type text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.persons%rowtype;
  v_from public.org_units%rowtype;
  v_to public.org_units%rowtype;
  v_type_name text;
  v_name text;
  v_date date;
  v_detail text := btrim(coalesce(p_data ->> 'detail', ''));
  v_from_place text := btrim(coalesce(p_data ->> 'from_place', ''));
  v_to_place text := btrim(coalesce(p_data ->> 'to_place', ''));
  v_is_owner boolean;
  v_can_edit boolean;
  v_route uuid[];
  v_lca_from integer;
  v_lca_to integer;
  v_payload jsonb;
  v_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'กรุณาเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;
  if not public.is_status_request_type(p_type) then
    raise exception 'ไม่พบชนิดคำขอนี้' using errcode = 'P0001';
  end if;
  select name into v_type_name from public.request_types where key = p_type;

  select * into v_person from public.persons where id = p_person_id for update;
  if not found then
    raise exception 'ไม่พบบุคคลนี้ในทะเบียน' using errcode = '42501';
  end if;
  v_is_owner := v_person.user_id = auth.uid();
  v_can_edit := public.can_edit_personnel(v_person.org_unit_id);
  if p_type in ('transfer', 'resign') then
    if not (coalesce(v_is_owner, false) or v_can_edit) then
      raise exception 'ผู้ยื่นต้องเป็นเจ้าของประวัติ หรือเลขานุการของหน่วยต้นสังกัด' using errcode = '42501';
    end if;
  elsif not v_can_edit then
    raise exception 'การแจ้งนี้บันทึกได้เฉพาะเลขานุการของหน่วยต้นสังกัด' using errcode = '42501';
  end if;
  if not v_person.is_active then
    raise exception 'บุคคลนี้ถูกปิดใช้งานอยู่ในทะเบียน' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.requests r
    where public.is_status_request_type(r.type_key)
      and r.status in ('pending', 'returned')
      and r.payload ->> 'person_id' = p_person_id::text
  ) then
    raise exception 'บุคคลนี้มีคำขอหรือการแจ้งเรื่องสถานะที่ยังไม่ได้ผลอยู่แล้ว ต้องรอผลหรือยกเลิกรายการเดิมก่อน' using errcode = 'P0001';
  end if;

  -- สถานะปัจจุบันต้องเข้ากับเรื่องที่ยื่น
  if p_type in ('transfer', 'resign', 'other_exit_notice') and v_person.status <> 'active' then
    raise exception 'ทำรายการนี้ได้เฉพาะบุคคลที่มีสถานะ ปฏิบัติหน้าที่' using errcode = 'P0001';
  end if;
  if p_type = 'death_notice' and v_person.status = 'deceased' then
    raise exception 'บุคคลนี้มีสถานะมรณภาพหรือตายอยู่แล้ว' using errcode = 'P0001';
  end if;
  if p_type = 'disrobe_notice' then
    if v_person.person_type <> 'monastic' then
      raise exception 'การแจ้งลาสิกขาใช้กับบรรพชิตเท่านั้น' using errcode = 'P0001';
    end if;
    if v_person.status in ('deceased', 'disrobed') then
      raise exception 'บุคคลนี้มีสถานะมรณภาพหรือลาสิกขาอยู่แล้ว' using errcode = 'P0001';
    end if;
  end if;

  begin
    v_date := nullif(p_data ->> 'effective_on', '')::date;
  exception when others then
    raise exception 'วันที่ไม่ถูกต้อง' using errcode = '23514';
  end;
  if v_date is null then
    raise exception 'กรุณากรอกวันที่มีผล' using errcode = '23514';
  end if;
  if p_type in ('death_notice', 'disrobe_notice', 'other_exit_notice') and v_date > current_date then
    raise exception 'วันที่ต้องไม่เป็นวันในอนาคต' using errcode = '23514';
  end if;
  if v_date > current_date + 366 then
    raise exception 'วันที่มีผลอยู่ไกลเกินไปในอนาคต กรุณาตรวจปี พ.ศ.' using errcode = '23514';
  end if;
  if p_type in ('resign', 'other_exit_notice') and v_detail = '' then
    raise exception 'กรุณาระบุเหตุผล' using errcode = '23514';
  end if;

  select * into v_from from public.org_units where id = v_person.org_unit_id;
  v_name := concat_ws(' ', nullif(v_person.title, ''), v_person.first_name,
                      nullif(v_person.monastic_name, ''), nullif(v_person.last_name, ''));
  v_payload := jsonb_build_object(
    'person_id', v_person.id, 'person_name', v_name, 'person_type', v_person.person_type,
    'effective_on', v_date, 'detail', v_detail,
    'from_unit_id', v_from.id, 'from_unit_name', v_from.name
  );

  if p_type = 'transfer' then
    select * into v_to from public.org_units where id = nullif(p_data ->> 'to_unit_id', '')::uuid;
    if not found or v_to.level = 'central' or not v_to.is_active then
      raise exception 'กรุณาเลือกหน่วยปลายทาง (ระดับภาค จังหวัด อำเภอ หรือตำบล ที่เปิดใช้งานอยู่)' using errcode = '23514';
    end if;
    if v_to.sect is distinct from v_from.sect then
      raise exception 'ย้ายข้ามนิกายไม่ได้' using errcode = '23514';
    end if;
    if v_from_place = '' then
      v_from_place := v_person.temple_name;
    end if;
    if v_to.id = v_from.id and (v_to_place = '' or v_to_place = v_from_place) then
      raise exception 'หน่วยปลายทางเป็นหน่วยเดียวกับต้นทาง กรุณาระบุวัดหรือสำนักปลายทางที่ต่างจากต้นทาง' using errcode = '23514';
    end if;

    -- เส้นทาง: สายต้นทางขึ้นไปถึงหน่วยร่วม แล้วลงสายปลายทางถึงหน่วยปลายทาง
    select f.depth, t.depth into v_lca_from, v_lca_to
    from public.ancestors_or_self(v_from.id) f
    join public.ancestors_or_self(v_to.id) t on t.id = f.id
    order by f.depth
    limit 1;
    select array_agg(x.id order by x.ord) into v_route
    from (
      select f.id, f.depth as ord from public.ancestors_or_self(v_from.id) f where f.depth <= v_lca_from
      union all
      select t.id, v_lca_from + (v_lca_to - t.depth) as ord from public.ancestors_or_self(v_to.id) t where t.depth < v_lca_to
    ) x;

    v_payload := v_payload || jsonb_build_object(
      'to_unit_id', v_to.id, 'to_unit_name', v_to.name, 'from_place', v_from_place, 'to_place', v_to_place
    );
  end if;

  v_id := private.create_request(p_type, v_person.org_unit_id, v_type_name || ': ' || v_name, v_payload, v_route);

  if p_type = 'transfer' then
    update public.persons set status = 'transfer_pending' where id = v_person.id;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.submit_status_request(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_status_request(uuid, text, jsonb) to authenticated;

-- แจ้งเตือนเจ้าคณะ รองเจ้าคณะ และเลขานุการ ของหน่วยที่ระบุ
create function private.notify_unit_roles(p_units uuid[], p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, title, body, link)
  select distinct ur.user_id, p_title, coalesce(p_body, ''), p_link
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where ur.org_unit_id = any (p_units)
    and ur.role_key in ('chief', 'deputy_chief', 'secretary')
    and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date);
$$;
revoke all on function private.notify_unit_roles(uuid[], text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- เมื่อคำขออนุมัติขั้นสุดท้าย หรือการแจ้งได้รับทราบ:
-- ปิดวาระใน appointments และ education_staff เปลี่ยนสถานะบุคคล บันทึกเส้นเวลา และแจ้งหน่วยที่ตำแหน่งว่าง
-- เมื่อคำขอย้ายไม่ได้รับอนุมัติหรือถูกยกเลิก: สถานะกลับเป็น ปฏิบัติหน้าที่
-- ---------------------------------------------------------------
create function public.apply_status_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.persons%rowtype;
  v_date date := (new.payload ->> 'effective_on')::date;
  v_reason text := coalesce(new.payload ->> 'detail', '');
  v_change text;
  v_end_reason text;
  v_status text;
  v_word text;
  v_body text;
  r record;
begin
  select * into v_person from public.persons where id = (new.payload ->> 'person_id')::uuid for update;
  if not found then
    raise exception 'ไม่พบบุคคลของคำขอนี้ในทะเบียน' using errcode = 'P0001';
  end if;

  if new.status in ('rejected', 'cancelled') then
    if new.type_key = 'transfer' and v_person.status = 'transfer_pending' then
      update public.persons set status = 'active' where id = v_person.id;
    end if;
    return new;
  end if;

  -- การแจ้งต้องมีหลักฐานแนบ จึงรับทราบได้
  if new.type_key in ('death_notice', 'disrobe_notice', 'other_exit_notice') and not exists (
    select 1 from public.attachments a
    where a.entity_table = 'requests' and a.entity_id = new.id::text and a.is_active
  ) then
    raise exception 'ยังไม่มีหลักฐานแนบ จึงรับทราบไม่ได้ กรุณาส่งกลับให้ผู้บันทึกแนบหลักฐาน' using errcode = 'P0001';
  end if;

  select x.change, x.end_reason, x.status, x.word into v_change, v_end_reason, v_status, v_word
  from (values
    ('transfer', 'transfer', 'transferred', 'active', 'ย้าย'),
    ('resign', 'resign', 'resigned', 'resigned', 'ลาออก'),
    ('death_notice', 'death', 'deceased', 'deceased',
       case when v_person.person_type = 'monastic' then 'มรณภาพ' else 'ตาย' end),
    ('disrobe_notice', 'disrobe', 'disrobed', 'disrobed', 'ลาสิกขา'),
    ('other_exit_notice', 'other', 'other', 'removed_other', 'พ้นตำแหน่งด้วยเหตุอื่น')
  ) as x(type_key, change, end_reason, status, word)
  where x.type_key = new.type_key;

  v_body := (new.payload ->> 'person_name') || ' ' || v_word || ' มีผลวันที่ '
            || to_char(v_date, 'DD/MM/') || (extract(year from v_date)::integer + 543);

  -- แจ้งหน่วยที่ตำแหน่งว่าง (หน่วยนั้นและหน่วยเหนือ 1 ชั้น) แล้วปิดวาระ
  for r in
    select a.org_unit_id, u.parent_id, t.name as position_name, u.name as unit_name
    from public.appointments a
    join public.position_types t on t.key = a.position_type_key
    join public.org_units u on u.id = a.org_unit_id
    where a.person_id = v_person.id and a.is_active and a.ended_on is null
  loop
    perform private.notify_unit_roles(
      array[r.org_unit_id, r.parent_id],
      'ตำแหน่งว่าง: ' || r.position_name || ' · ' || r.unit_name,
      v_body, '/app/personnel?f_unit=' || r.org_unit_id
    );
  end loop;
  update public.appointments
     set ended_on = greatest(v_date, appointed_on),
         end_reason = v_end_reason,
         end_note = case when v_end_reason = 'other' then coalesce(nullif(v_reason, ''), 'พ้นตำแหน่งด้วยเหตุอื่น') else end_note end
   where person_id = v_person.id and is_active and ended_on is null;

  for r in
    select e.org_unit_id, u.parent_id, e.track, e.school_name, u.name as unit_name
    from public.education_staff e
    join public.org_units u on u.id = e.org_unit_id
    where e.person_id = v_person.id and e.is_active and e.status <> 'ended'
  loop
    perform private.notify_unit_roles(
      array[r.org_unit_id, r.parent_id],
      'จศป. ว่าง: ' || case r.track when 'dhamma' then 'แผนกธรรม' when 'pali' then 'แผนกบาลี'
                                   when 'general' then 'แผนกสามัญ' else 'ปริยัตินิเทศก์' end
        || ' · ' || coalesce(nullif(r.school_name, ''), r.unit_name),
      v_body, '/app/personnel/education?track=' || r.track || '&f_unit=' || r.org_unit_id
    );
  end loop;
  update public.education_staff
     set status = 'ended', ended_on = greatest(v_date, coalesce(started_on, v_date))
   where person_id = v_person.id and is_active and status <> 'ended';

  if new.type_key = 'transfer' then
    update public.persons
       set org_unit_id = (new.payload ->> 'to_unit_id')::uuid,
           temple_name = coalesce(nullif(new.payload ->> 'to_place', ''), temple_name),
           status = 'active'
     where id = v_person.id;
  else
    update public.persons set status = v_status where id = v_person.id;
  end if;

  insert into public.status_changes (
    person_id, change_type, effective_on, reason, request_id,
    from_org_unit_id, to_org_unit_id, from_place, to_place, status_before, status_after, created_by
  ) values (
    v_person.id, v_change, v_date, v_reason, new.id,
    case when new.type_key = 'transfer' then (new.payload ->> 'from_unit_id')::uuid end,
    case when new.type_key = 'transfer' then (new.payload ->> 'to_unit_id')::uuid end,
    coalesce(new.payload ->> 'from_place', ''), coalesce(new.payload ->> 'to_place', ''),
    v_person.status, v_status, auth.uid()
  );
  return new;
end;
$$;
revoke execute on function public.apply_status_request() from public, anon, authenticated;

create trigger requests_apply_status_request
  after update of status on public.requests
  for each row
  when (
    public.is_status_request_type(new.type_key)
    and new.status is distinct from old.status
    and new.status in ('approved', 'rejected', 'cancelled')
  )
  execute function public.apply_status_request();

-- ---------------------------------------------------------------
-- รายการคำขอและการแจ้งของทะเบียนบุคคล สำหรับหน้า /app/personnel/requests (อยู่ใต้ RLS)
-- ---------------------------------------------------------------
create function public.list_personnel_requests(
  p_type text default null,
  p_status text default null,
  p_q text default '',
  p_sort text default 'submitted',
  p_dir text default 'desc',
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid, request_no text, type_key text, type_name text, title text, status text,
  person_id text, person_name text, org_unit_name text, effective_on text,
  submitted_at timestamptz, decided_at timestamptz, current_unit_name text, total_count bigint
)
language sql
stable
set search_path = public
as $$
  with base as (
    select r.id, r.request_no, r.type_key, t.name as type_name, r.title, r.status,
           r.payload ->> 'person_id' as person_id, r.payload ->> 'person_name' as person_name,
           u.name as org_unit_name, r.payload ->> 'effective_on' as effective_on,
           r.submitted_at, r.decided_at,
           (
             select su.name from public.request_steps s
             join public.org_units su on su.id = s.org_unit_id
             where s.request_id = r.id and s.step_no = r.current_step
           ) as current_unit_name
    from public.requests r
    join public.request_types t on t.key = r.type_key
    join public.org_units u on u.id = r.org_unit_id
    where t.is_personnel
      and (p_type is null or r.type_key = p_type)
      and (p_status is null or r.status = p_status)
      and (coalesce(p_q, '') = '' or r.request_no ilike '%' || p_q || '%' or r.title ilike '%' || p_q || '%')
  )
  select b.*, count(*) over () as total_count
  from base b
  order by
    case when p_sort = 'submitted' and p_dir = 'asc' then b.submitted_at end asc,
    case when p_sort = 'submitted' and p_dir = 'desc' then b.submitted_at end desc,
    case when p_sort = 'no' and p_dir = 'asc' then b.request_no end asc,
    case when p_sort = 'no' and p_dir = 'desc' then b.request_no end desc,
    case when p_sort = 'status' and p_dir = 'asc' then b.status end asc,
    case when p_sort = 'status' and p_dir = 'desc' then b.status end desc,
    b.submitted_at desc, b.id
  limit greatest(1, least(coalesce(p_limit, 10), 10000))
  offset greatest(0, coalesce(p_offset, 0));
$$;
revoke execute on function public.list_personnel_requests(text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.list_personnel_requests(text, text, text, text, text, integer, integer) to authenticated;
