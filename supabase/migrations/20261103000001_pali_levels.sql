-- บทที่ 33: ข้อมูลอ้างอิงฝ่ายบาลี (เตรียมช่วงที่ 2)
-- 1) ตารางชั้นประโยคบาลี pali_levels: เปรียญธรรม (ป.ธ.) และบาลีศึกษา (บ.ศ.) อย่างละ 8 ชั้น
--    พร้อมกติกาคุณสมบัติที่ผู้สั่งงานกำหนด (เก็บเป็นข้อมูล ผู้ดูแลระบบแก้ได้ การตรวจผู้สมัครจริงทำในบทที่ 49)
--    - ชั้นบาลีที่ต้องสอบได้ก่อน: ป.ธ.3 ต้องได้ประโยค 1-2, ป.ธ.4 ต้องได้ ป.ธ.3 ... ถึง ป.ธ.9 (บ.ศ. เหมือนกัน)
--    - วุฒิแผนกธรรมขั้นต่ำ: ชั้น 1-2 และ 3 = ชั้นตรีขึ้นไป, ชั้น 4-6 = ชั้นโทขึ้นไป, ชั้น 7-9 = ชั้นเอกขึ้นไป
--      ป.ธ. ใช้นักธรรม, บ.ศ. ใช้ธรรมศึกษา (ได้ชั้นสูงกว่าถือว่าผ่าน)
-- 2) หัวข้อติดต่อ "สอบบาลี"

-- ---------------------------------------------------------------
-- 1) pali_levels
-- ---------------------------------------------------------------
create table public.pali_levels (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^(pt|bs)(12|[3-9])$'),
  track               text not null check (track in ('pt', 'bs')),
  name                text not null check (length(btrim(name)) between 1 and 60),
  sort_order          integer not null check (sort_order between 1 and 999),
  prerequisite_level  text references public.pali_levels (code) on delete restrict,
  dhamma_exam_type    text check (dhamma_exam_type in ('nak_tham', 'tham_sueksa')),
  dhamma_min_level    text check (dhamma_min_level in ('tri', 'tho', 'ek')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint pali_levels_track_code check (left(code, 2) = track),
  constraint pali_levels_dhamma_pair check ((dhamma_exam_type is null) = (dhamma_min_level is null)),
  constraint pali_levels_not_self check (prerequisite_level is distinct from code)
);
comment on table public.pali_levels is 'ชั้นประโยคบาลี (บทที่ 33): track pt = เปรียญธรรม, bs = บาลีศึกษา; prerequisite_level = ชั้นบาลีที่ต้องสอบได้ก่อน; dhamma_exam_type + dhamma_min_level = วุฒิแผนกธรรมขั้นต่ำ (ได้ชั้นสูงกว่าถือว่าผ่าน) ผู้ดูแลระบบแก้ได้ เพิ่มหรือลบไม่ได้';

insert into public.pali_levels (code, track, name, sort_order, dhamma_exam_type, dhamma_min_level) values
  ('pt12', 'pt', 'ประโยค 1-2', 10, 'nak_tham', 'tri'),
  ('pt3',  'pt', 'ป.ธ.3', 20, 'nak_tham', 'tri'),
  ('pt4',  'pt', 'ป.ธ.4', 30, 'nak_tham', 'tho'),
  ('pt5',  'pt', 'ป.ธ.5', 40, 'nak_tham', 'tho'),
  ('pt6',  'pt', 'ป.ธ.6', 50, 'nak_tham', 'tho'),
  ('pt7',  'pt', 'ป.ธ.7', 60, 'nak_tham', 'ek'),
  ('pt8',  'pt', 'ป.ธ.8', 70, 'nak_tham', 'ek'),
  ('pt9',  'pt', 'ป.ธ.9', 80, 'nak_tham', 'ek'),
  ('bs12', 'bs', 'บ.ศ.1-2', 110, 'tham_sueksa', 'tri'),
  ('bs3',  'bs', 'บ.ศ.3', 120, 'tham_sueksa', 'tri'),
  ('bs4',  'bs', 'บ.ศ.4', 130, 'tham_sueksa', 'tho'),
  ('bs5',  'bs', 'บ.ศ.5', 140, 'tham_sueksa', 'tho'),
  ('bs6',  'bs', 'บ.ศ.6', 150, 'tham_sueksa', 'tho'),
  ('bs7',  'bs', 'บ.ศ.7', 160, 'tham_sueksa', 'ek'),
  ('bs8',  'bs', 'บ.ศ.8', 170, 'tham_sueksa', 'ek'),
  ('bs9',  'bs', 'บ.ศ.9', 180, 'tham_sueksa', 'ek');

-- ชั้นบาลีที่ต้องสอบได้ก่อน = ชั้นก่อนหน้าในสายเดียวกัน (ประโยค 1-2 และ บ.ศ.1-2 ไม่มี)
update public.pali_levels l
set prerequisite_level = p.code
from public.pali_levels p
where p.track = l.track
  and l.code not in ('pt12', 'bs12')
  and p.code = case when l.code in ('pt3', 'bs3') then l.track || '12'
                    else l.track || (substring(l.code from 3)::int - 1)::text end;

-- กติกา: รหัสและสายแก้ไม่ได้; ชั้นก่อนหน้าต้องอยู่สายเดียวกัน ลำดับก่อน และไม่วนกลับ;
-- เปรียญธรรมใช้วุฒินักธรรม บาลีศึกษาใช้วุฒิธรรมศึกษา
create function public.pali_levels_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_prev public.pali_levels;
  v_seen text[] := array[new.code];
  v_next text;
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if tg_op = 'UPDATE' and (new.code <> old.code or new.track <> old.track) then
    raise exception 'แก้รหัสและสายของชั้นประโยคไม่ได้ แก้ได้เฉพาะชื่อ ลำดับ และคุณสมบัติ' using errcode = '23514';
  end if;
  if new.dhamma_exam_type is not null
     and new.dhamma_exam_type <> (case new.track when 'pt' then 'nak_tham' else 'tham_sueksa' end) then
    raise exception 'เปรียญธรรมต้องใช้วุฒินักธรรม และบาลีศึกษาต้องใช้วุฒิธรรมศึกษา' using errcode = '23514';
  end if;
  if new.prerequisite_level is not null then
    select * into v_prev from public.pali_levels where code = new.prerequisite_level;
    if v_prev.track <> new.track then
      raise exception 'ชั้นที่ต้องสอบได้ก่อนต้องอยู่สายเดียวกัน (เปรียญธรรม หรือ บาลีศึกษา)' using errcode = '23514';
    end if;
    -- ไล่ชั้นก่อนหน้าขึ้นไปเรื่อย ๆ ต้องไม่วนกลับมาที่ชั้นนี้
    v_next := new.prerequisite_level;
    while v_next is not null loop
      if v_next = any (v_seen) then
        raise exception 'ตั้งชั้นที่ต้องสอบได้ก่อนวนกันไม่ได้' using errcode = '23514';
      end if;
      v_seen := v_seen || v_next;
      select prerequisite_level into v_next from public.pali_levels where code = v_next;
    end loop;
  end if;
  return new;
end;
$$;
create trigger pali_levels_check before insert or update on public.pali_levels
  for each row execute function public.pali_levels_check();
create trigger pali_levels_set_updated_at before update on public.pali_levels
  for each row execute function public.set_updated_at();
create trigger pali_levels_audit after insert or update or delete on public.pali_levels
  for each row execute function public.audit_row_change();

-- ทุกคนอ่านได้ (หน้าสาธารณะใช้ชื่อชั้นในบทต่อไป) ผู้ดูแลระบบแก้ได้เฉพาะชื่อ ลำดับ และคุณสมบัติ ไม่มีเพิ่มหรือลบ
alter table public.pali_levels enable row level security;
create policy pali_levels_read on public.pali_levels for select to anon, authenticated using (true);
create policy pali_levels_admin_update on public.pali_levels for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.pali_levels from anon, authenticated;
grant select on public.pali_levels to anon, authenticated;
grant update (name, sort_order, prerequisite_level, dhamma_exam_type, dhamma_min_level) on public.pali_levels to authenticated;

-- ---------------------------------------------------------------
-- 2) หัวข้อติดต่อ สอบบาลี
-- ---------------------------------------------------------------
alter table public.contact_topics drop constraint contact_topics_key_check;
alter table public.contact_topics add constraint contact_topics_key_check
  check (key in ('registry', 'exams', 'results', 'requests', 'quiz', 'system', 'privacy', 'pilot', 'pali'));
insert into public.contact_topics (key, name, sort_order) values ('pali', 'สอบบาลี', 25);
