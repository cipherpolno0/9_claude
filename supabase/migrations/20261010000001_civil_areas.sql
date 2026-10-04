-- บทที่ 9 (1/3): เขตการปกครองบ้านเมือง (จังหวัด อำเภอ ตำบล รหัสไปรษณีย์) สำหรับตัวเลือกที่อยู่
-- เป็นข้อมูลอ้างอิงสาธารณะ ทุกคนอ่านได้ ผู้ดูแลระบบนำเข้าจาก Excel ที่หน้า /app/admin/civil-areas
-- รหัสใช้ตามรหัสของกรมการปกครอง: จังหวัด 2 หลัก อำเภอ 4 หลัก ตำบล 6 หลัก (หลักหน้าของรหัสคือรหัสของหน่วยเหนือ)

create table public.civil_provinces (
  code        integer primary key check (code between 10 and 99),
  name        text not null unique check (length(btrim(name)) > 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.civil_provinces is 'จังหวัด (เขตการปกครองบ้านเมือง) code = รหัส 2 หลัก';

create table public.civil_districts (
  code           integer primary key check (code between 1000 and 9999),
  province_code  integer not null references public.civil_provinces (code),
  name           text not null check (length(btrim(name)) > 0),
  prefix         text not null default 'อำเภอ' check (prefix in ('อำเภอ', 'เขต')),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (province_code, name),
  constraint civil_districts_code_in_province check (code / 100 = province_code)
);
comment on table public.civil_districts is 'อำเภอและเขต code = รหัส 4 หลัก (2 หลักแรก = รหัสจังหวัด)';

create table public.civil_subdistricts (
  code           integer primary key check (code between 100000 and 999999),
  district_code  integer not null references public.civil_districts (code),
  name           text not null check (length(btrim(name)) > 0),
  prefix         text not null default 'ตำบล' check (prefix in ('ตำบล', 'แขวง')),
  postal_code    text not null check (postal_code ~ '^[0-9]{5}$'),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (district_code, name),
  constraint civil_subdistricts_code_in_district check (code / 100 = district_code)
);
comment on table public.civil_subdistricts is 'ตำบลและแขวง พร้อมรหัสไปรษณีย์ code = รหัส 6 หลัก (4 หลักแรก = รหัสอำเภอ)';
create index civil_districts_province_idx on public.civil_districts (province_code);
create index civil_subdistricts_district_idx on public.civil_subdistricts (district_code);

create trigger civil_provinces_set_updated_at before update on public.civil_provinces
  for each row execute function public.set_updated_at();
create trigger civil_districts_set_updated_at before update on public.civil_districts
  for each row execute function public.set_updated_at();
create trigger civil_subdistricts_set_updated_at before update on public.civil_subdistricts
  for each row execute function public.set_updated_at();

-- ประวัติการแก้ไข: audit_row_change() ใช้คอลัมน์ id หรือ key เป็นรหัสแถว ตารางชุดนี้ใช้ code จึงมีฟังก์ชันของตนเอง
create function public.audit_civil_area_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return new;
  end if;
  insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(v_new ->> 'code', v_old ->> 'code'), v_old, v_new);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function public.audit_civil_area_change() from public, anon, authenticated;

create trigger civil_provinces_audit after insert or update or delete on public.civil_provinces
  for each row execute function public.audit_civil_area_change();
create trigger civil_districts_audit after insert or update or delete on public.civil_districts
  for each row execute function public.audit_civil_area_change();
create trigger civil_subdistricts_audit after insert or update or delete on public.civil_subdistricts
  for each row execute function public.audit_civil_area_change();

-- RLS: อ่านได้ทุกคน เขียนผ่านฟังก์ชัน import_civil_areas เท่านั้น
alter table public.civil_provinces enable row level security;
alter table public.civil_districts enable row level security;
alter table public.civil_subdistricts enable row level security;
create policy civil_provinces_read_all on public.civil_provinces for select to anon, authenticated using (true);
create policy civil_districts_read_all on public.civil_districts for select to anon, authenticated using (true);
create policy civil_subdistricts_read_all on public.civil_subdistricts for select to anon, authenticated using (true);
revoke all on public.civil_provinces, public.civil_districts, public.civil_subdistricts from anon, authenticated;
grant select on public.civil_provinces, public.civil_districts, public.civil_subdistricts to anon, authenticated;

-- ---------------------------------------------------------------
-- นำเข้าเขตการปกครองบ้านเมืองจาก Excel (หนึ่งแถว = หนึ่งตำบล) เฉพาะผู้ดูแลระบบ
-- แถวที่มีรหัสอยู่แล้วจะถูกปรับชื่อและรหัสไปรษณีย์ให้ตรงกับไฟล์ แถวใหม่จะถูกเพิ่ม ไม่มีการลบ
-- คืนจำนวนตำบลที่เพิ่มหรือปรับ
-- ---------------------------------------------------------------
create function public.import_civil_areas(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.has_role('admin') then
    raise exception 'เฉพาะผู้ดูแลระบบจึงนำเข้าเขตการปกครองได้' using errcode = '42501';
  end if;
  if jsonb_array_length(p_rows) > 8000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 8,000 แถว' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as i(province_code integer, district_code integer, subdistrict_code integer)
    where i.subdistrict_code / 100 is distinct from i.district_code
       or i.district_code / 100 is distinct from i.province_code
  ) then
    raise exception 'รหัสไม่สัมพันธ์กัน: 2 หลักแรกของรหัสอำเภอต้องเป็นรหัสจังหวัด และ 4 หลักแรกของรหัสตำบลต้องเป็นรหัสอำเภอ'
      using errcode = '23514';
  end if;

  insert into public.civil_provinces (code, name)
  select distinct on (i.province_code) i.province_code, btrim(i.province_name)
  from jsonb_to_recordset(p_rows) as i(province_code integer, province_name text)
  order by i.province_code
  on conflict (code) do update set name = excluded.name
    where public.civil_provinces.name is distinct from excluded.name;

  insert into public.civil_districts (code, province_code, name, prefix)
  select distinct on (i.district_code) i.district_code, i.province_code, btrim(i.district_name), btrim(i.district_prefix)
  from jsonb_to_recordset(p_rows) as i(province_code integer, district_code integer, district_name text, district_prefix text)
  order by i.district_code
  on conflict (code) do update set name = excluded.name, prefix = excluded.prefix
    where (public.civil_districts.name, public.civil_districts.prefix) is distinct from (excluded.name, excluded.prefix);

  insert into public.civil_subdistricts (code, district_code, name, prefix, postal_code)
  select distinct on (i.subdistrict_code)
         i.subdistrict_code, i.district_code, btrim(i.subdistrict_name), btrim(i.subdistrict_prefix), btrim(i.postal_code)
  from jsonb_to_recordset(p_rows) as i(
    district_code integer, subdistrict_code integer, subdistrict_name text, subdistrict_prefix text, postal_code text
  )
  order by i.subdistrict_code
  on conflict (code) do update
    set name = excluded.name, prefix = excluded.prefix, postal_code = excluded.postal_code
    where (public.civil_subdistricts.name, public.civil_subdistricts.prefix, public.civil_subdistricts.postal_code)
          is distinct from (excluded.name, excluded.prefix, excluded.postal_code);
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;
revoke execute on function public.import_civil_areas(jsonb) from public, anon;
grant execute on function public.import_civil_areas(jsonb) to authenticated;

-- สรุปจำนวนสำหรับหน้าผู้ดูแลระบบ
create function public.civil_area_counts()
returns table (provinces bigint, districts bigint, subdistricts bigint)
language sql
stable
set search_path = public
as $$
  select (select count(*) from public.civil_provinces),
         (select count(*) from public.civil_districts),
         (select count(*) from public.civil_subdistricts);
$$;

-- ---------------------------------------------------------------
-- ตัวช่วยของผู้ดูแลฐานข้อมูล: เติมชุดข้อมูลตั้งต้นจากข้อความแบบย่อ (ไฟล์ supabase/seed_civil_areas.sql)
-- หนึ่งบรรทัด = หนึ่งรายการ
--   P<รหัสจังหวัด 2 หลัก><ชื่อจังหวัด>
--   D<รหัสอำเภอ 4 หลัก><ชื่ออำเภอ>            (กรุงเทพมหานคร = เขต / จังหวัดอื่น = อำเภอ)
--   <2 หลักท้ายของรหัสตำบล><ชื่อตำบล>[รหัสไปรษณีย์ 5 หลัก]   (ไม่ใส่รหัสไปรษณีย์ = เท่ากับบรรทัดก่อนหน้า)
-- เรียกผ่าน API ไม่ได้ (อยู่ใน schema private) รายการที่มีอยู่แล้วจะถูกปรับให้ตรงกับข้อความ
-- ---------------------------------------------------------------
create function private.load_civil_areas(p_text text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line text;
  v_m text[];
  v_province integer;
  v_district integer;
  v_zip text;
  v_count integer := 0;
begin
  for v_line in select btrim(l) from regexp_split_to_table(p_text, E'\n') as l loop
    continue when v_line = '';
    if v_line ~ '^P[0-9]{2}' then
      v_province := substr(v_line, 2, 2)::integer;
      insert into public.civil_provinces (code, name) values (v_province, substr(v_line, 4))
      on conflict (code) do update set name = excluded.name;
    elsif v_line ~ '^D[0-9]{4}' then
      v_district := substr(v_line, 2, 4)::integer;
      v_zip := null;
      insert into public.civil_districts (code, province_code, name, prefix)
      values (v_district, v_district / 100, substr(v_line, 6), case when v_district / 100 = 10 then 'เขต' else 'อำเภอ' end)
      on conflict (code) do update set name = excluded.name, prefix = excluded.prefix;
    else
      v_m := regexp_match(v_line, '^([0-9]{2})([^0-9]+)([0-9]{5})?$');
      if v_m is null or v_district is null then
        raise exception 'บรรทัดไม่ถูกรูปแบบ: %', v_line using errcode = '23514';
      end if;
      v_zip := coalesce(v_m[3], v_zip);
      insert into public.civil_subdistricts (code, district_code, name, prefix, postal_code)
      values (v_district * 100 + v_m[1]::integer, v_district, v_m[2],
              case when v_district / 100 = 10 then 'แขวง' else 'ตำบล' end, v_zip)
      on conflict (code) do update
        set name = excluded.name, prefix = excluded.prefix, postal_code = excluded.postal_code;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function private.load_civil_areas(text) from public, anon, authenticated;
