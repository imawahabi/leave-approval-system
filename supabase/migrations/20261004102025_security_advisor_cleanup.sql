revoke execute on function public.has_admin_user() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

grant insert on private.invite_tokens to authenticated;
create policy admin_can_create_invite on private.invite_tokens for insert to authenticated
  with check (private.is_admin() and created_by = auth.uid());
alter function public.create_registration_invite(text) security invoker;
