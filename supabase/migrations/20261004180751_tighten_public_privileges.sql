-- Every application screen requires a signed-in user. RLS remains the final
-- authorization gate; removing unused grants also limits accidental exposure.
revoke all on table
  public.audit_logs,
  public.departments,
  public.leadership_leaves,
  public.leadership_members,
  public.leave_types,
  public.profiles,
  public.sectors
from anon;

-- These operations are not part of the browser application's data API.
revoke truncate, references, trigger, maintain on table
  public.audit_logs,
  public.departments,
  public.leadership_leaves,
  public.leadership_members,
  public.leave_types,
  public.profiles,
  public.sectors
from authenticated;

-- The app never edits or deletes an audit record.
revoke update, delete on table public.audit_logs from authenticated;
revoke insert on table public.profiles from authenticated;

-- Evaluate session identity once per statement while preserving the same check.
drop policy if exists admin_can_create_invite on private.invite_tokens;
create policy admin_can_create_invite on private.invite_tokens
  for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));
