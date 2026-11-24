create or replace function public.create_registration_invite(p_token_hash text)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare expiry timestamptz := now() + interval '48 hours';
begin
  if not private.is_admin() or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Unauthorized';
  end if;
  insert into private.invite_tokens(token_hash,created_by,expires_at)
  values(p_token_hash,auth.uid(),expiry);
  return expiry;
end;
$$;
