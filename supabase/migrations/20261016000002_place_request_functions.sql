-- บทที่ 15 (2/2): ฟังก์ชันของคำขอจัดตั้งและยุบสำนักเรียน สำนักศาสนศึกษา
--   ยื่น / แก้ไขแล้วส่งใหม่ / ผลหลังอนุมัติขั้นสุดท้าย / เอกสารบังคับ / รายการ 3 แท็บ / แจ้งเตือนเกินกำหนด

create function private.samnak_type_label(p_place_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_place_type when 'samnak_rian' then 'สำนักเรียน' when 'samnak_sasanasuksa' then 'สำนักศาสนศึกษา' end;
$$;
revoke all on function private.samnak_type_label(text) from public, anon, authenticated;

-- จำนวนเต็ม 0 ถึง 100,000 จากข้อความ (ว่าง = 0) ถ้าไม่ใช่ตัวเลขคืน null
create function private.count_or_null(p_value text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(btrim(p_value), '') = '' then 0
    when btrim(p_value) ~ '^[0-9]{1,6}$' and btrim(p_value)::integer <= 100000 then btrim(p_value)::integer
  end;
$$;
revoke all on function private.count_or_null(text) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- ตรวจข้อมูลคำขอ แล้วคืน หน่วยที่ยื่น (เขตคณะสงฆ์ของวัดที่ตั้งหรือของสำนัก) เรื่อง และข้อมูลคำขอที่สะอาดแล้ว
-- p_exclude = รหัสคำขอเดิม (กรณีแก้ไขแล้วส่งใหม่) ไม่นับเป็นคำขอซ้ำ
-- ขอจัดตั้ง p_data: name, place_type, temple_id, head_person_id, counts {nak_tham|pali|tham_sueksa: {teachers, students}},
--                   buildings, detail
-- ขอยุบ p_data: place_id, detail, support_plan
-- ---------------------------------------------------------------
create function private.build_place_request(
  p_type text, p_data jsonb, p_exclude uuid,
  out o_unit uuid, out o_title text, out o_payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_data ->> 'name', ''), '\s+', ' ', 'g'));
  v_place_type text := coalesce(p_data ->> 'place_type', '');
  v_detail text := btrim(coalesce(p_data ->> 'detail', ''));
  v_buildings text := btrim(coalesce(p_data ->> 'buildings', ''));
  v_plan text := btrim(coalesce(p_data ->> 'support_plan', ''));
  v_temple public.places%rowtype;
  v_place public.places%rowtype;
  v_head public.persons%rowtype;
  v_unit_name text;
  v_counts jsonb := '{}'::jsonb;
  v_dept text;
  v_teachers integer;
  v_students integer;
  v_uuid uuid;
begin
  if p_type = 'samnak_establish' then
    if v_name = '' then
      raise exception 'กรุณากรอกชื่อสำนักที่ขอจัดตั้ง' using errcode = '23514';
    end if;
    if length(v_name) > 200 then
      raise exception 'ชื่อสำนักยาวเกินไป (ไม่เกิน 200 ตัวอักษร)' using errcode = '23514';
    end if;
    if v_place_type not in ('samnak_rian', 'samnak_sasanasuksa') then
      raise exception 'กรุณาเลือกประเภท สำนักเรียน หรือ สำนักศาสนศึกษา' using errcode = '23514';
    end if;

    begin
      v_uuid := nullif(p_data ->> 'temple_id', '')::uuid;
    exception when others then
      v_uuid := null;
    end;
    select * into v_temple from public.places where id = v_uuid;
    if not found or v_temple.place_type <> 'temple' or not v_temple.is_active then
      raise exception 'กรุณาเลือกวัดที่ตั้งจากทะเบียนสถานที่' using errcode = '23514';
    end if;
    if not public.can_edit_places(v_temple.org_unit_id) then
      raise exception 'ท่านยื่นคำขอได้เฉพาะวัดในเขตที่ท่านมีสิทธิ์แก้ไขทะเบียนสถานที่' using errcode = '42501';
    end if;
    if v_temple.status <> 'open' then
      raise exception 'วัดที่ตั้งไม่ได้อยู่ในสถานะ เปิดดำเนินการ' using errcode = '23514';
    end if;

    begin
      v_uuid := nullif(p_data ->> 'head_person_id', '')::uuid;
    exception when others then
      v_uuid := null;
    end;
    select * into v_head from public.persons where id = v_uuid;
    if not found or not v_head.is_active or not public.can_view_person(v_head.id) then
      raise exception 'กรุณาเลือกเจ้าสำนักจากทะเบียนบุคคล' using errcode = '23514';
    end if;
    if v_head.status not in ('active', 'transfer_pending') then
      raise exception 'เจ้าสำนักต้องเป็นบุคคลที่มีสถานะ ปฏิบัติหน้าที่' using errcode = '23514';
    end if;

    foreach v_dept in array array['nak_tham', 'pali', 'tham_sueksa'] loop
      v_teachers := private.count_or_null(p_data #>> array['counts', v_dept, 'teachers']);
      v_students := private.count_or_null(p_data #>> array['counts', v_dept, 'students']);
      if v_teachers is null or v_students is null then
        raise exception 'จำนวนครูและนักเรียนต้องเป็นตัวเลข 0 ถึง 100,000' using errcode = '23514';
      end if;
      v_counts := v_counts || jsonb_build_object(v_dept, jsonb_build_object('teachers', v_teachers, 'students', v_students));
    end loop;

    if v_buildings = '' then
      raise exception 'กรุณากรอกอาคารสถานที่' using errcode = '23514';
    end if;
    if v_detail = '' then
      raise exception 'กรุณาระบุเหตุผล' using errcode = '23514';
    end if;

    if v_temple.district_code is not null and exists (
      select 1 from public.places p
      where p.is_active and p.place_type = v_place_type
        and p.district_code = v_temple.district_code and p.name = v_name
    ) then
      raise exception 'มี "%" ประเภทเดียวกันในอำเภอนี้อยู่แล้วในทะเบียนสถานที่', v_name using errcode = '23514';
    end if;
    if exists (
      select 1 from public.requests r
      where r.type_key = 'samnak_establish' and r.status in ('pending', 'returned')
        and r.id is distinct from p_exclude
        and r.payload ->> 'temple_id' = v_temple.id::text
        and r.payload ->> 'place_type' = v_place_type
        and r.payload ->> 'name' = v_name
    ) then
      raise exception 'มีคำขอจัดตั้งสำนักชื่อนี้ที่วัดนี้ซึ่งยังไม่ได้ผลอยู่แล้ว' using errcode = 'P0001';
    end if;

    select name into v_unit_name from public.org_units where id = v_temple.org_unit_id;
    o_unit := v_temple.org_unit_id;
    o_title := 'ขอจัดตั้ง' || private.samnak_type_label(v_place_type) || ': ' || v_name;
    o_payload := jsonb_build_object(
      'name', v_name, 'place_type', v_place_type,
      'temple_id', v_temple.id, 'temple_name', v_temple.name, 'temple_code', v_temple.code,
      'unit_name', v_unit_name,
      'head_person_id', v_head.id,
      'head_name', btrim(concat_ws(' ', nullif(v_head.title, ''), v_head.first_name,
                                   nullif(v_head.monastic_name, ''), nullif(v_head.last_name, ''))),
      'counts', v_counts, 'buildings', v_buildings, 'detail', v_detail
    );

  elsif p_type = 'samnak_dissolve' then
    begin
      v_uuid := nullif(p_data ->> 'place_id', '')::uuid;
    exception when others then
      v_uuid := null;
    end;
    select * into v_place from public.places where id = v_uuid;
    if not found or v_place.place_type not in ('samnak_rian', 'samnak_sasanasuksa') or not v_place.is_active then
      raise exception 'กรุณาเลือกสำนักเรียนหรือสำนักศาสนศึกษาจากทะเบียนสถานที่' using errcode = '23514';
    end if;
    if not public.can_edit_places(v_place.org_unit_id) then
      raise exception 'ท่านยื่นคำขอได้เฉพาะสำนักในเขตที่ท่านมีสิทธิ์แก้ไขทะเบียนสถานที่' using errcode = '42501';
    end if;
    if v_place.status = 'dissolved' then
      raise exception 'สำนักนี้มีสถานะ ยุบ อยู่แล้ว' using errcode = '23514';
    end if;
    if v_detail = '' then
      raise exception 'กรุณาระบุเหตุผล' using errcode = '23514';
    end if;
    if v_plan = '' then
      raise exception 'กรุณากรอกแผนรองรับนักเรียนและบุคลากร' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.requests r
      where r.type_key = 'samnak_dissolve' and r.status in ('pending', 'returned')
        and r.id is distinct from p_exclude
        and r.payload ->> 'place_id' = v_place.id::text
    ) then
      raise exception 'สำนักนี้มีคำขอยุบที่ยังไม่ได้ผลอยู่แล้ว' using errcode = 'P0001';
    end if;

    select * into v_temple from public.places where id = v_place.parent_place_id;
    select name into v_unit_name from public.org_units where id = v_place.org_unit_id;
    o_unit := v_place.org_unit_id;
    o_title := 'ขอยุบ' || private.samnak_type_label(v_place.place_type) || ': ' || v_place.name;
    o_payload := jsonb_build_object(
      'place_id', v_place.id, 'name', v_place.name, 'place_code', v_place.code, 'place_type', v_place.place_type,
      'temple_id', v_temple.id, 'temple_name', coalesce(v_temple.name, ''),
      'unit_name', v_unit_name,
      'detail', v_detail, 'support_plan', v_plan
    );
  else
    raise exception 'ไม่พบชนิดคำขอนี้' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.build_place_request(text, jsonb, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- ยื่นคำขอจัดตั้งหรือขอยุบ (ผู้ยื่น = ผู้มีสิทธิ์แก้ไขทะเบียนสถานที่ของเขตนั้น)
-- ---------------------------------------------------------------
create function public.submit_place_request(p_type text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'กรุณาเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;
  if not public.is_place_request_type(p_type) then
    raise exception 'ไม่พบชนิดคำขอนี้' using errcode = 'P0001';
  end if;
  select * into v from private.build_place_request(p_type, coalesce(p_data, '{}'::jsonb), null);
  perform set_config('app.place_request', '1', true);
  v_id := private.create_request(p_type, v.o_unit, v.o_title, v.o_payload);
  perform set_config('app.place_request', '', true);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------
-- ผู้ยื่นแก้ไขคำขอที่ถูกส่งกลับ แล้วส่งใหม่ (วัดที่ตั้งหรือสำนักที่ขอยุบเปลี่ยนไม่ได้ เพราะเส้นทางพิจารณาผูกกับเขตนั้น)
-- ---------------------------------------------------------------
create function public.resubmit_place_request(p_request_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.requests%rowtype;
  v record;
  v_key text;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.requester_id is distinct from auth.uid() or not public.is_place_request_type(v_req.type_key) then
    raise exception 'ส่งใหม่ได้เฉพาะคำขอของตนเอง' using errcode = '42501';
  end if;
  if v_req.status <> 'returned' then
    raise exception 'ส่งใหม่ได้เฉพาะคำขอที่ถูกส่งกลับแก้ไข' using errcode = 'P0001';
  end if;
  v_key := case v_req.type_key when 'samnak_establish' then 'temple_id' else 'place_id' end;
  if coalesce(p_data ->> v_key, '') <> coalesce(v_req.payload ->> v_key, '') then
    raise exception '%', case v_req.type_key
      when 'samnak_establish' then 'เปลี่ยนวัดที่ตั้งไม่ได้ ถ้าต้องการเปลี่ยนให้ยกเลิกคำขอแล้วยื่นใหม่'
      else 'เปลี่ยนสำนักที่ขอยุบไม่ได้ ถ้าต้องการเปลี่ยนให้ยกเลิกคำขอแล้วยื่นใหม่' end
      using errcode = 'P0001';
  end if;
  select * into v from private.build_place_request(v_req.type_key, coalesce(p_data, '{}'::jsonb), v_req.id);
  perform set_config('app.place_request', '1', true);
  perform public.resubmit_request(v_req.id, v.o_title, v.o_payload);
  perform set_config('app.place_request', '', true);
end;
$$;

revoke execute on function public.submit_place_request(text, jsonb) from public, anon;
revoke execute on function public.resubmit_place_request(uuid, jsonb) from public, anon;
grant execute on function public.submit_place_request(text, jsonb) to authenticated;
grant execute on function public.resubmit_place_request(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------
-- เอกสารตามรายการของคำขอ: รายการที่ใช้งานอยู่ของชนิดคำขอนั้น (และรายการที่ปิดแล้วแต่มีไฟล์แนบไว้) พร้อมจำนวนไฟล์
-- ทำงานในนามผู้ใช้ จึงเห็นเฉพาะคำขอและไฟล์ที่ RLS อนุญาต
-- ---------------------------------------------------------------
create function public.request_documents(p_request_id uuid)
returns table (doc_type_id uuid, name text, is_required boolean, is_active boolean, sort_order integer, file_count integer)
language sql
stable
set search_path = public
as $$
  select d.id, d.name, d.is_required and d.is_active, d.is_active, d.sort_order, coalesce(f.n, 0)::integer
  from public.requests r
  join public.request_document_types d on d.type_key = r.type_key
  left join lateral (
    select count(*) as n from public.attachments a
    where a.entity_table = 'requests' and a.entity_id = r.id::text and a.doc_type_id = d.id and a.is_active
  ) f on true
  where r.id = p_request_id and (d.is_active or coalesce(f.n, 0) > 0)
  order by d.sort_order, d.name;
$$;
revoke execute on function public.request_documents(uuid) from public, anon;
grant execute on function public.request_documents(uuid) to authenticated;

-- เอกสารบังคับยังไม่ครบ ผู้พิจารณาเห็นชอบไม่ได้ (ให้ส่งกลับแก้ไข)
create function public.request_steps_require_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_missing text;
begin
  select r.type_key into v_type from public.requests r where r.id = new.request_id;
  if not public.is_place_request_type(v_type) then
    return new;
  end if;
  select string_agg(d.name, ', ' order by d.sort_order, d.name) into v_missing
  from public.request_document_types d
  where d.type_key = v_type and d.is_active and d.is_required
    and not exists (
      select 1 from public.attachments a
      where a.entity_table = 'requests' and a.entity_id = new.request_id::text
        and a.doc_type_id = d.id and a.is_active
    );
  if v_missing is not null then
    raise exception 'เอกสารแนบยังไม่ครบ: % (ให้ส่งกลับให้ผู้ยื่นแนบเอกสารก่อน)', v_missing using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.request_steps_require_documents() from public, anon, authenticated;
create trigger request_steps_require_documents before update of status on public.request_steps
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.request_steps_require_documents();

-- ---------------------------------------------------------------
-- เมื่ออนุมัติขั้นสุดท้าย
--   ขอจัดตั้ง: เพิ่มสำนักใน places สถานะ เปิดดำเนินการ (รหัสเริ่มต้น = เลขที่คำขอ ที่ตั้งและเขตคณะสงฆ์ตามวัดที่ตั้ง)
--   ขอยุบ: เปลี่ยนสถานะเป็น ยุบ แล้วแจ้งเตือนผู้เกี่ยวข้องกับบุคลากรและสนามสอบที่ผูกอยู่
-- ---------------------------------------------------------------
create function public.apply_place_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_temple public.places%rowtype;
  v_place public.places%rowtype;
  v_label text;
  v_id uuid;
  v_body text;
  v_year integer;
  r record;
begin
  perform set_config('app.place_request', '1', true);

  if new.type_key = 'samnak_establish' then
    select * into v_temple from public.places where id = (new.payload ->> 'temple_id')::uuid for update;
    if not found or not v_temple.is_active or v_temple.status <> 'open' then
      raise exception 'วัดที่ตั้งไม่ได้อยู่ในสถานะ เปิดดำเนินการ แล้ว จึงอนุมัติไม่ได้' using errcode = 'P0001';
    end if;
    insert into public.places (
      place_type, code, name, sect, house_no, road, subdistrict_code, district_code, province_code, postal_code,
      org_unit_id, latitude, longitude, responsible_person_id, status, established_on, parent_place_id, note
    ) values (
      new.payload ->> 'place_type', new.request_no, new.payload ->> 'name', v_temple.sect,
      v_temple.house_no, v_temple.road, v_temple.subdistrict_code, v_temple.district_code, v_temple.province_code,
      v_temple.postal_code, v_temple.org_unit_id, v_temple.latitude, v_temple.longitude,
      (new.payload ->> 'head_person_id')::uuid, 'open', (now() at time zone 'Asia/Bangkok')::date, v_temple.id,
      'จัดตั้งตามคำขอเลขที่ ' || new.request_no
    )
    returning id into v_id;
    update public.requests
       set payload = payload || jsonb_build_object('place_id', v_id, 'place_code', new.request_no)
     where id = new.id;

  elsif new.type_key = 'samnak_dissolve' then
    select * into v_place from public.places where id = (new.payload ->> 'place_id')::uuid for update;
    if not found then
      raise exception 'ไม่พบสำนักของคำขอนี้ในทะเบียนสถานที่' using errcode = 'P0001';
    end if;
    v_label := private.samnak_type_label(v_place.place_type);
    v_body := v_label || ' ' || v_place.name || ' ถูกยุบตามคำขอเลขที่ ' || new.request_no;
    if v_place.status <> 'dissolved' then
      update public.places set status = 'dissolved' where id = v_place.id;
    end if;

    -- เจ้าคณะ รองเจ้าคณะ เลขานุการ ของเขตที่สำนักสังกัดและหน่วยเหนือ 1 ชั้น
    perform private.notify_unit_roles(
      array[v_place.org_unit_id, (select u.parent_id from public.org_units u where u.id = v_place.org_unit_id)],
      'ยุบ' || v_label || ': ' || v_place.name, v_body, '/app/places/' || v_place.id
    );

    -- บุคลากรที่ผูกอยู่และมีบัญชีผู้ใช้: ผู้รับผิดชอบ (เจ้าสำนัก) และ จศป. ที่ระบุสำนักนี้
    insert into public.notifications (user_id, title, body, link)
    select distinct pe.user_id, 'สำนักที่ท่านเกี่ยวข้องถูกยุบ: ' || v_place.name, v_body, '/app/me'
    from public.persons pe
    join public.profiles pf on pf.id = pe.user_id and pf.status = 'active'
    where pe.is_active
      and (
        pe.id = v_place.responsible_person_id
        or exists (
          select 1 from public.education_staff e
          where e.person_id = pe.id and e.is_active and e.status <> 'ended'
            and e.org_unit_id = v_place.org_unit_id and e.school_name = v_place.name
        )
      );

    -- สนามสอบที่ตั้งอยู่ที่สำนักนี้และยังเปิดอยู่: แจ้งเจ้าหน้าที่ส่วนกลาง เขตที่สนามสอบสังกัด และประธาน/ผู้รับข้อสอบที่มีบัญชี
    select coalesce((select y.year_be from public.academic_years y where y.is_current), 0) into v_year;
    for r in
      select v.id, v.name, v.org_unit_id
      from public.exam_venues v
      where v.place_id = v_place.id and v.is_active and v.status = 'open'
    loop
      insert into public.notifications (user_id, title, body, link)
      select distinct x.user_id,
             'สนามสอบตั้งอยู่ที่สำนักที่ถูกยุบ: ' || r.name,
             v_body || ' กรุณาตรวจสอบสถานะของสนามสอบนี้',
             x.link
      from (
        select ur.user_id, '/app/places/venues/' || r.id as link
        from public.user_roles ur
        where ur.role_key = 'central_staff'
          and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
        union
        select ur.user_id, '/app/places/venues/' || r.id
        from public.user_roles ur
        where ur.org_unit_id = r.org_unit_id and ur.role_key in ('chief', 'deputy_chief', 'secretary')
          and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
        union
        select pe.user_id, '/app/me'
        from public.venue_officers o
        join public.academic_years y on y.id = o.academic_year_id and y.year_be >= v_year
        join public.persons pe on pe.id = o.person_id and pe.user_id is not null
        where o.venue_id = r.id and o.is_active
      ) x
      join public.profiles pf on pf.id = x.user_id and pf.status = 'active';
    end loop;
  end if;

  perform set_config('app.place_request', '', true);
  return new;
end;
$$;
revoke execute on function public.apply_place_request() from public, anon, authenticated;

create trigger requests_apply_place_request
  after update of status on public.requests
  for each row
  when (
    public.is_place_request_type(new.type_key)
    and new.status is distinct from old.status
    and new.status = 'approved'
  )
  execute function public.apply_place_request();

-- ---------------------------------------------------------------
-- รายการคำขอของหน้า /app/requests (ทำงานในนามผู้ใช้ อยู่ใต้ RLS)
--   p_tab: mine คำขอของฉัน / pending รอท่านพิจารณา / area ทั้งหมดในเขต (ทุกคำขอที่ท่านมองเห็น)
--   due_at = เวลาที่ขั้นปัจจุบันเริ่มรอ + จำนวนวันที่ตั้งไว้ (นับวันตามปฏิทิน รวมวันหยุด)
--   overdue_days = จำนวนวันที่เกินกำหนด นับตามวันที่ของประเทศไทย อย่างน้อย 1 (0 = ยังไม่เกิน)
-- ---------------------------------------------------------------
create function public.list_place_requests(
  p_tab text default 'area',
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
  subject_name text, place_type text, temple_name text, org_unit_name text, requester_is_me boolean,
  submitted_at timestamptz, decided_at timestamptz,
  current_step integer, step_count integer, current_unit_name text,
  pending_since timestamptz, due_at timestamptz, overdue_days integer, can_decide boolean, total_count bigint
)
language sql
stable
set search_path = public
as $$
  with cfg as (
    select coalesce((select s.value_int from public.app_settings s where s.key = 'place_request_step_days'), 15) as days
  ),
  base as (
    select r.id, r.request_no, r.type_key, t.name as type_name, r.title, r.status,
           r.payload ->> 'name' as subject_name, r.payload ->> 'place_type' as place_type,
           r.payload ->> 'temple_name' as temple_name, u.name as org_unit_name,
           r.requester_id = auth.uid() as requester_is_me,
           r.submitted_at, r.decided_at, r.current_step,
           (select count(*)::integer from public.request_steps s where s.request_id = r.id) as step_count,
           su.name as current_unit_name,
           case when r.status = 'pending' then cs.pending_since end as pending_since,
           case when r.status = 'pending' then cs.pending_since + make_interval(days => cfg.days) end as due_at,
           coalesce(r.status = 'pending' and public.can_decide_step(cs.id), false) as can_decide
    from public.requests r
    cross join cfg
    join public.request_types t on t.key = r.type_key
    join public.org_units u on u.id = r.org_unit_id
    left join public.request_steps cs on cs.request_id = r.id and cs.step_no = r.current_step
    left join public.org_units su on su.id = cs.org_unit_id
    where public.is_place_request_type(r.type_key)
      and (p_type is null or r.type_key = p_type)
      and (p_status is null or r.status = p_status)
      and (coalesce(p_q, '') = '' or r.request_no ilike '%' || p_q || '%' or r.title ilike '%' || p_q || '%'
           or r.payload ->> 'temple_name' ilike '%' || p_q || '%')
  ),
  scoped as (
    select b.*,
           case when b.due_at is not null and b.due_at < now()
                then greatest(1, (now() at time zone 'Asia/Bangkok')::date - (b.due_at at time zone 'Asia/Bangkok')::date)
                else 0 end as overdue_days
    from base b
    where case p_tab
            when 'mine' then b.requester_is_me
            when 'pending' then b.can_decide
            else true
          end
  )
  select s.id, s.request_no, s.type_key, s.type_name, s.title, s.status,
         s.subject_name, s.place_type, s.temple_name, s.org_unit_name, s.requester_is_me,
         s.submitted_at, s.decided_at, s.current_step, s.step_count, s.current_unit_name,
         s.pending_since, s.due_at, s.overdue_days, s.can_decide, count(*) over () as total_count
  from scoped s
  order by
    case when p_sort = 'submitted' and p_dir = 'asc' then s.submitted_at end asc,
    case when p_sort = 'submitted' and p_dir = 'desc' then s.submitted_at end desc,
    case when p_sort = 'no' and p_dir = 'asc' then s.request_no end asc,
    case when p_sort = 'no' and p_dir = 'desc' then s.request_no end desc,
    case when p_sort = 'status' and p_dir = 'asc' then s.status end asc,
    case when p_sort = 'status' and p_dir = 'desc' then s.status end desc,
    case when p_sort = 'due' and p_dir = 'asc' then s.due_at end asc nulls last,
    case when p_sort = 'due' and p_dir = 'desc' then s.due_at end desc nulls last,
    s.submitted_at desc, s.id
  limit greatest(1, least(coalesce(p_limit, 10), 10000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- จำนวนบนแท็บ: คำขอของฉัน / รอท่านพิจารณา / ทั้งหมดในเขต และจำนวนที่รอท่านพิจารณาซึ่งเกินกำหนดแล้ว
create function public.place_request_counts()
returns table (mine bigint, pending bigint, area bigint, pending_overdue bigint)
language sql
stable
set search_path = public
as $$
  select count(*) filter (where l.requester_is_me),
         count(*) filter (where l.can_decide),
         count(*),
         count(*) filter (where l.can_decide and l.overdue_days > 0)
  from public.list_place_requests('area', null, null, '', 'submitted', 'desc', 10000, 0) l;
$$;

revoke execute on function public.list_place_requests(text, text, text, text, text, text, integer, integer) from public, anon;
revoke execute on function public.place_request_counts() from public, anon;
grant execute on function public.list_place_requests(text, text, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.place_request_counts() to authenticated;

-- ---------------------------------------------------------------
-- แจ้งเตือนผู้พิจารณาของขั้นที่เกินกำหนด (ไม่เกินวันละ 1 ครั้งต่อขั้น) คืนจำนวนขั้นที่แจ้ง
-- เรียกเมื่อมีผู้เปิดแดชบอร์ดหรือหน้า คำขอ (ไม่ต้องมีตัวตั้งเวลา) เรียกซ้ำได้ไม่มีผลข้างเคียง
-- ---------------------------------------------------------------
create function public.remind_overdue_place_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := coalesce((select s.value_int from public.app_settings s where s.key = 'place_request_step_days'), 15);
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
       and public.is_place_request_type(q.type_key)
       and q.status = 'pending' and s.status = 'pending' and s.step_no = q.current_step
       and s.pending_since + make_interval(days => v_days) < now()
       and (s.overdue_notified_at is null or s.overdue_notified_at < now() - interval '1 day')
    returning s.id, s.org_unit_id, s.level, s.pending_since, q.id as request_id, q.request_no, q.title,
              q.type_key, q.requester_id
  loop
    v_count := v_count + 1;
    insert into public.notifications (user_id, title, body, link)
    select distinct ur.user_id,
           'คำขอเกินกำหนดพิจารณา ' || v_days || ' วัน',
           r.request_no || ' ' || r.title || ' (เกินกำหนดมาแล้ว '
             || greatest(1, (now() at time zone 'Asia/Bangkok')::date
                              - ((r.pending_since + make_interval(days => v_days)) at time zone 'Asia/Bangkok')::date)
             || ' วัน)',
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
  return v_count;
end;
$$;
revoke execute on function public.remind_overdue_place_requests() from public, anon;
grant execute on function public.remind_overdue_place_requests() to authenticated;
