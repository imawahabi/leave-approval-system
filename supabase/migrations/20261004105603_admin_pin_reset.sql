-- Existing PINs remain valid; resets use an HMAC derived from the civil hash.
alter table private.civil_credentials
  add column if not exists pin_scheme text not null default 'civil_id';
alter table private.civil_credentials
  add constraint civil_credentials_pin_scheme_check
  check (pin_scheme in ('civil_id','civil_hash'));

create or replace function public.verify_civil_pin_v2(
  p_civil_hash text, p_legacy_verifier text, p_reset_verifier text, p_ip_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare cred private.civil_credentials%rowtype; attempts integer; user_email text; candidate text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Unauthorized'; end if;
  if p_civil_hash !~ '^[0-9a-f]{64}$' or p_legacy_verifier !~ '^[0-9a-f]{64}$'
     or p_reset_verifier !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  insert into private.login_rate_limits(ip_hash,window_start,attempts)
  values(p_ip_hash,now(),1)
  on conflict (ip_hash) do update set
    window_start=case when private.login_rate_limits.window_start<now()-interval '15 minutes'
      then now() else private.login_rate_limits.window_start end,
    attempts=case when private.login_rate_limits.window_start<now()-interval '15 minutes'
      then 1 else private.login_rate_limits.attempts+1 end
  returning private.login_rate_limits.attempts into attempts;
  if attempts>20 then return null; end if;
  select * into cred from private.civil_credentials where civil_hash=p_civil_hash for update;
  if not found or cred.locked_until>now() then return null; end if;
  candidate := case when cred.pin_scheme='civil_hash' then p_reset_verifier else p_legacy_verifier end;
  if extensions.crypt(candidate,cred.pin_hash) <> cred.pin_hash then
    update private.civil_credentials set
      failed_attempts=failed_attempts+1,
      locked_until=case when failed_attempts+1>=5 then now()+interval '1 hour' else null end
    where user_id=cred.user_id;
    return null;
  end if;
  select u.email into user_email from auth.users u
  join public.profiles p on p.id=u.id
  where u.id=cred.user_id and p.is_active=true;
  if user_email is null then return null; end if;
  update private.civil_credentials set failed_attempts=0,locked_until=null
  where user_id=cred.user_id;
  return user_email;
end;
$$;
revoke all on function public.verify_civil_pin_v2(text,text,text,text) from public,anon,authenticated;
grant execute on function public.verify_civil_pin_v2(text,text,text,text) to service_role;
revoke all on function public.verify_civil_pin(text,text,text) from public,anon,authenticated,service_role;

create or replace function public.admin_pin_reset_civil_hash(p_admin_id uuid,p_target_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare result text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Unauthorized'; end if;
  if not exists(select 1 from public.profiles where id=p_admin_id and role='admin' and is_active) then
    raise exception 'Unauthorized';
  end if;
  select civil_hash into result from private.civil_credentials where user_id=p_target_id;
  if result is null then raise exception 'Target has no civil credential'; end if;
  return result;
end;
$$;
revoke all on function public.admin_pin_reset_civil_hash(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_pin_reset_civil_hash(uuid,uuid) to service_role;

create or replace function public.admin_reset_civil_pin(
  p_admin_id uuid,p_target_id uuid,p_reset_verifier text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Unauthorized'; end if;
  if not exists(select 1 from public.profiles where id=p_admin_id and role='admin' and is_active) then
    raise exception 'Unauthorized';
  end if;
  if p_reset_verifier !~ '^[0-9a-f]{64}$' then raise exception 'Invalid PIN verifier'; end if;
  update private.civil_credentials set
    pin_hash=extensions.crypt(p_reset_verifier,extensions.gen_salt('bf',12)),
    pin_scheme='civil_hash',failed_attempts=0,locked_until=null
  where user_id=p_target_id;
  if not found then raise exception 'Target has no civil credential'; end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_values)
  values(p_admin_id,'reset_user_pin','profiles',p_target_id,
    jsonb_build_object('credential','PIN reset'));
  return true;
end;
$$;
revoke all on function public.admin_reset_civil_pin(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_reset_civil_pin(uuid,uuid,text) to service_role;

create or replace function private.audit_profile_admin_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and row(new.full_name,new.role,new.is_active)
     is distinct from row(old.full_name,old.role,old.is_active) then
    insert into public.audit_logs(user_id,action,entity_type,entity_id,old_values,new_values)
    values(auth.uid(),'update_user_profile','profiles',new.id,
      jsonb_build_object('full_name',old.full_name,'role',old.role,'is_active',old.is_active),
      jsonb_build_object('full_name',new.full_name,'role',new.role,'is_active',new.is_active));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_profile_admin_changes on public.profiles;
create trigger audit_profile_admin_changes after update of full_name,role,is_active
  on public.profiles for each row execute function private.audit_profile_admin_changes();
