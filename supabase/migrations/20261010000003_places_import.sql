-- บทที่ 9 (3/3): นำเข้าสถานที่จาก Excel ทีละประเภท
-- ขั้นที่ 1 check_places_import: ตรวจทุกแถวและบอกเหตุผลของแถวที่ผิด (ยังไม่บันทึก)
-- ขั้นที่ 2 import_places: ตรวจซ้ำแล้วบันทึกทั้งชุด ถ้ามีแถวผิดแม้แถวเดียวจะไม่บันทึกเลย
-- แถวที่รหัส ชื่อ และประเภทตรงกับรายการในทะเบียนอยู่แล้ว = ข้าม (นำเข้าไฟล์เดิมซ้ำได้โดยไม่เกิดรายการซ้ำ)

create function private.resolve_place_rows(p_type text, p_rows jsonb)
returns table (
  row_number integer, code text, name text, sect public.sect, house_no text, road text,
  subdistrict_code integer, district_code integer, province_code integer, postal_code text, org_unit_id uuid,
  latitude numeric, longitude numeric, office_phone text, email text, status text, established_on date,
  parent_place_id uuid, skip boolean, error text
)
language sql
stable
security definer
set search_path = public
as $$
  with x as (
    select *
    from jsonb_to_recordset(p_rows) as x(
      row_number integer, code text, name text, sect text, house_no text, road text,
      subdistrict text, district text, province text, postal_code text, org_unit_code text,
      latitude numeric, longitude numeric, office_phone text, email text, status text,
      established_on date, parent_code text
    )
  ),
  n as (
    select x.row_number,
           btrim(coalesce(x.code, '')) as code,
           btrim(regexp_replace(coalesce(x.name, ''), '\s+', ' ', 'g')) as name,
           nullif(btrim(coalesce(x.sect, '')), '') as sect_text,
           btrim(coalesce(x.house_no, '')) as house_no, btrim(coalesce(x.road, '')) as road,
           btrim(coalesce(x.subdistrict, '')) as subdistrict, btrim(coalesce(x.district, '')) as district,
           btrim(coalesce(x.province, '')) as province, btrim(coalesce(x.postal_code, '')) as postal_code,
           btrim(coalesce(x.org_unit_code, '')) as org_unit_code,
           x.latitude, x.longitude,
           btrim(coalesce(x.office_phone, '')) as office_phone, btrim(coalesce(x.email, '')) as email,
           coalesce(nullif(btrim(coalesce(x.status, '')), ''), 'open') as status,
           x.established_on, btrim(coalesce(x.parent_code, '')) as parent_code
    from x
  ),
  r as (
    select n.*, pv.code as pv_code, d.code as d_code, s.code as s_code, s.postal_code as s_postal,
           u.id as unit_id, u.sect as unit_sect, u.is_active as unit_active,
           par.id as par_id, par.place_type as par_type, par.sect as par_sect,
           ex.name as ex_name, ex.place_type as ex_type
    from n
    left join public.civil_provinces pv on n.province in (pv.name, 'จังหวัด' || pv.name, 'จ.' || pv.name)
    left join public.civil_districts d
      on d.province_code = pv.code and n.district in (d.name, d.prefix || d.name, 'อ.' || d.name)
    left join public.civil_subdistricts s
      on s.district_code = d.code and n.subdistrict in (s.name, s.prefix || s.name, 'ต.' || s.name)
    left join public.org_units u on u.code = n.org_unit_code
    left join public.places par on par.code = n.parent_code and n.parent_code <> ''
    left join public.places ex on ex.code = n.code
  ),
  e as (
    select r.*,
           coalesce(r.sect_text::public.sect, case when p_type in ('samnak_rian', 'samnak_sasanasuksa') then r.par_sect end)
             as eff_sect,
           (r.ex_name is not null and r.ex_name = r.name and r.ex_type = p_type) as is_skip,
           min(r.row_number) over (partition by r.code) as first_code_row,
           min(r.row_number) over (partition by r.d_code, r.name) as first_name_row
    from r
  )
  select e.row_number, e.code, e.name, e.eff_sect, e.house_no, e.road,
         e.s_code, e.d_code, e.pv_code,
         case when e.postal_code <> '' then e.postal_code else coalesce(e.s_postal, '') end,
         e.unit_id, e.latitude, e.longitude, e.office_phone, e.email, e.status, e.established_on, e.par_id,
         e.is_skip,
         case
           when e.is_skip then null
           when e.code = '' then 'ไม่ได้กรอกรหัส'
           when e.name = '' then 'ไม่ได้กรอกชื่อ'
           when e.ex_name is not null then 'รหัส ' || e.code || ' มีในทะเบียนแล้ว (ชื่อ ' || e.ex_name || ')'
           when e.first_code_row <> e.row_number then 'รหัสซ้ำกับแถวที่ ' || e.first_code_row
           when e.province = '' or e.district = '' then 'ต้องกรอกจังหวัดและอำเภอ'
           when e.pv_code is null then 'ไม่พบจังหวัด "' || e.province || '"'
           when e.d_code is null then 'ไม่พบอำเภอ "' || e.district || '" ในจังหวัด' || e.province
           when e.subdistrict <> '' and e.s_code is null then 'ไม่พบตำบล "' || e.subdistrict || '" ในอำเภอนี้'
           when e.postal_code <> '' and e.postal_code !~ '^[0-9]{5}$' then 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก'
           when e.org_unit_code = '' then 'ไม่ได้กรอกรหัสเขตปกครองคณะสงฆ์'
           when e.unit_id is null or not e.unit_active then 'ไม่พบเขตปกครองคณะสงฆ์รหัส "' || e.org_unit_code || '"'
           when not public.can_edit_places(e.unit_id) then 'ท่านไม่มีสิทธิ์บันทึกสถานที่ในเขตปกครองนี้'
           when p_type in ('samnak_rian', 'samnak_sasanasuksa') and e.parent_code = '' then 'ต้องกรอกรหัสวัดที่ตั้ง'
           when p_type in ('samnak_rian', 'samnak_sasanasuksa') and e.par_id is null
             then 'ไม่พบวัดรหัส "' || e.parent_code || '" ในทะเบียน'
           when p_type in ('samnak_rian', 'samnak_sasanasuksa') and e.par_type <> 'temple'
             then 'รหัส "' || e.parent_code || '" ไม่ใช่รายการประเภทวัด'
           when p_type in ('temple', 'samnak_rian', 'samnak_sasanasuksa') and e.eff_sect is null then 'ต้องระบุนิกาย'
           when p_type in ('samnak_rian', 'samnak_sasanasuksa') and e.eff_sect is distinct from e.par_sect
             then 'นิกายไม่ตรงกับนิกายของวัดที่ตั้ง'
           when e.eff_sect is not null and e.unit_sect is not null and e.eff_sect <> e.unit_sect
             then 'นิกายไม่ตรงกับนิกายของเขตปกครองคณะสงฆ์'
           when e.status not in ('open', 'dissolved', 'suspended') then 'สถานะไม่ถูกต้อง'
           when (e.latitude is null) <> (e.longitude is null) then 'พิกัดต้องกรอกทั้งละติจูดและลองจิจูด'
           when e.latitude not between -90 and 90 or e.longitude not between -180 and 180 then 'พิกัดอยู่นอกช่วงที่เป็นไปได้'
           when exists (
             select 1 from public.places p
             where p.is_active and p.place_type = p_type and p.district_code = e.d_code and p.name = e.name
           ) then 'มีชื่อนี้ในอำเภอเดียวกันอยู่แล้วในทะเบียน'
           when e.first_name_row <> e.row_number then 'ชื่อซ้ำกับแถวที่ ' || e.first_name_row || ' ในอำเภอเดียวกัน'
         end
  from e
  order by e.row_number;
$$;
revoke execute on function private.resolve_place_rows(text, jsonb) from public, anon, authenticated;

create function public.check_places_import(p_type text, p_rows jsonb)
returns table (row_number integer, status text, message text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_edit_any_places() then
    raise exception 'ท่านไม่มีสิทธิ์นำเข้าทะเบียนสถานที่' using errcode = '42501';
  end if;
  if p_type not in ('temple', 'samnak_rian', 'samnak_sasanasuksa', 'school', 'organization') then
    raise exception 'ประเภทสถานที่ไม่ถูกต้อง' using errcode = '23514';
  end if;
  return query
    select r.row_number,
           case when r.skip then 'skip' when r.error is not null then 'error' else 'new' end,
           case when r.skip then 'มีในทะเบียนแล้ว' else coalesce(r.error, '') end
    from private.resolve_place_rows(p_type, p_rows) r;
end;
$$;

create function public.import_places(p_type text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad record;
  v_count integer;
begin
  if not public.can_edit_any_places() then
    raise exception 'ท่านไม่มีสิทธิ์นำเข้าทะเบียนสถานที่' using errcode = '42501';
  end if;
  if p_type not in ('temple', 'samnak_rian', 'samnak_sasanasuksa', 'school', 'organization') then
    raise exception 'ประเภทสถานที่ไม่ถูกต้อง' using errcode = '23514';
  end if;
  if jsonb_array_length(p_rows) > 3000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 3,000 แถว' using errcode = '23514';
  end if;

  select r.row_number, r.error into v_bad
  from private.resolve_place_rows(p_type, p_rows) r
  where r.error is not null
  order by r.row_number
  limit 1;
  if found then
    raise exception 'แถวที่ %: %', v_bad.row_number, v_bad.error using errcode = '23514';
  end if;

  insert into public.places (
    place_type, code, name, sect, house_no, road, subdistrict_code, district_code, province_code, postal_code,
    org_unit_id, latitude, longitude, office_phone, email, status, established_on, parent_place_id, created_by
  )
  select p_type, r.code, r.name, r.sect, r.house_no, r.road, r.subdistrict_code, r.district_code, r.province_code,
         r.postal_code, r.org_unit_id, r.latitude, r.longitude, r.office_phone, r.email, r.status, r.established_on,
         r.parent_place_id, auth.uid()
  from private.resolve_place_rows(p_type, p_rows) r
  where not r.skip
  order by r.row_number;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.check_places_import(text, jsonb) from public, anon;
revoke execute on function public.import_places(text, jsonb) from public, anon;
grant execute on function public.check_places_import(text, jsonb) to authenticated;
grant execute on function public.import_places(text, jsonb) to authenticated;
