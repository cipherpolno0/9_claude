-- ข้อมูลจำลองสำหรับทดสอบความเร็ว (บทที่ 31) ใช้กับฐานข้อมูลทดสอบในเครื่องเท่านั้น ห้ามรันกับฐานจริง
-- สถานที่ 50,000 แห่ง (วัด 35,000 สำนักเรียน 7,000 สำนักศาสนศึกษา 3,000 สถานศึกษา 3,000 องค์กร 2,000) สนามสอบ 3,000 สนาม
-- บัญชีผู้สมัคร 2,000 บัญชี ผู้สมัคร 500,000 คน (นักธรรมชั้นตรี ปีการศึกษาปัจจุบัน) และผลสอบที่ประกาศแล้วครบทุกคน
-- ชื่อสมมุติ: ชื่อ 2,000 แบบ นามสกุล 5,000 แบบ (สร้างจากพยางค์) เพื่อให้การค้นชื่อมีจำนวนผลใกล้เคียงข้อมูลจริง
set session_replication_role = replica;

create temp table syl(i int, s text);
insert into syl select row_number() over (), s from unnest(array[
  'สม','ชาย','ศักดิ์','บุญ','มี','ทอง','ดี','ใจ','สุข','ประ','เสริฐ','วิ','ชัย','พง','ษ์','ธนา','กร','นิ','รัน','อรุณ',
  'สิทธิ์','ศรี','วงศ์','พร','เจริญ','กิจ','มณี','รัตน์','จันทร์','แก้ว','เพชร','สุวรรณ','นาค','ธรรม','ปัญญา','กุศล','เมตตา','สติ','พุทธ','สงฆ์']) s;
create temp table first_names as
  select row_number() over () as n, a.s || b.s || c.s as name from syl a, syl b, syl c where a.i <> b.i and b.i <> c.i limit 2000;
create temp table last_names as
  select row_number() over () as n, a.s || b.s || c.s || d.s as name from syl a, syl b, syl c, syl d where a.i < b.i and b.i < c.i and c.i <> d.i limit 5000;
create temp table subs as
  select row_number() over (order by s.code) as n, s.code, s.district_code, d.province_code from civil_subdistricts s join civil_districts d on d.code = s.district_code;
create temp table units as
  select row_number() over (order by code) as n, id, sect from org_units where level = 'subdistrict';

-- สถานที่
insert into places (place_type, code, name, sect, subdistrict_code, district_code, province_code, org_unit_id, status, office_phone)
select t.place_type, 'PF' || g, t.prefix || f.name || ' ' || g, case when t.place_type in ('temple', 'samnak_rian', 'samnak_sasanasuksa') then u.sect end,
       s.code, s.district_code, s.province_code, u.id, case when g % 50 = 0 then 'dissolved' else 'open' end, '02' || lpad((g % 10000000)::text, 7, '0')
from generate_series(1, 50000) g
cross join lateral (select case when g <= 35000 then 'temple' when g <= 42000 then 'samnak_rian' when g <= 45000 then 'samnak_sasanasuksa'
                                when g <= 48000 then 'school' else 'organization' end as place_type,
                           case when g <= 35000 then 'วัด' when g <= 42000 then 'สำนักเรียนวัด' when g <= 45000 then 'สำนักศาสนศึกษาวัด'
                                when g <= 48000 then 'โรงเรียน' else 'องค์กร' end as prefix) t
join first_names f on f.n = 1 + (g * 7) % 2000
join subs s on s.n = 1 + (g * 13) % (select count(*) from subs)
join units u on u.n = 1 + g % (select count(*) from units);

-- สนามสอบ 3,000 สนาม ที่วัด
insert into exam_venues (code, name, venue_type, levels, place_id, org_unit_id, status)
select (100000 + g)::text, 'สนามสอบ' || p.name, case when g % 3 = 0 then 'tham_sueksa' else 'nak_tham' end, '{tri,tho,ek}', p.id, p.org_unit_id, 'open'
from generate_series(1, 3000) g join places p on p.code = 'PF' || (g * 11);

-- รอบสมัครสอบนักธรรมชั้นตรีของปีปัจจุบัน (ประกาศผลแล้ว)
insert into exam_rounds (academic_year_id, exam_type, level, opens_on, closes_on, exam_starts_on, status, result_status, results_announced_on)
select id, 'nak_tham', 'tri', current_date - 60, current_date - 30, current_date - 20, 'closed', 'published', current_date - 1
from academic_years where is_current;

-- บัญชี 2,000 บัญชี (สำนักเรียน + สนามนักธรรม)
create temp table b as
select gen_random_uuid() as id, g,
       (select id from places where code = 'PF' || (35000 + 1 + (g * 3) % 7000)) as place_id,
       (select v.id from exam_venues v where v.code = (100000 + 1 + ((g * 3) % 2000) * 3 / 2)::text) as venue_id
from generate_series(1, 2000) g;
update b set venue_id = (select id from exam_venues where venue_type = 'nak_tham' order by code limit 1) where venue_id is null;
insert into registration_batches (id, round_id, template_id, place_id, venue_id, org_unit_id, uploaded_by, status, file_name)
select b.id, (select id from exam_rounds where result_status = 'published' and exam_type = 'nak_tham' order by created_at desc limit 1),
       (select id from form_templates where is_active and exam_type = 'nak_tham' and level = 'tri'),
       b.place_id, b.venue_id, (select org_unit_id from places where id = b.place_id),
       (select id from profiles order by created_at limit 1), case when g % 4 = 0 then 'submitted' else 'certified' end, 'perf.xlsx'
from b;

-- ผู้สมัคร 500,000 คน (250 คนต่อบัญชี)
insert into candidates (batch_id, round_id, row_no, seq, candidate_code, person_kind, person_key, title, first_name, monastic_name, last_name,
                        birth_date, national_id_last4, national_id_hash, national_id_enc, school_name, level, status, counted)
select b.id, rb.round_id, 8 + r, r, (select year_be from academic_years where is_current) || '-ศ1-' || lpad(((b.g - 1) * 250 + r)::text, 6, '0'),
       'monastic', md5(b.g || '-' || r), case when r % 3 = 0 then 'สามเณร' else 'พระ' end,
       f.name, case when r % 3 = 0 then '' else 'ฉายา' || l.n end, l.name,
       date '1990-01-01' + ((b.g * 251 + r) % 9000), lpad(((b.g * 7919 + r) % 10000)::text, 4, '0'), md5('nid' || b.g || '-' || r) || md5('x' || r),
       '\x00'::bytea, p.name, 'tri', 'ok', true
from b
join registration_batches rb on rb.id = b.id
join places p on p.id = b.place_id
cross join generate_series(1, 250) r
join first_names f on f.n = 1 + ((b.g * 37 + r * 101) % 2000)
join last_names l on l.n = 1 + ((b.g * 53 + r * 17) % 5000);

-- ผลสอบที่ประกาศแล้ว
insert into exam_results (candidate_id, round_id, result, certificate_no)
select c.id, c.round_id, case when c.seq % 5 = 0 then 'failed' when c.seq % 17 = 0 then 'absent' else 'passed' end,
       case when c.seq % 5 <> 0 and c.seq % 17 <> 0 then 'P' || c.candidate_code else '' end
from candidates c join exam_rounds r on r.id = c.round_id where r.result_status = 'published';

set session_replication_role = origin;
analyze;
select 'places', count(*) from places union all select 'venues', count(*) from exam_venues
union all select 'candidates', count(*) from candidates union all select 'results', count(*) from exam_results;
