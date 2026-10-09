-- บทที่ 17 (1/2): รอบสมัครสอบ (exam_rounds) และแบบฟอร์มบัญชี ศ. (form_templates) ระบบที่ 9
--   แบบ ศ. ตั้งต้นอ่านจากไฟล์จริงของสำนักงานแม่กองธรรม (ไฟล์ที่สอง 20261018000002_form_templates_seed.sql)
--   รอบสมัครสอบ: ส่วนกลาง (central_staff) และผู้ดูแลระบบสร้าง เปิด ปิด
--   หน้าสมัครสอบ: ผู้ที่เห็นเมนู สมัครสอบและผลสอบ เลือกรอบ สำนักหรือสถานศึกษาในเขตของตน และสนามสอบ แล้วดาวน์โหลดแม่แบบ

-- ---------------------------------------------------------------
-- 1) ตัวช่วยสิทธิ์
-- ---------------------------------------------------------------
-- ผู้ใช้ปัจจุบันใช้เมนูพื้นที่ทำงานนี้ได้หรือไม่ (ตาราง role_menus ผู้ดูแลระบบใช้ได้ทุกเมนู) ตรงกับ allowedMenus ใน src/lib/auth/session.ts
create function private.has_menu(p_href text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin') or exists (
    select 1
    from public.my_role_rows() m
    join public.role_menus rm on rm.role_key = m.role_key and rm.menu_href = p_href and rm.enabled
    where m.effective
  );
$$;
revoke all on function private.has_menu(text) from public, anon, authenticated;

-- จัดการรอบสมัครสอบได้หรือไม่: ส่วนกลางและผู้ดูแลระบบ (ผู้สั่งงานกำหนด)
create function public.can_manage_exam_rounds()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin') or public.has_role('central_staff');
$$;
revoke execute on function public.can_manage_exam_rounds() from public, anon;
grant execute on function public.can_manage_exam_rounds() to authenticated;

-- วันที่วันนี้ตามเวลาประเทศไทย
create function private.today_bangkok()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Bangkok')::date;
$$;
revoke all on function private.today_bangkok() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 2) form_templates: แบบฟอร์มบัญชี ศ. (หนึ่งแถว = หนึ่งแฟ้ม = ประเภท + ชั้น)
--    header_cells: ช่องหัวแฟ้มแถว 4-5 [{cell, merge, text}] = ป้าย / [{cell, merge, field, min, max, help_title, help, error}] = ช่องกรอก
--      field: year_be, venue_code, venue_name, venue_subdistrict, venue_district, venue_province, region_no
--    columns: คอลัมน์ข้อมูล เรียงจากคอลัมน์ A [{key, label, top, top_span, bottom, type, required, width,
--      min, max, options, help_title, help, error_title, error, header_help_title, header_help, example}]
--      type: number เลขจำนวนเต็ม / year ปี พ.ศ. / date วันเดือนปี (ข้อความ เช่น 1/1/2540) / id เลขประจำตัว / text ข้อความ
--            list รายการให้เลือก (options) / title คำนำหน้าชื่อ (รายการจาก form_title_options ของประเภทนั้น)
--    layout: ความสูงแถว 1-8 สีและแบบอักษรของหัวแฟ้ม (ใช้ตอนสร้างไฟล์ Excel)
--    marker_code, marker_no, version: ค่าในแถว 1 (ตัวอักษรสีขาว) ของไฟล์จริง เช่น sor1 / 1 / 2568-v3 คงไว้ตามต้นฉบับ
-- ---------------------------------------------------------------
create table public.form_templates (
  id            uuid primary key default gen_random_uuid(),
  code          text not null check (length(btrim(code)) between 1 and 20),
  exam_type     text not null check (exam_type in ('nak_tham', 'tham_sueksa')),
  level         text not null check (level in ('tri', 'tho', 'ek')),
  sheet_name    text not null,
  marker_code   text not null default '' check (length(marker_code) <= 20),
  marker_no     integer check (marker_no between 0 and 999),
  version       text not null default '' check (length(version) <= 30),
  notice        text not null default '' check (length(notice) <= 500),
  title         text not null check (length(btrim(title)) between 1 and 200),
  header_cells  jsonb not null default '[]'::jsonb,
  columns       jsonb not null,
  layout        jsonb not null default '{}'::jsonb,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.form_templates is 'แบบฟอร์มบัญชี ศ. ของการสมัครสอบ (หัวแฟ้ม คอลัมน์ ชนิดข้อมูล บังคับกรอก กฎตรวจ) ใช้สร้างแม่แบบ Excel ผู้ดูแลระบบแก้ที่ /app/admin/form-templates';
create unique index form_templates_one_active on public.form_templates (exam_type, level) where is_active;

-- รายการคำนำหน้าชื่อของแม่แบบ แยกนักธรรมกับธรรมศึกษา (ผู้ดูแลระบบกรอกเอง เริ่มต้นว่าง: ผู้สั่งงานกำหนด)
create table public.form_title_options (
  id          uuid primary key default gen_random_uuid(),
  exam_type   text not null check (exam_type in ('nak_tham', 'tham_sueksa')),
  name        text not null check (length(btrim(name)) between 1 and 60 and name = btrim(name)),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint form_title_options_unique unique (exam_type, name)
);
comment on table public.form_title_options is 'คำนำหน้าชื่อที่ให้เลือกในแม่แบบ Excel ของบัญชี ศ. แยกตามประเภทการสอบ';

-- ตรวจโครงสร้างแบบฟอร์มก่อนบันทึก (ผิดข้อเดียวไม่บันทึก)
create function public.form_templates_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_col jsonb;
  v_cell jsonb;
  v_n integer;
  v_i integer := 0;
  v_keys text[] := '{}';
  v_key text;
  v_type text;
  v_span integer;
  v_fields text[] := '{}';
  v_label text;
begin
  new.code := btrim(new.code);
  new.title := btrim(new.title);
  new.sheet_name := btrim(new.sheet_name);
  new.version := btrim(new.version);
  new.marker_code := btrim(new.marker_code);
  if length(new.sheet_name) not between 1 and 31 or new.sheet_name ~ '[\[\]:*?/\\]' then
    raise exception 'ชื่อแผ่นงานต้องยาว 1-31 ตัวอักษร และห้ามมีเครื่องหมาย [ ] : * ? / \' using errcode = '23514';
  end if;

  if jsonb_typeof(new.columns) <> 'array' then
    raise exception 'รายการคอลัมน์ไม่ถูกต้อง' using errcode = '23514';
  end if;
  v_n := jsonb_array_length(new.columns);
  if v_n not between 1 and 40 then
    raise exception 'แบบฟอร์มต้องมีคอลัมน์ 1 ถึง 40 คอลัมน์' using errcode = '23514';
  end if;

  for v_col in select value from jsonb_array_elements(new.columns) loop
    v_i := v_i + 1;
    v_key := v_col ->> 'key';
    v_label := btrim(coalesce(v_col ->> 'label', ''));
    v_type := v_col ->> 'type';
    if v_key is null or v_key !~ '^[a-z][a-z0-9_]{0,39}$' then
      raise exception 'คอลัมน์ที่ %: รหัสคอลัมน์ต้องเป็นภาษาอังกฤษตัวเล็ก ตัวเลข หรือ _ ขึ้นต้นด้วยตัวอักษร', v_i using errcode = '23514';
    end if;
    if v_key = any (v_keys) then
      raise exception 'รหัสคอลัมน์ % ซ้ำกัน', v_key using errcode = '23514';
    end if;
    v_keys := v_keys || v_key;
    if v_label = '' or length(v_label) > 100 then
      raise exception 'คอลัมน์ที่ %: กรุณากรอกชื่อคอลัมน์ (ไม่เกิน 100 ตัวอักษร)', v_i using errcode = '23514';
    end if;
    -- หัวตาราง 2 บรรทัด (แถว 7 และ 8) ว่างได้บรรทัดเดียว เช่น คอลัมน์ใต้หัวรวมมีแต่บรรทัดล่าง
    if btrim(coalesce(v_col ->> 'top', '')) = '' and btrim(coalesce(v_col ->> 'bottom', '')) = '' then
      raise exception 'คอลัมน์ที่ % (%): ต้องมีหัวตารางอย่างน้อย 1 บรรทัด', v_i, v_label using errcode = '23514';
    end if;
    if length(coalesce(v_col ->> 'top', '')) > 200 or length(coalesce(v_col ->> 'bottom', '')) > 200 then
      raise exception 'คอลัมน์ที่ % (%): หัวตารางยาวเกิน 200 ตัวอักษร', v_i, v_label using errcode = '23514';
    end if;
    if v_type is null or v_type not in ('number', 'year', 'date', 'id', 'text', 'list', 'title') then
      raise exception 'คอลัมน์ที่ % (%): ชนิดข้อมูลไม่ถูกต้อง', v_i, v_label using errcode = '23514';
    end if;
    if jsonb_typeof(v_col -> 'required') is distinct from 'boolean' then
      raise exception 'คอลัมน์ที่ % (%): ต้องระบุว่าบังคับกรอกหรือไม่', v_i, v_label using errcode = '23514';
    end if;
    v_span := coalesce((v_col ->> 'top_span')::integer, 1);
    if v_span < 1 or v_i + v_span - 1 > v_n then
      raise exception 'คอลัมน์ที่ % (%): หัวรวมครอบคอลัมน์เกินจำนวนคอลัมน์ที่มี', v_i, v_label using errcode = '23514';
    end if;
    if jsonb_typeof(v_col -> 'width') is distinct from 'number' or (v_col ->> 'width')::numeric not between 3 and 80 then
      raise exception 'คอลัมน์ที่ % (%): ความกว้างต้องเป็นตัวเลข 3 ถึง 80', v_i, v_label using errcode = '23514';
    end if;
    if v_type in ('number', 'year') then
      if jsonb_typeof(v_col -> 'min') is distinct from 'number' or jsonb_typeof(v_col -> 'max') is distinct from 'number'
         or (v_col ->> 'min')::numeric <> trunc((v_col ->> 'min')::numeric)
         or (v_col ->> 'max')::numeric <> trunc((v_col ->> 'max')::numeric)
         or (v_col ->> 'min')::numeric > (v_col ->> 'max')::numeric
         or (v_col ->> 'max')::numeric > 1000000000 or (v_col ->> 'min')::numeric < 0 then
        raise exception 'คอลัมน์ที่ % (%): ค่าต่ำสุดและสูงสุดต้องเป็นเลขจำนวนเต็ม 0 ถึง 1,000,000,000 และต่ำสุดไม่เกินสูงสุด', v_i, v_label
          using errcode = '23514';
      end if;
    end if;
    if v_type = 'list' then
      if jsonb_typeof(v_col -> 'options') is distinct from 'array'
         or jsonb_array_length(v_col -> 'options') not between 1 and 50
         or exists (
           select 1 from jsonb_array_elements(v_col -> 'options') o
           where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '' or length(o #>> '{}') > 100
         )
         or (select count(distinct o #>> '{}') from jsonb_array_elements(v_col -> 'options') o) <> jsonb_array_length(v_col -> 'options') then
        raise exception 'คอลัมน์ที่ % (%): รายการให้เลือกต้องมี 1 ถึง 50 รายการ ไม่ว่าง ไม่ซ้ำ และยาวไม่เกิน 100 ตัวอักษร', v_i, v_label
          using errcode = '23514';
      end if;
    end if;
    -- ข้อจำกัดของ Excel: หัวข้อคำแนะนำไม่เกิน 32 ตัวอักษร ข้อความไม่เกิน 255 ตัวอักษร
    if length(coalesce(v_col ->> 'help_title', '')) > 32 or length(coalesce(v_col ->> 'error_title', '')) > 32
       or length(coalesce(v_col ->> 'header_help_title', '')) > 32 then
      raise exception 'คอลัมน์ที่ % (%): หัวข้อคำแนะนำหรือหัวข้อข้อความเตือนยาวเกิน 32 ตัวอักษร (ข้อจำกัดของ Excel)', v_i, v_label
        using errcode = '23514';
    end if;
    if length(coalesce(v_col ->> 'help', '')) > 255 or length(coalesce(v_col ->> 'error', '')) > 255
       or length(coalesce(v_col ->> 'header_help', '')) > 255 then
      raise exception 'คอลัมน์ที่ % (%): คำแนะนำหรือข้อความเตือนยาวเกิน 255 ตัวอักษร (ข้อจำกัดของ Excel)', v_i, v_label
        using errcode = '23514';
    end if;
    if length(coalesce(v_col ->> 'example', '')) > 200 then
      raise exception 'คอลัมน์ที่ % (%): ตัวอย่างยาวเกิน 200 ตัวอักษร', v_i, v_label using errcode = '23514';
    end if;
  end loop;

  if jsonb_typeof(new.header_cells) <> 'array' then
    raise exception 'หัวแฟ้มไม่ถูกต้อง' using errcode = '23514';
  end if;
  for v_cell in select value from jsonb_array_elements(new.header_cells) loop
    if coalesce(v_cell ->> 'cell', '') !~ '^[A-Z]{1,2}[2-6]$'
       or (v_cell ? 'merge' and v_cell ->> 'merge' is not null and v_cell ->> 'merge' !~ '^[A-Z]{1,2}[2-6]:[A-Z]{1,2}[2-6]$') then
      raise exception 'ตำแหน่งช่องของหัวแฟ้มไม่ถูกต้อง (ใช้ได้แถว 2 ถึง 6)' using errcode = '23514';
    end if;
    if v_cell ? 'field' then
      if v_cell ->> 'field' not in ('year_be', 'venue_code', 'venue_name', 'venue_subdistrict', 'venue_district', 'venue_province', 'region_no')
         or v_cell ->> 'field' = any (v_fields) then
        raise exception 'ช่องกรอกของหัวแฟ้มไม่ถูกต้องหรือซ้ำกัน' using errcode = '23514';
      end if;
      v_fields := v_fields || (v_cell ->> 'field');
    elsif length(coalesce(v_cell ->> 'text', '')) not between 1 and 200 then
      raise exception 'ป้ายของหัวแฟ้มต้องมีข้อความ 1 ถึง 200 ตัวอักษร' using errcode = '23514';
    end if;
  end loop;

  if jsonb_typeof(new.layout) <> 'object' then
    raise exception 'ค่าการจัดหน้าไม่ถูกต้อง' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.form_templates_check() from public, anon, authenticated;

create trigger form_templates_check before insert or update on public.form_templates
  for each row execute function public.form_templates_check();
create trigger form_templates_set_updated_at before update on public.form_templates
  for each row execute function public.set_updated_at();
create trigger form_templates_audit after insert or update or delete on public.form_templates
  for each row execute function public.audit_row_change();
create trigger form_title_options_set_updated_at before update on public.form_title_options
  for each row execute function public.set_updated_at();
create trigger form_title_options_audit after insert or update or delete on public.form_title_options
  for each row execute function public.audit_row_change();

alter table public.form_templates enable row level security;
alter table public.form_title_options enable row level security;
revoke all on public.form_templates, public.form_title_options from anon;
revoke delete, truncate on public.form_templates, public.form_title_options from authenticated;
create policy form_templates_read on public.form_templates for select to authenticated
  using (is_active or public.has_role('admin'));
create policy form_templates_admin_insert on public.form_templates for insert to authenticated
  with check (public.has_role('admin'));
create policy form_templates_admin_update on public.form_templates for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy form_title_options_read on public.form_title_options for select to authenticated
  using (is_active or public.has_role('admin'));
create policy form_title_options_admin_insert on public.form_title_options for insert to authenticated
  with check (public.has_role('admin'));
create policy form_title_options_admin_update on public.form_title_options for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---------------------------------------------------------------
-- 3) exam_rounds: รอบสมัครสอบ (ปีการศึกษา + ประเภท + ชั้น) มีรอบที่ใช้งานได้รอบเดียวต่อปี ประเภท ชั้น
--    status: draft ร่าง / open เปิดรับสมัคร / closed ปิดรับสมัคร
--    สมัครได้เมื่อ status = open และวันนี้อยู่ระหว่าง opens_on ถึง closes_on (เวลาประเทศไทย)
-- ---------------------------------------------------------------
create table public.exam_rounds (
  id                uuid primary key default gen_random_uuid(),
  academic_year_id  uuid not null references public.academic_years (id),
  exam_type         text not null check (exam_type in ('nak_tham', 'tham_sueksa')),
  level             text not null check (level in ('tri', 'tho', 'ek')),
  opens_on          date not null,                 -- วันเปิดรับสมัคร
  closes_on         date not null,                 -- วันปิดรับสมัคร
  exam_starts_on    date not null,                 -- วันสอบ (วันแรก)
  exam_ends_on      date,                          -- วันสอบวันสุดท้าย (ว่าง = สอบวันเดียว)
  status            text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  note              text not null default '' check (length(note) <= 500),
  is_active         boolean not null default true,
  created_by        uuid default auth.uid() references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint exam_rounds_registration_dates check (closes_on >= opens_on),
  constraint exam_rounds_exam_after_close check (exam_starts_on >= closes_on),
  constraint exam_rounds_exam_dates check (exam_ends_on is null or exam_ends_on >= exam_starts_on)
);
comment on table public.exam_rounds is 'รอบสมัครสอบ นักธรรม / ธรรมศึกษา ต่อปีการศึกษาและชั้น ส่วนกลางสร้าง เปิด ปิด ที่ /app/exams/rounds';
create unique index exam_rounds_one_active on public.exam_rounds (academic_year_id, exam_type, level) where is_active;

create function public.exam_rounds_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.note := btrim(new.note);
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'รอบใหม่ต้องเริ่มที่สถานะ ร่าง แล้วจึงเปิดรับสมัคร' using errcode = '23514';
    end if;
  else
    if old.status <> 'draft' and (new.academic_year_id <> old.academic_year_id or new.exam_type <> old.exam_type
                                  or new.level <> old.level) then
      raise exception 'รอบที่เคยเปิดรับสมัครแล้ว เปลี่ยนปีการศึกษา ประเภท หรือชั้นไม่ได้' using errcode = '23514';
    end if;
    if new.status <> old.status and not (
      (old.status = 'draft' and new.status = 'open')
      or (old.status = 'open' and new.status = 'closed')
      or (old.status = 'closed' and new.status = 'open')
    ) then
      raise exception 'เปลี่ยนสถานะจาก % เป็น % ไม่ได้', old.status, new.status using errcode = '23514';
    end if;
    if not new.is_active and old.is_active and old.status <> 'draft' then
      raise exception 'ยกเลิกได้เฉพาะรอบที่ยังเป็นร่าง รอบที่เคยเปิดแล้วให้ปิดรับสมัครแทน' using errcode = '23514';
    end if;
    if new.is_active and not old.is_active then
      raise exception 'รอบที่ยกเลิกแล้วนำกลับมาใช้ไม่ได้ ให้สร้างรอบใหม่' using errcode = '23514';
    end if;
  end if;
  if new.status = 'open' and not exists (
    select 1 from public.form_templates f where f.is_active and f.exam_type = new.exam_type and f.level = new.level
  ) then
    raise exception 'ยังไม่มีแบบฟอร์มบัญชี ศ. ที่ใช้งานอยู่สำหรับประเภทและชั้นนี้ จึงเปิดรับสมัครไม่ได้' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.exam_rounds_check() from public, anon, authenticated;

create trigger exam_rounds_check before insert or update on public.exam_rounds
  for each row execute function public.exam_rounds_check();
create trigger exam_rounds_set_updated_at before update on public.exam_rounds
  for each row execute function public.set_updated_at();
create trigger exam_rounds_audit after insert or update or delete on public.exam_rounds
  for each row execute function public.audit_row_change();

alter table public.exam_rounds enable row level security;
revoke all on public.exam_rounds from anon;
revoke delete, truncate on public.exam_rounds from authenticated;
create policy exam_rounds_read on public.exam_rounds for select to authenticated
  using (is_active or public.can_manage_exam_rounds());
create policy exam_rounds_manage_insert on public.exam_rounds for insert to authenticated
  with check (public.can_manage_exam_rounds());
create policy exam_rounds_manage_update on public.exam_rounds for update to authenticated
  using (public.can_manage_exam_rounds()) with check (public.can_manage_exam_rounds());

-- ---------------------------------------------------------------
-- 4) หน้าสมัครสอบ (/app/exams/register): ผู้ที่ใช้เมนู สมัครสอบและผลสอบ ได้
--    สำนักหรือสถานศึกษา = ทุกแห่งในเขตของตนและเขตใต้สังกัด (can_access) ที่ใช้งานอยู่และเปิดดำเนินการ (ผู้สั่งงานกำหนด)
--      นักธรรม = สำนักเรียน สำนักศาสนศึกษา / ธรรมศึกษา = สำนักเรียน สำนักศาสนศึกษา วัด สถานศึกษา องค์กร
--    สนามสอบ = สนามสอบที่เปิดอยู่ ประเภทเดียวกับรอบ และเปิดสอบชั้นของรอบ (ไม่คืนที่อยู่จัดส่งและเบอร์ติดต่อ)
-- ---------------------------------------------------------------
create function private.exam_place_types(p_exam_type text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_exam_type
    when 'nak_tham' then array['samnak_rian', 'samnak_sasanasuksa']
    when 'tham_sueksa' then array['samnak_rian', 'samnak_sasanasuksa', 'temple', 'school', 'organization']
    else array[]::text[] end;
$$;
revoke all on function private.exam_place_types(text) from public, anon, authenticated;

-- รอบที่สมัครได้วันนี้ (status open และอยู่ในช่วงวันรับสมัคร)
create function private.exam_round_accepting(p_round public.exam_rounds)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_round.is_active and p_round.status = 'open'
     and private.today_bangkok() between p_round.opens_on and p_round.closes_on;
$$;
revoke all on function private.exam_round_accepting(public.exam_rounds) from public, anon, authenticated;

create function public.exam_register_rounds()
returns table (
  id uuid, year_be integer, exam_type text, level text, opens_on date, closes_on date,
  exam_starts_on date, exam_ends_on date, status text, accepting boolean, form_code text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, y.year_be, r.exam_type, r.level, r.opens_on, r.closes_on, r.exam_starts_on, r.exam_ends_on, r.status,
         private.exam_round_accepting(r),
         (select f.code from public.form_templates f where f.is_active and f.exam_type = r.exam_type and f.level = r.level)
  from public.exam_rounds r
  join public.academic_years y on y.id = r.academic_year_id
  where private.has_menu('/app/exams') and r.is_active and r.status = 'open'
  order by y.year_be desc, r.exam_type, case r.level when 'tri' then 1 when 'tho' then 2 else 3 end;
$$;

create function public.exam_register_places(p_round uuid, p_q text default '', p_limit integer default 20)
returns table (
  id uuid, code text, name text, place_type text, temple_name text, org_unit_name text,
  subdistrict_name text, district_name text, province_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.code, p.name, p.place_type, t.name, u.name, sd.name, d.name, pv.name
  from public.exam_rounds r
  join public.places p on p.place_type = any (private.exam_place_types(r.exam_type))
  left join public.places t on t.id = p.parent_place_id
  join public.org_units u on u.id = p.org_unit_id
  left join public.civil_subdistricts sd on sd.code = p.subdistrict_code
  left join public.civil_districts d on d.code = p.district_code
  left join public.civil_provinces pv on pv.code = p.province_code
  where r.id = p_round and r.is_active
    and private.has_menu('/app/exams')
    and p.is_active and p.status = 'open'
    and public.can_access(p.org_unit_id)
    and (coalesce(btrim(p_q), '') = '' or p.name ilike '%' || btrim(p_q) || '%' or p.code ilike '%' || btrim(p_q) || '%')
  order by p.name, p.code
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

create function public.exam_register_venues(p_round uuid, p_q text default '', p_limit integer default 20)
returns table (
  id uuid, code text, name text, place_name text, org_unit_name text, district_name text, province_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.code, v.name, p.name, u.name, d.name, pv.name
  from public.exam_rounds r
  join public.exam_venues v on v.venue_type = r.exam_type and r.level = any (v.levels)
  join public.places p on p.id = v.place_id
  join public.org_units u on u.id = v.org_unit_id
  left join public.civil_districts d on d.code = p.district_code
  left join public.civil_provinces pv on pv.code = p.province_code
  where r.id = p_round and r.is_active
    and private.has_menu('/app/exams')
    and v.is_active and v.status = 'open'
    and (coalesce(btrim(p_q), '') = '' or v.name ilike '%' || btrim(p_q) || '%' or v.code ilike '%' || btrim(p_q) || '%'
         or p.name ilike '%' || btrim(p_q) || '%')
  order by v.name, v.code
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- ข้อมูลสำหรับสร้างแม่แบบที่เติมหัวแฟ้มแล้ว: ตรวจรอบ สำนัก สนามสอบ และแบบฟอร์มอีกครั้งที่ฐานข้อมูล
create function public.exam_template_context(p_round uuid, p_place uuid, p_venue uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_round public.exam_rounds%rowtype;
  v_year integer;
  v_place public.places%rowtype;
  v_venue public.exam_venues%rowtype;
  v_vplace public.places%rowtype;
  v_template uuid;
begin
  if not private.has_menu('/app/exams') then
    raise exception 'ท่านไม่มีสิทธิ์ใช้เมนู สมัครสอบและผลสอบ' using errcode = '42501';
  end if;
  select * into v_round from public.exam_rounds where id = p_round;
  if not found or not v_round.is_active or v_round.status <> 'open' then
    raise exception 'ไม่พบรอบสมัครสอบ หรือรอบนี้ไม่ได้เปิดรับสมัคร' using errcode = 'P0001';
  end if;
  if not private.exam_round_accepting(v_round) then
    raise exception 'ไม่อยู่ในช่วงวันรับสมัครของรอบนี้' using errcode = 'P0001';
  end if;
  select year_be into v_year from public.academic_years where id = v_round.academic_year_id;

  select * into v_place from public.places where id = p_place;
  if not found or not v_place.is_active or v_place.status <> 'open'
     or v_place.place_type <> all (private.exam_place_types(v_round.exam_type))
     or not public.can_access(v_place.org_unit_id) then
    raise exception 'กรุณาเลือกสำนักหรือสถานศึกษาในเขตของท่านจากรายการ' using errcode = 'P0001';
  end if;

  select * into v_venue from public.exam_venues where id = p_venue;
  if not found or not v_venue.is_active or v_venue.status <> 'open'
     or v_venue.venue_type <> v_round.exam_type or not (v_round.level = any (v_venue.levels)) then
    raise exception 'กรุณาเลือกสนามสอบที่เปิดอยู่และเปิดสอบชั้นนี้จากรายการ' using errcode = 'P0001';
  end if;
  select * into v_vplace from public.places where id = v_venue.place_id;

  select f.id into v_template from public.form_templates f
  where f.is_active and f.exam_type = v_round.exam_type and f.level = v_round.level;
  if v_template is null then
    raise exception 'ยังไม่มีแบบฟอร์มบัญชี ศ. ของประเภทและชั้นนี้' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'round_id', v_round.id, 'year_be', v_year, 'exam_type', v_round.exam_type, 'level', v_round.level,
    'template_id', v_template,
    'place', jsonb_build_object('id', v_place.id, 'code', v_place.code, 'name', v_place.name, 'place_type', v_place.place_type),
    'venue', jsonb_build_object(
      'id', v_venue.id, 'code', v_venue.code, 'name', v_venue.name,
      'subdistrict', (select s.name from public.civil_subdistricts s where s.code = v_vplace.subdistrict_code),
      'district', (select d.name from public.civil_districts d where d.code = v_vplace.district_code),
      'province', (select pv.name from public.civil_provinces pv where pv.code = v_vplace.province_code),
      'region_name', (select ur.region_name from private.unit_regions() ur where ur.unit_id = v_venue.org_unit_id)
    )
  );
end;
$$;

revoke execute on function public.exam_register_rounds() from public, anon;
revoke execute on function public.exam_register_places(uuid, text, integer) from public, anon;
revoke execute on function public.exam_register_venues(uuid, text, integer) from public, anon;
revoke execute on function public.exam_template_context(uuid, uuid, uuid) from public, anon;
grant execute on function public.exam_register_rounds() to authenticated;
grant execute on function public.exam_register_places(uuid, text, integer) to authenticated;
grant execute on function public.exam_register_venues(uuid, text, integer) to authenticated;
grant execute on function public.exam_template_context(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------
-- 5) หน้าสาธารณะ ดาวน์โหลด: แบบฟอร์มที่ใช้งานอยู่และรายการคำนำหน้า (ไม่มีข้อมูลบุคคล)
-- ---------------------------------------------------------------
create function public.public_form_templates()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'code', f.code, 'exam_type', f.exam_type, 'level', f.level, 'sheet_name', f.sheet_name,
        'marker_code', f.marker_code, 'marker_no', f.marker_no, 'version', f.version, 'notice', f.notice, 'title', f.title,
        'header_cells', f.header_cells, 'columns', f.columns, 'layout', f.layout, 'updated_at', f.updated_at
      ) order by f.sort_order, f.code)
      from public.form_templates f where f.is_active
    ), '[]'::jsonb),
    'titles', coalesce((
      select jsonb_agg(jsonb_build_object('exam_type', o.exam_type, 'name', o.name) order by o.exam_type, o.sort_order, o.name)
      from public.form_title_options o where o.is_active
    ), '[]'::jsonb)
  );
$$;
revoke execute on function public.public_form_templates() from public;
grant execute on function public.public_form_templates() to anon, authenticated;
