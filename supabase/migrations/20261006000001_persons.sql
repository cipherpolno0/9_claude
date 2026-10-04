-- บทที่ 5 (1/3): ทะเบียนบุคคล (persons)
-- เลขประจำตัวประชาชนเก็บแบบเข้ารหัส กุญแจอยู่ใน Supabase Vault ไม่อยู่ในไฟล์นี้และไม่อยู่ในโค้ดของเว็บ

create extension if not exists pgcrypto with schema extensions;

-- schema ภายใน: ไม่เปิดให้เรียกผ่าน API
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- กุญแจเข้ารหัส: สุ่มขึ้นครั้งแรกครั้งเดียวแล้วเก็บใน Vault (ไม่มีใครเห็นค่า รวมถึงผู้เขียนไฟล์นี้)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'national_id_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'national_id_key',
      'กุญแจเข้ารหัสเลขประจำตัวประชาชนในตาราง persons ห้ามลบหรือเปลี่ยน มิฉะนั้นจะอ่านเลขเดิมไม่ได้'
    );
  end if;
end;
$$;

create function private.national_id_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'national_id_key' limit 1;
$$;
revoke all on function private.national_id_key() from public, anon, authenticated;

-- ตรวจเลขประจำตัวประชาชน 13 หลัก (รวมหลักตรวจสอบตัวสุดท้าย)
create function public.valid_national_id(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null or p_value !~ '^[0-9]{13}$' then false
    else (11 - (
      select sum(substr(p_value, i, 1)::integer * (14 - i)) from generate_series(1, 12) as i
    ) % 11) % 10 = substr(p_value, 13, 1)::integer
  end;
$$;

-- ไม่เก็บค่าที่เข้ารหัสลงในประวัติการแก้ไข (เก็บเฉพาะ 4 ตัวท้ายและรหัสเทียบซ้ำ)
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id text;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old) - 'national_id_enc'; end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new) - 'national_id_enc'; end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key', '');

  if tg_op = 'UPDATE'
     and (v_old - 'updated_at' - 'last_seen_at') = (v_new - 'updated_at' - 'last_seen_at') then
    return new;
  end if;

  insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_old, v_new);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function public.audit_row_change() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- สิทธิ์ของทะเบียนบุคคล
-- ดูได้: ผู้ดูแลระบบ เจ้าหน้าที่ส่วนกลาง และ เจ้าคณะ รองเจ้าคณะ เลขานุการ ของเขตนั้นหรือหน่วยเหนือ
-- เพิ่มและแก้ไขได้: เลขานุการของเขตนั้นหรือหน่วยเหนือ และผู้ดูแลระบบ
-- ---------------------------------------------------------------
create function public.can_view_personnel(p_org_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org_unit_id is not null and (
    exists (
      select 1 from public.my_role_rows() m
      where m.effective and m.role_key in ('admin', 'central_staff')
    )
    or exists (
      select 1
      from public.my_role_rows() m
      join public.ancestors_or_self(p_org_unit_id) a on a.id = m.org_unit_id
      where m.effective and m.role_key in ('chief', 'deputy_chief', 'secretary')
    )
  );
$$;
comment on function public.can_view_personnel(uuid) is 'ดูทะเบียนบุคคลของเขตนี้ได้หรือไม่';

create function public.can_edit_personnel(p_org_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org_unit_id is not null and (
    exists (select 1 from public.my_role_rows() m where m.effective and m.role_key = 'admin')
    or exists (
      select 1
      from public.my_role_rows() m
      join public.ancestors_or_self(p_org_unit_id) a on a.id = m.org_unit_id
      where m.effective and m.role_key = 'secretary'
    )
  );
$$;
comment on function public.can_edit_personnel(uuid) is 'เพิ่มและแก้ไขทะเบียนบุคคลของเขตนี้ได้หรือไม่ (เลขานุการ ผู้ดูแลระบบ)';

-- ---------------------------------------------------------------
-- persons: บุคคล (บรรพชิต / คฤหัสถ์)
-- ---------------------------------------------------------------
create table public.persons (
  id                 uuid primary key default gen_random_uuid(),
  person_type        text not null check (person_type in ('monastic', 'lay')),      -- บรรพชิต / คฤหัสถ์
  title              text not null default '',                                      -- คำนำหน้าหรือสมณศักดิ์
  first_name         text not null check (length(btrim(first_name)) > 0),
  monastic_name      text not null default '',                                      -- ฉายา
  last_name          text not null default '',
  birth_date         date,
  national_id_enc    bytea,                                                         -- เลขประจำตัวประชาชน (เข้ารหัส)
  national_id_last4  text check (national_id_last4 ~ '^[0-9]{4}$'),                 -- 4 ตัวท้าย (สำหรับแสดงผล)
  national_id_hash   text unique,                                                   -- รหัสเทียบซ้ำ (ย้อนกลับเป็นเลขไม่ได้)
  ordination_date    date,                                                          -- วันอุปสมบท
  nak_tham           text not null default '' check (nak_tham in ('', 'tri', 'tho', 'ek')),
  pali_grade         text not null default ''
                       check (pali_grade in ('', 'p12', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9')),
  general_education  text not null default '',                                      -- วุฒิสามัญ
  temple_name        text not null default '',                                      -- วัดที่สังกัด
  org_unit_id        uuid not null references public.org_units (id),                -- เขตปกครองที่วัดตั้งอยู่
  phone              text not null default '',                                      -- เบอร์ติดต่อ (ไม่แสดงในหน้าสาธารณะ)
  status             text not null default 'active'
                       check (status in ('active', 'disrobed', 'deceased', 'moved_out')),
  note               text not null default '',
  is_active          boolean not null default true,                                 -- ปิดใช้งานแทนการลบ
  created_by         uuid default auth.uid() references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint persons_national_id_shape check (
    (national_id_enc is null and national_id_last4 is null and national_id_hash is null)
    or (national_id_enc is not null and national_id_last4 is not null and national_id_hash is not null)
  ),
  constraint persons_dates check (
    birth_date is null or ordination_date is null or ordination_date > birth_date
  )
);
comment on table public.persons is 'ทะเบียนบุคคล: บรรพชิตและคฤหัสถ์ สถานะ: active ปกติ / disrobed ลาสิกขา / deceased มรณภาพ / moved_out ย้ายออกนอกเขต';
create index persons_org_unit_idx on public.persons (org_unit_id);
create index persons_name_idx on public.persons (first_name, last_name);

create trigger persons_set_updated_at before update on public.persons
  for each row execute function public.set_updated_at();
create trigger persons_audit after insert or update or delete on public.persons
  for each row execute function public.audit_row_change();

-- ตรวจว่ามีบุคคลนี้ในทะเบียนแล้วหรือไม่ (เทียบเลขประจำตัวประชาชน ถ้าไม่มีเลขให้เทียบชื่อและวันเกิด)
create function private.person_duplicate(
  p_national_id text, p_first_name text, p_monastic_name text, p_last_name text, p_birth_date date, p_except uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_national_id is not null then exists (
      select 1 from public.persons p
      where p.id is distinct from p_except
        and p.national_id_hash = encode(
          extensions.hmac(convert_to(p_national_id, 'utf8'), convert_to(private.national_id_key(), 'utf8'), 'sha256'),
          'hex')
    )
    else exists (
      select 1 from public.persons p
      where p.id is distinct from p_except
        and p.is_active
        and p.first_name = btrim(p_first_name)
        and p.monastic_name = btrim(coalesce(p_monastic_name, ''))
        and p.last_name = btrim(coalesce(p_last_name, ''))
        and p.birth_date is not distinct from p_birth_date
        and p_birth_date is not null
    )
  end;
$$;
revoke all on function private.person_duplicate(text, text, text, text, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- save_person: เพิ่ม (p_id ว่าง) หรือแก้ไขบุคคล เป็นทางเดียวที่เขียนตาราง persons ได้
-- p_data: person_type, title, first_name, monastic_name, last_name, birth_date, national_id,
--         clear_national_id, ordination_date, nak_tham, pali_grade, general_education,
--         temple_name, org_unit_id, phone, status, note
-- เลขประจำตัวประชาชน: ไม่ส่งมา = คงค่าเดิม / ส่งมา = เข้ารหัสแล้วแทนค่าเดิม / clear_national_id = ลบออก
-- ---------------------------------------------------------------
create function public.save_person(p_id uuid, p_data jsonb)
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
  if v_status not in ('active', 'disrobed', 'deceased', 'moved_out') then
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
comment on function public.save_person(uuid, jsonb) is 'เพิ่มหรือแก้ไขบุคคล ตรวจสิทธิ์และเข้ารหัสเลขประจำตัวประชาชนภายใน';

-- ปิดหรือเปิดใช้งานบุคคล (ไม่ลบข้อมูลจริง)
create function public.set_person_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit uuid;
begin
  select org_unit_id into v_unit from public.persons where id = p_id for update;
  if not found then
    raise exception 'ไม่พบบุคคลนี้ในทะเบียน' using errcode = '23503';
  end if;
  if not public.can_edit_personnel(v_unit) then
    raise exception 'ท่านไม่มีสิทธิ์ทำรายการนี้' using errcode = '42501';
  end if;
  update public.persons set is_active = p_active where id = p_id;
end;
$$;

-- ---------------------------------------------------------------
-- RLS: อ่านตามเขตปกครอง เขียนผ่านฟังก์ชันเท่านั้น
-- คอลัมน์ที่เข้ารหัสและรหัสเทียบซ้ำ ไม่เปิดให้อ่านผ่าน API
-- (policy การอ่านอยู่ในไฟล์ 2/3 เพราะต้องอ้างถึงตาราง appointments)
-- ---------------------------------------------------------------
alter table public.persons enable row level security;
revoke all on public.persons from anon, authenticated;
grant select (
  id, person_type, title, first_name, monastic_name, last_name, birth_date, national_id_last4,
  ordination_date, nak_tham, pali_grade, general_education, temple_name, org_unit_id, phone,
  status, note, is_active, created_at, updated_at
) on public.persons to authenticated;

revoke execute on function public.valid_national_id(text) from public, anon;
revoke execute on function public.can_view_personnel(uuid) from public, anon;
revoke execute on function public.can_edit_personnel(uuid) from public, anon;
revoke execute on function public.save_person(uuid, jsonb) from public, anon;
revoke execute on function public.set_person_active(uuid, boolean) from public, anon;
grant execute on function public.valid_national_id(text) to authenticated;
grant execute on function public.can_view_personnel(uuid) to authenticated;
grant execute on function public.can_edit_personnel(uuid) to authenticated;
grant execute on function public.save_person(uuid, jsonb) to authenticated;
grant execute on function public.set_person_active(uuid, boolean) to authenticated;
