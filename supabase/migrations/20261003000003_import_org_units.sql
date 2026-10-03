-- บทที่ 2 (3/3): ฟังก์ชันนำเข้าเขตปกครองทีละชุด (ใช้กับการนำเข้าจาก Excel)
-- รับรายการเป็น JSON: [{ "code", "name", "level", "sect", "parent_code" }, ...]
-- ทำทั้งชุดในครั้งเดียว ถ้าแถวใดผิด จะไม่บันทึกเลยทั้งชุด
-- รหัสที่มีอยู่แล้วในระบบจะถูกข้าม คืนค่าเป็นจำนวนแถวที่เพิ่มจริง

create function public.import_org_units(p_rows jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  r record;
  v_parent_id uuid;
  v_count integer := 0;
begin
  for r in
    select
      btrim(x.code) as code,
      btrim(x.name) as name,
      x.level::public.org_level as level,
      nullif(x.sect, '')::public.sect as sect,
      nullif(btrim(x.parent_code), '') as parent_code
    from jsonb_to_recordset(p_rows)
      as x(code text, name text, level text, sect text, parent_code text)
    order by x.level::public.org_level, btrim(x.code)
  loop
    if exists (select 1 from public.org_units u where u.code = r.code) then
      continue;
    end if;

    v_parent_id := null;
    if r.level <> 'central' then
      select u.id into v_parent_id from public.org_units u where u.code = r.parent_code;
      if v_parent_id is null then
        raise exception 'ไม่พบรหัสหน่วยเหนือ "%" ของหน่วย "%"', coalesce(r.parent_code, ''), r.code
          using errcode = '23503';
      end if;
    end if;

    insert into public.org_units (parent_id, level, sect, name, code)
    values (v_parent_id, r.level, case when r.level = 'central' then null else r.sect end, r.name, r.code);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
comment on function public.import_org_units(jsonb) is 'นำเข้าเขตปกครองทั้งชุดแบบสำเร็จทั้งหมดหรือไม่บันทึกเลย';

-- เรียกได้เฉพาะฝั่งเซิร์ฟเวอร์ (secret key) จนกว่าจะมีสิทธิ์ตามบทบาทในบทที่ 3
revoke execute on function public.import_org_units(jsonb) from public, anon, authenticated;
grant execute on function public.import_org_units(jsonb) to service_role;
