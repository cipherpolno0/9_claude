-- บทที่ 32: ขึ้นใช้งานจริง
-- 1) บันทึกข้อผิดพลาดของระบบ (app_error_logs) + แจ้งผู้ดูแลระบบเมื่อมีข้อผิดพลาดจำนวนมาก + ตรวจสถานะฐานข้อมูล (health_ping)
-- 2) นำเข้าตำแหน่ง (appointments) และสนามสอบ (exam_venues) จาก Excel: ตรวจทั้งชุดก่อน ผิดแถวเดียวไม่บันทึก
-- 3) หัวข้อติดต่อ "ข้อเสนอแนะการนำร่อง" สำหรับเก็บความเห็นช่วงนำร่อง

-- ---------------------------------------------------------------
-- 1) บันทึกข้อผิดพลาด (ระบบเขียนเท่านั้น ไม่ผูก audit เพราะเป็นบันทึกอยู่แล้ว)
-- ---------------------------------------------------------------
create table public.app_error_logs (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  source       text not null check (source in ('server', 'client')),
  route_type   text not null default '' check (length(route_type) <= 40),
  path         text not null default '' check (length(path) <= 300),
  digest       text not null default '' check (length(digest) <= 100),
  message      text not null default '' check (length(message) <= 1000),
  environment  text not null default '' check (length(environment) <= 20),
  user_id      uuid references public.profiles (id)
);
comment on table public.app_error_logs is 'ข้อผิดพลาดของเว็บ (ฝั่งเซิร์ฟเวอร์จาก onRequestError และฝั่งเบราว์เซอร์จากหน้าแสดงข้อผิดพลาด) path ไม่มีส่วน ?query เพื่อไม่เก็บคำค้นหรือข้อมูลบุคคล อ่านได้เฉพาะผู้ดูแลระบบ';
create index app_error_logs_time_idx on public.app_error_logs (occurred_at desc);
alter table public.app_error_logs enable row level security;
create policy app_error_logs_read on public.app_error_logs for select to authenticated using (public.has_role('admin'));
revoke all on public.app_error_logs from anon;
revoke insert, update, delete, truncate on public.app_error_logs from authenticated;
grant select on public.app_error_logs to authenticated;

-- เวลาที่แจ้งเตือนครั้งล่าสุดต่อชนิด (กันแจ้งซ้ำ)
create table private.ops_alerts (
  kind          text primary key,
  last_sent_at  timestamptz not null
);
alter table private.ops_alerts enable row level security;

insert into public.app_settings (key, value_int, description) values
  ('ops_error_alert_threshold', 10, 'จำนวนข้อผิดพลาดของระบบใน 15 นาทีที่ทำให้แจ้งเตือนผู้ดูแลระบบ (แจ้งไม่เกินชั่วโมงละครั้ง)');

-- บันทึกหนึ่งรายการ (เรียกได้เฉพาะเซิร์ฟเวอร์ของเว็บ = service_role) จำกัด 200 รายการต่อนาทีทั้งระบบ กันตารางโตผิดปกติ
create function public.log_app_error(p_source text, p_route_type text, p_path text, p_digest text, p_message text,
                                     p_environment text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent integer;
  v_threshold integer;
  v_admin uuid;
begin
  if (select count(*) from public.app_error_logs where occurred_at > now() - interval '1 minute') >= 200 then
    return;
  end if;
  insert into public.app_error_logs (source, route_type, path, digest, message, environment, user_id)
  values (case when p_source = 'client' then 'client' else 'server' end,
          left(coalesce(p_route_type, ''), 40),
          left(split_part(coalesce(p_path, ''), '?', 1), 300),
          left(coalesce(p_digest, ''), 100),
          left(coalesce(p_message, ''), 1000),
          left(coalesce(p_environment, ''), 20),
          (select id from public.profiles where id = p_user));

  select coalesce((select value_int from public.app_settings where key = 'ops_error_alert_threshold'), 10) into v_threshold;
  select count(*) into v_recent from public.app_error_logs where occurred_at > now() - interval '15 minutes';
  if v_threshold > 0 and v_recent >= v_threshold
     and not exists (select 1 from private.ops_alerts a where a.kind = 'errors' and a.last_sent_at > now() - interval '1 hour') then
    insert into private.ops_alerts as a (kind, last_sent_at) values ('errors', now())
    on conflict (kind) do update set last_sent_at = excluded.last_sent_at;
    for v_admin in
      select distinct ur.user_id from public.user_roles ur join public.profiles p on p.id = ur.user_id
      where ur.role_key = 'admin' and p.status = 'active'
        and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
    loop
      perform public.notify_user(v_admin, 'ระบบพบข้อผิดพลาดจำนวนมาก',
        format('%s รายการใน 15 นาทีที่ผ่านมา กรุณาตรวจที่หน้า สถานะระบบ', v_recent), '/app/admin/system');
    end loop;
  end if;
end;
$$;

-- ตรวจว่าฐานข้อมูลตอบได้ (หน้า /api/health เรียกด้วยกุญแจสาธารณะ) ไม่คืนข้อมูลใดนอกจากเวลา
create function public.health_ping()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('ok', true, 'at', now());
$$;

-- ---------------------------------------------------------------
-- 2) นำเข้าตำแหน่งและสนามสอบ
-- ทำงานในนามผู้ใช้ (security invoker) จึงผ่าน RLS และ trigger กติกาเดิมทุกข้อ
-- p_commit = false: ลองบันทึกแล้วย้อนกลับ เพื่อแสดงผลตรวจรายแถว / true: บันทึกจริงเมื่อไม่มีแถวผิด
-- ---------------------------------------------------------------

-- หาบุคคลจากเลขประจำตัว (ถ้ามี) หรือ ชื่อ + ฉายา + นามสกุล เฉพาะบุคคลที่ผู้เรียกมีสิทธิ์ดู (คืนได้ไม่เกิน 2 รหัส ไม่คืนข้อมูลอื่น)
-- อยู่ใน schema public เพราะผู้ใช้ไม่มีสิทธิ์ใช้ schema private (ห้าม grant usage on schema private)
create function public.import_find_persons(p_national_id text, p_first_name text, p_monastic_name text, p_last_name text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.persons p
  where p.is_active
    and public.can_view_person(p.id)
    and case
      when nullif(regexp_replace(coalesce(p_national_id, ''), '[^0-9]', '', 'g'), '') is not null then
        p.national_id_hash = encode(extensions.hmac(
          convert_to(regexp_replace(p_national_id, '[^0-9]', '', 'g'), 'utf8'),
          convert_to(private.national_id_key(), 'utf8'), 'sha256'), 'hex')
      else
        p.first_name = btrim(coalesce(p_first_name, ''))
        and p.monastic_name = btrim(coalesce(p_monastic_name, ''))
        and p.last_name = btrim(coalesce(p_last_name, ''))
    end
  limit 2;
$$;
revoke all on function public.import_find_persons(text, text, text, text) from public, anon;
grant execute on function public.import_find_persons(text, text, text, text) to authenticated;

create function public.import_appointments(p_rows jsonb, p_commit boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  v_results jsonb := '[]'::jsonb;
  v_errors integer := 0;
  v_added integer := 0;
  v_people uuid[];
  v_pos text;
  v_unit uuid;
begin
  if not public.can_edit_any_personnel() then
    raise exception 'ท่านไม่มีสิทธิ์นำเข้าทะเบียนบุคคล' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'ไม่พบข้อมูลที่จะนำเข้า' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 2,000 แถว' using errcode = 'P0001';
  end if;

  begin
    for r in
      select * from jsonb_to_recordset(p_rows) as x(row_number integer, national_id text, first_name text, monastic_name text,
                                                     last_name text, position_name text, unit_code text, appointed_on date, order_no text)
    loop
      v_people := array(select public.import_find_persons(r.national_id, r.first_name, r.monastic_name, r.last_name));
      select t.key into v_pos from public.position_types t
        where t.is_active and (t.key = btrim(coalesce(r.position_name, '')) or t.name = btrim(coalesce(r.position_name, ''))) limit 1;
      select u.id into v_unit from public.org_units u where u.code = btrim(coalesce(r.unit_code, '')) and u.is_active;
      if cardinality(v_people) = 0 then
        v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'error',
          'message', 'ไม่พบบุคคลนี้ในทะเบียนที่ท่านดูได้ (นำเข้าบุคคลก่อน)');
        v_errors := v_errors + 1;
      elsif cardinality(v_people) > 1 then
        v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'error',
          'message', 'พบบุคคลชื่อนี้มากกว่า 1 คน กรุณากรอกเลขประจำตัวประชาชน');
        v_errors := v_errors + 1;
      elsif v_pos is null then
        v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'error', 'message', 'ไม่พบตำแหน่งนี้');
        v_errors := v_errors + 1;
      elsif v_unit is null then
        v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'error', 'message', 'ไม่พบรหัสเขตปกครองนี้');
        v_errors := v_errors + 1;
      elsif r.appointed_on is null then
        v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'error', 'message', 'กรุณากรอกวันแต่งตั้ง');
        v_errors := v_errors + 1;
      elsif exists (select 1 from public.appointments a
                    where a.person_id = v_people[1] and a.position_type_key = v_pos and a.org_unit_id = v_unit
                      and a.appointed_on = r.appointed_on and a.is_active) then
        v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'skip', 'message', 'มีวาระนี้อยู่แล้ว');
      else
        begin
          insert into public.appointments (person_id, position_type_key, org_unit_id, appointed_on, order_no)
          values (v_people[1], v_pos, v_unit, r.appointed_on, left(btrim(coalesce(r.order_no, '')), 200));
          v_added := v_added + 1;
          v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'new', 'message', '');
        exception when others then
          v_errors := v_errors + 1;
          v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'error', 'message', sqlerrm);
        end;
      end if;
    end loop;
    if not p_commit or v_errors > 0 then
      raise exception using errcode = 'P0002', message = 'import_rollback';
    end if;
  exception when sqlstate 'P0002' then
    v_added := 0;
  end;
  return jsonb_build_object('rows', v_results, 'errors', v_errors, 'added', v_added, 'committed', p_commit and v_errors = 0);
end;
$$;
revoke execute on function public.import_appointments(jsonb, boolean) from public, anon;
grant execute on function public.import_appointments(jsonb, boolean) to authenticated;

create function public.import_venues(p_rows jsonb, p_commit boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  v_results jsonb := '[]'::jsonb;
  v_errors integer := 0;
  v_added integer := 0;
  v_place record;
  v_old record;
begin
  if not public.can_edit_any_venues() then
    raise exception 'ท่านไม่มีสิทธิ์นำเข้าทะเบียนสนามสอบ' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'ไม่พบข้อมูลที่จะนำเข้า' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 2,000 แถว' using errcode = 'P0001';
  end if;

  begin
    for r in
      select * from jsonb_to_recordset(p_rows) as x(row_number integer, code text, name text, venue_type text, levels text[],
                                                     place_code text, capacity integer, start_year_be integer, note text)
    loop
      v_place := null;
      v_old := null;
      select p.id, p.org_unit_id into v_place from public.places p where p.code = btrim(coalesce(r.place_code, '')) and p.is_active;
      select v.id, v.name, v.place_id into v_old from public.exam_venues v where v.code = btrim(coalesce(r.code, ''));
      if v_place.id is null then
        v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'error',
          'message', 'ไม่พบรหัสสถานที่ตั้งนี้ในทะเบียนที่ท่านดูได้ (นำเข้าสถานที่ก่อน)');
        v_errors := v_errors + 1;
      elsif v_old.id is not null then
        if v_old.name = btrim(r.name) and v_old.place_id = v_place.id then
          v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'skip', 'message', 'มีสนามสอบนี้อยู่แล้ว');
        else
          v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'error',
            'message', 'รหัสสนามสอบนี้มีอยู่แล้วแต่ชื่อหรือสถานที่ตั้งไม่ตรงกัน');
          v_errors := v_errors + 1;
        end if;
      else
        begin
          insert into public.exam_venues (code, name, venue_type, levels, place_id, org_unit_id, capacity, start_year_be, note)
          values (btrim(r.code), btrim(r.name), r.venue_type, r.levels, v_place.id, v_place.org_unit_id, r.capacity,
                  r.start_year_be, left(btrim(coalesce(r.note, '')), 500));
          v_added := v_added + 1;
          v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'new', 'message', '');
        exception when others then
          v_errors := v_errors + 1;
          v_results := v_results || jsonb_build_object('row', r.row_number, 'status', 'error', 'message', sqlerrm);
        end;
      end if;
    end loop;
    if not p_commit or v_errors > 0 then
      raise exception using errcode = 'P0002', message = 'import_rollback';
    end if;
  exception when sqlstate 'P0002' then
    v_added := 0;
  end;
  return jsonb_build_object('rows', v_results, 'errors', v_errors, 'added', v_added, 'committed', p_commit and v_errors = 0);
end;
$$;
revoke execute on function public.import_venues(jsonb, boolean) from public, anon;
grant execute on function public.import_venues(jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------
-- 3) หัวข้อติดต่อสำหรับช่วงนำร่อง
-- ---------------------------------------------------------------
alter table public.contact_topics drop constraint contact_topics_key_check;
alter table public.contact_topics add constraint contact_topics_key_check
  check (key in ('registry', 'exams', 'results', 'requests', 'quiz', 'system', 'privacy', 'pilot'));
insert into public.contact_topics (key, name, sort_order) values ('pilot', 'ข้อเสนอแนะการนำร่อง', 80);

-- ---------------------------------------------------------------
-- 4) สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------
revoke execute on function public.log_app_error(text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.log_app_error(text, text, text, text, text, text, uuid) to service_role;
revoke execute on function public.health_ping() from public;
grant execute on function public.health_ping() to anon, authenticated, service_role;
