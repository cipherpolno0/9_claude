-- รายการสิทธิ์ของทุกวัตถุใน schema public/private (ใช้เทียบต้นทางกับฐานที่กู้คืน ต้องตรงกันทุกบรรทัด)
-- เรียงรายการสิทธิ์ภายในแต่ละวัตถุ (ลำดับใน aclitem[] ต่างกันได้แม้สิทธิ์เท่ากัน) และแทนค่าว่างด้วยสิทธิ์ตั้งต้นของเจ้าของ
\set QUIET on
-- ชื่อชนิดข้อมูลต้องระบุ schema เต็ม (ไฟล์ schema ของ pg_dump ตั้ง search_path ว่าง)
set search_path = '';
with o as (
  select 'f ' || p.oid::regprocedure::text as obj, coalesce(p.proacl, acldefault('f', p.proowner)) as acl
  from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
  union all
  select c.relkind::text || ' ' || format('%I.%I', c.relnamespace::regnamespace, c.relname),
         coalesce(c.relacl, acldefault(case c.relkind when 'S' then 's' else 'r' end::"char", c.relowner))
  from pg_class c where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace) and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  union all
  select 'c ' || format('%I.%I.%I', c.relnamespace::regnamespace, c.relname, a.attname), a.attacl
  from pg_attribute a join pg_class c on c.oid = a.attrelid
  where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace) and a.attacl is not null and not a.attisdropped
  union all
  select 'n ' || n.nspname, coalesce(n.nspacl, acldefault('n', n.nspowner)) from pg_namespace n where n.nspname in ('public', 'private')
)
select obj || ' ' || coalesce((select string_agg(x::text, ',' order by x::text collate "C") from unnest(acl) x), '-')
from o order by obj collate "C";
