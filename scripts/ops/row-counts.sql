-- จำนวนแถวทุกตารางของข้อมูลงาน + บัญชีผู้ใช้ + รายการไฟล์ (ใช้เทียบหลังกู้คืน)
select format('%s.%s', table_schema, table_name) || ' ' ||
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables
where table_type = 'BASE TABLE'
  and (table_schema in ('public', 'private')
       or (table_schema = 'auth' and table_name in ('users', 'identities', 'mfa_factors'))
       or (table_schema = 'storage' and table_name in ('buckets', 'objects')))
order by 1;
