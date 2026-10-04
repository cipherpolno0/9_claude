-- บทที่ 7 (2/3): ปรับฟังก์ชันเดิมให้รองรับสถานะชุดใหม่

-- save_person: สถานะชุดใหม่ และสถานะของบุคคลที่มีอยู่แล้วเปลี่ยนผ่านคำขอหรือการแจ้งเท่านั้น
create or replace function public.save_person(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.persons%rowtype;
  v_unit public.org_units%rowtype;
  v_unit_id uuid := nullif(p_data ->> 'org_unit_id', '')::uuid;
  v_type text := coalesce(p_data ->> 'person_type', '');
  v_first text := btrim(coalesce(p_data ->> 'first_name', ''));
  v_birth date := nullif(p_data ->> 'birth_date', '')::date;
  v_ordained date := nullif(p_data ->> 'ordination_date', '')::date;
  v_monastic text := btrim(coalesce(p_data ->> 'monastic_name', ''));
  v_last text := btrim(coalesce(p_data ->> 'last_name', ''));
  v_nid text := nullif(regexp_replace(coalesce(p_data ->> 'national_id', ''), '[^0-9A-Za-z]', '', 'g'), '');
  v_clear boolean := coalesce((p_data ->> 'clear_national_id')::boolean, false);
  v_status text := coalesce(nullif(p_data ->> 'status', ''), 'active');
  v_enc bytea;
  v_last4 text;
  v_hash text;
  v_key text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'กรุณาเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;

  if p_id is not null then
    select * into v_old from public.persons where id = p_id for update;
    if not found then
      raise exception 'ไม่พบบุคคลนี้ในทะเบียน' using errcode = '23503';
    end if;
    if not public.can_edit_personnel(v_old.org_unit_id) then
      raise exception 'ท่านไม่มีสิทธิ์แก้ไขบุคคลนี้ (แก้ไขได้เฉพาะเลขานุการของเขตนั้นหรือหน่วยเหนือ)' using errcode = '42501';
    end if;
    -- สถานะของบุคคลที่มีอยู่แล้วเปลี่ยนผ่านคำขอหรือการแจ้งเท่านั้น (ผู้ดูแลระบบแก้ไขเพื่อปรับข้อมูลได้)
    if not public.has_role('admin') or nullif(p_data ->> 'status', '') is null then
      v_status := v_old.status;
    end if;
  end if;

  if v_type not in ('monastic', 'lay') then
    raise exception 'กรุณาเลือกประเภทบุคคล (บรรพชิต หรือ คฤหัสถ์)' using errcode = '23514';
  end if;
  if v_first = '' then
    raise exception 'กรุณากรอกชื่อ' using errcode = '23514';
  end if;
  if v_unit_id is null then
    raise exception 'กรุณาเลือกเขตปกครองที่วัดตั้งอยู่' using errcode = '23514';
  end if;

  select * into v_unit from public.org_units where id = v_unit_id;
  if not found or v_unit.level = 'central' then
    raise exception 'กรุณาเลือกเขตปกครองระดับภาค จังหวัด อำเภอ หรือตำบล' using errcode = '23514';
  end if;
  if not v_unit.is_active and (p_id is null or v_old.org_unit_id <> v_unit_id) then
    raise exception 'เขตปกครองที่เลือกถูกปิดใช้งานอยู่' using errcode = '23514';
  end if;
  if not public.can_edit_personnel(v_unit_id) then
    raise exception 'ท่านไม่มีสิทธิ์บันทึกบุคคลในเขตปกครองนี้ (บันทึกได้เฉพาะเลขานุการของเขตนั้นหรือหน่วยเหนือ)' using errcode = '42501';
  end if;

  if v_birth is not null and v_birth > current_date then
    raise exception 'วันเกิดต้องไม่เป็นวันในอนาคต' using errcode = '23514';
  end if;
  if v_type = 'lay' then
    v_ordained := null;
    v_monastic := '';
  end if;
  if v_ordained is not null and v_ordained > current_date then
    raise exception 'วันอุปสมบทต้องไม่เป็นวันในอนาคต' using errcode = '23514';
  end if;
  if v_ordained is not null and v_birth is not null and v_ordained <= v_birth then
    raise exception 'วันอุปสมบทต้องอยู่หลังวันเกิด' using errcode = '23514';
  end if;
  if coalesce(p_data ->> 'nak_tham', '') not in ('', 'tri', 'tho', 'ek') then
    raise exception 'ค่า น.ธ. ไม่ถูกต้อง' using errcode = '23514';
  end if;
  if coalesce(p_data ->> 'pali_grade', '') not in ('', 'p12', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9') then
    raise exception 'ค่า ป.ธ. ไม่ถูกต้อง' using errcode = '23514';
  end if;
  if v_status = 'moved_out' then
    v_status := 'transferred';
  end if;
  if v_status not in ('active', 'transfer_pending', 'transferred', 'resigned', 'deceased', 'disrobed', 'removed_other')
     or (p_id is null and v_status = 'transfer_pending') then
    raise exception 'สถานะไม่ถูกต้อง' using errcode = '23514';
  end if;

  -- เลขประจำตัวประชาชน
  if v_nid is not null then
    if not public.valid_national_id(v_nid) then
      raise exception 'เลขประจำตัวประชาชนไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลัก และหลักสุดท้ายต้องตรงตามสูตรตรวจสอบ)' using errcode = '23514';
    end if;
    if private.person_duplicate(v_nid, null, null, null, null, p_id) then
      raise exception 'เลขประจำตัวประชาชนนี้มีอยู่ในทะเบียนแล้ว' using errcode = '23514';
    end if;
    v_key := private.national_id_key();
    if v_key is null then
      raise exception 'ไม่พบกุญแจเข้ารหัสในระบบ กรุณาแจ้งผู้ดูแลระบบ' using errcode = 'P0001';
    end if;
    v_enc := extensions.pgp_sym_encrypt(v_nid, v_key);
    v_last4 := right(v_nid, 4);
    v_hash := encode(extensions.hmac(convert_to(v_nid, 'utf8'), convert_to(v_key, 'utf8'), 'sha256'), 'hex');
  elsif p_id is not null and not v_clear then
    v_enc := v_old.national_id_enc;
    v_last4 := v_old.national_id_last4;
    v_hash := v_old.national_id_hash;
  end if;

  if p_id is null then
    insert into public.persons (
      person_type, title, first_name, monastic_name, last_name, birth_date,
      national_id_enc, national_id_last4, national_id_hash, ordination_date,
      nak_tham, pali_grade, general_education, temple_name, org_unit_id, phone, status, note, created_by
    ) values (
      v_type, btrim(coalesce(p_data ->> 'title', '')), v_first, v_monastic, v_last, v_birth,
      v_enc, v_last4, v_hash, v_ordained,
      coalesce(p_data ->> 'nak_tham', ''), coalesce(p_data ->> 'pali_grade', ''),
      btrim(coalesce(p_data ->> 'general_education', '')), btrim(coalesce(p_data ->> 'temple_name', '')),
      v_unit_id, btrim(coalesce(p_data ->> 'phone', '')), v_status, btrim(coalesce(p_data ->> 'note', '')), auth.uid()
    )
    returning id into v_id;
  else
    update public.persons set
      person_type = v_type,
      title = btrim(coalesce(p_data ->> 'title', '')),
      first_name = v_first,
      monastic_name = v_monastic,
      last_name = v_last,
      birth_date = v_birth,
      national_id_enc = v_enc,
      national_id_last4 = v_last4,
      national_id_hash = v_hash,
      ordination_date = v_ordained,
      nak_tham = coalesce(p_data ->> 'nak_tham', ''),
      pali_grade = coalesce(p_data ->> 'pali_grade', ''),
      general_education = btrim(coalesce(p_data ->> 'general_education', '')),
      temple_name = btrim(coalesce(p_data ->> 'temple_name', '')),
      org_unit_id = v_unit_id,
      phone = btrim(coalesce(p_data ->> 'phone', '')),
      status = v_status,
      note = btrim(coalesce(p_data ->> 'note', ''))
    where id = p_id;
    v_id := p_id;
  end if;

  return v_id;
end;
$$;

-- education_staff: วันที่พ้นหน้าที่เป็นวันในอนาคตได้ (กรณีคำขอลาออกหรือย้ายที่มีผลล่วงหน้า)
create or replace function public.education_staff_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.education_position_types%rowtype;
  v_unit public.org_units%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.person_id <> old.person_id or new.track <> old.track then
      raise exception 'เปลี่ยนบุคคลหรือแท่งของรายการที่บันทึกแล้วไม่ได้ ให้ยกเลิกรายการนี้แล้วเพิ่มรายการใหม่' using errcode = '23514';
    end if;
    if not old.is_active and new.is_active then
      raise exception 'รายการที่ยกเลิกแล้วนำกลับมาใช้ไม่ได้ กรุณาเพิ่มรายการใหม่' using errcode = '23514';
    end if;
  end if;
  if not new.is_active then
    return new;
  end if;

  select * into v_type from public.education_position_types where id = new.position_type_id;
  if v_type.track <> new.track then
    raise exception 'ประเภทตำแหน่งที่เลือกไม่ได้อยู่ในแท่งนี้' using errcode = '23514';
  end if;
  if not v_type.is_active and (tg_op = 'INSERT' or new.position_type_id <> old.position_type_id) then
    raise exception 'ประเภทตำแหน่งนี้ถูกปิดใช้งานอยู่' using errcode = '23514';
  end if;

  select * into v_unit from public.org_units where id = new.org_unit_id;
  if v_unit.level = 'central' then
    raise exception 'เขตที่รับผิดชอบต้องเป็นระดับภาค จังหวัด อำเภอ หรือตำบล' using errcode = '23514';
  end if;
  if not v_unit.is_active and (tg_op = 'INSERT' or new.org_unit_id <> old.org_unit_id) then
    raise exception 'เขตปกครองนี้ถูกปิดใช้งานอยู่' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and not exists (select 1 from public.persons p where p.id = new.person_id and p.is_active) then
    raise exception 'บุคคลนี้ถูกปิดใช้งานอยู่ในทะเบียน' using errcode = '23514';
  end if;
  if new.started_on is not null and new.started_on > current_date + 366 then
    raise exception 'วันที่เริ่มอยู่ไกลเกินไปในอนาคต กรุณาตรวจปี พ.ศ.' using errcode = '23514';
  end if;
  if new.ended_on is not null and new.ended_on > current_date + 366 then
    raise exception 'วันที่พ้นหน้าที่อยู่ไกลเกินไปในอนาคต กรุณาตรวจปี พ.ศ.' using errcode = '23514';
  end if;
  return new;
end;
$$;
