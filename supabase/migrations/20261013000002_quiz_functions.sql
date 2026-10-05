-- บทที่ 12 (2/2): ฟังก์ชันของคลังข้อสอบ (รายการ แดชบอร์ด เผยแพร่ทั้งชุด ประวัติ นำเข้าจาก Excel)
-- ทุกฟังก์ชันตรวจ can_manage_quiz() เอง และไม่เปิดให้ anon

-- เงื่อนไขกรองชุดเดียว ใช้ทั้งหน้ารายการและปุ่มเผยแพร่ทั้งชุด (p_year = 0 หมายถึงข้อที่ไม่ระบุปี)
create function private.filter_questions(
  p_q text, p_course uuid, p_unit uuid, p_year integer, p_status text, p_difficulty text
)
returns setof public.questions
language sql
stable
set search_path = public
as $$
  select q.*
  from public.questions q
  where (case when p_status = 'inactive' then not q.is_active else q.is_active end)
    and (p_status is null or p_status = 'inactive' or q.status = p_status)
    and (p_course is null or q.course_id = p_course)
    and (p_unit is null or q.unit_id = p_unit)
    and (p_year is null or (p_year = 0 and q.source_year_be is null) or q.source_year_be = p_year)
    and (p_difficulty is null or q.difficulty = p_difficulty)
    and (
      coalesce(p_q, '') = ''
      or q.question_text ilike '%' || p_q || '%'
      or q.choice_a ilike '%' || p_q || '%'
      or q.choice_b ilike '%' || p_q || '%'
      or q.choice_c ilike '%' || p_q || '%'
      or q.choice_d ilike '%' || p_q || '%'
    );
$$;
revoke execute on function private.filter_questions(text, uuid, uuid, integer, text, text) from public, anon, authenticated;

create function public.list_questions(
  p_q text default '',
  p_course uuid default null,
  p_unit uuid default null,
  p_year integer default null,
  p_status text default null,
  p_difficulty text default null,
  p_sort text default 'created',
  p_dir text default 'desc',
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid, course_id uuid, course_code text, course_name text, unit_id uuid, unit_name text,
  question_text text, correct_choice text, source_year_be integer, difficulty text, status text,
  is_active boolean, created_at timestamptz, updated_at timestamptz, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.course_id, c.code, c.name, q.unit_id, u.name,
         q.question_text, q.correct_choice, q.source_year_be, q.difficulty, q.status,
         q.is_active, q.created_at, q.updated_at, count(*) over ()
  from private.filter_questions(p_q, p_course, p_unit, p_year, p_status, p_difficulty) q
  join public.courses c on c.id = q.course_id
  join public.units u on u.id = q.unit_id
  where public.can_manage_quiz()
  order by
    case when p_sort = 'created' and p_dir = 'asc' then q.created_at end asc,
    case when p_sort = 'created' and p_dir = 'desc' then q.created_at end desc,
    case when p_sort = 'course' and p_dir = 'asc' then c.sort_order end asc,
    case when p_sort = 'course' and p_dir = 'desc' then c.sort_order end desc,
    case when p_sort = 'course' and p_dir = 'asc' then u.sort_order end asc,
    case when p_sort = 'course' and p_dir = 'desc' then u.sort_order end desc,
    case when p_sort = 'year' and p_dir = 'asc' then q.source_year_be end asc nulls last,
    case when p_sort = 'year' and p_dir = 'desc' then q.source_year_be end desc nulls last,
    case when p_sort = 'status' and p_dir = 'asc' then q.status end asc,
    case when p_sort = 'status' and p_dir = 'desc' then q.status end desc,
    q.created_at desc, q.id
  limit greatest(1, least(coalesce(p_limit, 10), 1000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- ปีของข้อสอบที่มีในคลัง (ตัวเลือกของตัวกรอง)
create function public.question_years()
returns table (year_be integer)
language sql
stable
security definer
set search_path = public
as $$
  select distinct q.source_year_be
  from public.questions q
  where q.is_active and q.source_year_be is not null and public.can_manage_quiz()
  order by 1 desc;
$$;

-- แดชบอร์ดคลัง: หนึ่งแถว = รายวิชา + หน่วยที่ใช้งาน (รายวิชาที่ยังไม่มีหน่วยได้หนึ่งแถวที่ unit_id ว่าง)
create function public.quiz_bank_summary()
returns table (
  course_id uuid, course_code text, course_name text, level text, stage text, subject text,
  has_mcq boolean, course_order integer, unit_id uuid, unit_name text, unit_order integer,
  published_count integer, draft_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.code, c.name, c.level, c.stage, c.subject, c.has_mcq, c.sort_order,
         u.id, u.name, u.sort_order,
         (count(q.id) filter (where q.status = 'published'))::integer,
         (count(q.id) filter (where q.status = 'draft'))::integer
  from public.courses c
  left join public.units u on u.course_id = c.id and u.is_active
  left join public.questions q on q.unit_id = u.id and q.is_active
  where c.is_active and public.can_manage_quiz()
  group by c.id, u.id
  order by c.sort_order, u.sort_order, u.name;
$$;

-- เผยแพร่ข้อสอบฉบับร่างทั้งหมดที่ตรงกับตัวกรอง คืนจำนวนข้อที่เผยแพร่
create function public.publish_draft_questions(
  p_q text default '',
  p_course uuid default null,
  p_unit uuid default null,
  p_year integer default null,
  p_difficulty text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.can_manage_quiz() then
    raise exception 'ท่านไม่มีสิทธิ์จัดการคลังข้อสอบ' using errcode = '42501';
  end if;
  update public.questions q
     set status = 'published'
   where q.id in (select f.id from private.filter_questions(p_q, p_course, p_unit, p_year, 'draft', p_difficulty) f);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ประวัติการแก้ไขของข้อสอบ (audit_logs เปิดให้เฉพาะผู้ดูแลระบบ)
create function public.question_history(p_question_id uuid)
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
         l.old_data - 'created_by' - 'published_by' - 'dup_key',
         l.new_data - 'created_by' - 'published_by' - 'dup_key', l.created_at,
         nullif(btrim(concat_ws(' ', pr.title_prefix, pr.first_name, pr.monastic_name, pr.last_name)), '')
  from public.audit_logs l
  left join public.profiles pr on pr.id = l.actor_id
  where l.table_name = 'questions' and l.row_id = p_question_id::text and public.can_manage_quiz()
  order by l.created_at desc, l.id desc
  limit 200;
$$;

-- ---------------------------------------------------------------
-- นำเข้าข้อสอบจาก Excel
-- ขั้นที่ 1 check_questions_import: ตรวจทุกแถวและบอกเหตุผล (ยังไม่บันทึก)
-- ขั้นที่ 2 import_questions: ตรวจซ้ำแล้วบันทึกทั้งชุดเป็น ร่าง ถ้ามีแถวผิดแม้แถวเดียวจะไม่บันทึกเลย
-- ข้อซ้ำ (โจทย์และตัวเลือกชุดเดียวกันในรายวิชาเดียวกัน): ข้อถูกตรงกัน = ข้าม / ข้อถูกไม่ตรงกัน = ผิด
-- ---------------------------------------------------------------
create function private.resolve_question_rows(p_rows jsonb)
returns table (
  row_number integer, course_id uuid, unit_id uuid, question_text text,
  choice_a text, choice_b text, choice_c text, choice_d text, correct_choice text,
  explanation text, source_year_be integer, skip boolean, note text, error text
)
language sql
stable
security definer
set search_path = public
as $$
  with x as (
    select *
    from jsonb_to_recordset(p_rows) as x(
      row_number integer, course text, unit text, question_text text,
      choice_a text, choice_b text, choice_c text, choice_d text, correct text,
      explanation text, year integer
    )
  ),
  n as (
    select x.row_number,
           btrim(regexp_replace(coalesce(x.course, ''), '\s+', ' ', 'g')) as course,
           btrim(regexp_replace(coalesce(x.unit, ''), '\s+', ' ', 'g')) as unit,
           btrim(coalesce(x.question_text, '')) as question_text,
           btrim(coalesce(x.choice_a, '')) as choice_a, btrim(coalesce(x.choice_b, '')) as choice_b,
           btrim(coalesce(x.choice_c, '')) as choice_c, btrim(coalesce(x.choice_d, '')) as choice_d,
           lower(btrim(coalesce(x.correct, ''))) as correct,
           btrim(coalesce(x.explanation, '')) as explanation, x.year
    from x
  ),
  r as (
    select n.*, c.id as c_id, c.has_mcq, u.id as u_id,
           private.question_dup_key(n.question_text, n.choice_a, n.choice_b, n.choice_c, n.choice_d) as dk,
           private.quiz_norm(case n.correct when 'a' then n.choice_a when 'b' then n.choice_b
                                            when 'c' then n.choice_c when 'd' then n.choice_d end) as correct_text
    from n
    left join lateral (
      select cc.id, cc.has_mcq from public.courses cc
      where cc.is_active and n.course in (cc.code, cc.name)
      order by (cc.code = n.course) desc
      limit 1
    ) c on true
    left join public.units u on u.course_id = c.id and u.is_active and u.name = n.unit
  ),
  e as (
    select r.*, ex.id as ex_id,
           private.quiz_norm(case ex.correct_choice when 'a' then ex.choice_a when 'b' then ex.choice_b
                                                    when 'c' then ex.choice_c when 'd' then ex.choice_d end) as ex_correct_text,
           first_value(r.row_number) over w as first_row,
           first_value(r.correct_text) over w as first_correct_text
    from r
    left join public.questions ex on ex.is_active and ex.course_id = r.c_id and ex.dup_key = r.dk
    window w as (partition by r.c_id, r.dk order by r.row_number)
  ),
  v as (
    select e.*,
           case
             when e.course = '' then 'ไม่ได้กรอกรายวิชา'
             when e.c_id is null then 'ไม่พบรายวิชา "' || e.course || '"'
             when not e.has_mcq then 'วิชากระทู้ธรรมเป็นข้อเขียน ไม่มีข้อสอบปรนัย'
             when e.unit = '' then 'ไม่ได้กรอกหน่วย'
             when e.u_id is null then 'ไม่พบหน่วย "' || e.unit || '" ในรายวิชานี้'
             when e.question_text = '' then 'ไม่ได้กรอกโจทย์'
             when '' in (e.choice_a, e.choice_b, e.choice_c, e.choice_d) then 'ตัวเลือกไม่ครบ 4 ข้อ'
             when e.correct = '' then 'ไม่มีข้อถูก'
             when e.correct not in ('a', 'b', 'c', 'd') then 'ข้อถูกต้องเป็น ก ข ค หรือ ง'
             when (select count(distinct private.quiz_norm(t)) from unnest(array[e.choice_a, e.choice_b, e.choice_c, e.choice_d]) as t) < 4
               then 'ตัวเลือกซ้ำกัน'
             when e.year is not null and e.year not between 2400 and 2700 then 'ปีต้องเป็นปี พ.ศ. เช่น 2567'
             when e.ex_id is not null and e.ex_correct_text <> e.correct_text
               then 'มีข้อนี้ในคลังแล้ว แต่ข้อถูกไม่ตรงกับในคลัง'
             when e.first_row <> e.row_number and e.first_correct_text <> e.correct_text
               then 'ซ้ำกับแถวที่ ' || e.first_row || ' แต่ข้อถูกไม่ตรงกัน'
           end as err
    from e
  )
  select v.row_number, v.c_id, v.u_id, v.question_text, v.choice_a, v.choice_b, v.choice_c, v.choice_d,
         v.correct, v.explanation, v.year,
         (v.err is null and (v.ex_id is not null or v.first_row <> v.row_number)),
         case
           when v.err is not null then null
           when v.ex_id is not null then 'มีในคลังแล้ว'
           when v.first_row <> v.row_number then 'ซ้ำกับแถวที่ ' || v.first_row || ' ในไฟล์'
         end,
         v.err
  from v
  order by v.row_number;
$$;
revoke execute on function private.resolve_question_rows(jsonb) from public, anon, authenticated;

create function public.check_questions_import(p_rows jsonb)
returns table (row_number integer, status text, message text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_quiz() then
    raise exception 'ท่านไม่มีสิทธิ์จัดการคลังข้อสอบ' using errcode = '42501';
  end if;
  return query
    select r.row_number,
           case when r.error is not null then 'error' when r.skip then 'skip' else 'new' end,
           coalesce(r.error, r.note, '')
    from private.resolve_question_rows(p_rows) r;
end;
$$;

create function public.import_questions(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad record;
  v_count integer;
begin
  if not public.can_manage_quiz() then
    raise exception 'ท่านไม่มีสิทธิ์จัดการคลังข้อสอบ' using errcode = '42501';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 2,000 แถว' using errcode = '23514';
  end if;

  select r.row_number, r.error into v_bad
  from private.resolve_question_rows(p_rows) r
  where r.error is not null
  order by r.row_number
  limit 1;
  if found then
    raise exception 'แถวที่ %: %', v_bad.row_number, v_bad.error using errcode = '23514';
  end if;

  insert into public.questions (
    course_id, unit_id, question_text, choice_a, choice_b, choice_c, choice_d,
    correct_choice, explanation, source_year_be, difficulty, status
  )
  select r.course_id, r.unit_id, r.question_text, r.choice_a, r.choice_b, r.choice_c, r.choice_d,
         r.correct_choice, r.explanation, r.source_year_be, 'medium', 'draft'
  from private.resolve_question_rows(p_rows) r
  where not r.skip
  order by r.row_number;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.list_questions(text, uuid, uuid, integer, text, text, text, text, integer, integer) from public, anon;
revoke execute on function public.question_years() from public, anon;
revoke execute on function public.quiz_bank_summary() from public, anon;
revoke execute on function public.publish_draft_questions(text, uuid, uuid, integer, text) from public, anon;
revoke execute on function public.question_history(uuid) from public, anon;
revoke execute on function public.check_questions_import(jsonb) from public, anon;
revoke execute on function public.import_questions(jsonb) from public, anon;
grant execute on function public.list_questions(text, uuid, uuid, integer, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.question_years() to authenticated;
grant execute on function public.quiz_bank_summary() to authenticated;
grant execute on function public.publish_draft_questions(text, uuid, uuid, integer, text) to authenticated;
grant execute on function public.question_history(uuid) to authenticated;
grant execute on function public.check_questions_import(jsonb) to authenticated;
grant execute on function public.import_questions(jsonb) to authenticated;
