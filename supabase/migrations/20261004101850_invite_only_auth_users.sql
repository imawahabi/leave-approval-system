-- Supabase's public signUp endpoint must not create even inactive accounts.
-- app_metadata is writable only by the service-role Admin API.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_app_meta_data->>'invite_registration' is distinct from 'true' then
    raise exception 'Registration requires a one-time invitation';
  end if;
  insert into public.profiles(id,email,full_name,role,is_active)
  values(new.id,coalesce(new.email,''),'','viewer',false)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
