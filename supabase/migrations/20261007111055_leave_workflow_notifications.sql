-- Durable workflow notices for the account that submitted a leader's leave.
create table public.leave_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  leave_id uuid not null references public.leadership_leaves(id) on delete cascade,
  event_code text not null check (event_code in (
    'submitted', 'forwarded', 'returned_to_review', 'displayed',
    'archived', 'resubmitted', 'cancelled'
  )),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index leave_notifications_recipient_latest
  on public.leave_notifications (recipient_id, created_at desc);
alter table public.leave_notifications enable row level security;
revoke all on public.leave_notifications from public, anon, authenticated;
grant select on public.leave_notifications to authenticated;
grant update (read_at) on public.leave_notifications to authenticated;

create policy leave_notifications_read_own on public.leave_notifications
  for select to authenticated using (recipient_id = (select auth.uid()));
create policy leave_notifications_mark_own on public.leave_notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy leaves_read_submitted_own on public.leadership_leaves
  for select to authenticated using (created_by = (select auth.uid()));

create or replace function private.guard_leave_notification_read()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if row(new.id, new.recipient_id, new.leave_id, new.event_code, new.created_at)
     is distinct from row(old.id, old.recipient_id, old.leave_id, old.event_code, old.created_at) then
    raise exception 'Only notification read state can change';
  end if;
  if auth.role() <> 'service_role' then
    if auth.uid() is null or auth.uid() <> old.recipient_id then
      raise exception 'Unauthorized notification update';
    end if;
    new.read_at := case when new.read_at is null then null else now() end;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_leave_notification_read() from public, anon, authenticated;
create trigger guard_leave_notification_read before update on public.leave_notifications
  for each row execute function private.guard_leave_notification_read();

create or replace function private.notify_leave_creator()
returns trigger language plpgsql security definer set search_path = '' as $$
declare notice_event text;
begin
  if new.created_by is null then return new; end if;
  if tg_op = 'INSERT' then
    notice_event := 'submitted';
  elsif new.status = 'cancelled' and old.status is distinct from new.status then
    notice_event := 'cancelled';
  elsif new.workflow_status is distinct from old.workflow_status then
    notice_event := case
      when new.workflow_status = 'approved' then 'displayed'
      when new.workflow_status like 'rejected%' then 'archived'
      when old.workflow_status = 'approved' or old.workflow_status like 'rejected%'
        then case when row(new.leadership_member_id, new.leave_type_id,
          new.start_date, new.end_date, new.return_date, new.total_days,
          new.notes, new.substitute_member_id, new.attachment_url)
          is distinct from row(old.leadership_member_id, old.leave_type_id,
          old.start_date, old.end_date, old.return_date, old.total_days,
          old.notes, old.substitute_member_id, old.attachment_url)
          then 'resubmitted' else 'returned_to_review' end
      when new.workflow_status = 'pending_stage_2' then 'forwarded'
      else 'returned_to_review'
    end;
  elsif row(new.leadership_member_id, new.leave_type_id, new.start_date,
    new.end_date, new.return_date, new.total_days, new.notes,
    new.substitute_member_id, new.attachment_url)
    is distinct from row(old.leadership_member_id, old.leave_type_id,
    old.start_date, old.end_date, old.return_date, old.total_days,
    old.notes, old.substitute_member_id, old.attachment_url) then
    notice_event := 'resubmitted';
  end if;
  if notice_event is not null then
    insert into public.leave_notifications (recipient_id, leave_id, event_code)
    values (new.created_by, new.id, notice_event);
  end if;
  return new;
end;
$$;
revoke all on function private.notify_leave_creator() from public, anon, authenticated;
create trigger notify_leave_creator_after_change
  after insert or update on public.leadership_leaves
  for each row execute function private.notify_leave_creator();
