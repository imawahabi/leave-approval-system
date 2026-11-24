-- Integrate account type and scoped permissions into every user-provisioning path.
-- The legacy `role` and `requested_role` columns remain as compatibility shadows;
-- account_type plus permission_grants are the authoritative access model.

alter table private.invite_tokens
  add column if not exists requested_account_type text not null default 'user',
  add column if not exists requested_grants jsonb not null default '[]'::jsonb;

alter table private.invite_tokens
  drop constraint if exists invite_tokens_requested_account_type_check;
alter table private.invite_tokens
  add constraint invite_tokens_requested_account_type_check
  check (requested_account_type in ('admin', 'user', 'approver'));

alter table private.invite_tokens
  drop constraint if exists invite_tokens_requested_grants_array_check;
alter table private.invite_tokens
  add constraint invite_tokens_requested_grants_array_check
  check (jsonb_typeof(requested_grants) = 'array');

create or replace function private.legacy_role_for_account(p_account_type text)
returns text language sql immutable set search_path = '' as $$
  select case p_account_type
    when 'admin' then 'admin'
    when 'approver' then 'approver'
    else 'viewer'
  end
$$;

create or replace function private.default_grants_for_legacy_role(p_role text)
returns jsonb language sql immutable set search_path = '' as $$
  select case p_role
    when 'supervisor' then '[
      {"permission_code":"view_leaders","scope_kind":"all"},
      {"permission_code":"view_leaves","scope_kind":"all"},
      {"permission_code":"create_leave","scope_kind":"all"},
      {"permission_code":"edit_any_leave","scope_kind":"all"},
      {"permission_code":"cancel_any_leave","scope_kind":"all"}
    ]'::jsonb
    when 'approver' then '[
      {"permission_code":"approve_undersecretary","scope_kind":"all"},
      {"permission_code":"approve_minister","scope_kind":"all"},
      {"permission_code":"return_review_pending","scope_kind":"all"}
    ]'::jsonb
    when 'admin' then '[]'::jsonb
    else '[
      {"permission_code":"view_leaders","scope_kind":"all"},
      {"permission_code":"view_leaves","scope_kind":"all"}
    ]'::jsonb
  end
$$;

create or replace function private.validate_access_grants(
  p_account_type text,
  p_grants jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  grant_row jsonb;
  permission_code text;
  scope_kind text;
  scope_id uuid;
begin
  if p_account_type not in ('admin', 'user', 'approver') then
    raise exception 'Invalid account type';
  end if;
  if jsonb_typeof(coalesce(p_grants, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid access grants';
  end if;
  if p_account_type = 'admin' and jsonb_array_length(coalesce(p_grants, '[]'::jsonb)) > 0 then
    raise exception 'Administrator accounts do not accept custom grants';
  end if;

  for grant_row in select value from jsonb_array_elements(coalesce(p_grants, '[]'::jsonb)) loop
    permission_code := nullif(btrim(grant_row->>'permission_code'), '');
    scope_kind := nullif(btrim(grant_row->>'scope_kind'), '');
    scope_id := nullif(grant_row->>'scope_id', '')::uuid;

    if permission_code is null or not exists (
      select 1 from private.permission_catalog where code = permission_code
    ) then
      raise exception 'Unknown permission';
    end if;
    if scope_kind not in ('all', 'own', 'sector', 'department', 'assistant_undersecretary') then
      raise exception 'Invalid permission scope';
    end if;
    if scope_kind in ('all', 'own') and scope_id is not null then
      raise exception 'This permission scope does not accept a scope id';
    end if;
    if scope_kind not in ('all', 'own') and scope_id is null then
      raise exception 'An organizational scope id is required';
    end if;
    if scope_kind = 'sector' and not exists (
      select 1 from public.sectors where id = scope_id and is_active
    ) then
      raise exception 'Sector scope not found';
    end if;
    if scope_kind = 'department' and not exists (
      select 1 from public.departments where id = scope_id
    ) then
      raise exception 'Department scope not found';
    end if;
    if scope_kind = 'assistant_undersecretary' and not exists (
      select 1 from public.assistant_undersecretaries where id = scope_id and is_active
    ) then
      raise exception 'Assistant undersecretary scope not found';
    end if;

    if p_account_type = 'approver' and permission_code not in (
      'approve_undersecretary', 'approve_minister', 'return_review_pending'
    ) then
      raise exception 'Approver accounts can only receive review permissions';
    end if;
    if p_account_type = 'user' and permission_code in (
      'approve_undersecretary', 'approve_minister', 'reopen_rejected_leave',
      'manage_users', 'manage_organization', 'manage_leave_types'
    ) then
      raise exception 'This permission belongs to an administrator or approver';
    end if;
  end loop;
end;
$$;

create or replace function private.insert_access_grants(
  p_user_id uuid,
  p_grants jsonb,
  p_created_by uuid
)
returns void language sql security definer set search_path = '' as $$
  insert into private.permission_grants(
    user_id, permission_code, scope_kind, scope_id, created_by
  )
  select p_user_id,
    value->>'permission_code',
    value->>'scope_kind',
    nullif(value->>'scope_id', '')::uuid,
    p_created_by
  from jsonb_array_elements(coalesce(p_grants, '[]'::jsonb))
  on conflict (user_id, permission_code, scope_kind, scope_id)
  do update set is_allowed = true, created_by = excluded.created_by;
$$;

revoke all on function private.legacy_role_for_account(text) from public, anon, authenticated;
revoke all on function private.default_grants_for_legacy_role(text) from public, anon, authenticated;
revoke all on function private.validate_access_grants(text,jsonb) from public, anon, authenticated;
revoke all on function private.insert_access_grants(uuid,jsonb,uuid) from public, anon, authenticated;

-- Existing pending invites keep their old role but are upgraded to an equivalent
-- account type and grant bundle before the new registration path uses them.
update private.invite_tokens
set requested_account_type = case requested_role
  when 'admin' then 'admin'
  when 'approver' then 'approver'
  else 'user'
end,
requested_grants = private.default_grants_for_legacy_role(requested_role)
where requested_grants = '[]'::jsonb;

create or replace function public.create_registration_invite(
  p_token_hash text,
  p_account_type text,
  p_grants jsonb default '[]'::jsonb
)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare expiry timestamptz := now() + interval '48 hours';
begin
  if not private.is_admin() or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Unauthorized or invalid invite';
  end if;
  perform private.validate_access_grants(p_account_type, p_grants);
  insert into private.invite_tokens(
    token_hash, created_by, requested_role, requested_account_type, requested_grants, expires_at
  ) values (
    p_token_hash,
    auth.uid(),
    private.legacy_role_for_account(p_account_type),
    p_account_type,
    coalesce(p_grants, '[]'::jsonb),
    expiry
  );
  return expiry;
end;
$$;

revoke all on function public.create_registration_invite(text,text,jsonb) from public, anon;
grant execute on function public.create_registration_invite(text,text,jsonb) to authenticated;

-- Compatibility wrapper for older clients that still send a legacy role.
create or replace function public.create_registration_invite(p_token_hash text, p_role text default 'viewer')
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare account_type text;
begin
  account_type := case p_role when 'admin' then 'admin' when 'approver' then 'approver' else 'user' end;
  return public.create_registration_invite(
    p_token_hash, account_type, private.default_grants_for_legacy_role(p_role)
  );
end;
$$;

revoke all on function public.create_registration_invite(text,text) from public, anon;
grant execute on function public.create_registration_invite(text,text) to authenticated;

create or replace function public.admin_create_registration_invite(
  p_admin_id uuid,
  p_token_hash text,
  p_account_type text,
  p_grants jsonb default '[]'::jsonb
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role'
     or not exists(select 1 from public.profiles where id=p_admin_id and account_type='admin' and is_active)
     or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Unauthorized or invalid invite';
  end if;
  perform private.validate_access_grants(p_account_type, p_grants);
  insert into private.invite_tokens(
    token_hash, created_by, requested_role, requested_account_type, requested_grants, expires_at
  ) values (
    p_token_hash,
    p_admin_id,
    private.legacy_role_for_account(p_account_type),
    p_account_type,
    coalesce(p_grants, '[]'::jsonb),
    now() + interval '5 minutes'
  );
  return true;
end;
$$;

revoke all on function public.admin_create_registration_invite(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.admin_create_registration_invite(uuid,text,text,jsonb) to service_role;

-- Compatibility wrapper for the old edge-function signature.
create or replace function public.admin_create_registration_invite(
  p_admin_id uuid, p_token_hash text, p_role text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  return public.admin_create_registration_invite(
    p_admin_id,
    p_token_hash,
    case p_role when 'admin' then 'admin' when 'approver' then 'approver' else 'user' end,
    private.default_grants_for_legacy_role(p_role)
  );
end;
$$;

revoke all on function public.admin_create_registration_invite(uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_create_registration_invite(uuid,text,text) to service_role;

create or replace function public.finish_registration(
  p_token_hash text, p_user_id uuid, p_civil_hash text, p_pin_verifier text, p_full_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  invite_account_type text;
  invite_grants jsonb;
  invite_creator uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Unauthorized'; end if;
  if p_civil_hash !~ '^[0-9a-f]{64}$' or p_pin_verifier !~ '^[0-9a-f]{64}$'
     or length(trim(p_full_name)) not between 2 and 120 then raise exception 'Invalid registration'; end if;
  select coalesce(requested_account_type, case requested_role
           when 'admin' then 'admin' when 'approver' then 'approver' else 'user' end),
         coalesce(requested_grants, private.default_grants_for_legacy_role(requested_role)),
         created_by
    into invite_account_type, invite_grants, invite_creator
  from private.invite_tokens
  where token_hash=p_token_hash and used_at is not null and used_by is null
    and expires_at>now() and used_at>now()-interval '5 minutes' for update;
  if invite_account_type is null then raise exception 'Invalid invite'; end if;
  perform private.validate_access_grants(invite_account_type, invite_grants);
  insert into private.civil_credentials(user_id,civil_hash,pin_hash)
  values(p_user_id,p_civil_hash,extensions.crypt(p_pin_verifier,extensions.gen_salt('bf',12)));
  update public.profiles set
    full_name=trim(p_full_name),
    account_type=invite_account_type,
    role=private.legacy_role_for_account(invite_account_type),
    is_active=true
  where id=p_user_id;
  if not found then raise exception 'Profile not found'; end if;
  perform private.insert_access_grants(p_user_id, invite_grants, invite_creator);
  update private.invite_tokens set used_by=p_user_id where token_hash=p_token_hash;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_values)
  values(invite_creator,'register_invited_user','profiles',p_user_id,
    jsonb_build_object('account_type',invite_account_type,'grant_count',jsonb_array_length(invite_grants),'full_name',trim(p_full_name)));
  return true;
end;
$$;

revoke all on function public.finish_registration(text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.finish_registration(text,uuid,text,text,text) to service_role;

create or replace function public.admin_replace_user_access(
  p_user_id uuid,
  p_account_type text,
  p_grants jsonb default '[]'::jsonb,
  p_full_name text default null,
  p_is_active boolean default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if private.current_account_type() <> 'admin' then raise exception 'Unauthorized'; end if;
  perform private.validate_access_grants(p_account_type, p_grants);
  if p_full_name is not null and length(trim(p_full_name)) not between 2 and 120 then
    raise exception 'Invalid name';
  end if;
  update public.profiles set
    account_type = p_account_type,
    role = private.legacy_role_for_account(p_account_type),
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    is_active = coalesce(p_is_active, is_active)
  where id = p_user_id;
  if not found then raise exception 'Profile not found'; end if;
  delete from private.permission_grants where user_id = p_user_id;
  perform private.insert_access_grants(p_user_id, p_grants, auth.uid());
  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_values)
  values(auth.uid(), 'replace_user_access', 'profiles', p_user_id,
    jsonb_build_object('account_type', p_account_type, 'grant_count', jsonb_array_length(coalesce(p_grants, '[]'::jsonb))));
  return true;
end;
$$;

revoke all on function public.admin_replace_user_access(uuid,text,jsonb,text,boolean) from public, anon;
grant execute on function public.admin_replace_user_access(uuid,text,jsonb,text,boolean) to authenticated;

notify pgrst, 'reload schema';
