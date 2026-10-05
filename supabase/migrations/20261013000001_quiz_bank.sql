-- บทที่ 12 (1/2): คลังข้อสอบ (ระบบที่ 3) ตาราง courses, units, questions
-- ผู้จัดการคลังข้อสอบ = บทบาท quiz_manager และผู้ดูแลระบบ (ผู้สั่งงานกำหนด) บทบาทอื่นอ่านตารางชุดนี้ไม่ได้
-- เพราะตาราง questions มีข้อถูกและคำอธิบายเฉลย การทำแบบทดสอบของผู้เรียนจะเปิดผ่านฟังก์ชันเฉพาะในบทหลัง

-- ---------------------------------------------------------------
-- 1) สิทธิ์
-- ---------------------------------------------------------------
create function public.can_manage_quiz()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.my_role_rows() m
    where m.effective and m.role_key in ('quiz_manager', 'admin')
  );
$$;
comment on function public.can_manage_quiz() is 'จัดการคลังข้อสอบได้หรือไม่ (ผู้จัดการคลังข้อสอบ และผู้ดูแลระบบ)';
revoke execute on function public.can_manage_quiz() from public, anon;
grant execute on function public.can_manage_quiz() to authenticated;

insert into public.app_settings (key, value_int, description) values
  ('quiz_min_questions_per_unit', 20, 'คลังข้อสอบ: เตือนเมื่อหน่วยการเรียนมีข้อสอบที่เผยแพร่แล้วน้อยกว่ากี่ข้อ');

-- ---------------------------------------------------------------
-- 2) courses: รายวิชา = ชั้น x ช่วงชั้น x วิชา
--    level: tri ตรี / tho โท / ek เอก
--    stage: primary ประถมศึกษา / secondary มัธยมศึกษา / higher อุดมศึกษาและประชาชนทั่วไป
--    subject: dhamma ธรรม / buddha พุทธ / vinaya วินัย / kratu กระทู้ธรรม (ข้อเขียน ไม่มีข้อสอบปรนัย)
-- ---------------------------------------------------------------
create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code = btrim(code) and length(code) > 0),
  name        text not null check (length(btrim(name)) > 0),
  level       text not null check (level in ('tri', 'tho', 'ek')),
  stage       text not null check (stage in ('primary', 'secondary', 'higher')),
  subject     text not null check (subject in ('dhamma', 'buddha', 'vinaya', 'kratu')),
  has_mcq     boolean generated always as (subject <> 'kratu') stored,   -- กระทู้ธรรมเป็นข้อเขียน
  sort_order  integer not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (level, stage, subject),
  unique (name)
);
comment on table public.courses is 'รายวิชาธรรมศึกษา: ชั้น x ช่วงชั้น x วิชา (27 รายวิชาปรนัย + 9 รายวิชากระทู้ธรรมซึ่งไม่มีข้อสอบปรนัย)';

create trigger courses_set_updated_at before update on public.courses
  for each row execute function public.set_updated_at();
create trigger courses_audit after insert or update or delete on public.courses
  for each row execute function public.audit_row_change();

insert into public.courses (code, name, level, stage, subject, sort_order)
select l.code || '-' || s.code || '-' || j.code,
       'ธรรมศึกษาชั้น' || l.code || ' ' || s.name || ' วิชา' || j.name,
       l.key, s.key, j.key,
       l.n * 100 + s.n * 10 + j.n
from (values ('tri', 'ตรี', 1), ('tho', 'โท', 2), ('ek', 'เอก', 3)) as l(key, code, n)
cross join (values
  ('primary', 'ประถม', 'ประถมศึกษา', 1),
  ('secondary', 'มัธยม', 'มัธยมศึกษา', 2),
  ('higher', 'อุดม', 'อุดมศึกษาและประชาชนทั่วไป', 3)) as s(key, code, name, n)
cross join (values
  ('dhamma', 'ธรรม', 'ธรรม', 1),
  ('buddha', 'พุทธ', 'พุทธ', 2),
  ('vinaya', 'วินัย', 'วินัย', 3),
  ('kratu', 'กระทู้', 'กระทู้ธรรม', 4)) as j(key, code, name, n);

-- แก้ได้เฉพาะชื่อที่แสดง (ชั้น ช่วงชั้น วิชา และรหัส เป็นโครงสร้างตายตัว)
create function public.courses_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if new.code <> old.code or new.level <> old.level or new.stage <> old.stage or new.subject <> old.subject then
    raise exception 'แก้รหัส ชั้น ช่วงชั้น และวิชาของรายวิชาไม่ได้ แก้ได้เฉพาะชื่อที่แสดง' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.courses_check() from public, anon, authenticated;
create trigger courses_rules before update on public.courses
  for each row execute function public.courses_check();

alter table public.courses enable row level security;
create policy courses_read on public.courses for select to authenticated
  using (public.can_manage_quiz());
create policy courses_update on public.courses for update to authenticated
  using (public.can_manage_quiz()) with check (public.can_manage_quiz());
revoke all on public.courses from anon, authenticated;
grant select on public.courses to authenticated;
grant update (name) on public.courses to authenticated;

-- ---------------------------------------------------------------
-- 3) units: หน่วยการเรียนในแต่ละรายวิชา
-- ---------------------------------------------------------------
create table public.units (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id),
  name        text not null check (length(btrim(name)) > 0),
  sort_order  integer not null default 0,                               -- 0 = ให้ระบบต่อท้าย
  is_active   boolean not null default true,                            -- ปิดใช้งานแทนการลบ
  created_by  uuid default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.units is 'หน่วยการเรียนของรายวิชา (ชื่อหน่วย ลำดับ)';
create index units_course_idx on public.units (course_id, sort_order);
create unique index units_course_name_key on public.units (course_id, name) where is_active;

create trigger units_set_updated_at before update on public.units
  for each row execute function public.set_updated_at();
create trigger units_audit after insert or update or delete on public.units
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------
-- 4) questions: ข้อสอบปรนัย 4 ตัวเลือก
--    correct_choice: a ก / b ข / c ค / d ง
--    difficulty: easy ง่าย / medium ปานกลาง / hard ยาก
--    status: draft ร่าง / published เผยแพร่
-- ---------------------------------------------------------------
create table public.questions (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.courses (id),
  unit_id         uuid not null references public.units (id),
  question_text   text not null check (length(btrim(question_text)) > 0),
  choice_a        text not null check (length(btrim(choice_a)) > 0),
  choice_b        text not null check (length(btrim(choice_b)) > 0),
  choice_c        text not null check (length(btrim(choice_c)) > 0),
  choice_d        text not null check (length(btrim(choice_d)) > 0),
  correct_choice  text not null check (correct_choice in ('a', 'b', 'c', 'd')),
  explanation     text not null default '',                              -- คำอธิบายเฉลย
  source_year_be  integer check (source_year_be between 2400 and 2700),  -- ที่มา: ปี พ.ศ. ของข้อสอบสนามหลวง
  difficulty      text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  status          text not null default 'draft' check (status in ('draft', 'published')),
  published_at    timestamptz,
  published_by    uuid references public.profiles (id),
  dup_key         text not null default '',                              -- ระบบคำนวณ ใช้ตรวจข้อซ้ำ
  is_active       boolean not null default true,                         -- ปิดใช้งานแทนการลบ
  created_by      uuid default auth.uid() references public.profiles (id),
  created_at      timestamptz not null default clock_timestamp(),        -- เวลาจริงรายแถว: ข้อที่นำเข้าชุดเดียวกันเรียงตามลำดับในไฟล์
  updated_at      timestamptz not null default now()
);
comment on table public.questions is 'คลังข้อสอบปรนัย มีข้อถูกและคำอธิบายเฉลย อ่านได้เฉพาะผู้จัดการคลังข้อสอบ';
create index questions_course_unit_idx on public.questions (course_id, unit_id);
create index questions_unit_status_idx on public.questions (unit_id, status) where is_active;
create index questions_year_idx on public.questions (source_year_be);
create index questions_created_idx on public.questions (created_at desc);
-- ข้อซ้ำ = รายวิชาเดียวกัน โจทย์เดียวกัน และตัวเลือกชุดเดียวกัน (ไม่สนลำดับตัวเลือก) นับเฉพาะข้อที่ยังใช้งาน
create unique index questions_dup_key on public.questions (course_id, dup_key) where is_active;

create trigger questions_set_updated_at before update on public.questions
  for each row execute function public.set_updated_at();
create trigger questions_audit after insert or update or delete on public.questions
  for each row execute function public.audit_row_change();

-- ข้อความที่ใช้เทียบข้อซ้ำ: ไม่สนช่องว่างทุกชนิด (ภาษาไทยเว้นวรรคไม่แน่นอน) และไม่สนตัวพิมพ์เล็กใหญ่
create function private.quiz_norm(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(coalesce(p_text, ''), '\s+', '', 'g'));
$$;

create function private.question_dup_key(p_question text, p_a text, p_b text, p_c text, p_d text)
returns text
language sql
immutable
set search_path = public
as $$
  select md5(
    private.quiz_norm(p_question) || chr(31) ||
    (select string_agg(c.v, chr(31) order by c.v collate "C")
     from (select private.quiz_norm(x) as v from unnest(array[p_a, p_b, p_c, p_d]) as x) c)
  );
$$;
revoke execute on function private.quiz_norm(text) from public, anon, authenticated;
revoke execute on function private.question_dup_key(text, text, text, text, text) from public, anon, authenticated;

-- กติกาของหน่วยการเรียน
create function public.units_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if tg_op = 'UPDATE' and new.course_id <> old.course_id then
    raise exception 'ย้ายหน่วยการเรียนไปรายวิชาอื่นไม่ได้ ให้ปิดใช้งานแล้วเพิ่มใหม่' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.courses c where c.id = new.course_id and c.is_active) then
      raise exception 'ไม่พบรายวิชาที่เลือก' using errcode = '23503';
    end if;
    if new.sort_order <= 0 then
      select coalesce(max(u.sort_order), 0) + 1 into new.sort_order from public.units u where u.course_id = new.course_id;
    end if;
  end if;
  if new.is_active and exists (
    select 1 from public.units u
    where u.id <> new.id and u.course_id = new.course_id and u.is_active and u.name = new.name
  ) then
    raise exception 'รายวิชานี้มีหน่วยชื่อ "%" อยู่แล้ว', new.name using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.is_active and not new.is_active and exists (
    select 1 from public.questions q where q.unit_id = new.id and q.is_active
  ) then
    raise exception 'หน่วยนี้ยังมีข้อสอบที่ใช้งานอยู่ ให้ย้ายหรือปิดใช้งานข้อสอบก่อน' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.units_check() from public, anon, authenticated;
create trigger units_rules before insert or update on public.units
  for each row execute function public.units_check();

-- กติกาของข้อสอบ
create function public.questions_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.courses%rowtype;
  v_unit public.units%rowtype;
begin
  new.question_text := btrim(new.question_text);
  new.choice_a := btrim(new.choice_a);
  new.choice_b := btrim(new.choice_b);
  new.choice_c := btrim(new.choice_c);
  new.choice_d := btrim(new.choice_d);
  new.explanation := btrim(new.explanation);

  select * into v_course from public.courses where id = new.course_id;
  if not found or not v_course.is_active then
    raise exception 'ไม่พบรายวิชาที่เลือก' using errcode = '23503';
  end if;
  if not v_course.has_mcq then
    raise exception 'วิชากระทู้ธรรมเป็นข้อเขียน ไม่มีข้อสอบปรนัย' using errcode = '23514';
  end if;

  select * into v_unit from public.units where id = new.unit_id;
  if not found or v_unit.course_id <> new.course_id then
    raise exception 'หน่วยการเรียนที่เลือกไม่ได้อยู่ในรายวิชานี้' using errcode = '23514';
  end if;
  if not v_unit.is_active and new.is_active
     and (tg_op = 'INSERT' or new.unit_id <> old.unit_id or not old.is_active) then
    raise exception 'หน่วยการเรียนที่เลือกปิดใช้งานแล้ว' using errcode = '23514';
  end if;

  if (select count(distinct private.quiz_norm(x)) from unnest(array[new.choice_a, new.choice_b, new.choice_c, new.choice_d]) as x) < 4 then
    raise exception 'ตัวเลือกทั้ง 4 ข้อต้องไม่ซ้ำกัน' using errcode = '23514';
  end if;

  new.dup_key := private.question_dup_key(new.question_text, new.choice_a, new.choice_b, new.choice_c, new.choice_d);
  if new.is_active and exists (
    select 1 from public.questions q
    where q.id <> new.id and q.is_active and q.course_id = new.course_id and q.dup_key = new.dup_key
  ) then
    raise exception 'มีข้อสอบข้อนี้ (โจทย์และตัวเลือกเดียวกัน) ในรายวิชานี้อยู่แล้ว' using errcode = '23514';
  end if;

  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := now();
    new.published_by := auth.uid();
  elsif new.status = 'draft' then
    new.published_at := null;
    new.published_by := null;
  elsif tg_op = 'UPDATE' then
    new.published_at := old.published_at;
    new.published_by := old.published_by;
  end if;
  return new;
end;
$$;
revoke execute on function public.questions_check() from public, anon, authenticated;
create trigger questions_rules before insert or update on public.questions
  for each row execute function public.questions_check();

-- RLS: เฉพาะผู้จัดการคลังข้อสอบ ไม่มีการลบ
alter table public.units enable row level security;
create policy units_read on public.units for select to authenticated
  using (public.can_manage_quiz());
create policy units_insert on public.units for insert to authenticated
  with check (public.can_manage_quiz());
create policy units_update on public.units for update to authenticated
  using (public.can_manage_quiz()) with check (public.can_manage_quiz());
revoke all on public.units from anon, authenticated;
grant select, insert, update on public.units to authenticated;

alter table public.questions enable row level security;
create policy questions_read on public.questions for select to authenticated
  using (public.can_manage_quiz());
create policy questions_insert on public.questions for insert to authenticated
  with check (public.can_manage_quiz());
create policy questions_update on public.questions for update to authenticated
  using (public.can_manage_quiz()) with check (public.can_manage_quiz());
revoke all on public.questions from anon, authenticated;
grant select, insert, update on public.questions to authenticated;
