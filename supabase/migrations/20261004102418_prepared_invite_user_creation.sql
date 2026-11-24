create table if not exists private.prepared_auth_emails (
  email text primary key,
  token_hash text not null references private.invite_tokens(token_hash),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table private.prepared_auth_emails enable row level security;
revoke all on private.prepared_auth_emails from public, anon, authenticated;

create or replace function public.prepare_invite_email(p_token_hash text,p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Unauthorized'; end if;
  if p_email !~ '^[0-9a-f-]{36}@accounts[.]leave-system[.]example$' then
    raise exception 'Invalid internal address';
  end if;
  if not exists(select 1 from private.invite_tokens
    where token_hash=p_token_hash and used_at>now()-interval '5 minutes'
      and used_by is null and expires_at>now()) then
    raise exception 'Invalid invite';
  end if;
  insert into private.prepared_auth_emails(email,token_hash) values(p_email,p_token_hash);
  return true;
end;
$$;
revoke all on function public.prepare_invite_email(text,text) from public, anon, authenticated;
grant execute on function public.prepare_invite_email(text,text) to service_role;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare prepared text;
begin
  update private.prepared_auth_emails pae set used_at=now()
  from private.invite_tokens invite
  where pae.email=new.email and pae.used_at is null
    and pae.created_at>now()-interval '5 minutes'
    and invite.token_hash=pae.token_hash
    and invite.used_at is not null and invite.used_by is null
  returning pae.email into prepared;
  if prepared is null then
    raise exception 'Registration requires a one-time invitation';
  end if;
  insert into public.profiles(id,email,full_name,role,is_active)
  values(new.id,coalesce(new.email,''),'','viewer',false)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
