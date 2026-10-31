-- Private upload and server-side abuse controls for PrintBoard.
-- Keep the bucket-specific file size limit unset. The project/plan-level
-- Storage cap remains in effect; this app does not add a separate cap.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.rate_limit_salt (
  id boolean primary key default true check (id),
  salt bytea not null
);
revoke all on table private.rate_limit_salt from public, anon, authenticated, service_role;
alter table private.rate_limit_salt enable row level security;
insert into private.rate_limit_salt (id, salt)
values (true, extensions.gen_random_bytes(32))
on conflict (id) do nothing;

create table if not exists private.rate_limit_buckets (
  scope text not null,
  client_key bytea not null,
  window_started_at timestamptz not null,
  hits integer not null check (hits > 0),
  primary key (scope, client_key)
);
revoke all on table private.rate_limit_buckets from public, anon, authenticated, service_role;
alter table private.rate_limit_buckets enable row level security;

create or replace function public.consume_printboard_rate_limit(
  p_scope text,
  p_client_ip inet,
  p_max_hits integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salt bytea;
  v_client_key bytea;
  v_window timestamptz;
  v_hits integer;
begin
  if p_scope not in ('request_upload', 'request_submit', 'request_cleanup', 'admin')
     or p_client_ip is null
     or p_max_hits < 1 or p_max_hits > 100
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    return false;
  end if;

  select s.salt into v_salt
  from private.rate_limit_salt as s
  where s.id = true;
  if v_salt is null then
    return false;
  end if;

  v_client_key := extensions.hmac(
    pg_catalog.convert_to(p_client_ip::text, 'UTF8'),
    v_salt,
    'sha256'
  );

  if pg_catalog.random() < 0.02 then
    delete from private.rate_limit_buckets as b
    where b.window_started_at < pg_catalog.now() - interval '2 days';
  end if;

  insert into private.rate_limit_buckets as current_bucket
    (scope, client_key, window_started_at, hits)
  values (p_scope, v_client_key, pg_catalog.clock_timestamp(), 1)
  on conflict (scope, client_key) do update
  set window_started_at = case
        when current_bucket.window_started_at + pg_catalog.make_interval(secs => p_window_seconds)
             <= pg_catalog.clock_timestamp()
        then pg_catalog.clock_timestamp()
        else current_bucket.window_started_at
      end,
      hits = case
        when current_bucket.window_started_at + pg_catalog.make_interval(secs => p_window_seconds)
             <= pg_catalog.clock_timestamp()
        then 1
        else current_bucket.hits + 1
      end
  returning current_bucket.window_started_at, current_bucket.hits
  into v_window, v_hits;

  return v_hits <= p_max_hits;
end;
$$;
revoke all on function public.consume_printboard_rate_limit(text, inet, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_printboard_rate_limit(text, inet, integer, integer)
  to service_role;

create or replace function private.consume_current_admin_attempt()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text;
begin
  begin
    v_ip := coalesce(
      nullif((pg_catalog.current_setting('request.headers', true)::jsonb)->>'cf-connecting-ip', ''),
      nullif(pg_catalog.split_part(
        (pg_catalog.current_setting('request.headers', true)::jsonb)->>'x-forwarded-for', ',', 1
      ), '')
    );
  exception when others then
    v_ip := null;
  end;

  if v_ip is null then
    return false;
  end if;
  return public.consume_printboard_rate_limit('admin', v_ip::inet, 8, 900);
exception when others then
  return false;
end;
$$;
revoke all on function private.consume_current_admin_attempt() from public, anon, authenticated, service_role;

create or replace function public.printboard_admin_password_matches(pw text, p_client_ip inet)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if pw is null or pg_catalog.length(pw) > 72 then
    if not public.consume_printboard_rate_limit('admin', p_client_ip, 8, 900) then
      raise exception 'too many admin attempts' using errcode = 'P0001';
    end if;
    return false;
  end if;

  select s.password_hash into v_hash
  from public.admin_secret as s
  where s.id = 1;

  if v_hash is null or extensions.crypt(pw, v_hash) <> v_hash then
    if not public.consume_printboard_rate_limit('admin', p_client_ip, 8, 900) then
      raise exception 'too many admin attempts' using errcode = 'P0001';
    end if;
    return false;
  end if;
  return true;
end;
$$;
revoke all on function public.printboard_admin_password_matches(text, inet)
  from public, anon, authenticated;
grant execute on function public.printboard_admin_password_matches(text, inet)
  to service_role;

-- The Functions service_role becomes the only browser-independent writer for
-- requests and files. Printer status RPC remains as-is in this migration.
revoke insert on table public.print_requests from public, anon, authenticated;
drop policy if exists print_requests_public_insert on public.print_requests;
grant select, insert, update, delete on table public.print_requests to service_role;

revoke insert on table storage.objects from public, anon, authenticated;
drop policy if exists print_files_uuid_upload on storage.objects;
update storage.buckets
set public = false,
    allowed_mime_types = array[
      'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
      'model/stl'
    ]
where id = 'print-files';

-- Preserve the current password-based RPC interface while applying a server
-- rate limit at the database boundary. Forwarded IPs are hashed with a random
-- database-only salt and raw addresses are not stored.
create or replace function public.admin_list_requests(pw text)
returns table (
  id uuid,
  requester_name text,
  member_no text,
  file_path text,
  note text,
  status text,
  printer_id integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if pw is null or pg_catalog.length(pw) > 72 then
    if not private.consume_current_admin_attempt() then
      raise exception 'too many admin attempts' using errcode = 'P0001';
    end if;
    raise exception 'invalid admin password' using errcode = '28000';
  end if;

  select s.password_hash into v_hash
  from public.admin_secret as s
  where s.id = 1;
  if v_hash is null or extensions.crypt(pw, v_hash) <> v_hash then
    if not private.consume_current_admin_attempt() then
      raise exception 'too many admin attempts' using errcode = 'P0001';
    end if;
    raise exception 'invalid admin password' using errcode = '28000';
  end if;

  return query
  select r.id, r.requester_name, r.member_no, r.file_path, r.note,
         r.status, r.printer_id, r.created_at
  from public.print_requests as r
  order by r.created_at desc;
end;
$$;

create or replace function public.admin_update_request(
  pw text,
  req_id uuid,
  new_status text,
  printer_id integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if pw is null or pg_catalog.length(pw) > 72 then
    if not private.consume_current_admin_attempt() then
      raise exception 'too many admin attempts' using errcode = 'P0001';
    end if;
    raise exception 'invalid admin password' using errcode = '28000';
  end if;

  select s.password_hash into v_hash
  from public.admin_secret as s
  where s.id = 1;
  if v_hash is null or extensions.crypt(pw, v_hash) <> v_hash then
    if not private.consume_current_admin_attempt() then
      raise exception 'too many admin attempts' using errcode = 'P0001';
    end if;
    raise exception 'invalid admin password' using errcode = '28000';
  end if;

  if new_status is null or new_status not in ('pending', 'accepted', 'printing', 'done', 'rejected') then
    raise exception 'invalid request status' using errcode = '22023';
  end if;
  if printer_id is not null and not exists (
    select 1 from public.printers as p where p.id = printer_id
  ) then
    raise exception 'printer not found' using errcode = '22023';
  end if;

  update public.print_requests as r
  set status = new_status,
      printer_id = $4
  where r.id = $2;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

-- admin RPCs remain available for compatibility, but they now share the same
-- database rate limiter. Do not treat this as a full admin-auth redesign.
revoke all on function public.admin_list_requests(text) from public;
revoke all on function public.admin_update_request(text, uuid, text, integer) from public;
grant execute on function public.admin_list_requests(text) to anon, authenticated, service_role;
grant execute on function public.admin_update_request(text, uuid, text, integer)
  to anon, authenticated, service_role;

-- The signed-download function has already obtained the trusted client IP from
-- Supabase's Edge ingress. Use that IP here instead of the Edge-to-PostgREST
-- request headers, which identify the function's server-side call.
create or replace function public.printboard_admin_password_matches(pw text, p_client_ip inet)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if p_client_ip is null then
    raise exception 'client IP unavailable' using errcode = 'P0001';
  end if;

  if pw is null or pg_catalog.length(pw) > 72 then
    if not public.consume_printboard_rate_limit('admin', p_client_ip, 8, 900) then
      raise exception 'too many admin attempts' using errcode = 'P0001';
    end if;
    return false;
  end if;

  select s.password_hash into v_hash
  from public.admin_secret as s
  where s.id = 1;
  if v_hash is null or extensions.crypt(pw, v_hash) <> v_hash then
    if not public.consume_printboard_rate_limit('admin', p_client_ip, 8, 900) then
      raise exception 'too many admin attempts' using errcode = 'P0001';
    end if;
    return false;
  end if;
  return true;
end;
$$;
revoke all on function public.printboard_admin_password_matches(text, inet)
  from public, anon, authenticated;
grant execute on function public.printboard_admin_password_matches(text, inet) to service_role;

-- Anonymous QR updates cannot identify who changed a printer. A short,
-- database-enforced per-printer cooldown limits rapid repeated changes while
-- keeping the public QR flow available. The first update is always allowed.
create table if not exists private.printer_status_cooldowns (
  printer_id integer primary key references public.printers(id) on delete cascade,
  last_update_at timestamptz
);
revoke all on table private.printer_status_cooldowns from public, anon, authenticated, service_role;
alter table private.printer_status_cooldowns enable row level security;
insert into private.printer_status_cooldowns (printer_id, last_update_at)
select p.id, null
from public.printers as p
on conflict (printer_id) do nothing;

create or replace function private.enforce_printer_status_cooldown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_update timestamptz;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select c.last_update_at into v_last_update
  from private.printer_status_cooldowns as c
  where c.printer_id = new.id
  for update;

  if not found then
    raise exception 'printer status limiter unavailable' using errcode = 'P0001';
  end if;

  if v_last_update is not null and v_last_update > v_now - interval '15 seconds' then
    raise exception '상태가 자주 변경되었습니다. 15초 뒤 다시 시도해 주세요.' using errcode = 'P0001';
  end if;

  update private.printer_status_cooldowns as c
  set last_update_at = v_now
  where c.printer_id = new.id;
  return new;
end;
$$;
revoke all on function private.enforce_printer_status_cooldown() from public, anon, authenticated, service_role;
drop trigger if exists printers_status_cooldown on public.printers;
create trigger printers_status_cooldown
before update on public.printers
for each row execute function private.enforce_printer_status_cooldown();
