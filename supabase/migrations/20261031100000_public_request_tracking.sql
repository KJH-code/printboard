-- Public request tracking uses an unguessable short reference plus the
-- submitter's member number. The lookup endpoint still returns no PII.
alter table public.print_requests add column if not exists tracking_code text;

update public.print_requests
set tracking_code = upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10))
where tracking_code is null;

alter table public.print_requests alter column tracking_code set not null;
alter table public.print_requests alter column tracking_code
  set default upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10));
create unique index if not exists print_requests_tracking_code_uidx
  on public.print_requests (tracking_code);

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
  if p_scope not in ('request_upload', 'request_submit', 'request_cleanup', 'request_lookup', 'admin')
     or p_client_ip is null
     or p_max_hits < 1 or p_max_hits > 100
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    return false;
  end if;

  select s.salt into v_salt from private.rate_limit_salt as s where s.id = true;
  if v_salt is null then return false; end if;

  v_client_key := extensions.hmac(pg_catalog.convert_to(p_client_ip::text, 'UTF8'), v_salt, 'sha256');
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
             <= pg_catalog.clock_timestamp() then pg_catalog.clock_timestamp()
        else current_bucket.window_started_at end,
      hits = case
        when current_bucket.window_started_at + pg_catalog.make_interval(secs => p_window_seconds)
             <= pg_catalog.clock_timestamp() then 1
        else current_bucket.hits + 1 end
  returning current_bucket.window_started_at, current_bucket.hits into v_window, v_hits;
  return v_hits <= p_max_hits;
end;
$$;
revoke all on function public.consume_printboard_rate_limit(text, inet, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_printboard_rate_limit(text, inet, integer, integer)
  to service_role;
