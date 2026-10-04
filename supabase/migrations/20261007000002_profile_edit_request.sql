-- บทที่ 6 (2/2): คำขอแก้ไขประวัติ (ชนิดคำขอ profile_edit) ผ่านเครื่องอนุมัติกลาง

-- ---------------------------------------------------------------
-- ขยายเครื่องอนุมัติกลาง
-- 1) max_steps: จำกัดจำนวนขั้นพิจารณา (ว่าง = ทุกระดับในเส้นทาง)
-- 2) แยกส่วนสร้างคำขอเป็นฟังก์ชันภายใน ให้ระบบอื่นเรียกได้หลังตรวจสิทธิ์ของตนเองแล้ว
-- ---------------------------------------------------------------
alter table public.request_types
  add column max_steps integer check (max_steps is null or max_steps >= 1);
comment on column public.request_types.max_steps is 'จำนวนขั้นพิจารณาสูงสุด นับจากขั้นแรก (ว่าง = ทุกระดับในเส้นทาง)';

create function private.create_request(p_type_key text, p_org_unit_id uuid, p_title text, p_payload jsonb)
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
  select v_id, x.step_no, x.id, x.level
  from (
    select row_number() over (order by a.depth) as step_no, u.id, u.level
    from public.ancestors_or_self(p_org_unit_id) a
    join public.org_units u on u.id = a.id
    where u.level = any (v_type.route_levels)
      and (v_type.start_at_own_unit or a.depth > 0)
  ) x
  where v_type.max_steps is null or x.step_no <= v_type.max_steps;
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
revoke all on function private.create_request(text, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.submit_request(p_type_key text, p_org_unit_id uuid, p_title text, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'กรุณาเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;
  -- คำขอแก้ไขประวัติต้องยื่นผ่าน submit_profile_edit เท่านั้น (ตรวจว่าเป็นประวัติของตนเอง)
  if p_type_key = 'profile_edit' then
    raise exception 'คำขอแก้ไขประวัติให้ยื่นจากหน้า ประวัติของฉัน' using errcode = 'P0001';
  end if;
  if p_org_unit_id is null or not public.can_access(p_org_unit_id) then
    raise exception 'ท่านยื่นคำขอได้เฉพาะในนามหน่วยที่ท่านดูแล' using errcode = '42501';
  end if;
  return private.create_request(p_type_key, p_org_unit_id, p_title, p_payload);
end;
$$;

-- ---------------------------------------------------------------
-- ชนิดคำขอ: แก้ไขประวัติ
-- พิจารณาขั้นเดียวที่เขตปกครองของบุคคลนั้น โดย เลขานุการ เจ้าคณะ หรือรองเจ้าคณะ ของเขตนั้น
-- ---------------------------------------------------------------
insert into public.request_types (key, code, name, route_levels, start_at_own_unit, decider_roles, max_steps)
values (
  'profile_edit', 'EDIT', 'ขอแก้ไขประวัติ',
  '{subdistrict,district,province,region}', true, '{secretary,chief,deputy_chief}', 1
);

-- คำขอแก้ไขประวัติมีข้อมูลส่วนบุคคล: เห็นได้เฉพาะผู้ยื่นและผู้มีสิทธิ์ดูทะเบียนบุคคลของเขตนั้น
alter policy requests_read on public.requests
  using (
    requester_id = auth.uid()
    or case
      when type_key = 'profile_edit' then public.can_view_personnel(org_unit_id)
      else public.can_access(org_unit_id)
    end
  );

-- ---------------------------------------------------------------
-- ตรวจรายการที่ขอแก้ไข คืนเฉพาะช่องที่อนุญาตและค่าต่างจากปัจจุบัน
-- ช่องที่ขอแก้ได้: title, first_name, monastic_name, last_name, birth_date, ordination_date,
--                 nak_tham, pali_grade, general_education, temple_name, phone
-- (เลขประจำตัวประชาชน เขตปกครอง และสถานะ ไม่รับผ่านคำขอ ให้ระบุในรายละเอียดเพื่อให้เลขานุการแก้ไข)
-- ---------------------------------------------------------------
create function private.clean_profile_changes(p_person public.persons, p_changes jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array['title', 'first_name', 'monastic_name', 'last_name', 'birth_date', 'ordination_date',
                            'nak_tham', 'pali_grade', 'general_education', 'temple_name', 'phone'];
  v_current jsonb := to_jsonb(p_person);
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_value text;
  v_birth date;
  v_ordained date;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    return v_out;
  end if;

  for v_key, v_value in select key, btrim(coalesce(value, '')) from jsonb_each_text(p_changes)
  loop
    if not (v_key = any (v_allowed)) then
      raise exception 'ช่อง "%" ขอแก้ไขผ่านคำขอไม่ได้', v_key using errcode = '23514';
    end if;
    if p_person.person_type = 'lay' and v_key in ('monastic_name', 'ordination_date') then
      continue;
    end if;
    if v_key in ('birth_date', 'ordination_date') and v_value <> '' then
      begin
        perform v_value::date;
      exception when others then
        raise exception 'วันที่ที่ขอแก้ไขไม่ถูกต้อง' using errcode = '23514';
      end;
    end if;
    if v_value is distinct from coalesce(v_current ->> v_key, '') then
      v_out := v_out || jsonb_build_object(v_key, v_value);
    end if;
  end loop;

  if v_out ? 'first_name' and v_out ->> 'first_name' = '' then
    raise exception 'ชื่อต้องไม่ว่าง' using errcode = '23514';
  end if;
  if v_out ? 'nak_tham' and v_out ->> 'nak_tham' not in ('', 'tri', 'tho', 'ek') then
    raise exception 'ค่า น.ธ. ไม่ถูกต้อง' using errcode = '23514';
  end if;
  if v_out ? 'pali_grade' and v_out ->> 'pali_grade' not in ('', 'p12', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9') then
    raise exception 'ค่า ป.ธ. ไม่ถูกต้อง' using errcode = '23514';
  end if;

  v_birth := case when v_out ? 'birth_date' then nullif(v_out ->> 'birth_date', '')::date else p_person.birth_date end;
  v_ordained := case when v_out ? 'ordination_date' then nullif(v_out ->> 'ordination_date', '')::date
                     else p_person.ordination_date end;
  if v_birth is not null and v_birth > current_date then
    raise exception 'วันเกิดต้องไม่เป็นวันในอนาคต' using errcode = '23514';
  end if;
  if v_ordained is not null and v_ordained > current_date then
    raise exception 'วันอุปสมบทต้องไม่เป็นวันในอนาคต' using errcode = '23514';
  end if;
  if v_ordained is not null and v_birth is not null and v_ordained <= v_birth then
    raise exception 'วันอุปสมบทต้องอยู่หลังวันเกิด' using errcode = '23514';
  end if;

  return v_out;
end;
$$;
revoke all on function private.clean_profile_changes(public.persons, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- ยื่นคำขอแก้ไขประวัติของตนเอง
-- payload: person_id, changes (ค่าที่ขอ), before (ค่าเดิมของช่องเดียวกัน), detail (รายละเอียดเพิ่มเติม)
-- ---------------------------------------------------------------
create function public.submit_profile_edit(p_changes jsonb, p_detail text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.persons%rowtype;
  v_changes jsonb;
  v_before jsonb := '{}'::jsonb;
  v_detail text := btrim(coalesce(p_detail, ''));
  v_key text;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'กรุณาเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;
  select * into v_person from public.persons where user_id = auth.uid() and is_active;
  if not found then
    raise exception 'บัญชีของท่านยังไม่ได้ผูกกับทะเบียนบุคคล' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.requests
    where requester_id = auth.uid() and type_key = 'profile_edit' and status in ('pending', 'returned')
  ) then
    raise exception 'ท่านมีคำขอแก้ไขประวัติที่ยังไม่ได้ผลอยู่แล้ว กรุณารอผล หรือยกเลิกคำขอเดิมก่อน' using errcode = 'P0001';
  end if;

  v_changes := private.clean_profile_changes(v_person, p_changes);
  if v_changes = '{}'::jsonb and v_detail = '' then
    raise exception 'ยังไม่มีรายการที่ขอแก้ไข กรุณาแก้ค่าในช่องที่ต้องการ หรือระบุรายละเอียด' using errcode = 'P0001';
  end if;
  for v_key in select jsonb_object_keys(v_changes)
  loop
    v_before := v_before || jsonb_build_object(v_key, coalesce(to_jsonb(v_person) ->> v_key, ''));
  end loop;

  return private.create_request(
    'profile_edit', v_person.org_unit_id,
    'ขอแก้ไขประวัติ: ' || concat_ws(' ', nullif(v_person.title, ''), v_person.first_name,
                                    nullif(v_person.monastic_name, ''), nullif(v_person.last_name, '')),
    jsonb_build_object('person_id', v_person.id, 'changes', v_changes, 'before', v_before, 'detail', v_detail)
  );
end;
$$;
revoke execute on function public.submit_profile_edit(jsonb, text) from public, anon;
grant execute on function public.submit_profile_edit(jsonb, text) to authenticated;

-- ---------------------------------------------------------------
-- เมื่อคำขอแก้ไขประวัติได้รับอนุมัติขั้นสุดท้าย: แก้ข้อมูลในทะเบียนบุคคลให้อัตโนมัติ
-- ตรวจรายการซ้ำอีกครั้ง และแก้เฉพาะประวัติของผู้ยื่นเองเสมอ (ไม่เชื่อ person_id ใน payload)
-- ---------------------------------------------------------------
create function public.apply_profile_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.persons%rowtype;
  c jsonb;
begin
  select * into v_person from public.persons where user_id = new.requester_id for update;
  if not found then
    raise exception 'ไม่พบบุคคลในทะเบียนที่ผูกกับบัญชีของผู้ยื่น จึงอนุมัติไม่ได้' using errcode = 'P0001';
  end if;
  c := private.clean_profile_changes(v_person, new.payload -> 'changes');
  if c = '{}'::jsonb then
    return new;
  end if;

  update public.persons set
    title = coalesce(c ->> 'title', title),
    first_name = coalesce(c ->> 'first_name', first_name),
    monastic_name = coalesce(c ->> 'monastic_name', monastic_name),
    last_name = coalesce(c ->> 'last_name', last_name),
    birth_date = case when c ? 'birth_date' then nullif(c ->> 'birth_date', '')::date else birth_date end,
    ordination_date = case when c ? 'ordination_date' then nullif(c ->> 'ordination_date', '')::date else ordination_date end,
    nak_tham = coalesce(c ->> 'nak_tham', nak_tham),
    pali_grade = coalesce(c ->> 'pali_grade', pali_grade),
    general_education = coalesce(c ->> 'general_education', general_education),
    temple_name = coalesce(c ->> 'temple_name', temple_name),
    phone = coalesce(c ->> 'phone', phone)
  where id = v_person.id;
  return new;
end;
$$;
revoke execute on function public.apply_profile_edit() from public, anon, authenticated;

create trigger requests_apply_profile_edit
  after update of status on public.requests
  for each row
  when (new.type_key = 'profile_edit' and new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.apply_profile_edit();
