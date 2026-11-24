create or replace function public.has_my_civil_credential()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.civil_credentials c
    where c.user_id=auth.uid())
$$;
revoke all on function public.has_my_civil_credential() from public, anon;
grant execute on function public.has_my_civil_credential() to authenticated;
