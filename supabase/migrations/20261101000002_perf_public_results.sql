-- บทที่ 31 ข้อ 6: ทดสอบความเร็วกับข้อมูลจำลอง (สถานที่ 50,000 แห่ง ผู้สมัคร 500,000 คน)
-- ฟังก์ชันสถิติผลสอบและรายชื่อสำนักที่มีผู้สอบได้ใช้เวลาเกิน 1 วินาทีเมื่อฐานข้อมูลไม่ใช้การทำงานขนาน
-- เขียนใหม่ให้นับรวมต่อบัญชี (batch) ก่อน แล้วจึงเชื่อมตารางสนามสอบ สถานที่ จังหวัด ภาค (ผลลัพธ์เหมือนเดิมทุกแถว)
-- ไม่เปลี่ยนชนิดผลลัพธ์ สิทธิ์ (grant) และ security definer ของเดิมยังคงอยู่เพราะใช้ create or replace

create or replace function public.public_result_stats()
 returns table(year_be integer, exam_type text, level text, stage text, region_name text, province_name text,
               sent integer, absent integer, passed integer, failed integer, no_result integer)
 language sql stable security definer
 set search_path to 'public'
as $function$
  with a as (
    select c.batch_id, c.stage,
           count(*) as sent,
           count(*) filter (where x.result = 'absent') as absent,
           count(*) filter (where x.result = 'passed') as passed,
           count(*) filter (where x.result = 'failed') as failed,
           count(*) filter (where x.id is null) as no_result
    from public.candidates c
    left join public.exam_results x on x.candidate_id = c.id
    where c.counted
      and c.round_id in (select id from public.exam_rounds where is_active and result_status = 'published')
    group by c.batch_id, c.stage
  )
  select y.year_be, r.exam_type, r.level, a.stage, coalesce(ur.region_name, ''), coalesce(pv.name, ''),
         sum(a.sent)::integer, sum(a.absent)::integer, sum(a.passed)::integer, sum(a.failed)::integer, sum(a.no_result)::integer
  from a
  join public.registration_batches b on b.id = a.batch_id
  join public.exam_rounds r on r.id = b.round_id
  join public.academic_years y on y.id = r.academic_year_id
  join public.exam_venues v on v.id = b.venue_id
  left join public.places pl on pl.id = v.place_id
  left join public.civil_provinces pv on pv.code = pl.province_code
  left join private.unit_regions() ur on ur.unit_id = v.org_unit_id
  where b.status in ('submitted', 'returned', 'certified') and r.is_active and r.result_status = 'published'
  group by y.year_be, r.exam_type, r.level, a.stage, ur.region_name, pv.name;
$function$;

create or replace function public.public_result_places(p_year integer, p_type text, p_level text)
 returns table(province_code integer, province_name text, place_id uuid, place_name text, passed integer)
 language sql stable security definer
 set search_path to 'public'
as $function$
  with a as (
    select c.batch_id, count(*) as passed
    from public.exam_results x
    join public.candidates c on c.id = x.candidate_id
    where x.result = 'passed'
      and x.round_id in (select r.id from public.exam_rounds r
                         join public.academic_years y on y.id = r.academic_year_id
                         where r.result_status = 'published' and r.is_active
                           and y.year_be = p_year and r.exam_type = p_type and r.level = p_level)
    group by c.batch_id
  )
  select pl.province_code, coalesce(pv.name, 'ไม่ระบุจังหวัด'), pl.id, pl.name, sum(a.passed)::integer
  from a
  join public.registration_batches b on b.id = a.batch_id
  join public.places pl on pl.id = b.place_id
  left join public.civil_provinces pv on pv.code = pl.province_code
  group by pl.province_code, pv.name, pl.id, pl.name
  order by pv.name nulls last, pl.name;
$function$;
