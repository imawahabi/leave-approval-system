-- The selected invitation role is stored server-side and consumed exactly once.
alter table private.invite_tokens
  add column if not exists requested_role text not null default 'viewer';
alter table private.invite_tokens
  add constraint invite_tokens_requested_role_check
  check (requested_role in ('viewer', 'supervisor', 'approver', 'admin'));

drop function if exists public.create_registration_invite(text);
create function public.create_registration_invite(p_token_hash text, p_role text default 'viewer')
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare expiry timestamptz := now() + interval '48 hours';
begin
  if not private.is_admin() or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_role not in ('viewer','supervisor','approver','admin') then
    raise exception 'Unauthorized or invalid invite';
  end if;
  insert into private.invite_tokens(token_hash,created_by,requested_role,expires_at)
  values(p_token_hash,auth.uid(),p_role,expiry);
  return expiry;
end;
$$;
revoke all on function public.create_registration_invite(text,text) from public,anon;
grant execute on function public.create_registration_invite(text,text) to authenticated;

-- Used only by the Edge Function after checking the caller's JWT and admin profile.
create or replace function public.admin_create_registration_invite(
  p_admin_id uuid, p_token_hash text, p_role text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role'
     or not exists(select 1 from public.profiles where id=p_admin_id and role='admin' and is_active)
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_role not in ('viewer','supervisor','approver','admin') then
    raise exception 'Unauthorized or invalid invite';
  end if;
  insert into private.invite_tokens(token_hash,created_by,requested_role,expires_at)
  values(p_token_hash,p_admin_id,p_role,now()+interval '5 minutes');
  return true;
end;
$$;
revoke all on function public.admin_create_registration_invite(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_create_registration_invite(uuid,text,text) to service_role;

create or replace function public.finish_registration(
  p_token_hash text, p_user_id uuid, p_civil_hash text, p_pin_verifier text, p_full_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare invite_role text; invite_creator uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Unauthorized'; end if;
  if p_civil_hash !~ '^[0-9a-f]{64}$' or p_pin_verifier !~ '^[0-9a-f]{64}$'
     or length(trim(p_full_name)) not between 2 and 120 then raise exception 'Invalid registration'; end if;
  select requested_role,created_by into invite_role,invite_creator from private.invite_tokens
  where token_hash=p_token_hash and used_at is not null and used_by is null
    and expires_at>now() and used_at>now()-interval '5 minutes' for update;
  if invite_role is null then raise exception 'Invalid invite'; end if;
  insert into private.civil_credentials(user_id,civil_hash,pin_hash)
  values(p_user_id,p_civil_hash,extensions.crypt(p_pin_verifier,extensions.gen_salt('bf',12)));
  update public.profiles set full_name=trim(p_full_name),role=invite_role,is_active=true
  where id=p_user_id;
  if not found then raise exception 'Profile not found'; end if;
  update private.invite_tokens set used_by=p_user_id where token_hash=p_token_hash;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_values)
  values(invite_creator,'register_invited_user','profiles',p_user_id,
    jsonb_build_object('role',invite_role,'full_name',trim(p_full_name)));
  return true;
end;
$$;
revoke all on function public.finish_registration(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_registration(text,uuid,text,text,text) to service_role;

-- A signed-in user may edit their own display name, with no access to role/status.
create or replace function public.update_my_name(p_full_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare clean_name text;
begin
  clean_name := trim(coalesce(p_full_name,''));
  if auth.uid() is null or length(clean_name) not between 2 and 120 then
    raise exception 'Invalid name or session';
  end if;
  update public.profiles set full_name=clean_name
  where id=auth.uid() and is_active=true;
  if not found then raise exception 'Account unavailable'; end if;
  return clean_name;
end;
$$;
revoke all on function public.update_my_name(text) from public,anon;
grant execute on function public.update_my_name(text) to authenticated;

create or replace function public.self_reset_civil_pin(
  p_user_id uuid,p_civil_hash text,p_reset_verifier text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role'
     or p_civil_hash !~ '^[0-9a-f]{64}$'
     or p_reset_verifier !~ '^[0-9a-f]{64}$'
     or not exists(select 1 from public.profiles where id=p_user_id and is_active) then
    raise exception 'Unauthorized';
  end if;
  update private.civil_credentials set
    pin_hash=extensions.crypt(p_reset_verifier,extensions.gen_salt('bf',12)),
    pin_scheme='civil_hash',failed_attempts=0,locked_until=null
  where user_id=p_user_id and civil_hash=p_civil_hash;
  if not found then raise exception 'Credential unavailable'; end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_values)
  values(p_user_id,'change_own_pin','profiles',p_user_id,jsonb_build_object('credential','PIN changed'));
  return true;
end;
$$;
revoke all on function public.self_reset_civil_pin(uuid,text,text) from public,anon,authenticated;
grant execute on function public.self_reset_civil_pin(uuid,text,text) to service_role;

notify pgrst, 'reload schema';
