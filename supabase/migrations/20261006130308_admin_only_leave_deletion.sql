-- Permanent leave deletion is an administrator-only action.
-- The scoped delete grant is obsolete; retain audit log rows for traceability.
delete from private.permission_grants
where permission_code = 'delete_leave';

delete from private.permission_catalog
where code = 'delete_leave';

drop policy if exists leaves_delete_scoped on public.leadership_leaves;
drop policy if exists leaves_delete on public.leadership_leaves;

create policy leaves_delete_admin_only
  on public.leadership_leaves
  for delete to authenticated
  using ((select private.is_admin()));
