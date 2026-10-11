-- วัดเวลาฟังก์ชันของหน้าสาธารณะ (บทที่ 31) ใช้หลัง perf_seed.sql บนฐานข้อมูลทดสอบในเครื่องเท่านั้น
-- รันสองแบบ: ตามปกติ และ set max_parallel_workers_per_gather = 0 (จำลองเครื่องที่ไม่ใช้การทำงานขนาน)
\timing on
\pset tuples_only on
\pset format unaligned
select set_config('my.fn', (select first_name from candidates where seq=7 limit 1), false), set_config('my.ln', (select last_name from candidates where seq=7 limit 1), false),
       set_config('my.yr', (select year_be::text from academic_years where is_current), false),
       set_config('my.place', (select p.id::text from registration_batches b join places p on p.id=b.place_id limit 1), false),
       set_config('my.pname', (select substr(name, 4, 6) from places where code='PF123'), false);
set role anon;
select 'T1 places q', count(*) from public_places('temple', current_setting('my.pname'), null,null,null,null,null,null,50,0);
select 'T2 places no q', count(*) from public_places('temple', null, null,null,null,null,null,null,50,0);
select 'T3 places province', count(*) from public_places('temple', null, null,10,null,null,null,null,50,0);
select 'T4 places q export', count(*) from public_places('temple', 'วัด', null,null,null,null,null,null,5000,0);
select 'T5 places last page', count(*) from public_places('temple', null, null,null,null,null,null,null,50,34950);
select 'T6 venues q', count(*) from public_venues(null, 'สนามสอบวัด', null,null,null,null,null,null,50,0);
select 'T7 venues none', count(*) from public_venues(null, null, null,null,null,null,null,null,50,0);
select 'T8 reg stats', count(*) from public_registration_stats();
select 'T9 result stats', count(*) from public_result_stats();
select 'T10 home stats', public_home_stats()::text;
select 'T11 result places', count(*) from public_result_places(current_setting('my.yr')::int, 'nak_tham', 'tri');
select 'T12 result list', count(*) from public_result_list(current_setting('my.yr')::int, 'nak_tham', 'tri', current_setting('my.place')::uuid);
select 'T13 requests', count(*) from public_requests(null,null,null,100,0);
select 'T14 officers', count(*) from public_officers('สม', null,null,null,50,0);
select 'T15 calendar', count(*) from public_exam_calendar();
reset role;
set role service_role;
select 'T16 reg search', count(*) from public_registration_search(current_setting('my.fn'), current_setting('my.ln'), current_setting('my.yr')::int, repeat('a',64));
select 'T17 reg search first only', count(*) from public_registration_search(current_setting('my.fn'), '', current_setting('my.yr')::int, repeat('b',64));
select 'T18 result search', count(*) from public_result_search(current_setting('my.fn'), current_setting('my.ln'), current_setting('my.yr')::int, 'nak_tham','tri', repeat('c',64));
select 'T19 result search first', count(*) from public_result_search(current_setting('my.fn'), '', current_setting('my.yr')::int, 'nak_tham','tri', repeat('d',64));
