-- บทที่ 3 (3/4): ทบทวนสิทธิ์ประจำปี และการระงับบัญชีอัตโนมัติ

create table public.access_review_rounds (
  id          uuid primary key default gen_random_uuid(),
  year_be     integer not null unique check (year_be between 2400 and 2700),
  opened_at   timestamptz not null default now(),
  due_on      date not null,                -- วันสุดท้ายที่ยืนยันได้
  closed_at   timestamptz,
  opened_by   uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.access_review_rounds is 'รอบทบทวนสิทธิ์ผู้ใช้ประจำปี';

create table public.access_review_decisions (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references public.access_review_rounds (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  decision    text not null check (decision in ('keep', 'suspend')),
  decided_by  uuid references public.profiles (id),
  decided_at  timestamptz not null default now(),
  unique (round_id, user_id)
);
comment on table public.access_review_decisions is 'ผลยืนยันบัญชีในรอบทบทวน: keep คงไว้ / suspend ระงับ';

create trigger access_review_rounds_set_updated_at before update on public.access_review_rounds
  for each row execute function public.set_updated_at();
create trigger access_review_rounds_audit after insert or update or delete on public.access_review_rounds
  for each row execute function public.audit_row_change();
create trigger access_review_decisions_audit after insert or update or delete on public.access_review_decisions
  for each row execute function public.audit_row_change();

alter table public.access_review_rounds enable row level security;
alter table public.access_review_decisions enable row level security;
revoke all on public.access_review_rounds, public.access_review_decisions from anon;
revoke insert, update, delete on public.access_review_rounds, public.access_review_decisions from authenticated;
create policy access_review_rounds_read on public.access_review_rounds for select to authenticated using (true);
create policy access_review_decisions_read on public.access_review_decisions for select to authenticated
  using (user_id = auth.uid() or public.can_review_user(user_id));

-- บัญชีที่อยู่ในขอบเขตของรอบทบทวน: บัญชีที่ใช้งานอยู่และมีมาก่อนเปิดรอบ ยกเว้นผู้ดูแลระบบ
-- (ผู้ดูแลระบบไม่ถูกระงับอัตโนมัติ เพื่อไม่ให้ระบบไม่มีผู้ดูแลเหลืออยู่)
create function public.in_review_scope(p_user_id uuid, p_opened_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.status = 'active'
      and coalesce(p.activated_at, p.created_at) <= p_opened_at
  ) and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user_id and ur.role_key = 'admin'
      and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
  );
$$;
revoke execute on function public.in_review_scope(uuid, timestamptz) from public, anon, authenticated;

-- เปิดรอบทบทวน (ผู้ดูแลระบบ)
create function public.open_access_review(p_year_be integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_role('admin') then
    raise exception 'เฉพาะผู้ดูแลระบบ' using errcode = '42501';
  end if;
  if exists (select 1 from public.access_review_rounds where closed_at is null) then
    raise exception 'ยังมีรอบทบทวนที่เปิดอยู่ ต้องรอให้ครบกำหนดก่อน' using errcode = 'P0001';
  end if;
  insert into public.access_review_rounds (year_be, due_on, opened_by)
  values (p_year_be, current_date + public.setting_int('access_review_grace_days'), auth.uid())
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'ปี พ.ศ. นี้เคยเปิดรอบทบทวนแล้ว' using errcode = 'P0001';
end;
$$;

-- รายชื่อบัญชีที่ผู้ใช้ปัจจุบันต้องยืนยันในรอบนี้
create function public.access_review_list(p_round_id uuid)
returns table (
  user_id uuid, full_name text, email text, roles_text text,
  last_seen_at timestamptz, decision text, decided_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         btrim(concat_ws(' ', nullif(p.title_prefix, ''), p.first_name, nullif(p.monastic_name, ''), nullif(p.last_name, ''))),
         p.email,
         (select string_agg(r.name || coalesce(' · ' || u.name, ''), ', ' order by r.sort_order)
            from public.user_roles ur
            join public.roles r on r.key = ur.role_key
            left join public.org_units u on u.id = ur.org_unit_id
           where ur.user_id = p.id
             and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)),
         p.last_seen_at, d.decision, d.decided_at
  from public.access_review_rounds rd
  join public.profiles p on p.id <> auth.uid()
  left join public.access_review_decisions d on d.round_id = rd.id and d.user_id = p.id
  where rd.id = p_round_id
    and public.can_review_user(p.id)
    and (d.user_id is not null or public.in_review_scope(p.id, rd.opened_at))
  order by 2;
$$;

-- บันทึกผลยืนยัน: keep คงไว้ / suspend ระงับทันที
create function public.decide_access_review(p_round_id uuid, p_user_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.access_review_rounds%rowtype;
begin
  select * into v_round from public.access_review_rounds where id = p_round_id;
  if not found or v_round.closed_at is not null or v_round.due_on < current_date then
    raise exception 'รอบทบทวนนี้ปิดแล้ว' using errcode = 'P0001';
  end if;
  if p_decision not in ('keep', 'suspend') then
    raise exception 'ผลยืนยันไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() or not public.can_review_user(p_user_id) then
    raise exception 'ท่านไม่มีสิทธิ์ยืนยันบัญชีนี้' using errcode = '42501';
  end if;

  insert into public.access_review_decisions (round_id, user_id, decision, decided_by)
  values (p_round_id, p_user_id, p_decision, auth.uid())
  on conflict (round_id, user_id)
  do update set decision = excluded.decision, decided_by = excluded.decided_by, decided_at = now();

  if p_decision = 'suspend' then
    update public.profiles
    set status = 'suspended',
        status_reason = 'ระงับในการทบทวนสิทธิ์ประจำปี พ.ศ. ' || v_round.year_be
    where id = p_user_id and status = 'active';
  end if;
end;
$$;

-- ใช้กฎระงับอัตโนมัติกับบัญชีหนึ่งบัญชี คืนเหตุผลถ้าถูกระงับ
create function public.apply_suspension_rules(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_round public.access_review_rounds%rowtype;
  v_days integer := public.setting_int('inactive_suspend_days');
  v_reason text;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found or v_profile.status <> 'active' then
    return null;
  end if;

  -- 1) ไม่เข้าใช้เกินกำหนด (นับจากเวลาเข้าใช้ล่าสุด หรือเวลาที่เปิดใช้บัญชี)
  if greatest(coalesce(v_profile.last_seen_at, '-infinity'), coalesce(v_profile.activated_at, v_profile.created_at))
       < now() - make_interval(days => v_days) then
    v_reason := 'ไม่ได้เข้าใช้งานเกิน ' || v_days || ' วัน';
  end if;

  -- 2) ไม่ได้รับการยืนยันในรอบทบทวนล่าสุดที่ครบกำหนดแล้ว
  if v_reason is null then
    select * into v_round from public.access_review_rounds
    where due_on < current_date order by opened_at desc limit 1;
    if found
       and public.in_review_scope(p_user_id, v_round.opened_at)
       and not exists (
         select 1 from public.access_review_decisions d
         where d.round_id = v_round.id and d.user_id = p_user_id and d.decision = 'keep'
       ) then
      v_reason := 'ไม่ได้รับการยืนยันในการทบทวนสิทธิ์ประจำปี พ.ศ. ' || v_round.year_be;
    end if;
  end if;

  -- ไม่ระงับผู้ดูแลระบบคนสุดท้ายที่ยังใช้งานอยู่ เพื่อไม่ให้ระบบไม่มีผู้ดูแล
  if v_reason is not null
     and exists (
       select 1 from public.user_roles ur
       where ur.user_id = p_user_id and ur.role_key = 'admin'
         and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
     )
     and not exists (
       select 1 from public.user_roles ur
       join public.profiles p on p.id = ur.user_id
       where ur.role_key = 'admin' and ur.user_id <> p_user_id and p.status = 'active'
         and ur.starts_on <= current_date and (ur.ends_on is null or ur.ends_on >= current_date)
     ) then
    return null;
  end if;

  if v_reason is not null then
    update public.profiles set status = 'suspended', status_reason = v_reason where id = p_user_id;
  end if;
  return v_reason;
end;
$$;
revoke execute on function public.apply_suspension_rules(uuid) from public, anon, authenticated;

-- เรียกทุกครั้งที่ผู้ใช้เข้าพื้นที่ทำงาน: ตรวจกฎระงับ แล้วบันทึกเวลาเข้าใช้ล่าสุด
create function public.enforce_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    return null;
  end if;
  v_reason := public.apply_suspension_rules(auth.uid());

  update public.profiles
  set last_seen_at = now()
  where id = auth.uid() and status = 'active'
    and (last_seen_at is null or last_seen_at < now() - interval '1 hour');

  select * into v_profile from public.profiles where id = auth.uid();
  return jsonb_build_object(
    'status', v_profile.status,
    'status_reason', v_profile.status_reason,
    'just_suspended', v_reason is not null
  );
end;
$$;

-- งานประจำ (ผู้ดูแลระบบ): ระงับบัญชีที่เข้าเกณฑ์ทั้งหมด และปิดรอบทบทวนที่ครบกำหนด
create function public.run_account_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_suspended integer := 0;
  v_closed integer := 0;
begin
  if not public.has_role('admin') then
    raise exception 'เฉพาะผู้ดูแลระบบ' using errcode = '42501';
  end if;

  for v_user in select id from public.profiles where status = 'active' and id <> auth.uid() loop
    if public.apply_suspension_rules(v_user) is not null then
      v_suspended := v_suspended + 1;
    end if;
  end loop;

  update public.access_review_rounds set closed_at = now()
  where closed_at is null and due_on < current_date;
  get diagnostics v_closed = row_count;

  return jsonb_build_object('suspended', v_suspended, 'rounds_closed', v_closed);
end;
$$;

revoke execute on function public.open_access_review(integer) from public, anon;
revoke execute on function public.access_review_list(uuid) from public, anon;
revoke execute on function public.decide_access_review(uuid, uuid, text) from public, anon;
revoke execute on function public.enforce_my_account() from public, anon;
revoke execute on function public.run_account_maintenance() from public, anon;
grant execute on function public.open_access_review(integer) to authenticated;
grant execute on function public.access_review_list(uuid) to authenticated;
grant execute on function public.decide_access_review(uuid, uuid, text) to authenticated;
grant execute on function public.enforce_my_account() to authenticated;
grant execute on function public.run_account_maintenance() to authenticated;
