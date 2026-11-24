create or replace function public.setup_admin_civil(
  p_admin_id uuid,p_civil_hash text,p_pin_verifier text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Unauthorized'; end if;
  if p_civil_hash !~ '^[0-9a-f]{64}$' or p_pin_verifier !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid credentials';
  end if;
  if not exists(select 1 from public.profiles
    where id=p_admin_id and role='admin' and is_active=true) then
    raise exception 'Not an active administrator';
  end if;
  insert into private.civil_credentials(user_id,civil_hash,pin_hash)
  values(p_admin_id,p_civil_hash,extensions.crypt(p_pin_verifier,extensions.gen_salt('bf',12)));
  return true;
end;
$$;
revoke all on function public.setup_admin_civil(uuid,text,text) from public, anon, authenticated;
grant execute on function public.setup_admin_civil(uuid,text,text) to service_role;
