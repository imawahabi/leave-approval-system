-- Private credentials are never exposed through the Data API.
create table if not exists private.invite_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  used_at timestamptz,
  used_by uuid references auth.users(id)
);
create table if not exists private.civil_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  civil_hash text not null unique check (civil_hash ~ '^[0-9a-f]{64}$'),
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists private.login_rate_limits (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
alter table private.invite_tokens enable row level security;
alter table private.civil_credentials enable row level security;
alter table private.login_rate_limits enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;

-- Admin generates a high-entropy link in the browser. Only its SHA-256 hash is stored.
create or replace function public.create_registration_invite(p_token_hash text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare expiry timestamptz;
begin
  if not private.is_admin() or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Unauthorized';
  end if;
  insert into private.invite_tokens(token_hash,created_by)
  values(p_token_hash,auth.uid()) returning expires_at into expiry;
  return expiry;
end;
$$;
revoke all on function public.create_registration_invite(text) from public, anon;
grant execute on function public.create_registration_invite(text) to authenticated;

-- These two functions are callable only by the Edge Function's service role.
create or replace function public.consume_registration_invite(p_token_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Unauthorized'; end if;
  update private.invite_tokens set used_at=now()
  where token_hash=p_token_hash and used_at is null and expires_at>now()
  returning true into ok;
  return coalesce(ok,false);
end;
$$;
revoke all on function public.consume_registration_invite(text) from public, anon, authenticated;
grant execute on function public.consume_registration_invite(text) to service_role;

create or replace function public.finish_registration(
  p_token_hash text, p_user_id uuid, p_civil_hash text, p_pin_verifier text, p_full_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Unauthorized'; end if;
  if p_civil_hash !~ '^[0-9a-f]{64}$' or p_pin_verifier !~ '^[0-9a-f]{64}$'
     or length(trim(p_full_name)) < 2 then raise exception 'Invalid registration'; end if;
  if not exists(select 1 from private.invite_tokens
    where token_hash=p_token_hash and used_at is not null and used_by is null
      and expires_at>now() and used_at>now()-interval '5 minutes') then
    raise exception 'Invalid invite';
  end if;
  insert into private.civil_credentials(user_id,civil_hash,pin_hash)
  values(p_user_id,p_civil_hash,extensions.crypt(p_pin_verifier,extensions.gen_salt('bf',12)));
  update public.profiles set full_name=trim(p_full_name),role='viewer',is_active=true
  where id=p_user_id;
  if not found then raise exception 'Profile not found'; end if;
  update private.invite_tokens set used_by=p_user_id where token_hash=p_token_hash;
  return true;
end;
$$;
revoke all on function public.finish_registration(text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.finish_registration(text,uuid,text,text,text) to service_role;

create or replace function public.verify_civil_pin(
  p_civil_hash text,p_pin_verifier text,p_ip_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare cred private.civil_credentials%rowtype; attempts integer; user_email text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Unauthorized'; end if;
  if p_civil_hash !~ '^[0-9a-f]{64}$' or p_pin_verifier !~ '^[0-9a-f]{64}$'
     or p_ip_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  insert into private.login_rate_limits(ip_hash,window_start,attempts)
  values(p_ip_hash,now(),1)
  on conflict (ip_hash) do update set
    window_start=case when private.login_rate_limits.window_start<now()-interval '15 minutes'
      then now() else private.login_rate_limits.window_start end,
    attempts=case when private.login_rate_limits.window_start<now()-interval '15 minutes'
      then 1 else private.login_rate_limits.attempts+1 end
  returning private.login_rate_limits.attempts into attempts;
  if attempts>20 then return null; end if;
  select * into cred from private.civil_credentials where civil_hash=p_civil_hash for update;
  if not found or cred.locked_until>now() then return null; end if;
  if extensions.crypt(p_pin_verifier,cred.pin_hash) <> cred.pin_hash then
    update private.civil_credentials set
      failed_attempts=failed_attempts+1,
      locked_until=case when failed_attempts+1>=5 then now()+interval '1 hour' else null end
    where user_id=cred.user_id;
    return null;
  end if;
  select u.email into user_email from auth.users u
  join public.profiles p on p.id=u.id
  where u.id=cred.user_id and p.is_active=true;
  if user_email is null then return null; end if;
  update private.civil_credentials set failed_attempts=0,locked_until=null
  where user_id=cred.user_id;
  return user_email;
end;
$$;
revoke all on function public.verify_civil_pin(text,text,text) from public, anon, authenticated;
grant execute on function public.verify_civil_pin(text,text,text) to service_role;
