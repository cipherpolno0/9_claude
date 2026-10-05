-- บทที่ 14: ผลคะแนน ความคืบหน้า และสถิติของคลังข้อสอบ (ระบบที่ 3) ไม่มีตารางใหม่ มีแต่ฟังก์ชันอ่านจาก quiz_attempts
--   ผู้เรียน: quiz_unit_result, quiz_unit_weak_lessons (anon + ผู้ล็อกอิน เห็นเฉพาะของตน), quiz_my_progress (เฉพาะผู้ล็อกอิน)
--   ผู้จัดการคลังข้อสอบ: quiz_stats_totals, quiz_stats_courses, quiz_stats_questions (ตัวเลขรวม ไม่มีชื่อหรือรหัสของผู้เรียน)

insert into public.app_settings (key, value_int, description) values
  ('quiz_problem_correct_percent', 20, 'คลังข้อสอบ: ข้อที่มีผู้ตอบถูกน้อยกว่าร้อยละเท่านี้ ถือว่าอาจมีปัญหา'),
  ('quiz_stats_min_answers', 10, 'คลังข้อสอบ: สถิติรายข้อนับเฉพาะข้อที่ถูกใช้ในแบบทดสอบที่ส่งแล้วอย่างน้อยกี่ครั้ง');

-- แบบทดสอบก่อนเรียนที่ส่งแล้วครั้งล่าสุด และแบบทดสอบหลังเรียนที่ส่งแล้วครั้งล่าสุดของรอบนั้น ของผู้เรียก
create function private.quiz_unit_pair(p_unit uuid, p_device uuid)
returns table (pre_id uuid, post_id uuid)
language sql
stable
set search_path = public
as $$
  with mine as (
    select a.* from public.quiz_attempts a
    where a.unit_id = p_unit and a.submitted_at is not null
      and case when (select auth.uid()) is not null then a.user_id = (select auth.uid())
               else p_device is not null and a.device_id = p_device end
  ),
  pre as (select m.* from mine m where m.kind = 'pre' order by m.submitted_at desc limit 1)
  select pre.id,
         (select m.id from mine m where m.kind = 'post' and m.started_at >= pre.submitted_at
           order by m.submitted_at desc limit 1)
  from pre;
$$;
revoke execute on function private.quiz_unit_pair(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- สรุปผลของหน่วยสำหรับผู้เรียก: คะแนนก่อนเรียนเทียบหลังเรียน (ไม่มีแถว = ยังไม่เคยส่งแบบทดสอบก่อนเรียนของหน่วยนี้)
-- ---------------------------------------------------------------
create function public.quiz_unit_result(p_unit uuid, p_device uuid default null)
returns table (
  unit_id uuid, unit_name text, course_name text, level text, stage text, subject text,
  pre_id uuid, pre_score integer, pre_total integer, pre_submitted_at timestamptz,
  post_id uuid, post_score integer, post_total integer, post_submitted_at timestamptz,
  post_done_count integer, best_post_score integer, best_post_total integer
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.name, c.name, c.level, c.stage, c.subject,
         pre.id, pre.score, pre.total, pre.submitted_at,
         post.id, post.score, post.total, post.submitted_at,
         (select count(*)::integer from public.quiz_attempts a
           where a.unit_id = u.id and a.kind = 'post' and a.submitted_at is not null and a.started_at >= pre.submitted_at
             and a.user_id is not distinct from pre.user_id and a.device_id is not distinct from pre.device_id),
         best.score, best.total
  from public.units u
  join public.courses c on c.id = u.course_id and c.is_active
  join private.quiz_unit_pair(p_unit, p_device) pair on true
  join public.quiz_attempts pre on pre.id = pair.pre_id
  left join public.quiz_attempts post on post.id = pair.post_id
  left join lateral (
    select a.score, a.total from public.quiz_attempts a
    where a.unit_id = u.id and a.kind = 'post' and a.submitted_at is not null and a.started_at >= pre.submitted_at
      and a.user_id is not distinct from pre.user_id and a.device_id is not distinct from pre.device_id
    order by (a.score::numeric / nullif(a.total, 0)) desc nulls last, a.submitted_at desc
    limit 1
  ) best on true
  where u.id = p_unit and u.is_active;
$$;

-- ---------------------------------------------------------------
-- หัวข้อ (บทเรียน) ของหน่วยที่มีข้อสอบอยู่ในแบบทดสอบของผู้เรียก: จำนวนข้อและจำนวนที่ตอบผิด ก่อนเรียนและหลังเรียน
-- lesson_id ว่าง = ข้อที่ไม่ได้ผูกกับบทเรียน (หรือบทเรียนนั้นไม่ได้เผยแพร่แล้ว) ข้อที่ไม่ตอบนับเป็นตอบผิด
-- ---------------------------------------------------------------
create function public.quiz_unit_weak_lessons(p_unit uuid, p_device uuid default null)
returns table (
  lesson_id uuid, title text, sort_order integer,
  pre_asked integer, pre_wrong integer, post_asked integer, post_wrong integer
)
language sql
stable
security definer
set search_path = public
as $$
  with pair as (select * from private.quiz_unit_pair(p_unit, p_device)),
  answered as (
    select a.kind, l.id as lesson_id, l.title, l.sort_order,
           (a.answers ->> q.id::text is distinct from q.correct_choice) as wrong
    from pair
    join public.quiz_attempts a on a.id in (pair.pre_id, pair.post_id)
    cross join lateral unnest(a.question_ids) as x(question_id)
    join public.questions q on q.id = x.question_id
    left join public.lessons l on l.id = q.lesson_id and l.is_active and l.status = 'published'
  )
  select s.lesson_id, s.title, s.sort_order,
         (count(*) filter (where s.kind = 'pre'))::integer,
         (count(*) filter (where s.kind = 'pre' and s.wrong))::integer,
         (count(*) filter (where s.kind = 'post'))::integer,
         (count(*) filter (where s.kind = 'post' and s.wrong))::integer
  from answered s
  group by s.lesson_id, s.title, s.sort_order
  order by (s.lesson_id is null), s.sort_order, s.title;
$$;

-- ---------------------------------------------------------------
-- ความคืบหน้าของผู้ล็อกอินในทุกรายวิชาที่มีเนื้อหาให้เรียน หรือที่เคยทำแบบทดสอบ
--   unit_total = หน่วยที่มีข้อสอบเผยแพร่  unit_started = ส่งก่อนเรียนแล้ว  unit_done = ส่งหลังเรียนแล้ว
--   post_avg_percent = ค่าเฉลี่ยของคะแนนหลังเรียนครั้งล่าสุดของแต่ละหน่วย (ร้อยละ)
-- ---------------------------------------------------------------
create function public.quiz_my_progress()
returns table (
  course_id uuid, course_name text, level text, stage text, subject text, has_mcq boolean,
  unit_total integer, unit_started integer, unit_done integer, post_avg_percent integer,
  full_count integer, full_best_percent integer, last_activity timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select a.* from public.quiz_attempts a
    where a.user_id = (select auth.uid()) and a.submitted_at is not null
  ),
  last_post as (
    select distinct on (m.unit_id) m.course_id, m.unit_id, m.score, m.total
    from mine m where m.kind = 'post'
    order by m.unit_id, m.submitted_at desc
  ),
  per as (
    select c.id, c.name, c.level, c.stage, c.subject, c.has_mcq, c.sort_order,
           (select count(distinct p.unit_id)::integer from private.quiz_pool(c.id) p) as unit_total,
           (select count(distinct m.unit_id)::integer from mine m where m.course_id = c.id and m.kind = 'pre') as unit_started,
           (select count(*)::integer from last_post lp where lp.course_id = c.id) as unit_done,
           (select round(avg(lp.score * 100.0 / nullif(lp.total, 0)))::integer from last_post lp where lp.course_id = c.id) as post_avg,
           (select count(*)::integer from mine m where m.course_id = c.id and m.kind = 'full') as full_count,
           (select round(max(m.score * 100.0 / nullif(m.total, 0)))::integer from mine m where m.course_id = c.id and m.kind = 'full') as full_best,
           (select max(m.submitted_at) from mine m where m.course_id = c.id) as last_activity
    from public.courses c
    where c.is_active and (select auth.uid()) is not null
  )
  select per.id, per.name, per.level, per.stage, per.subject, per.has_mcq,
         per.unit_total, per.unit_started, per.unit_done, per.post_avg,
         per.full_count, per.full_best, per.last_activity
  from per
  where per.unit_total > 0 or per.last_activity is not null
  order by per.sort_order;
$$;

-- ---------------------------------------------------------------
-- สถิติของผู้จัดการคลังข้อสอบ (นับเฉพาะแบบทดสอบที่ส่งแล้ว ผู้ทำ = บัญชีหรือเครื่องที่ไม่ซ้ำกัน)
-- ---------------------------------------------------------------
create function public.quiz_stats_totals()
returns table (takers integer, signed_in_takers integer, device_takers integer, attempts integer, open_attempts integer)
language sql
stable
security definer
set search_path = public
as $$
  select (count(distinct coalesce(a.user_id, a.device_id)) filter (where a.submitted_at is not null))::integer,
         (count(distinct a.user_id) filter (where a.submitted_at is not null))::integer,
         (count(distinct a.device_id) filter (where a.submitted_at is not null))::integer,
         (count(*) filter (where a.submitted_at is not null))::integer,
         (count(*) filter (where a.submitted_at is null))::integer
  from public.quiz_attempts a
  where public.can_manage_quiz();
$$;

-- ต่อรายวิชา: จำนวนผู้ทำ จำนวนครั้งและคะแนนเฉลี่ย (ร้อยละ) ของก่อนเรียน หลังเรียน ทดสอบรวม
-- pair_* = เฉพาะผู้ที่ทำครบทั้งก่อนและหลังเรียนของหน่วยเดียวกัน (ก่อนเรียนครั้งล่าสุด เทียบหลังเรียนครั้งล่าสุดของรอบนั้น)
create function public.quiz_stats_courses()
returns table (
  course_id uuid, course_name text, level text, stage text, subject text,
  takers integer, pre_count integer, pre_avg numeric, post_count integer, post_avg numeric,
  pair_count integer, pair_pre_avg numeric, pair_post_avg numeric,
  full_count integer, full_avg numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with done as (
    select a.*, coalesce(a.user_id, a.device_id) as owner, a.score * 100.0 / nullif(a.total, 0) as pct
    from public.quiz_attempts a
    where a.submitted_at is not null and public.can_manage_quiz()
  ),
  last_pre as (
    select distinct on (d.owner, d.unit_id) d.course_id, d.owner, d.unit_id, d.pct, d.submitted_at
    from done d where d.kind = 'pre'
    order by d.owner, d.unit_id, d.submitted_at desc
  ),
  pairs as (
    select lp.course_id, lp.pct as pre_pct, po.pct as post_pct
    from last_pre lp
    join lateral (
      select d.pct from done d
      where d.kind = 'post' and d.owner = lp.owner and d.unit_id = lp.unit_id and d.started_at >= lp.submitted_at
      order by d.submitted_at desc limit 1
    ) po on true
  )
  select c.id, c.name, c.level, c.stage, c.subject,
         count(distinct d.owner)::integer,
         (count(*) filter (where d.kind = 'pre'))::integer, round(avg(d.pct) filter (where d.kind = 'pre'), 1),
         (count(*) filter (where d.kind = 'post'))::integer, round(avg(d.pct) filter (where d.kind = 'post'), 1),
         (select count(*)::integer from pairs p where p.course_id = c.id),
         (select round(avg(p.pre_pct), 1) from pairs p where p.course_id = c.id),
         (select round(avg(p.post_pct), 1) from pairs p where p.course_id = c.id),
         (count(*) filter (where d.kind = 'full'))::integer, round(avg(d.pct) filter (where d.kind = 'full'), 1)
  from done d
  join public.courses c on c.id = d.course_id
  group by c.id
  order by c.sort_order;
$$;

-- รายข้อ: จำนวนครั้งที่ถูกใช้ในแบบทดสอบที่ส่งแล้ว จำนวนที่ตอบถูก ร้อยละ และจำนวนที่เลือกแต่ละตัวเลือก (ไม่ตอบ = n_blank นับเป็นผิด)
-- เรียงจากร้อยละตอบถูกน้อยที่สุด  p_min_shown = นับเฉพาะข้อที่ถูกใช้อย่างน้อยเท่านี้ครั้ง  p_max_percent = เฉพาะข้อที่ตอบถูกน้อยกว่าร้อยละนี้
create function public.quiz_stats_questions(
  p_course uuid default null, p_min_shown integer default 1, p_max_percent numeric default null, p_limit integer default 20
)
returns table (
  question_id uuid, question_text text, course_name text, unit_name text, correct_choice text,
  status text, is_active boolean, shown integer, correct integer, correct_percent numeric,
  n_a integer, n_b integer, n_c integer, n_d integer, n_blank integer, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with used as (
    select x.question_id, a.answers ->> x.question_id::text as picked
    from public.quiz_attempts a
    cross join lateral unnest(a.question_ids) as x(question_id)
    where a.submitted_at is not null and public.can_manage_quiz()
      and (p_course is null or a.course_id = p_course)
  ),
  agg as (
    select u.question_id, count(*)::integer as shown,
           (count(*) filter (where u.picked = q.correct_choice))::integer as correct,
           (count(*) filter (where u.picked = 'a'))::integer as n_a,
           (count(*) filter (where u.picked = 'b'))::integer as n_b,
           (count(*) filter (where u.picked = 'c'))::integer as n_c,
           (count(*) filter (where u.picked = 'd'))::integer as n_d,
           (count(*) filter (where u.picked is null))::integer as n_blank
    from used u
    join public.questions q on q.id = u.question_id
    group by u.question_id
  )
  select q.id, q.question_text, c.name, un.name, q.correct_choice, q.status, q.is_active,
         g.shown, g.correct, round(g.correct * 100.0 / g.shown, 1),
         g.n_a, g.n_b, g.n_c, g.n_d, g.n_blank, count(*) over ()
  from agg g
  join public.questions q on q.id = g.question_id
  join public.courses c on c.id = q.course_id
  join public.units un on un.id = q.unit_id
  where g.shown >= greatest(coalesce(p_min_shown, 1), 1)
    and (p_max_percent is null or g.correct * 100.0 / g.shown < p_max_percent)
  order by g.correct * 1.0 / g.shown, g.shown desc, q.id
  limit greatest(1, least(coalesce(p_limit, 20), 500));
$$;

revoke execute on function public.quiz_unit_result(uuid, uuid) from public;
revoke execute on function public.quiz_unit_weak_lessons(uuid, uuid) from public;
revoke execute on function public.quiz_my_progress() from public, anon;
revoke execute on function public.quiz_stats_totals() from public, anon;
revoke execute on function public.quiz_stats_courses() from public, anon;
revoke execute on function public.quiz_stats_questions(uuid, integer, numeric, integer) from public, anon;
grant execute on function public.quiz_unit_result(uuid, uuid) to anon, authenticated;
grant execute on function public.quiz_unit_weak_lessons(uuid, uuid) to anon, authenticated;
grant execute on function public.quiz_my_progress() to authenticated;
grant execute on function public.quiz_stats_totals() to authenticated;
grant execute on function public.quiz_stats_courses() to authenticated;
grant execute on function public.quiz_stats_questions(uuid, integer, numeric, integer) to authenticated;
