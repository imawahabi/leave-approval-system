-- Immutable, server-written history for all future leave changes. No leave FK:
-- a deliberate deletion must not erase the history needed to investigate it.
create table private.leave_trace_events (
  id uuid primary key default gen_random_uuid(),
  leave_id uuid not null,
  event_code text not null,
  actor_id uuid,
  actor_name text,
  from_state text,
  to_state text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index leave_trace_events_leave_time_idx
  on private.leave_trace_events (leave_id, occurred_at, id);
alter table private.leave_trace_events enable row level security;
revoke all on private.leave_trace_events from public, anon, authenticated;

create function private.record_leave_trace()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_label text;
  previous_state text;
  next_state text;
  code text;
  changes jsonb := '{}'::jsonb;
  old_row jsonb;
  new_row jsonb;
  field_name text;
begin
  select p.full_name into actor_label from public.profiles p where p.id = actor;
  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and
    (old_row - array['updated_at','updated_by']) = (new_row - array['updated_at','updated_by']) then
    return new;
  end if;

  previous_state := old_row->>'workflow_status';
  next_state := new_row->>'workflow_status';
  code := case
    when tg_op = 'INSERT' then 'created'
    when tg_op = 'DELETE' then 'deleted'
    when new_row->>'status' = 'cancelled' and old_row->>'status' is distinct from 'cancelled' then 'cancelled'
    when previous_state = 'pending_stage_1' and next_state = 'pending_stage_2' then 'forwarded_to_minister'
    when next_state = 'approved' and previous_state is distinct from 'approved' then 'presented_to_minister'
    when next_state like 'rejected_stage_%' and previous_state is distinct from next_state then 'archived_at_stage'
    when previous_state = 'approved' and next_state = 'pending_stage_2' then 'presentation_revoked'
    when previous_state like 'rejected_stage_%' and next_state like 'pending_stage_%' then 'reopened'
    when previous_state = 'pending_stage_2' and next_state = 'pending_stage_1' then 'returned_to_undersecretary'
    when previous_state is distinct from next_state then 'workflow_changed'
    else 'edited' end;

  -- The trace contains operational fields, not notes, attachments or PINs.
  foreach field_name in array array[
    'leadership_member_id','leave_type_id','start_date','end_date',
    'return_date','total_days','status','approval_status',
    'workflow_status','current_approval_stage','rejected_at_stage',
    'approval_route_id','rejection_reason'
  ] loop
    if tg_op = 'INSERT' or tg_op = 'DELETE' or old_row->field_name is distinct from new_row->field_name then
      changes := changes || jsonb_build_object(field_name,
        jsonb_build_object('before', old_row->field_name, 'after', new_row->field_name));
    end if;
  end loop;
  if tg_op = 'UPDATE' then
    changes := changes || jsonb_build_object(
      'notes_changed', old_row->'notes' is distinct from new_row->'notes',
      'attachment_changed', old_row->'attachment_url' is distinct from new_row->'attachment_url');
  end if;

  insert into private.leave_trace_events
    (leave_id, event_code, actor_id, actor_name, from_state, to_state, details)
  values
    (coalesce(new_row->>'id', old_row->>'id')::uuid, code, actor, actor_label,
     previous_state, next_state, changes);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.record_leave_trace() from public, anon, authenticated;
create trigger record_leave_trace
  after insert or update or delete on public.leadership_leaves
  for each row execute function private.record_leave_trace();

-- The RPC checks the account type in the database. The private table has no
-- client grants, so hiding the button in React is not the access boundary.
create function public.admin_leave_timeline(p_leave_id uuid)
returns table (
  event_id uuid, event_at timestamptz, event_code text,
  actor_id uuid, actor_name text, from_state text, to_state text,
  details jsonb, source text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.current_account_type() <> 'admin' then
    raise exception 'Unauthorized';
  end if;
  return query
  with first_trace as (
    select min(t.occurred_at) as started_at
    from private.leave_trace_events t where t.leave_id = p_leave_id
  ), entries as (
    select t.id, t.occurred_at, t.event_code, t.actor_id, t.actor_name,
      t.from_state, t.to_state,
      t.details || case when workflow.reason is not null
        then jsonb_build_object('reason', workflow.reason) else '{}'::jsonb end as details,
      'recorded'::text as origin
    from private.leave_trace_events t
    left join lateral (
      select e.reason from private.leave_workflow_events e
      where e.leave_id = t.leave_id and e.created_at = t.occurred_at
        and e.actor_id is not distinct from t.actor_id
        and e.from_state is not distinct from t.from_state
        and e.to_state is not distinct from t.to_state
      order by e.id limit 1
    ) workflow on true
    where t.leave_id = p_leave_id
    union all
    select a.id, a.created_at, a.action, a.user_id, p.full_name,
      a.old_values->>'workflow_status', a.new_values->>'workflow_status',
      jsonb_build_object('before', a.old_values, 'after', a.new_values),
      'legacy_audit'::text
    from public.audit_logs a
    left join public.profiles p on p.id = a.user_id
    cross join first_trace ft
    where a.entity_type = 'leadership_leaves' and a.entity_id = p_leave_id
      and (ft.started_at is null or a.created_at < ft.started_at)
    union all
    select e.id, e.created_at, e.event_code, e.actor_id, p.full_name,
      e.from_state, e.to_state,
      jsonb_build_object('reason', e.reason), 'legacy_workflow'::text
    from private.leave_workflow_events e
    left join public.profiles p on p.id = e.actor_id
    cross join first_trace ft
    where e.leave_id = p_leave_id
      and (ft.started_at is null or e.created_at < ft.started_at)
    union all
    select s.id, coalesce(s.decided_at, s.created_at),
      ('historical_' || s.stage_code || '_' || s.status)::text,
      s.reviewer_id, p.full_name, null::text, null::text,
      jsonb_build_object('stage', s.stage_code, 'status', s.status),
      'legacy_step'::text
    from private.leave_approval_steps s
    left join public.profiles p on p.id = s.reviewer_id
    where s.leave_id = p_leave_id and s.status in ('approved', 'rejected')
      and not exists (
        select 1 from private.leave_trace_events t
        where t.leave_id = s.leave_id and (
          (s.stage_code = 'undersecretary' and t.event_code in ('forwarded_to_minister', 'archived_at_stage'))
          or (s.stage_code = 'minister' and t.event_code in ('presented_to_minister', 'archived_at_stage'))
        )
      )
      and not exists (
        select 1 from private.leave_workflow_events e
        where e.leave_id = s.leave_id and (
          (s.stage_code = 'undersecretary' and e.event_code in ('forward_to_minister', 'reject_stage'))
          or (s.stage_code = 'minister' and e.event_code in ('approve_final', 'reject_stage'))
        )
      )
    union all
    select l.id, l.created_at, 'created'::text, l.created_by, p.full_name,
      null::text, null::text, '{}'::jsonb, 'creation_record'::text
    from public.leadership_leaves l
    left join public.profiles p on p.id = l.created_by
    where l.id = p_leave_id
      and not exists (select 1 from private.leave_trace_events t
        where t.leave_id = l.id and t.event_code = 'created')
      and not exists (select 1 from public.audit_logs a
        where a.entity_type = 'leadership_leaves' and a.entity_id = l.id
          and a.action = 'create_leave')
  )
  select x.id, x.occurred_at, x.event_code, x.actor_id, x.actor_name,
    x.from_state, x.to_state, x.details, x.origin
  from entries x order by x.occurred_at, x.id;
end;
$$;

revoke all on function public.admin_leave_timeline(uuid) from public, anon;
grant execute on function public.admin_leave_timeline(uuid) to authenticated;

notify pgrst, 'reload schema';
