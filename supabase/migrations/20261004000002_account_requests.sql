-- บทที่ 3 (2/4): คำขอบัญชีผู้ใช้ การอนุมัติ และการระงับบัญชี

create table public.account_requests (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null default 'new' check (kind in ('new', 'reactivate')),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  position_text       text not null default '',          -- ตำแหน่งที่ผู้ขอกรอก
  requested_role_key  text references public.roles (key),
  org_unit_id         uuid references public.org_units (id),  -- สังกัด
  letter_path         text,                               -- ที่เก็บไฟล์หนังสือรับรอง
  note                text not null default '',
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by          uuid references public.profiles (id),
  decided_at          timestamptz,
  decision_note       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.account_requests is 'คำขอบัญชีผู้ใช้ใหม่ และคำขอเปิดใช้บัญชีที่ถูกระงับ';
create unique index account_requests_one_pending on public.account_requests (user_id) where status = 'pending';
create index account_requests_status_idx on public.account_requests (status, created_at);

create trigger account_requests_set_updated_at before update on public.account_requests
  for each row execute function public.set_updated_at();
create trigger account_requests_audit after insert or update or delete on public.account_requests
  for each row execute function public.audit_row_change();

alter table public.account_requests enable row level security;
revoke all on public.account_requests from anon;
revoke insert, update, delete on public.account_requests from authenticated;
create policy account_requests_read on public.account_requests for select to authenticated
  using (user_id = auth.uid() or public.can_manage_accounts_of(org_unit_id) or public.can_review_user(user_id));

-- ผู้พิจารณาเห็นข้อมูลของผู้ยื่นคำขอที่ยังไม่มีบทบาท
create policy profiles_read_requesters on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.account_requests ar
      where ar.user_id = profiles.id and public.can_manage_accounts_of(ar.org_unit_id)
    )
  );

-- ---------------------------------------------------------------
-- อนุมัติคำขอ
-- ---------------------------------------------------------------
create function public.approve_account_request(
  p_request_id uuid,
  p_role_key text default null,
  p_org_unit_id uuid default null,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.account_requests%rowtype;
  v_role public.roles%rowtype;
  v_org uuid := p_org_unit_id;
begin
  select * into v_req from public.account_requests where id = p_request_id for update;
  if not found or v_req.status <> 'pending' then
    raise exception 'ไม่พบคำขอ หรือคำขอนี้ถูกพิจารณาไปแล้ว' using errcode = 'P0001';
  end if;
  if v_req.user_id = auth.uid() then
    raise exception 'พิจารณาคำขอของตนเองไม่ได้' using errcode = 'P0001';
  end if;

  if v_req.kind = 'new' then
    select * into v_role from public.roles where key = p_role_key;
    if not found then
      raise exception 'กรุณาเลือกบทบาท' using errcode = 'P0001';
    end if;
    if v_role.requires_org_unit and v_org is null then
      raise exception 'บทบาทนี้ต้องเลือกเขตปกครอง' using errcode = 'P0001';
    end if;
    if not v_role.requires_org_unit then
      v_org := null;
    end if;

    if not public.has_role('admin') then
      if not v_role.requires_org_unit or not public.can_manage_accounts_of(v_org) then
        raise exception 'ท่านอนุมัติได้เฉพาะบัญชีของหน่วยใต้สังกัด บทบาทนี้ต้องให้ผู้ดูแลระบบอนุมัติ'
          using errcode = '42501';
      end if;
    end if;

    insert into public.user_roles (user_id, role_key, org_unit_id, created_by)
    values (v_req.user_id, v_role.key, v_org, auth.uid());
  else
    if not public.can_review_user(v_req.user_id) then
      raise exception 'ท่านไม่มีสิทธิ์พิจารณาคำขอนี้' using errcode = '42501';
    end if;
  end if;

  update public.profiles
  set status = 'active', status_reason = null, activated_at = now()
  where id = v_req.user_id;

  update public.account_requests
  set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), '')
  where id = p_request_id;
end;
$$;

-- ---------------------------------------------------------------
-- ไม่อนุมัติคำขอ (ต้องระบุเหตุผล)
-- ---------------------------------------------------------------
create function public.reject_account_request(p_request_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.account_requests%rowtype;
begin
  select * into v_req from public.account_requests where id = p_request_id for update;
  if not found or v_req.status <> 'pending' then
    raise exception 'ไม่พบคำขอ หรือคำขอนี้ถูกพิจารณาไปแล้ว' using errcode = 'P0001';
  end if;
  if v_req.user_id = auth.uid() then
    raise exception 'พิจารณาคำขอของตนเองไม่ได้' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'กรุณาระบุเหตุผลที่ไม่อนุมัติ' using errcode = 'P0001';
  end if;
  if not (public.can_manage_accounts_of(v_req.org_unit_id) or public.can_review_user(v_req.user_id)) then
    raise exception 'ท่านไม่มีสิทธิ์พิจารณาคำขอนี้' using errcode = '42501';
  end if;

  if v_req.kind = 'new' then
    update public.profiles set status = 'rejected', status_reason = btrim(p_note) where id = v_req.user_id;
  end if;

  update public.account_requests
  set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = btrim(p_note)
  where id = p_request_id;
end;
$$;

-- ---------------------------------------------------------------
-- ระงับ หรือ เปิดใช้บัญชี
-- ---------------------------------------------------------------
create function public.set_account_status(p_user_id uuid, p_status text, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_privileged boolean;
begin
  if p_status not in ('active', 'suspended') then
    raise exception 'สถานะไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'เปลี่ยนสถานะบัญชีของตนเองไม่ได้' using errcode = 'P0001';
  end if;

  select status into v_current from public.profiles where id = p_user_id for update;
  if not found or v_current not in ('active', 'suspended') then
    raise exception 'เปลี่ยนสถานะได้เฉพาะบัญชีที่ใช้งานอยู่หรือถูกระงับ' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.user_roles where user_id = p_user_id and role_key in ('admin', 'central_staff')
  ) into v_privileged;

  if not public.has_role('admin') and (v_privileged or not public.can_review_user(p_user_id)) then
    raise exception 'ท่านไม่มีสิทธิ์เปลี่ยนสถานะบัญชีนี้' using errcode = '42501';
  end if;
  if p_status = 'suspended' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'กรุณาระบุเหตุผลที่ระงับ' using errcode = 'P0001';
  end if;

  update public.profiles
  set status = p_status,
      status_reason = case when p_status = 'suspended' then btrim(p_reason) else null end,
      activated_at = case when p_status = 'active' then now() else activated_at end
  where id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------
-- เพิ่มบทบาท และสิ้นสุดบทบาท (เฉพาะผู้ดูแลระบบ)
-- ---------------------------------------------------------------
create function public.grant_user_role(p_user_id uuid, p_role_key text, p_org_unit_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'เฉพาะผู้ดูแลระบบ' using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role_key, org_unit_id, created_by)
  values (p_user_id, p_role_key, p_org_unit_id, auth.uid());
end;
$$;

create function public.end_user_role(p_user_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'เฉพาะผู้ดูแลระบบ' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_roles where id = p_user_role_id and user_id = auth.uid() and role_key = 'admin') then
    raise exception 'ถอนบทบาทผู้ดูแลระบบของตนเองไม่ได้' using errcode = 'P0001';
  end if;
  -- ไม่ลบแถว ใช้การกำหนดวันสิ้นสุดเป็นเมื่อวาน
  update public.user_roles
  set ends_on = greatest(starts_on, current_date - 1)
  where id = p_user_role_id and (ends_on is null or ends_on >= current_date);
end;
$$;

-- ---------------------------------------------------------------
-- ผู้ใช้แก้ข้อมูลของตนเอง
-- ---------------------------------------------------------------
create function public.update_my_profile(
  p_title_prefix text, p_first_name text, p_monastic_name text, p_last_name text, p_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_first_name), '') = '' then
    raise exception 'กรุณากรอกชื่อ' using errcode = 'P0001';
  end if;
  update public.profiles
  set title_prefix = btrim(coalesce(p_title_prefix, '')),
      first_name = btrim(p_first_name),
      monastic_name = btrim(coalesce(p_monastic_name, '')),
      last_name = btrim(coalesce(p_last_name, '')),
      phone = btrim(coalesce(p_phone, ''))
  where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------
-- ผู้ใช้ที่ถูกระงับ ขอเปิดใช้บัญชีใหม่
-- ---------------------------------------------------------------
create function public.request_reactivation(p_note text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_org uuid;
begin
  select status into v_status from public.profiles where id = auth.uid();
  if v_status is distinct from 'suspended' then
    raise exception 'ขอเปิดใช้ได้เฉพาะบัญชีที่ถูกระงับ' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.account_requests where user_id = auth.uid() and status = 'pending') then
    raise exception 'ท่านมีคำขอที่รอพิจารณาอยู่แล้ว' using errcode = 'P0001';
  end if;

  select org_unit_id into v_org
  from public.user_roles
  where user_id = auth.uid() and org_unit_id is not null
  order by created_at desc
  limit 1;

  insert into public.account_requests (kind, user_id, org_unit_id, note)
  values ('reactivate', auth.uid(), v_org, btrim(coalesce(p_note, '')));
end;
$$;

revoke execute on function public.approve_account_request(uuid, text, uuid, text) from public, anon;
revoke execute on function public.reject_account_request(uuid, text) from public, anon;
revoke execute on function public.set_account_status(uuid, text, text) from public, anon;
revoke execute on function public.grant_user_role(uuid, text, uuid) from public, anon;
revoke execute on function public.end_user_role(uuid) from public, anon;
revoke execute on function public.update_my_profile(text, text, text, text, text) from public, anon;
revoke execute on function public.request_reactivation(text) from public, anon;
revoke execute on function public.setting_int(text) from public, anon;
grant execute on function public.approve_account_request(uuid, text, uuid, text) to authenticated;
grant execute on function public.reject_account_request(uuid, text) to authenticated;
grant execute on function public.set_account_status(uuid, text, text) to authenticated;
grant execute on function public.grant_user_role(uuid, text, uuid) to authenticated;
grant execute on function public.end_user_role(uuid) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, text) to authenticated;
grant execute on function public.request_reactivation(text) to authenticated;
grant execute on function public.setting_int(text) to authenticated;
