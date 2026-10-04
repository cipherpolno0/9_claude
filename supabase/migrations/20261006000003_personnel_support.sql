-- บทที่ 5 (3/3): รายชื่อบุคลากร ประวัติการแก้ไข ไฟล์แนบของทะเบียนบุคคล และการนำเข้าจาก Excel

-- ---------------------------------------------------------------
-- list_personnel: รายชื่อสำหรับตารางข้อมูลกลาง (ทำงานในนามผู้ใช้ อยู่ใต้ RLS)
-- กรองเขต = บุคคลที่วัดสังกัดอยู่ในเขตนั้นหรือเขตใต้สังกัด หรือดำรงตำแหน่งอยู่ในเขตนั้น
-- กรองตำแหน่ง = ตำแหน่งที่ดำรงอยู่ในวันนี้
-- p_status: active / disrobed / deceased / moved_out / inactive (รายการที่ปิดใช้งาน)
-- ---------------------------------------------------------------
create function public.list_personnel(
  p_q text default '',
  p_unit uuid default null,
  p_position text default null,
  p_status text default null,
  p_sort text default 'name',
  p_dir text default 'asc',
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid, person_type text, title text, first_name text, monastic_name text, last_name text,
  temple_name text, org_unit_id uuid, org_unit_name text, org_unit_code text,
  ordination_date date, status text, is_active boolean, positions text, total_count bigint
)
language sql
stable
set search_path = public
as $$
  with scope as (
    select p_unit as id where p_unit is not null
    union
    select d.id from public.descendants_of(p_unit) d where p_unit is not null
  ),
  cur as (
    select a.person_id, a.position_type_key, a.org_unit_id
    from public.appointments a
    where a.is_active and a.appointed_on <= current_date
      and (a.ended_on is null or a.ended_on > current_date)
  ),
  base as (
    select p.id, p.person_type, p.title, p.first_name, p.monastic_name, p.last_name,
           p.temple_name, p.org_unit_id, u.name as org_unit_name, u.code as org_unit_code,
           p.ordination_date, p.status, p.is_active,
           (
             select string_agg(t.name || ' · ' || cu.name, E'\n' order by t.sort_order, cu.code)
             from cur c
             join public.position_types t on t.key = c.position_type_key
             join public.org_units cu on cu.id = c.org_unit_id
             where c.person_id = p.id
           ) as positions
    from public.persons p
    join public.org_units u on u.id = p.org_unit_id
    where (case when p_status = 'inactive' then not p.is_active else p.is_active end)
      and (p_status is null or p_status = 'inactive' or p.status = p_status)
      and (
        coalesce(p_q, '') = ''
        or p.first_name ilike '%' || p_q || '%'
        or p.monastic_name ilike '%' || p_q || '%'
        or p.last_name ilike '%' || p_q || '%'
        or p.title ilike '%' || p_q || '%'
        or p.temple_name ilike '%' || p_q || '%'
      )
      and (
        p_position is null
        or exists (
          select 1 from cur c
          where c.person_id = p.id and c.position_type_key = p_position
            and (p_unit is null or c.org_unit_id in (select s.id from scope s))
        )
      )
      and (
        p_unit is null or p_position is not null
        or p.org_unit_id in (select s.id from scope s)
        or exists (select 1 from cur c where c.person_id = p.id and c.org_unit_id in (select s.id from scope s))
      )
  )
  select b.*, count(*) over () as total_count
  from base b
  order by
    case when p_sort = 'name' and p_dir = 'asc' then b.first_name end asc,
    case when p_sort = 'name' and p_dir = 'desc' then b.first_name end desc,
    case when p_sort = 'unit' and p_dir = 'asc' then b.org_unit_code end asc,
    case when p_sort = 'unit' and p_dir = 'desc' then b.org_unit_code end desc,
    case when p_sort = 'ordination' and p_dir = 'asc' then b.ordination_date end asc nulls last,
    case when p_sort = 'ordination' and p_dir = 'desc' then b.ordination_date end desc nulls last,
    case when p_sort = 'status' and p_dir = 'asc' then b.status end asc,
    case when p_sort = 'status' and p_dir = 'desc' then b.status end desc,
    b.first_name, b.last_name, b.id
  limit greatest(1, least(coalesce(p_limit, 10), 10000))
  offset greatest(0, coalesce(p_offset, 0));
$$;
revoke execute on function public.list_personnel(text, uuid, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.list_personnel(text, uuid, text, text, text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------
-- personnel_history: ประวัติการแก้ไขของบุคคลและวาระตำแหน่งของบุคคลนั้น พร้อมชื่อผู้แก้ไข
-- ดูได้เฉพาะผู้ที่มองเห็นบุคคลนั้น (ไม่เปิดตาราง audit_logs และ profiles ให้อ่านเพิ่ม)
-- ---------------------------------------------------------------
create function public.personnel_history(p_person_id uuid)
returns table (
  id bigint, action text, table_name text, row_id text,
  old_data jsonb, new_data jsonb, created_at timestamptz, actor_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.action, l.table_name, l.row_id,
         l.old_data - 'national_id_enc' - 'national_id_hash' - 'created_by',
         l.new_data - 'national_id_enc' - 'national_id_hash' - 'created_by',
         l.created_at,
         nullif(btrim(concat_ws(' ', pr.title_prefix, pr.first_name, pr.monastic_name, pr.last_name)), '')
  from public.audit_logs l
  left join public.profiles pr on pr.id = l.actor_id
  where public.can_view_person(p_person_id)
    and (
      (l.table_name = 'persons' and l.row_id = p_person_id::text)
      or (l.table_name = 'appointments' and l.row_id in (
        select a.id::text from public.appointments a where a.person_id = p_person_id
      ))
    )
  order by l.created_at desc, l.id desc
  limit 200;
$$;
revoke execute on function public.personnel_history(uuid) from public, anon;
grant execute on function public.personnel_history(uuid) to authenticated;

-- ---------------------------------------------------------------
-- ไฟล์แนบของทะเบียนบุคคล (persons = เอกสารของบุคคล, person_photos = รูปถ่าย, appointments = คำสั่งหรือตราตั้ง)
-- เขตปกครองของไฟล์กำหนดจากรายการที่แนบเสมอ ไม่เชื่อค่าที่ส่งมาจากหน้าจอ
-- ดูได้ตามสิทธิ์ดูทะเบียนบุคคล แนบและเอาออกได้ตามสิทธิ์แก้ไขทะเบียนบุคคล
-- ---------------------------------------------------------------
create function public.attachments_personnel_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit uuid;
begin
  if new.entity_table in ('persons', 'person_photos') then
    select org_unit_id into v_unit from public.persons where id::text = new.entity_id;
  elsif new.entity_table = 'appointments' then
    select org_unit_id into v_unit from public.appointments where id::text = new.entity_id;
  else
    return new;
  end if;
  if v_unit is null then
    raise exception 'ไม่พบรายการที่จะแนบไฟล์' using errcode = '23503';
  end if;
  new.org_unit_id := v_unit;
  return new;
end;
$$;
revoke execute on function public.attachments_personnel_unit() from public, anon, authenticated;
create trigger attachments_personnel_unit before insert on public.attachments
  for each row execute function public.attachments_personnel_unit();

-- ย้ายเขตของบุคคลแล้ว ไฟล์แนบของบุคคลนั้นย้ายตาม
create function public.persons_move_attachments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.attachments
     set org_unit_id = new.org_unit_id
   where entity_table in ('persons', 'person_photos') and entity_id = new.id::text;
  return new;
end;
$$;
revoke execute on function public.persons_move_attachments() from public, anon, authenticated;
create trigger persons_move_attachments after update of org_unit_id on public.persons
  for each row when (old.org_unit_id is distinct from new.org_unit_id)
  execute function public.persons_move_attachments();

-- ปรับ policy เดิมของ attachments (ใช้ alter เพื่อไม่ให้มีช่วงที่ตารางไม่มี policy)
alter policy attachments_read on public.attachments
  using (
    case
      when entity_table in ('persons', 'person_photos', 'appointments') then public.can_view_personnel(org_unit_id)
      else uploaded_by = auth.uid() or public.has_role('admin') or public.can_access(org_unit_id)
    end
  );
alter policy attachments_insert on public.attachments
  with check (
    uploaded_by = auth.uid()
    and storage_path like auth.uid()::text || '/%'
    and case
      when entity_table in ('persons', 'person_photos', 'appointments') then public.can_edit_personnel(org_unit_id)
      else org_unit_id is null or public.can_access(org_unit_id)
    end
  );
alter policy attachments_update on public.attachments
  using (
    case
      when entity_table in ('persons', 'person_photos', 'appointments') then public.can_edit_personnel(org_unit_id)
      else uploaded_by = auth.uid() or public.has_role('admin')
    end
  )
  with check (
    case
      when entity_table in ('persons', 'person_photos', 'appointments') then public.can_edit_personnel(org_unit_id)
      else uploaded_by = auth.uid() or public.has_role('admin')
    end
  );

-- ---------------------------------------------------------------
-- นำเข้าบุคคลจาก Excel
-- ขั้นที่ 1 check_persons_import: บอกว่าแถวใดมีในทะเบียนแล้ว (ตอบเพียง ใช่/ไม่ใช่)
-- ขั้นที่ 2 import_persons: บันทึกทั้งชุด แถวที่มีในทะเบียนแล้วจะถูกข้าม ถ้าแถวใดผิดจะไม่บันทึกเลยทั้งชุด
-- ---------------------------------------------------------------
create function public.check_persons_import(p_rows jsonb)
returns table (row_number integer, duplicate boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_role('admin') or public.has_role('secretary')) then
    raise exception 'ท่านไม่มีสิทธิ์นำเข้าทะเบียนบุคคล' using errcode = '42501';
  end if;
  return query
    select x.row_number,
           private.person_duplicate(
             nullif(regexp_replace(coalesce(x.national_id, ''), '[^0-9A-Za-z]', '', 'g'), ''),
             x.first_name, x.monastic_name, x.last_name, nullif(x.birth_date, '')::date, null
           )
    from jsonb_to_recordset(p_rows) as x(
      row_number integer, national_id text, first_name text, monastic_name text, last_name text, birth_date text
    );
end;
$$;

create function public.import_persons(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_count integer := 0;
  v_row integer;
begin
  if not (public.has_role('admin') or public.has_role('secretary')) then
    raise exception 'ท่านไม่มีสิทธิ์นำเข้าทะเบียนบุคคล' using errcode = '42501';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 2,000 แถว' using errcode = '23514';
  end if;

  for r in select value from jsonb_array_elements(p_rows) order by (value ->> 'row_number')::integer
  loop
    v_row := (r ->> 'row_number')::integer;
    if private.person_duplicate(
         nullif(regexp_replace(coalesce(r ->> 'national_id', ''), '[^0-9A-Za-z]', '', 'g'), ''),
         r ->> 'first_name', r ->> 'monastic_name', r ->> 'last_name',
         nullif(r ->> 'birth_date', '')::date, null
       ) then
      continue;
    end if;
    begin
      perform public.save_person(null, r);
    exception when others then
      raise exception 'แถวที่ %: %', v_row, sqlerrm using errcode = '23514';
    end;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.check_persons_import(jsonb) from public, anon;
revoke execute on function public.import_persons(jsonb) from public, anon;
grant execute on function public.check_persons_import(jsonb) to authenticated;
grant execute on function public.import_persons(jsonb) to authenticated;
