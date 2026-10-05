-- บทที่ 13 (2/3): ฟังก์ชันของเส้นทางเรียน (หน้าสาธารณะ /quiz) เรียกได้ทั้งผู้ที่ไม่ล็อกอิน (anon) และผู้ล็อกอิน
-- กติกาสำคัญ:
--   * ไม่มีฟังก์ชันใดคืนข้อถูกหรือคำอธิบายเฉลยก่อนส่งคำตอบ และแบบทดสอบก่อนเรียนไม่คืนเฉลยแม้ส่งแล้ว
--   * ลำดับ ก่อนเรียน > บทเรียน > หลังเรียน บังคับที่นี่ ไม่ได้พึ่งหน้าเว็บ
--   * เจ้าของ = auth.uid() ถ้าล็อกอิน มิฉะนั้นใช้รหัสอุปกรณ์ p_device (สุ่มโดยเว็บ เก็บในคุกกี้ที่สคริปต์อ่านไม่ได้)
--   * ผู้เรียนเห็นเฉพาะข้อสอบและบทเรียนที่เผยแพร่และยังใช้งาน

-- ข้อสอบที่ผู้เรียนใช้ได้
create function private.quiz_pool(p_course uuid)
returns table (id uuid, unit_id uuid)
language sql
stable
set search_path = public
as $$
  select q.id, q.unit_id
  from public.questions q
  join public.units u on u.id = q.unit_id and u.is_active
  join public.courses c on c.id = q.course_id and c.is_active and c.has_mcq
  where q.course_id = p_course and q.is_active and q.status = 'published';
$$;

-- สุ่มข้อสอบของหน่วย p_n ข้อ เลี่ยงข้อใน p_avoid ก่อน ถ้าไม่พอจึงใช้ซ้ำ
create function private.quiz_pick_unit(p_course uuid, p_unit uuid, p_n integer, p_avoid uuid[])
returns uuid[]
language sql
volatile
set search_path = public
as $$
  select coalesce(array_agg(s.id order by random()), '{}'::uuid[])
  from (
    select p.id, row_number() over (order by (p.id = any(coalesce(p_avoid, '{}'::uuid[]))), random()) as rn
    from private.quiz_pool(p_course) p
    where p.unit_id = p_unit
  ) s
  where s.rn <= greatest(p_n, 1);
$$;

-- สุ่มข้อสอบทั้งวิชา p_n ข้อ เวียนหยิบจากทุกหน่วยให้ทั่วก่อน
create function private.quiz_pick_course(p_course uuid, p_n integer)
returns uuid[]
language sql
volatile
set search_path = public
as $$
  select coalesce(array_agg(s.id order by random()), '{}'::uuid[])
  from (
    select r.id, row_number() over (order by r.per_unit, random()) as rn
    from (
      select p.id, row_number() over (partition by p.unit_id order by random()) as per_unit
      from private.quiz_pool(p_course) p
    ) r
  ) s
  where s.rn <= greatest(p_n, 1);
$$;

-- ตรวจและปิดการทำแบบทดสอบ (คิดคะแนนจากข้อถูกปัจจุบันของแต่ละข้อ)
create function private.quiz_finalize(p_attempt uuid)
returns void
language sql
volatile
set search_path = public
as $$
  update public.quiz_attempts a
     set score = (
           select count(*)::integer from public.questions q
           where q.id = any(a.question_ids) and a.answers ->> q.id::text = q.correct_choice
         ),
         submitted_at = least(now(), coalesce(a.expires_at, now())),
         duration_seconds = greatest(0, extract(epoch from least(now(), coalesce(a.expires_at, now())) - a.started_at)::integer)
   where a.id = p_attempt and a.submitted_at is null;
$$;

-- ผู้เรียกเป็นเจ้าของการทำแบบทดสอบนี้หรือไม่
create function private.quiz_owns(p_user uuid, p_device_of_row uuid, p_device uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select (p_user is not null and p_user = (select auth.uid()))
      or (p_user is null and p_device is not null and p_device_of_row = p_device);
$$;

revoke execute on function private.quiz_pool(uuid) from public, anon, authenticated;
revoke execute on function private.quiz_pick_unit(uuid, uuid, integer, uuid[]) from public, anon, authenticated;
revoke execute on function private.quiz_pick_course(uuid, integer) from public, anon, authenticated;
revoke execute on function private.quiz_finalize(uuid) from public, anon, authenticated;
revoke execute on function private.quiz_owns(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- รายการหน่วยของรายวิชา พร้อมความคืบหน้าของผู้เรียก (แสดงเฉพาะหน่วยที่มีบทเรียนหรือข้อสอบเผยแพร่แล้ว)
-- รายวิชาที่ยังไม่มีหน่วยให้เรียน ได้ 1 แถวที่ unit_id ว่าง
-- ---------------------------------------------------------------
create function public.quiz_course_units(p_level text, p_stage text, p_subject text, p_device uuid default null)
returns table (
  course_id uuid, course_name text, has_mcq boolean, question_total integer,
  unit_id uuid, unit_name text, unit_order integer, lesson_count integer, question_count integer,
  pre_done boolean, post_done boolean, last_post_score integer, last_post_total integer
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select c.* from public.courses c
    where c.level = p_level and c.stage = p_stage and c.subject = p_subject and c.is_active
  ),
  u as (
    select u.id, u.name, u.sort_order, u.course_id,
           (select count(*)::integer from public.lessons l where l.unit_id = u.id and l.is_active and l.status = 'published') as lesson_count,
           (select count(*)::integer from private.quiz_pool(u.course_id) p where p.unit_id = u.id) as question_count
    from public.units u
    join c on c.id = u.course_id
    where u.is_active
  ),
  mine as (
    select a.* from public.quiz_attempts a
    join c on c.id = a.course_id
    where a.submitted_at is not null
      and case when (select auth.uid()) is not null then a.user_id = (select auth.uid())
               else p_device is not null and a.device_id = p_device end
  )
  select c.id, c.name, c.has_mcq,
         (select count(*)::integer from private.quiz_pool(c.id)),
         v.id, v.name, v.sort_order, v.lesson_count, v.question_count,
         exists (select 1 from mine m where m.unit_id = v.id and m.kind = 'pre'),
         exists (select 1 from mine m where m.unit_id = v.id and m.kind = 'post'),
         lp.score, lp.total
  from c
  left join (select * from u where u.lesson_count > 0 or u.question_count > 0) v on true
  left join lateral (
    select m.score, m.total from mine m
    where m.unit_id = v.id and m.kind = 'post'
    order by m.submitted_at desc limit 1
  ) lp on true
  order by v.sort_order, v.name;
$$;

-- ---------------------------------------------------------------
-- สถานะของหน่วยสำหรับผู้เรียก: ขั้นก่อนเรียน บทเรียน หลังเรียน
-- รอบปัจจุบัน = แบบทดสอบก่อนเรียนครั้งล่าสุด และแบบทดสอบหลังเรียนที่เริ่มหลังส่งครั้งนั้น
-- ---------------------------------------------------------------
create function public.quiz_unit_state(p_unit uuid, p_device uuid default null)
returns table (
  unit_id uuid, unit_name text, course_id uuid, course_name text, level text, stage text, subject text, has_mcq boolean,
  question_count integer, lesson_count integer, per_quiz integer,
  pre_id uuid, pre_submitted boolean, pre_score integer, pre_total integer, pre_answered integer,
  lessons_opened boolean,
  post_id uuid, post_submitted boolean, post_score integer, post_total integer, post_answered integer,
  post_done_count integer, best_post_score integer
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select u.id as unit_id, u.name as unit_name, c.id as course_id, c.name as course_name,
           c.level, c.stage, c.subject, c.has_mcq
    from public.units u
    join public.courses c on c.id = u.course_id and c.is_active
    where u.id = p_unit and u.is_active
  ),
  mine as (
    select a.* from public.quiz_attempts a
    where a.unit_id = p_unit
      and case when (select auth.uid()) is not null then a.user_id = (select auth.uid())
               else p_device is not null and a.device_id = p_device end
  ),
  pre as (select m.* from mine m where m.kind = 'pre' order by m.started_at desc limit 1),
  posts as (
    select m.* from mine m
    where m.kind = 'post' and m.started_at >= (select p.submitted_at from pre p)
  ),
  post as (select p.* from posts p order by p.started_at desc limit 1)
  select b.unit_id, b.unit_name, b.course_id, b.course_name, b.level, b.stage, b.subject, b.has_mcq,
         (select count(*)::integer from private.quiz_pool(b.course_id) p where p.unit_id = b.unit_id),
         (select count(*)::integer from public.lessons l where l.unit_id = b.unit_id and l.is_active and l.status = 'published'),
         coalesce(public.setting_int('quiz_unit_question_count'), 10),
         pre.id, pre.submitted_at is not null, pre.score, pre.total,
         (select count(*)::integer from jsonb_object_keys(pre.answers)),
         pre.lessons_opened_at is not null,
         post.id, post.submitted_at is not null, post.score, post.total,
         (select count(*)::integer from jsonb_object_keys(post.answers)),
         (select count(*)::integer from posts p where p.submitted_at is not null),
         (select max(p.score) from posts p where p.submitted_at is not null)
  from base b
  left join pre on true
  left join post on true;
$$;

-- ---------------------------------------------------------------
-- บทเรียนของหน่วย: เปิดหลังส่งแบบทดสอบก่อนเรียน (หน่วยที่ไม่มีข้อสอบเปิดได้ทันที)
-- wrong_count = จำนวนข้อที่ตอบผิดหรือไม่ตอบในแบบทดสอบก่อนเรียนที่ผูกกับบทเรียนนั้น เรียงหัวข้อที่ตอบผิดไว้บนสุด
-- ยังไม่ถึงขั้นนี้ = ไม่คืนแถว (หน้าเว็บดูเหตุผลจาก quiz_unit_state)
-- ---------------------------------------------------------------
create function public.quiz_unit_lessons(p_unit uuid, p_device uuid default null)
returns table (id uuid, title text, blocks jsonb, sort_order integer, wrong_count integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_course uuid;
  v_questions integer;
  v_pre public.quiz_attempts%rowtype;
begin
  select u.course_id into v_course
  from public.units u join public.courses c on c.id = u.course_id and c.is_active
  where u.id = p_unit and u.is_active;
  if not found then return; end if;

  select count(*) into v_questions from private.quiz_pool(v_course) p where p.unit_id = p_unit;
  select a.* into v_pre from public.quiz_attempts a
  where a.unit_id = p_unit and a.kind = 'pre'
    and case when v_uid is not null then a.user_id = v_uid else p_device is not null and a.device_id = p_device end
  order by a.started_at desc limit 1;

  if v_questions > 0 and (v_pre.id is null or v_pre.submitted_at is null) then
    return;
  end if;
  if v_pre.id is not null and v_pre.submitted_at is not null and v_pre.lessons_opened_at is null then
    update public.quiz_attempts a set lessons_opened_at = now() where a.id = v_pre.id;
  end if;

  return query
    select s.id, s.title, s.blocks, s.sort_order, s.wrong
    from (
      select l.id, l.title, l.blocks, l.sort_order,
             (select count(*)::integer from public.questions q
               where v_pre.submitted_at is not null and q.id = any(v_pre.question_ids) and q.lesson_id = l.id
                 and v_pre.answers ->> q.id::text is distinct from q.correct_choice) as wrong
      from public.lessons l
      where l.unit_id = p_unit and l.is_active and l.status = 'published'
    ) s
    order by (s.wrong > 0) desc, s.sort_order, s.title;
end;
$$;

-- ---------------------------------------------------------------
-- เริ่ม (หรือกลับมาทำต่อ) แบบทดสอบ คืนรหัสการทำแบบทดสอบ
--   pre  : หน่วยละ 1 ชุดต่อรอบ ถ้ามีอยู่แล้วคืนชุดเดิม (p_restart = เริ่มรอบใหม่ ทำได้เมื่อชุดเดิมส่งแล้ว)
--   post : ต้องส่งก่อนเรียนแล้ว และเปิดบทเรียนแล้ว (ถ้าหน่วยมีบทเรียน) สุ่มชุดใหม่ทุกครั้ง เลี่ยงข้อของก่อนเรียน
--   full : ทดสอบรวมทั้งวิชา จับเวลา ถ้ามีชุดที่ยังไม่หมดเวลาคืนชุดเดิม
-- ---------------------------------------------------------------
create function public.quiz_start(
  p_kind text, p_course uuid, p_unit uuid default null, p_device uuid default null, p_restart boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_device uuid := case when auth.uid() is null then p_device end;
  v_course public.courses%rowtype;
  v_pre public.quiz_attempts%rowtype;
  v_open uuid;
  v_ids uuid[];
  v_id uuid;
  v_expires timestamptz;
begin
  if v_uid is null and v_device is null then
    raise exception 'ไม่พบรหัสอุปกรณ์ กรุณาเปิดหน้านี้ใหม่' using errcode = '23514';
  end if;
  if p_kind not in ('pre', 'post', 'full') then
    raise exception 'ชนิดแบบทดสอบไม่ถูกต้อง' using errcode = '23514';
  end if;

  if p_kind = 'full' then
    select * into v_course from public.courses c where c.id = p_course and c.is_active;
  else
    select c.* into v_course
    from public.units u join public.courses c on c.id = u.course_id and c.is_active
    where u.id = p_unit and u.is_active;
  end if;
  if v_course.id is null then
    raise exception 'ไม่พบรายวิชาหรือหน่วยการเรียนนี้' using errcode = '23503';
  end if;
  if not v_course.has_mcq then
    raise exception 'วิชากระทู้ธรรมเป็นข้อเขียน ไม่มีแบบทดสอบปรนัย' using errcode = '23514';
  end if;

  if p_kind = 'full' then
    -- ปิดชุดที่หมดเวลาแล้วแต่ยังไม่ได้ส่ง
    perform private.quiz_finalize(a.id) from public.quiz_attempts a
    where a.kind = 'full' and a.course_id = v_course.id and a.submitted_at is null and a.expires_at <= now()
      and case when v_uid is not null then a.user_id = v_uid else a.device_id = v_device end;
    select a.id into v_open from public.quiz_attempts a
    where a.kind = 'full' and a.course_id = v_course.id and a.submitted_at is null
      and case when v_uid is not null then a.user_id = v_uid else a.device_id = v_device end
    order by a.started_at desc limit 1;
    if v_open is not null then return v_open; end if;
    v_ids := private.quiz_pick_course(v_course.id, coalesce(public.setting_int('quiz_full_question_count'), 50));
    v_expires := now() + make_interval(mins => coalesce(public.setting_int('quiz_full_minutes'), 50));
  else
    select a.* into v_pre from public.quiz_attempts a
    where a.unit_id = p_unit and a.kind = 'pre'
      and case when v_uid is not null then a.user_id = v_uid else a.device_id = v_device end
    order by a.started_at desc limit 1;

    if p_kind = 'pre' then
      if v_pre.id is not null and (not coalesce(p_restart, false) or v_pre.submitted_at is null) then
        return v_pre.id;
      end if;
      v_ids := private.quiz_pick_unit(v_course.id, p_unit, coalesce(public.setting_int('quiz_unit_question_count'), 10), null);
    else
      if v_pre.id is null or v_pre.submitted_at is null then
        raise exception 'ต้องทำแบบทดสอบก่อนเรียนให้เสร็จก่อน' using errcode = '23514';
      end if;
      if v_pre.lessons_opened_at is null and exists (
        select 1 from public.lessons l where l.unit_id = p_unit and l.is_active and l.status = 'published'
      ) then
        raise exception 'ต้องเปิดอ่านบทเรียนก่อน จึงทำแบบทดสอบหลังเรียนได้' using errcode = '23514';
      end if;
      select a.id into v_open from public.quiz_attempts a
      where a.unit_id = p_unit and a.kind = 'post' and a.submitted_at is null and a.started_at >= v_pre.submitted_at
        and case when v_uid is not null then a.user_id = v_uid else a.device_id = v_device end
      order by a.started_at desc limit 1;
      if v_open is not null then return v_open; end if;
      v_ids := private.quiz_pick_unit(v_course.id, p_unit, coalesce(public.setting_int('quiz_unit_question_count'), 10), v_pre.question_ids);
    end if;
  end if;

  if cardinality(v_ids) = 0 then
    raise exception 'ยังไม่มีข้อสอบที่เผยแพร่สำหรับแบบทดสอบนี้' using errcode = '23514';
  end if;

  insert into public.quiz_attempts (user_id, device_id, course_id, unit_id, kind, question_ids, total, expires_at)
  values (v_uid, v_device, v_course.id, case when p_kind = 'full' then null else p_unit end, p_kind, v_ids, cardinality(v_ids), v_expires)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------
-- ข้อมูลของการทำแบบทดสอบ (ไม่ใช่เจ้าของ = ไม่คืนแถว) ชุดที่หมดเวลาแล้วจะถูกตรวจและปิดให้
-- ---------------------------------------------------------------
create function public.quiz_attempt(p_attempt uuid, p_device uuid default null)
returns table (
  id uuid, kind text, course_id uuid, course_name text, level text, stage text, subject text,
  unit_id uuid, unit_name text, total integer, answers jsonb, started_at timestamptz,
  submitted_at timestamptz, expires_at timestamptz, seconds_left integer, score integer, duration_seconds integer
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform private.quiz_finalize(a.id) from public.quiz_attempts a
  where a.id = p_attempt and a.submitted_at is null and a.expires_at <= now()
    and private.quiz_owns(a.user_id, a.device_id, p_device);

  return query
    select a.id, a.kind, a.course_id, c.name, c.level, c.stage, c.subject,
           a.unit_id, u.name, a.total, a.answers, a.started_at,
           a.submitted_at, a.expires_at,
           case when a.expires_at is not null and a.submitted_at is null
                then greatest(0, ceil(extract(epoch from a.expires_at - now())))::integer end,
           a.score, a.duration_seconds
    from public.quiz_attempts a
    join public.courses c on c.id = a.course_id
    left join public.units u on u.id = a.unit_id
    where a.id = p_attempt and private.quiz_owns(a.user_id, a.device_id, p_device);
end;
$$;

-- ---------------------------------------------------------------
-- โจทย์และตัวเลือกของการทำแบบทดสอบ ตามลำดับที่สุ่ม
-- correct_choice และ explanation คืนเฉพาะเมื่อส่งคำตอบแล้ว และเป็นแบบทดสอบหลังเรียนหรือทดสอบรวม
-- (แบบทดสอบก่อนเรียนยังไม่แสดงเฉลย) unit_name คืนเฉพาะผลของการทดสอบรวม
-- ---------------------------------------------------------------
create function public.quiz_attempt_questions(p_attempt uuid, p_device uuid default null)
returns table (
  "position" integer, question_id uuid, question_text text,
  choice_a text, choice_b text, choice_c text, choice_d text,
  unit_name text, correct_choice text, explanation text
)
language sql
stable
security definer
set search_path = public
as $$
  select o.ord::integer, q.id, q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
         case when a.submitted_at is not null and a.kind = 'full' then u.name end,
         case when a.submitted_at is not null and a.kind in ('post', 'full') then q.correct_choice end,
         case when a.submitted_at is not null and a.kind in ('post', 'full') then q.explanation end
  from public.quiz_attempts a
  cross join lateral unnest(a.question_ids) with ordinality as o(question_id, ord)
  join public.questions q on q.id = o.question_id
  join public.units u on u.id = q.unit_id
  where a.id = p_attempt and private.quiz_owns(a.user_id, a.device_id, p_device)
  order by o.ord;
$$;

-- บันทึกคำตอบของข้อเดียว (บันทึกอัตโนมัติ) p_choice ว่าง = ล้างคำตอบของข้อนั้น
create function public.quiz_save_answer(p_attempt uuid, p_question uuid, p_choice text, p_device uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
begin
  select a.* into v_attempt from public.quiz_attempts a
  where a.id = p_attempt and private.quiz_owns(a.user_id, a.device_id, p_device);
  if v_attempt.id is null then
    raise exception 'ไม่พบแบบทดสอบนี้' using errcode = '42501';
  end if;
  if v_attempt.submitted_at is not null then
    raise exception 'ส่งคำตอบแล้ว แก้คำตอบไม่ได้' using errcode = '23514';
  end if;
  if v_attempt.expires_at is not null and v_attempt.expires_at <= now() then
    raise exception 'หมดเวลาทำแบบทดสอบแล้ว' using errcode = '23514';
  end if;
  if not (p_question = any(v_attempt.question_ids)) then
    raise exception 'ข้อนี้ไม่ได้อยู่ในแบบทดสอบชุดนี้' using errcode = '23514';
  end if;
  if p_choice is not null and p_choice not in ('a', 'b', 'c', 'd') then
    raise exception 'ตัวเลือกไม่ถูกต้อง' using errcode = '23514';
  end if;
  update public.quiz_attempts a
     set answers = case when p_choice is null then a.answers - p_question::text
                        else a.answers || jsonb_build_object(p_question::text, p_choice) end
   where a.id = p_attempt;
end;
$$;

-- ส่งคำตอบ: ตรวจและปิดชุด คืนคะแนน (เรียกซ้ำได้ ได้ผลเดิม)
create function public.quiz_submit(p_attempt uuid, p_device uuid default null)
returns table (score integer, total integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.quiz_attempts a
    where a.id = p_attempt and private.quiz_owns(a.user_id, a.device_id, p_device)
  ) then
    raise exception 'ไม่พบแบบทดสอบนี้' using errcode = '42501';
  end if;
  perform private.quiz_finalize(p_attempt);
  return query select a.score, a.total from public.quiz_attempts a where a.id = p_attempt;
end;
$$;

-- การทดสอบรวมทั้งวิชาของผู้เรียก: ชุดที่ยังทำค้างอยู่ และผลครั้งล่าสุด
create function public.quiz_full_state(p_course uuid, p_device uuid default null)
returns table (
  question_total integer, per_quiz integer, minutes integer,
  open_id uuid, open_seconds_left integer, open_answered integer, open_total integer,
  last_id uuid, last_score integer, last_total integer, done_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select a.* from public.quiz_attempts a
    where a.course_id = p_course and a.kind = 'full'
      and case when (select auth.uid()) is not null then a.user_id = (select auth.uid())
               else p_device is not null and a.device_id = p_device end
  ),
  open as (
    select m.* from mine m where m.submitted_at is null and m.expires_at > now()
    order by m.started_at desc limit 1
  ),
  last as (select m.* from mine m where m.submitted_at is not null order by m.submitted_at desc limit 1)
  select (select count(*)::integer from private.quiz_pool(p_course)),
         coalesce(public.setting_int('quiz_full_question_count'), 50),
         coalesce(public.setting_int('quiz_full_minutes'), 50),
         open.id, greatest(0, ceil(extract(epoch from open.expires_at - now())))::integer,
         (select count(*)::integer from jsonb_object_keys(open.answers)), open.total,
         last.id, last.score, last.total,
         (select count(*)::integer from mine m where m.submitted_at is not null)
  from (select 1) one
  left join open on true
  left join last on true;
$$;

-- ประวัติการทำแบบทดสอบของผู้ล็อกอิน (เฉพาะที่ส่งคำตอบแล้ว)
create function public.quiz_my_history(p_limit integer default 100)
returns table (
  id uuid, kind text, course_name text, level text, stage text, subject text, unit_id uuid, unit_name text,
  score integer, total integer, submitted_at timestamptz, duration_seconds integer
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.kind, c.name, c.level, c.stage, c.subject, a.unit_id, u.name,
         a.score, a.total, a.submitted_at, a.duration_seconds
  from public.quiz_attempts a
  join public.courses c on c.id = a.course_id
  left join public.units u on u.id = a.unit_id
  where a.user_id = (select auth.uid()) and a.submitted_at is not null
  order by a.submitted_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.quiz_course_units(text, text, text, uuid) from public;
revoke execute on function public.quiz_unit_state(uuid, uuid) from public;
revoke execute on function public.quiz_unit_lessons(uuid, uuid) from public;
revoke execute on function public.quiz_start(text, uuid, uuid, uuid, boolean) from public;
revoke execute on function public.quiz_attempt(uuid, uuid) from public;
revoke execute on function public.quiz_attempt_questions(uuid, uuid) from public;
revoke execute on function public.quiz_save_answer(uuid, uuid, text, uuid) from public;
revoke execute on function public.quiz_submit(uuid, uuid) from public;
revoke execute on function public.quiz_full_state(uuid, uuid) from public;
revoke execute on function public.quiz_my_history(integer) from public, anon;
grant execute on function public.quiz_course_units(text, text, text, uuid) to anon, authenticated;
grant execute on function public.quiz_unit_state(uuid, uuid) to anon, authenticated;
grant execute on function public.quiz_unit_lessons(uuid, uuid) to anon, authenticated;
grant execute on function public.quiz_start(text, uuid, uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.quiz_attempt(uuid, uuid) to anon, authenticated;
grant execute on function public.quiz_attempt_questions(uuid, uuid) to anon, authenticated;
grant execute on function public.quiz_save_answer(uuid, uuid, text, uuid) to anon, authenticated;
grant execute on function public.quiz_submit(uuid, uuid) to anon, authenticated;
grant execute on function public.quiz_full_state(uuid, uuid) to anon, authenticated;
grant execute on function public.quiz_my_history(integer) to authenticated;
