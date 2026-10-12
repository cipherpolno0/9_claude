-- สร้างคำสั่งตั้งสิทธิ์ให้ตรงกับต้นทาง (รันบนต้นทางตอนสำรอง ได้ไฟล์ acl.sql ไว้ใช้ตอนกู้คืน)
-- เหตุผล: โครงการ Supabase ใหม่มี default privileges ให้ anon/authenticated ทุกตารางและฟังก์ชันที่สร้างใน public
-- ไฟล์ schema ของ pg_dump ไม่ถอนสิทธิ์ที่ได้จาก default privileges จึงต้องถอนทั้งหมดแล้วให้ใหม่ตามต้นทาง
\set QUIET on
-- ชื่อชนิดข้อมูลต้องระบุ schema เต็ม (ไฟล์ schema ของ pg_dump ตั้ง search_path ว่าง)
set search_path = '';
with objs as (
  select 'function ' || p.oid::regprocedure::text as obj, coalesce(p.proacl, acldefault('f', p.proowner)) as acl
  from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prokind in ('f', 'p', 'w')
  union all
  select case c.relkind when 'S' then 'sequence ' else 'table ' end || format('%I.%I', c.relnamespace::regnamespace, c.relname),
         coalesce(c.relacl, acldefault(case c.relkind when 'S' then 's' else 'r' end::"char", c.relowner))
  from pg_class c where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace) and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
)
select stmt from (
  select o.obj, 0 as k, format('revoke all on %s from public, anon, authenticated, service_role;', o.obj) as stmt from objs o
  union all
  select o.obj, 1, format('grant %s on %s to %s%s;', e.privilege_type, o.obj,
                          case when e.grantee = 0 then 'public' else quote_ident(e.grantee::regrole::text) end,
                          case when e.is_grantable then ' with grant option' else '' end)
  from objs o
  cross join lateral aclexplode(o.acl) e
  where (e.grantee = 0 or e.grantee::regrole::text in ('anon', 'authenticated', 'service_role'))
  union all
  -- revoke all on table ถอนสิทธิ์รายคอลัมน์ด้วย จึงต้องให้สิทธิ์รายคอลัมน์ใหม่ (เช่น persons ที่ซ่อนเลขประจำตัว)
  select format('table %I.%I', c.relnamespace::regnamespace, c.relname), 2,
         format('grant %s (%I) on table %I.%I to %s%s;', e.privilege_type, a.attname, c.relnamespace::regnamespace, c.relname,
                case when e.grantee = 0 then 'public' else quote_ident(e.grantee::regrole::text) end,
                case when e.is_grantable then ' with grant option' else '' end)
  from pg_attribute a join pg_class c on c.oid = a.attrelid
  cross join lateral aclexplode(a.attacl) e
  where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace) and a.attacl is not null and not a.attisdropped
    and (e.grantee = 0 or e.grantee::regrole::text in ('anon', 'authenticated', 'service_role'))
) s order by obj collate "C", k, stmt collate "C";
