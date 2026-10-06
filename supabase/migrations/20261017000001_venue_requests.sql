-- บทที่ 16 (1/2): คำขอเปิด ปิด ย้ายสนามสอบ (ระบบที่ 4) บนเครื่องอนุมัติกลางและโครงของคำขอจัดตั้ง-ยุบสำนัก (บทที่ 15)
--   ชนิดคำขอ 3 ชนิด, วันปิดรับคำขอต่อปีการศึกษา, ประวัติการเปิด ปิด ย้ายของสนามสอบ, ผลหลังอนุมัติขั้นสุดท้าย, แจ้งผู้ยื่นเมื่อระบบปรับทะเบียนแล้ว

-- ---------------------------------------------------------------
-- 1) ชนิดคำขอ: เส้นทางและผู้พิจารณาเหมือนคำขอจัดตั้งสำนัก (ผู้สั่งงานกำหนด)
--    เขตคณะสงฆ์ของสนามสอบ ขึ้นไป ตำบล > อำเภอ > จังหวัด > ภาค > ส่วนกลาง
-- ---------------------------------------------------------------
insert into public.request_types
  (key, code, name, route_levels, start_at_own_unit, decider_roles, central_roles, max_steps, is_personnel)
values
  ('venue_open', 'VOPEN', 'ขอเปิดสนามสอบ',
   '{subdistrict,district,province,region,central}', true, '{chief,deputy_chief}', '{central_staff}', null, false),
  ('venue_close', 'VCLOSE', 'ขอปิดสนามสอบ',
   '{subdistrict,district,province,region,central}', true, '{chief,deputy_chief}', '{central_staff}', null, false),
  ('venue_move', 'VMOVE', 'ขอย้ายสนามสอบ',
   '{subdistrict,district,province,region,central}', true, '{chief,deputy_chief}', '{central_staff}', null, false);

-- คำขอของระบบที่ 4 ทั้ง 5 ชนิด (หน้า /app/requests, รายการเอกสาร, กำหนดเวลาพิจารณา, ด่านกันการแก้ข้อมูล ใช้ชุดเดียวกัน)
create or replace function public.is_place_request_type(p_type_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type_key in ('samnak_establish', 'samnak_dissolve', 'venue_open', 'venue_close', 'venue_move');
$$;

create function public.is_venue_request_type(p_type_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type_key in ('venue_open', 'venue_close', 'venue_move');
$$;
revoke execute on function public.is_venue_request_type(text) from public, anon;
grant execute on function public.is_venue_request_type(text) to authenticated;

-- ---------------------------------------------------------------
-- 2) วันปิดรับคำขอสนามสอบของแต่ละปีการศึกษา (ว่าง = ไม่กำหนด) ผู้ดูแลระบบตั้งที่หน้า บทบาทและค่าตั้ง
-- ---------------------------------------------------------------
alter table public.academic_years add column request_deadline date;
comment on column public.academic_years.request_deadline is 'วันสุดท้ายที่รับคำขอเปิด ปิด ย้ายสนามสอบของปีการศึกษานี้ (ว่าง = ไม่กำหนด)';

-- ---------------------------------------------------------------
-- 3) exam_venue_changes: ประวัติการเปิด ปิด ย้ายของสนามสอบ (ระบบบันทึกเมื่อคำขอได้รับอนุมัติขั้นสุดท้าย)
--    change_type: open เปิด / close ปิด / move ย้ายสถานที่ตั้ง
-- ---------------------------------------------------------------
create table public.exam_venue_changes (
  id                    uuid primary key default gen_random_uuid(),
  venue_id              uuid not null references public.exam_venues (id),
  change_type           text not null check (change_type in ('open', 'close', 'move')),
  request_id            uuid references public.requests (id),            -- คำขอที่เกี่ยวข้อง
  from_place_id         uuid references public.places (id),              -- สถานที่ตั้งเดิม
  from_place_name       text not null default '',
  to_place_id           uuid references public.places (id),              -- สถานที่ตั้งใหม่ (เปิด ย้าย)
  to_place_name         text not null default '',
  replacement_venue_id  uuid references public.exam_venues (id),         -- ปิด: สนามสอบที่รับผู้เข้าสอบแทน
  effective_year_be     integer check (effective_year_be between 2400 and 2700),  -- ปีการศึกษาที่เริ่ม / ที่มีผล
  reason                text not null default '',
  created_by            uuid default auth.uid() references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.exam_venue_changes is 'ประวัติการเปิด ปิด ย้ายสถานที่ตั้งของสนามสอบ บันทึกโดยระบบเมื่อคำขอได้รับอนุมัติขั้นสุดท้าย';
create index exam_venue_changes_venue_idx on public.exam_venue_changes (venue_id, created_at desc);

create trigger exam_venue_changes_set_updated_at before update on public.exam_venue_changes
  for each row execute function public.set_updated_at();
create trigger exam_venue_changes_audit after insert or update or delete on public.exam_venue_changes
  for each row execute function public.audit_row_change();

alter table public.exam_venue_changes enable row level security;
revoke all on public.exam_venue_changes from anon;
revoke insert, update, delete, truncate on public.exam_venue_changes from authenticated;
create policy exam_venue_changes_read on public.exam_venue_changes for select to authenticated
  using (exists (select 1 from public.exam_venues v where v.id = venue_id and public.can_view_venues(v.org_unit_id)));

-- ---------------------------------------------------------------
-- 4) ประธานสนามสอบและผู้รับข้อสอบที่ระบบเพิ่มให้เมื่อคำขอเปิดได้รับอนุมัติ:
--    สิทธิ์ดูบุคคลตรวจกับผู้ยื่นตอนยื่นคำขอแล้ว จึงไม่ตรวจซ้ำกับผู้อนุมัติขั้นสุดท้าย (app.place_request = 1)
-- ---------------------------------------------------------------
create or replace function public.venue_officers_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.delivery_address := btrim(new.delivery_address);
  new.contact_phone := btrim(new.contact_phone);
  if tg_op = 'UPDATE' and (new.venue_id <> old.venue_id or new.academic_year_id <> old.academic_year_id
                           or new.role <> old.role) then
    raise exception 'เปลี่ยนสนามสอบ ปีการศึกษา หรือบทบาทของรายการเดิมไม่ได้ ให้นำออกแล้วเพิ่มใหม่' using errcode = '23514';
  end if;
  if (tg_op = 'INSERT' or new.person_id is distinct from old.person_id)
     and not exists (select 1 from public.persons p where p.id = new.person_id and p.is_active) then
    raise exception 'ไม่พบบุคคลนี้ในทะเบียนบุคคล' using errcode = '23503';
  end if;
  -- เลือกได้เฉพาะบุคคลที่ผู้บันทึกมีสิทธิ์ดูในทะเบียนบุคคล (แถวที่คัดลอกจากปีก่อนใช้บุคคลเดิม จึงไม่ตรวจซ้ำ)
  if auth.uid() is not null
     and coalesce(current_setting('app.place_request', true), '') <> '1'
     and (tg_op = 'INSERT' or new.person_id is distinct from old.person_id)
     and not (tg_op = 'INSERT' and exists (
       select 1 from public.venue_officers s where s.id = new.copied_from_id and s.person_id = new.person_id))
     and not public.can_view_person(new.person_id) then
    raise exception 'ท่านไม่มีสิทธิ์ดูบุคคลนี้ในทะเบียนบุคคล จึงเลือกเป็นประธานสนามสอบหรือผู้รับข้อสอบไม่ได้' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.exam_venues v where v.id = new.venue_id and v.is_active) then
    raise exception 'ไม่พบสนามสอบ หรือสนามสอบนี้ปิดใช้งานแล้ว' using errcode = '23503';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- 5) ตรวจข้อมูลคำขอสนามสอบ แล้วคืน หน่วยที่ยื่น เรื่อง และข้อมูลคำขอที่สะอาดแล้ว
--    ขอเปิด p_data: name, venue_type, place_id, levels [tri|tho|ek], capacity, chair_person_id, receiver_person_id,
--                   start_year_be, detail (หมายเหตุ ไม่บังคับ)
--    ขอปิด p_data: venue_id, replacement_venue_id, detail
--    ขอย้าย p_data: venue_id, to_place_id, effective_year_be, detail
--    วันปิดรับ: ตรวจเฉพาะตอนยื่นใหม่ (p_exclude ว่าง) กับปีการศึกษาที่ระบุ (ขอปิด = ปีการศึกษาปัจจุบัน)
-- ---------------------------------------------------------------
create function private.venue_type_label(p_venue_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_venue_type when 'nak_tham' then 'นักธรรม' when 'tham_sueksa' then 'ธรรมศึกษา' end;
$$;
revoke all on function private.venue_type_label(text) from public, anon, authenticated;

create function private.uuid_or_null(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return nullif(btrim(coalesce(p_value, '')), '')::uuid;
exception when others then
  return null;
end;
$$;
revoke all on function private.uuid_or_null(text) from public, anon, authenticated;

create function private.person_label(p public.persons)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(concat_ws(' ', nullif(p.title, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, '')));
$$;
revoke all on function private.person_label(public.persons) from public, anon, authenticated;

-- พ้นวันปิดรับคำขอของปีการศึกษานั้นแล้วหรือไม่ (นับวันที่ตามเวลาประเทศไทย)
create function private.check_request_deadline(p_year_be integer)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_deadline date;
begin
  select y.request_deadline into v_deadline from public.academic_years y where y.year_be = p_year_be;
  if v_deadline is not null and (now() at time zone 'Asia/Bangkok')::date > v_deadline then
    raise exception 'พ้นกำหนดรับคำขอสนามสอบของปีการศึกษา % แล้ว (ปิดรับเมื่อ %)', p_year_be,
      to_char(v_deadline, 'DD/MM/') || (extract(year from v_deadline)::integer + 543) using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.check_request_deadline(integer) from public, anon, authenticated;

create function private.build_venue_request(
  p_type text, p_data jsonb, p_exclude uuid,
  out o_unit uuid, out o_title text, out o_payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_data ->> 'name', ''), '\s+', ' ', 'g'));
  v_venue_type text := coalesce(p_data ->> 'venue_type', '');
  v_detail text := btrim(coalesce(p_data ->> 'detail', ''));
  v_place public.places%rowtype;
  v_to public.places%rowtype;
  v_venue public.exam_venues%rowtype;
  v_repl public.exam_venues%rowtype;
  v_chair public.persons%rowtype;
  v_receiver public.persons%rowtype;
  v_levels text[];
  v_capacity integer;
  v_year integer;
  v_unit_name text;
begin
  if p_type = 'venue_open' then
    if v_name = '' then
      raise exception 'กรุณากรอกชื่อสนามสอบ' using errcode = '23514';
    end if;
    if length(v_name) > 200 then
      raise exception 'ชื่อสนามสอบยาวเกินไป (ไม่เกิน 200 ตัวอักษร)' using errcode = '23514';
    end if;
    if v_venue_type not in ('nak_tham', 'tham_sueksa') then
      raise exception 'กรุณาเลือกประเภท นักธรรม หรือ ธรรมศึกษา' using errcode = '23514';
    end if;

    select * into v_place from public.places where id = private.uuid_or_null(p_data ->> 'place_id');
    if not found or not v_place.is_active then
      raise exception 'กรุณาเลือกสถานที่ตั้งจากทะเบียนสถานที่' using errcode = '23514';
    end if;
    if not public.can_edit_venues(v_place.org_unit_id) then
      raise exception 'ท่านยื่นคำขอได้เฉพาะสถานที่ในเขตที่ท่านมีสิทธิ์แก้ไขทะเบียนสนามสอบ' using errcode = '42501';
    end if;
    if v_place.status <> 'open' then
      raise exception 'สถานที่ตั้งไม่ได้อยู่ในสถานะ เปิดดำเนินการ' using errcode = '23514';
    end if;

    if jsonb_typeof(p_data -> 'levels') = 'array' then
      select array_agg(l order by n) into v_levels
      from unnest(array['tri', 'tho', 'ek']) with ordinality as o(l, n)
      where p_data -> 'levels' ? l;
    end if;
    if v_levels is null
       or exists (select 1 from jsonb_array_elements_text(p_data -> 'levels') x where x not in ('tri', 'tho', 'ek')) then
      raise exception 'กรุณาเลือกชั้นที่เปิดสอบอย่างน้อย 1 ชั้น (ตรี โท เอก)' using errcode = '23514';
    end if;

    v_capacity := private.count_or_null(p_data ->> 'capacity');
    if v_capacity is null or v_capacity < 1 then
      raise exception 'กรุณากรอกจำนวนผู้เข้าสอบโดยประมาณ เป็นตัวเลข 1 ถึง 100,000' using errcode = '23514';
    end if;

    select * into v_chair from public.persons where id = private.uuid_or_null(p_data ->> 'chair_person_id');
    if not found or not v_chair.is_active or not public.can_view_person(v_chair.id) then
      raise exception 'กรุณาเลือกประธานสนามสอบจากทะเบียนบุคคล' using errcode = '23514';
    end if;
    select * into v_receiver from public.persons where id = private.uuid_or_null(p_data ->> 'receiver_person_id');
    if not found or not v_receiver.is_active or not public.can_view_person(v_receiver.id) then
      raise exception 'กรุณาเลือกผู้รับข้อสอบจากทะเบียนบุคคล' using errcode = '23514';
    end if;
    if v_chair.status not in ('active', 'transfer_pending') or v_receiver.status not in ('active', 'transfer_pending') then
      raise exception 'ประธานสนามสอบและผู้รับข้อสอบต้องเป็นบุคคลที่มีสถานะ ปฏิบัติหน้าที่' using errcode = '23514';
    end if;

    v_year := private.count_or_null(p_data ->> 'start_year_be');
    if v_year is null or not exists (select 1 from public.academic_years y where y.year_be = v_year) then
      raise exception 'กรุณาเลือกปีการศึกษาที่เริ่ม จากปีการศึกษาที่มีในระบบ' using errcode = '23514';
    end if;
    if p_exclude is null then
      perform private.check_request_deadline(v_year);
    end if;

    if exists (
      select 1 from public.exam_venues v
      where v.is_active and v.status = 'open' and v.venue_type = v_venue_type and v.place_id = v_place.id
    ) then
      raise exception 'สถานที่นี้มีสนามสอบ%ที่เปิดอยู่แล้วในทะเบียนสนามสอบ', private.venue_type_label(v_venue_type)
        using errcode = '23514';
    end if;
    if exists (
      select 1 from public.requests r
      where r.type_key = 'venue_open' and r.status in ('pending', 'returned')
        and r.id is distinct from p_exclude
        and r.payload ->> 'place_id' = v_place.id::text
        and r.payload ->> 'venue_type' = v_venue_type
    ) then
      raise exception 'สถานที่นี้มีคำขอเปิดสนามสอบประเภทนี้ที่ยังไม่ได้ผลอยู่แล้ว' using errcode = 'P0001';
    end if;

    select name into v_unit_name from public.org_units where id = v_place.org_unit_id;
    o_unit := v_place.org_unit_id;
    o_title := 'ขอเปิดสนามสอบ' || private.venue_type_label(v_venue_type) || ': ' || v_name;
    o_payload := jsonb_build_object(
      'name', v_name, 'venue_type', v_venue_type,
      'place_id', v_place.id, 'place_name', v_place.name, 'place_code', v_place.code, 'unit_name', v_unit_name,
      'levels', to_jsonb(v_levels), 'capacity', v_capacity,
      'chair_person_id', v_chair.id, 'chair_name', private.person_label(v_chair),
      'receiver_person_id', v_receiver.id, 'receiver_name', private.person_label(v_receiver),
      'start_year_be', v_year, 'detail', v_detail
    );

  elsif p_type in ('venue_close', 'venue_move') then
    select * into v_venue from public.exam_venues where id = private.uuid_or_null(p_data ->> 'venue_id');
    if not found or not v_venue.is_active then
      raise exception 'กรุณาเลือกสนามสอบจากทะเบียนสนามสอบ' using errcode = '23514';
    end if;
    if not public.can_edit_venues(v_venue.org_unit_id) then
      raise exception 'ท่านยื่นคำขอได้เฉพาะสนามสอบในเขตที่ท่านมีสิทธิ์แก้ไขทะเบียนสนามสอบ' using errcode = '42501';
    end if;
    if v_venue.status <> 'open' then
      raise exception 'สนามสอบนี้ไม่ได้อยู่ในสถานะ เปิด' using errcode = '23514';
    end if;
    if v_detail = '' then
      raise exception 'กรุณาระบุเหตุผล' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.requests r
      where r.type_key in ('venue_close', 'venue_move') and r.status in ('pending', 'returned')
        and r.id is distinct from p_exclude
        and r.payload ->> 'venue_id' = v_venue.id::text
    ) then
      raise exception 'สนามสอบนี้มีคำขอปิดหรือขอย้ายที่ยังไม่ได้ผลอยู่แล้ว' using errcode = 'P0001';
    end if;

    select * into v_place from public.places where id = v_venue.place_id;
    select name into v_unit_name from public.org_units where id = v_venue.org_unit_id;
    o_unit := v_venue.org_unit_id;
    o_payload := jsonb_build_object(
      'venue_id', v_venue.id, 'name', v_venue.name, 'venue_code', v_venue.code, 'venue_type', v_venue.venue_type,
      'place_id', v_place.id, 'place_name', coalesce(v_place.name, ''), 'unit_name', v_unit_name, 'detail', v_detail
    );

    if p_type = 'venue_close' then
      select * into v_repl from public.exam_venues where id = private.uuid_or_null(p_data ->> 'replacement_venue_id');
      if not found or not v_repl.is_active or not public.can_view_venues(v_repl.org_unit_id) then
        raise exception 'กรุณาเลือกสนามสอบที่จะรับผู้เข้าสอบแทน จากทะเบียนสนามสอบ' using errcode = '23514';
      end if;
      if v_repl.id = v_venue.id then
        raise exception 'สนามสอบที่รับผู้เข้าสอบแทนต้องไม่ใช่สนามสอบที่ขอปิด' using errcode = '23514';
      end if;
      if v_repl.status <> 'open' or v_repl.venue_type <> v_venue.venue_type then
        raise exception 'สนามสอบที่รับผู้เข้าสอบแทนต้องเป็นสนามสอบประเภทเดียวกันที่เปิดอยู่' using errcode = '23514';
      end if;
      if p_exclude is null then
        select y.year_be into v_year from public.academic_years y where y.is_current;
        if v_year is not null then
          perform private.check_request_deadline(v_year);
        end if;
      end if;
      o_title := 'ขอปิดสนามสอบ' || private.venue_type_label(v_venue.venue_type) || ': ' || v_venue.name;
      o_payload := o_payload || jsonb_build_object(
        'replacement_venue_id', v_repl.id, 'replacement_name', v_repl.name, 'replacement_code', v_repl.code
      );
    else
      select * into v_to from public.places where id = private.uuid_or_null(p_data ->> 'to_place_id');
      if not found or not v_to.is_active then
        raise exception 'กรุณาเลือกสถานที่ตั้งใหม่จากทะเบียนสถานที่' using errcode = '23514';
      end if;
      if v_to.id = v_venue.place_id then
        raise exception 'สถานที่ตั้งใหม่ต้องไม่ใช่สถานที่ตั้งปัจจุบัน' using errcode = '23514';
      end if;
      if not public.can_edit_venues(v_to.org_unit_id) then
        raise exception 'สถานที่ตั้งใหม่ต้องอยู่ในเขตที่ท่านมีสิทธิ์แก้ไขทะเบียนสนามสอบ' using errcode = '42501';
      end if;
      if v_to.status <> 'open' then
        raise exception 'สถานที่ตั้งใหม่ไม่ได้อยู่ในสถานะ เปิดดำเนินการ' using errcode = '23514';
      end if;
      if exists (
        select 1 from public.exam_venues v
        where v.is_active and v.status = 'open' and v.venue_type = v_venue.venue_type
          and v.place_id = v_to.id and v.id <> v_venue.id
      ) then
        raise exception 'สถานที่ตั้งใหม่มีสนามสอบ%ที่เปิดอยู่แล้ว', private.venue_type_label(v_venue.venue_type)
          using errcode = '23514';
      end if;
      v_year := private.count_or_null(p_data ->> 'effective_year_be');
      if v_year is null or not exists (select 1 from public.academic_years y where y.year_be = v_year) then
        raise exception 'กรุณาเลือกปีการศึกษาที่มีผล จากปีการศึกษาที่มีในระบบ' using errcode = '23514';
      end if;
      if p_exclude is null then
        perform private.check_request_deadline(v_year);
      end if;
      o_title := 'ขอย้ายสนามสอบ' || private.venue_type_label(v_venue.venue_type) || ': ' || v_venue.name;
      o_payload := o_payload || jsonb_build_object(
        'to_place_id', v_to.id, 'to_place_name', v_to.name, 'to_place_code', v_to.code, 'effective_year_be', v_year
      );
    end if;
  else
    raise exception 'ไม่พบชนิดคำขอนี้' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.build_venue_request(text, jsonb, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 6) ยื่น และแก้ไขแล้วส่งใหม่: ใช้ฟังก์ชันเดิมของบทที่ 15 เพิ่มการแยกชนิดคำขอสนามสอบ
--    สิ่งที่เปลี่ยนไม่ได้เมื่อส่งใหม่: จัดตั้ง = วัดที่ตั้ง / ยุบ = สำนัก / เปิด = สถานที่ตั้ง / ปิดและย้าย = สนามสอบ
-- ---------------------------------------------------------------
create or replace function public.submit_place_request(p_type text, p_data jsonb)
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
  if public.is_venue_request_type(p_type) then
    select * into v from private.build_venue_request(p_type, coalesce(p_data, '{}'::jsonb), null);
  else
    select * into v from private.build_place_request(p_type, coalesce(p_data, '{}'::jsonb), null);
  end if;
  perform set_config('app.place_request', '1', true);
  v_id := private.create_request(p_type, v.o_unit, v.o_title, v.o_payload);
  perform set_config('app.place_request', '', true);
  return v_id;
end;
$$;

create or replace function public.resubmit_place_request(p_request_id uuid, p_data jsonb)
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
  v_key := case v_req.type_key
    when 'samnak_establish' then 'temple_id'
    when 'samnak_dissolve' then 'place_id'
    when 'venue_open' then 'place_id'
    else 'venue_id' end;
  if coalesce(p_data ->> v_key, '') <> coalesce(v_req.payload ->> v_key, '') then
    raise exception '%', case v_req.type_key
      when 'samnak_establish' then 'เปลี่ยนวัดที่ตั้งไม่ได้ ถ้าต้องการเปลี่ยนให้ยกเลิกคำขอแล้วยื่นใหม่'
      when 'samnak_dissolve' then 'เปลี่ยนสำนักที่ขอยุบไม่ได้ ถ้าต้องการเปลี่ยนให้ยกเลิกคำขอแล้วยื่นใหม่'
      when 'venue_open' then 'เปลี่ยนสถานที่ตั้งไม่ได้ ถ้าต้องการเปลี่ยนให้ยกเลิกคำขอแล้วยื่นใหม่'
      else 'เปลี่ยนสนามสอบของคำขอไม่ได้ ถ้าต้องการเปลี่ยนให้ยกเลิกคำขอแล้วยื่นใหม่' end
      using errcode = 'P0001';
  end if;
  if public.is_venue_request_type(v_req.type_key) then
    select * into v from private.build_venue_request(v_req.type_key, coalesce(p_data, '{}'::jsonb), v_req.id);
  else
    select * into v from private.build_place_request(v_req.type_key, coalesce(p_data, '{}'::jsonb), v_req.id);
  end if;
  perform set_config('app.place_request', '1', true);
  perform public.resubmit_request(v_req.id, v.o_title, v.o_payload);
  perform set_config('app.place_request', '', true);
end;
$$;

-- ---------------------------------------------------------------
-- 7) เมื่ออนุมัติขั้นสุดท้าย: ปรับ exam_venues และ venue_officers แล้วบันทึกประวัติใน exam_venue_changes
--    ขอเปิด: เพิ่มสนามสอบ (รหัสเริ่มต้น = เลขที่คำขอ เขตคณะสงฆ์ตามสถานที่ตั้ง) และประธาน/ผู้รับข้อสอบของปีการศึกษาที่เริ่ม
--    ขอปิด: สถานะ ปิด นำประธาน/ผู้รับข้อสอบของปีการศึกษาปัจจุบันเป็นต้นไปออก บันทึกสนามสอบที่รับผู้เข้าสอบแทน
--    ขอย้าย: เปลี่ยนสถานที่ตั้ง (และเขตคณะสงฆ์ตามสถานที่ใหม่) ทันที เก็บสถานที่ตั้งเดิมและปีการศึกษาที่มีผลไว้ในประวัติ
-- ---------------------------------------------------------------
create function public.apply_venue_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_place public.places%rowtype;
  v_old public.places%rowtype;
  v_venue public.exam_venues%rowtype;
  v_repl public.exam_venues%rowtype;
  v_year_id uuid;
  v_year integer;
  v_id uuid;
  v_label text;
begin
  perform set_config('app.place_request', '1', true);

  if new.type_key = 'venue_open' then
    select * into v_place from public.places where id = (new.payload ->> 'place_id')::uuid for update;
    if not found or not v_place.is_active or v_place.status <> 'open' then
      raise exception 'สถานที่ตั้งไม่ได้อยู่ในสถานะ เปิดดำเนินการ แล้ว จึงอนุมัติไม่ได้' using errcode = 'P0001';
    end if;
    v_year := (new.payload ->> 'start_year_be')::integer;
    select y.id into v_year_id from public.academic_years y where y.year_be = v_year;
    if v_year_id is null then
      raise exception 'ไม่พบปีการศึกษา % ในระบบ จึงอนุมัติไม่ได้', v_year using errcode = 'P0001';
    end if;
    insert into public.exam_venues (
      code, name, venue_type, place_id, org_unit_id, levels, capacity, status, start_year_be, note
    ) values (
      new.request_no, new.payload ->> 'name', new.payload ->> 'venue_type', v_place.id, v_place.org_unit_id,
      array(select jsonb_array_elements_text(new.payload -> 'levels')), (new.payload ->> 'capacity')::integer,
      'open', v_year, 'เปิดตามคำขอเลขที่ ' || new.request_no
    )
    returning id into v_id;
    insert into public.venue_officers (venue_id, academic_year_id, role, person_id, note)
    values
      (v_id, v_year_id, 'chair', (new.payload ->> 'chair_person_id')::uuid, 'ตามคำขอเลขที่ ' || new.request_no),
      (v_id, v_year_id, 'receiver', (new.payload ->> 'receiver_person_id')::uuid, 'ตามคำขอเลขที่ ' || new.request_no);
    insert into public.exam_venue_changes (venue_id, change_type, request_id, to_place_id, to_place_name, effective_year_be, reason)
    values (v_id, 'open', new.id, v_place.id, v_place.name, v_year, coalesce(new.payload ->> 'detail', ''));
    update public.requests
       set payload = payload || jsonb_build_object('venue_id', v_id, 'venue_code', new.request_no)
     where id = new.id;

  else
    select * into v_venue from public.exam_venues where id = (new.payload ->> 'venue_id')::uuid for update;
    if not found then
      raise exception 'ไม่พบสนามสอบของคำขอนี้ในทะเบียนสนามสอบ' using errcode = 'P0001';
    end if;
    v_label := 'สนามสอบ' || private.venue_type_label(v_venue.venue_type) || ' ' || v_venue.name;
    select * into v_old from public.places where id = v_venue.place_id;

    if new.type_key = 'venue_close' then
      select * into v_repl from public.exam_venues where id = (new.payload ->> 'replacement_venue_id')::uuid;
      if v_venue.status <> 'closed' then
        update public.exam_venues set status = 'closed' where id = v_venue.id;
      end if;
      select coalesce((select y.year_be from public.academic_years y where y.is_current), 0) into v_year;
      update public.venue_officers o
         set is_active = false
        from public.academic_years y
       where y.id = o.academic_year_id and y.year_be >= v_year and o.venue_id = v_venue.id and o.is_active;
      insert into public.exam_venue_changes (
        venue_id, change_type, request_id, from_place_id, from_place_name, replacement_venue_id, effective_year_be, reason
      ) values (
        v_venue.id, 'close', new.id, v_old.id, coalesce(v_old.name, ''), v_repl.id, nullif(v_year, 0),
        coalesce(new.payload ->> 'detail', '')
      );
      perform private.notify_unit_roles(
        array[v_venue.org_unit_id],
        'ปิดสนามสอบ: ' || v_venue.name,
        v_label || ' ถูกปิดตามคำขอเลขที่ ' || new.request_no || ' ผู้เข้าสอบไปสอบที่ ' || coalesce(v_repl.name, '-'),
        '/app/places/venues/' || v_venue.id
      );
      if v_repl.id is not null and v_repl.org_unit_id <> v_venue.org_unit_id then
        perform private.notify_unit_roles(
          array[v_repl.org_unit_id],
          'สนามสอบของท่านรับผู้เข้าสอบแทน: ' || v_repl.name,
          v_label || ' ถูกปิดตามคำขอเลขที่ ' || new.request_no || ' ผู้เข้าสอบจะมาสอบที่ ' || v_repl.name,
          '/app/places/venues/' || v_repl.id
        );
      end if;

    elsif new.type_key = 'venue_move' then
      select * into v_place from public.places where id = (new.payload ->> 'to_place_id')::uuid for update;
      if not found or not v_place.is_active or v_place.status <> 'open' then
        raise exception 'สถานที่ตั้งใหม่ไม่ได้อยู่ในสถานะ เปิดดำเนินการ แล้ว จึงอนุมัติไม่ได้' using errcode = 'P0001';
      end if;
      if v_venue.status <> 'open' then
        raise exception 'สนามสอบนี้ไม่ได้อยู่ในสถานะ เปิด แล้ว จึงอนุมัติไม่ได้' using errcode = 'P0001';
      end if;
      update public.exam_venues set place_id = v_place.id, org_unit_id = v_place.org_unit_id where id = v_venue.id;
      insert into public.exam_venue_changes (
        venue_id, change_type, request_id, from_place_id, from_place_name, to_place_id, to_place_name, effective_year_be, reason
      ) values (
        v_venue.id, 'move', new.id, v_old.id, coalesce(v_old.name, ''), v_place.id, v_place.name,
        (new.payload ->> 'effective_year_be')::integer, coalesce(new.payload ->> 'detail', '')
      );
      perform private.notify_unit_roles(
        array[v_venue.org_unit_id, v_place.org_unit_id],
        'ย้ายสนามสอบ: ' || v_venue.name,
        v_label || ' ย้ายจาก ' || coalesce(v_old.name, '-') || ' ไป ' || v_place.name || ' ตามคำขอเลขที่ ' || new.request_no
          || ' มีผลปีการศึกษา ' || (new.payload ->> 'effective_year_be'),
        '/app/places/venues/' || v_venue.id
      );
    end if;
  end if;

  perform set_config('app.place_request', '', true);
  return new;
end;
$$;
revoke execute on function public.apply_venue_request() from public, anon, authenticated;

create trigger requests_apply_venue_request
  after update of status on public.requests
  for each row
  when (
    public.is_venue_request_type(new.type_key)
    and new.status is distinct from old.status
    and new.status = 'approved'
  )
  execute function public.apply_venue_request();

-- ---------------------------------------------------------------
-- 8) แจ้งผู้ยื่นเมื่อระบบปรับทะเบียนตามคำขอแล้ว (ทำงานหลัง trigger requests_apply_... ตามลำดับชื่อ)
--    การแจ้งเมื่อผ่านแต่ละขั้น ส่งกลับ ไม่เห็นชอบ และอนุมัติ มีอยู่แล้วใน decide_request ของเครื่องอนุมัติกลาง
-- ---------------------------------------------------------------
create function public.notify_place_request_applied()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_link text;
begin
  select r.payload into v_payload from public.requests r where r.id = new.id;
  v_link := case
    when public.is_venue_request_type(new.type_key) and v_payload ? 'venue_id' then '/app/places/venues/' || (v_payload ->> 'venue_id')
    when v_payload ? 'place_id' then '/app/places/' || (v_payload ->> 'place_id')
    else '/app/approvals/' || new.id end;
  perform public.notify_user(
    new.requester_id, 'ระบบปรับทะเบียนตามคำขอ ' || new.request_no || ' แล้ว', new.title, v_link
  );
  return new;
end;
$$;
revoke execute on function public.notify_place_request_applied() from public, anon, authenticated;

create trigger requests_notify_place_applied
  after update of status on public.requests
  for each row
  when (
    public.is_place_request_type(new.type_key)
    and new.status is distinct from old.status
    and new.status = 'approved'
  )
  execute function public.notify_place_request_applied();

-- ---------------------------------------------------------------
-- 9) รายการคำขอของหน้า /app/requests: ใช้ได้กับคำขอสนามสอบด้วย
--    place_type = ประเภทสำนักหรือประเภทสนามสอบ  temple_name = วัดที่ตั้งหรือสถานที่ตั้ง
-- ---------------------------------------------------------------
create or replace function public.list_place_requests(
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
           r.payload ->> 'name' as subject_name,
           coalesce(r.payload ->> 'place_type', r.payload ->> 'venue_type') as place_type,
           coalesce(r.payload ->> 'temple_name', r.payload ->> 'place_name') as temple_name, u.name as org_unit_name,
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
           or coalesce(r.payload ->> 'temple_name', r.payload ->> 'place_name') ilike '%' || p_q || '%')
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

-- ---------------------------------------------------------------
-- 10) ข้อความของด่านกันข้อมูล (บทที่ 15) ให้ครอบคลุมคำขอสนามสอบ
-- ---------------------------------------------------------------
create or replace function public.requests_guard_place_request()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_place_request_type(new.type_key)
     and coalesce(current_setting('app.place_request', true), '') <> '1' then
    raise exception 'คำขอชนิดนี้ต้องยื่นและแก้ไขจากหน้า คำขอ เท่านั้น' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
