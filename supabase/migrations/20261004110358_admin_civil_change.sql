create or replace function public.admin_change_civil_credential(
  p_admin_id uuid,p_target_id uuid,p_new_civil_hash text,p_new_pin_verifier text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Unauthorized'; end if;
  if not exists(select 1 from public.profiles where id=p_admin_id and role='admin' and is_active) then
    raise exception 'Unauthorized';
  end if;
  if p_new_civil_hash !~ '^[0-9a-f]{64}$' or p_new_pin_verifier !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid credential';
  end if;
  update private.civil_credentials set
    civil_hash=p_new_civil_hash,
    pin_hash=extensions.crypt(p_new_pin_verifier,extensions.gen_salt('bf',12)),
    pin_scheme='civil_hash',failed_attempts=0,locked_until=null
  where user_id=p_target_id;
  if not found then raise exception 'Target has no civil credential'; end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_values)
  values(p_admin_id,'change_user_civil_credential','profiles',p_target_id,
    jsonb_build_object('credential','civil ID and PIN changed'));
  return true;
end;
$$;
revoke all on function public.admin_change_civil_credential(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.admin_change_civil_credential(uuid,uuid,text,text) to service_role;
