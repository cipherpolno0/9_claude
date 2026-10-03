-- บทที่ 2 (2/3): ฟังก์ชัน descendants_of
-- คืนหน่วยใต้สังกัดทั้งหมดทุกชั้นของหน่วยที่ระบุ (ไม่รวมตัวหน่วยเอง)
-- depth = จำนวนชั้นที่ห่างจากหน่วยที่ระบุ (ลูกโดยตรง = 1)

create function public.descendants_of(p_org_unit_id uuid)
returns table (
  id         uuid,
  parent_id  uuid,
  level      public.org_level,
  sect       public.sect,
  name       text,
  code       text,
  is_active  boolean,
  depth      integer
)
language sql
stable
set search_path = public
as $$
  with recursive tree as (
    select u.id, u.parent_id, u.level, u.sect, u.name, u.code, u.is_active, 1 as depth
    from public.org_units u
    where u.parent_id = p_org_unit_id
    union all
    select u.id, u.parent_id, u.level, u.sect, u.name, u.code, u.is_active, t.depth + 1
    from public.org_units u
    join tree t on u.parent_id = t.id
  )
  select * from tree;
$$;
comment on function public.descendants_of(uuid) is 'หน่วยใต้สังกัดทั้งหมดทุกชั้น ไม่รวมตัวเอง';
