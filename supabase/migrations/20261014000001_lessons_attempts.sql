-- บทที่ 13 (1/3): บทเรียน และบันทึกการทำแบบทดสอบ (ระบบที่ 3)
-- lessons: บทเรียนของหน่วย เนื้อหาเป็นชิ้นเรียงตามลำดับ (ข้อความ รูป วิดีโอ YouTube ไฟล์ PDF)
-- quiz_attempts: การทำแบบทดสอบหนึ่งครั้ง (ก่อนเรียน หลังเรียน ทดสอบรวมทั้งวิชา) ของผู้ใช้หรือของอุปกรณ์ที่ไม่ล็อกอิน

insert into public.app_settings (key, value_int, description) values
  ('quiz_unit_question_count', 10, 'คลังข้อสอบ: จำนวนข้อของแบบทดสอบก่อนเรียนและหลังเรียนต่อหน่วย'),
  ('quiz_full_question_count', 50, 'คลังข้อสอบ: จำนวนข้อของการทดสอบรวมทั้งวิชา'),
  ('quiz_full_minutes', 50, 'คลังข้อสอบ: เวลาของการทดสอบรวมทั้งวิชา (นาที)');

-- ---------------------------------------------------------------
-- 1) lessons
--    blocks = รายการชิ้นเนื้อหาตามลำดับ แต่ละชิ้นมี type:
--      text  {type, text}                  ข้อความ
--      image {type, path, caption}         รูป (path ในที่เก็บ lesson-media ขึ้นต้นด้วยรหัสบทเรียน)
--      video {type, video_id}              วิดีโอ YouTube (รหัสวิดีโอ 11 ตัว)
--      pdf   {type, path, title}           ไฟล์ PDF
--    status: draft ร่าง / published เผยแพร่ (ผู้เรียนเห็นเฉพาะที่เผยแพร่)
-- ---------------------------------------------------------------
create table public.lessons (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units (id),
  title         text not null check (length(btrim(title)) > 0),
  blocks        jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  sort_order    integer not null default 0,                              -- 0 = ให้ระบบต่อท้าย
  status        text not null default 'draft' check (status in ('draft', 'published')),
  published_at  timestamptz,
  is_active     boolean not null default true,                           -- ปิดใช้งานแทนการลบ
  created_by    uuid default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.lessons is 'บทเรียนของหน่วยการเรียน (หัวข้อ เนื้อหาเป็นชิ้น ลำดับ) แก้ไขได้เฉพาะผู้จัดการคลังข้อสอบ ผู้เรียนอ่านผ่านฟังก์ชัน quiz_unit_lessons';
create index lessons_unit_idx on public.lessons (unit_id, sort_order);

create trigger lessons_set_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();
create trigger lessons_audit after insert or update or delete on public.lessons
  for each row execute function public.audit_row_change();

create function public.lessons_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block jsonb;
  v_type text;
  v_path text;
begin
  new.title := btrim(regexp_replace(new.title, '\s+', ' ', 'g'));
  if tg_op = 'UPDATE' and new.unit_id <> old.unit_id then
    raise exception 'ย้ายบทเรียนไปหน่วยอื่นไม่ได้ ให้ปิดใช้งานแล้วเพิ่มใหม่' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.units u where u.id = new.unit_id and u.is_active) then
      raise exception 'ไม่พบหน่วยการเรียนที่เลือก หรือหน่วยนั้นปิดใช้งานแล้ว' using errcode = '23503';
    end if;
    if new.sort_order <= 0 then
      select coalesce(max(l.sort_order), 0) + 1 into new.sort_order from public.lessons l where l.unit_id = new.unit_id;
    end if;
  end if;
  if new.is_active and exists (
    select 1 from public.lessons l
    where l.id <> new.id and l.unit_id = new.unit_id and l.is_active and l.title = new.title
  ) then
    raise exception 'หน่วยนี้มีบทเรียนหัวข้อ "%" อยู่แล้ว', new.title using errcode = '23514';
  end if;

  if jsonb_typeof(new.blocks) <> 'array' then
    raise exception 'รูปแบบเนื้อหาของบทเรียนไม่ถูกต้อง' using errcode = '23514';
  end if;
  if jsonb_array_length(new.blocks) > 60 then
    raise exception 'บทเรียนหนึ่งหัวข้อมีเนื้อหาได้ไม่เกิน 60 ชิ้น' using errcode = '23514';
  end if;
  for v_block in select b.value from jsonb_array_elements(new.blocks) as b(value) loop
    v_type := v_block ->> 'type';
    v_path := coalesce(v_block ->> 'path', '');
    if v_type = 'text' then
      if length(btrim(coalesce(v_block ->> 'text', ''))) = 0 or length(v_block ->> 'text') > 20000 then
        raise exception 'ชิ้นข้อความต้องไม่ว่าง และยาวไม่เกิน 20,000 ตัวอักษร' using errcode = '23514';
      end if;
    elsif v_type = 'image' then
      if v_path !~ ('^' || new.id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
        raise exception 'รูปของบทเรียนไม่ถูกต้อง กรุณาอัปโหลดใหม่' using errcode = '23514';
      end if;
    elsif v_type = 'pdf' then
      if v_path !~ ('^' || new.id::text || '/[0-9a-f-]{36}\.pdf$') then
        raise exception 'ไฟล์ PDF ของบทเรียนไม่ถูกต้อง กรุณาอัปโหลดใหม่' using errcode = '23514';
      end if;
    elsif v_type = 'video' then
      if coalesce(v_block ->> 'video_id', '') !~ '^[A-Za-z0-9_-]{11}$' then
        raise exception 'ลิงก์วิดีโอ YouTube ไม่ถูกต้อง' using errcode = '23514';
      end if;
    else
      raise exception 'ชนิดของชิ้นเนื้อหาไม่ถูกต้อง' using errcode = '23514';
    end if;
  end loop;

  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := now();
  elsif new.status = 'draft' then
    new.published_at := null;
  elsif tg_op = 'UPDATE' then
    new.published_at := old.published_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.lessons_check() from public, anon, authenticated;
create trigger lessons_rules before insert or update on public.lessons
  for each row execute function public.lessons_check();

alter table public.lessons enable row level security;
create policy lessons_read on public.lessons for select to authenticated
  using (public.can_manage_quiz());
create policy lessons_insert on public.lessons for insert to authenticated
  with check (public.can_manage_quiz());
create policy lessons_update on public.lessons for update to authenticated
  using (public.can_manage_quiz()) with check (public.can_manage_quiz());
revoke all on public.lessons from anon, authenticated;
grant select, insert, update on public.lessons to authenticated;

-- ---------------------------------------------------------------
-- 2) ข้อสอบผูกกับบทเรียน (ไม่บังคับ): ใช้ยกหัวข้อที่ตอบผิดในแบบทดสอบก่อนเรียนไว้บนสุด
-- ---------------------------------------------------------------
alter table public.questions add column lesson_id uuid references public.lessons (id);
comment on column public.questions.lesson_id is 'บทเรียนที่เกี่ยวข้อง (ไม่บังคับ) ต้องอยู่ในหน่วยเดียวกับข้อสอบ';
create index questions_lesson_idx on public.questions (lesson_id);

-- กติกาของข้อสอบ (เพิ่ม: บทเรียนที่เกี่ยวข้องต้องอยู่ในหน่วยเดียวกัน)
create or replace function public.questions_check()
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

  if new.lesson_id is not null and not exists (
    select 1 from public.lessons l where l.id = new.lesson_id and l.unit_id = new.unit_id
  ) then
    raise exception 'บทเรียนที่เกี่ยวข้องต้องอยู่ในหน่วยเดียวกับข้อสอบ' using errcode = '23514';
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

-- ---------------------------------------------------------------
-- 3) quiz_attempts: การทำแบบทดสอบหนึ่งครั้ง
--    kind: pre ก่อนเรียน / post หลังเรียน / full ทดสอบรวมทั้งวิชา (unit_id ว่าง มีเวลาหมด expires_at)
--    เจ้าของ = user_id (ล็อกอิน) หรือ device_id (รหัสอุปกรณ์ในคุกกี้ของผู้ที่ไม่ล็อกอิน) อย่างใดอย่างหนึ่ง
--    answers = {"รหัสข้อสอบ": "a|b|c|d"}  score ว่างจนกว่าจะส่งคำตอบ
--    ตารางนี้เขียนผ่านฟังก์ชัน quiz_start / quiz_save_answer / quiz_submit เท่านั้น
-- ---------------------------------------------------------------
create table public.quiz_attempts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references public.profiles (id),
  device_id          uuid,
  course_id          uuid not null references public.courses (id),
  unit_id            uuid references public.units (id),
  kind               text not null check (kind in ('pre', 'post', 'full')),
  question_ids       uuid[] not null check (cardinality(question_ids) > 0),   -- ข้อที่สุ่ม ตามลำดับที่แสดง
  answers            jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  total              integer not null,
  score              integer,
  started_at         timestamptz not null default now(),
  expires_at         timestamptz,
  submitted_at       timestamptz,
  duration_seconds   integer,                                                  -- เวลาที่ใช้ (วินาที)
  lessons_opened_at  timestamptz,                                              -- ของแบบทดสอบก่อนเรียน: เวลาที่เปิดบทเรียนครั้งแรก
  constraint quiz_attempts_one_owner check ((user_id is null) <> (device_id is null)),
  constraint quiz_attempts_unit_by_kind check ((kind = 'full') = (unit_id is null))
);
comment on table public.quiz_attempts is 'การทำแบบทดสอบ (ก่อนเรียน หลังเรียน ทดสอบรวม) ของผู้ใช้หรือของอุปกรณ์ที่ไม่ล็อกอิน เขียนผ่านฟังก์ชัน quiz_... เท่านั้น';
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, unit_id, kind, started_at desc) where user_id is not null;
create index quiz_attempts_device_idx on public.quiz_attempts (device_id, unit_id, kind, started_at desc) where device_id is not null;
create index quiz_attempts_course_idx on public.quiz_attempts (course_id, kind);

-- บันทึกประวัติเฉพาะตอนเริ่มและตอนส่งคำตอบ (การบันทึกคำตอบอัตโนมัติทีละข้อไม่บันทึก เพื่อไม่ให้ audit_logs โตเกินจำเป็น)
create trigger quiz_attempts_audit after insert or update of submitted_at or delete on public.quiz_attempts
  for each row execute function public.audit_row_change();

-- RLS: ผู้ล็อกอินอ่านของตนเองได้ ผู้จัดการคลังข้อสอบอ่านได้ทั้งหมด ไม่มีสิทธิ์เขียนตรง
alter table public.quiz_attempts enable row level security;
create policy quiz_attempts_read on public.quiz_attempts for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_quiz());
revoke all on public.quiz_attempts from anon, authenticated;
grant select on public.quiz_attempts to authenticated;
