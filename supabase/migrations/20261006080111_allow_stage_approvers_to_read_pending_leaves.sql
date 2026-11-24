-- Stage approvers can read only pending leave rows currently assigned to
-- the stage and organizational scope they are authorized to review.
create policy leaves_read_pending_approvers
  on public.leadership_leaves
  for select
  to authenticated
  using (
    approval_status = 'pending'
    and (
      (workflow_status = 'pending_stage_1'
        and private.has_permission('approve_undersecretary', leadership_member_id, id))
      or
      (workflow_status = 'pending_stage_2'
        and private.has_permission('approve_minister', leadership_member_id, id))
    )
  );
