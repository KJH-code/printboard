-- PrintBoard initial schema.
-- Apply with the Supabase SQL editor or Supabase CLI after reviewing this file.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.printers (
  id integer primary key check (id between 1 and 8),
  name text not null,
  status text not null default 'idle'
    check (status in ('idle', 'printing', 'broken')),
  user_name text,
  ends_at timestamptz,
  note text,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint printers_printing_details_check check (
    status <> 'printing' or (user_name is not null and ends_at is not null)
  )
);

create table if not exists public.status_logs (
  id bigint generated always as identity primary key,
  printer_id integer not null references public.printers(id) on delete cascade,
  status text not null check (status in ('idle', 'printing', 'broken')),
  note text,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.print_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  requester_name text not null check (pg_catalog.length(pg_catalog.btrim(requester_name)) between 1 and 100),
  member_no text not null check (pg_catalog.length(pg_catalog.btrim(member_no)) between 1 and 40),
  file_path text not null unique,
  note text check (note is null or pg_catalog.length(note) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'printing', 'done', 'rejected')),
  printer_id integer references public.printers(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.admin_secret (
  id smallint primary key check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists status_logs_printer_created_idx
  on public.status_logs (printer_id, created_at desc);
create index if not exists print_requests_status_created_idx
  on public.print_requests (status, created_at desc);

insert into public.printers (id, name)
values
  (1, '프린터 1'),
  (2, '프린터 2'),
  (3, '프린터 3'),
  (4, '프린터 4'),
  (5, '프린터 5'),
  (6, '프린터 6'),
  (7, '프린터 7'),
  (8, '프린터 8')
on conflict (id) do nothing;

alter table public.printers enable row level security;
alter table public.status_logs enable row level security;
alter table public.print_requests enable row level security;
alter table public.admin_secret enable row level security;

-- Remove any broad default grants before giving the browser only the required access.
revoke all on table public.printers from public, anon, authenticated;
revoke all on table public.status_logs from public, anon, authenticated;
revoke all on table public.print_requests from public, anon, authenticated;
revoke all on table public.admin_secret from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on table public.printers to anon, authenticated;
grant select, insert on table public.status_logs to anon, authenticated;
grant insert (requester_name, member_no, file_path, note)
  on table public.print_requests to anon, authenticated;

drop policy if exists printers_public_read on public.printers;
create policy printers_public_read
  on public.printers for select to anon, authenticated
  using (true);

drop policy if exists status_logs_public_read on public.status_logs;
create policy status_logs_public_read
  on public.status_logs for select to anon, authenticated
  using (true);

drop policy if exists status_logs_public_insert on public.status_logs;
create policy status_logs_public_insert
  on public.status_logs for insert to anon, authenticated
  with check (true);

drop policy if exists print_requests_public_insert on public.print_requests;
create policy print_requests_public_insert
  on public.print_requests for insert to anon, authenticated
  with check (true);

-- No policies or grants are created for direct reads or writes to admin_secret.

create or replace function public.update_printer_status(
  p_printer_id integer,
  p_status text,
  p_user_name text,
  p_ends_at timestamptz,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log_note text;
begin
  if p_status is null or p_status not in ('idle', 'printing', 'broken') then
    raise exception 'invalid printer status' using errcode = '22023';
  end if;

  if p_status = 'printing' then
    if nullif(pg_catalog.btrim(p_user_name), '') is null
       or pg_catalog.length(pg_catalog.btrim(p_user_name)) > 100 then
      raise exception 'operator name is required' using errcode = '22023';
    end if;
    if p_ends_at is null or p_ends_at <= pg_catalog.now() then
      raise exception 'a future estimated end time is required' using errcode = '22023';
    end if;
    v_log_note := pg_catalog.format(
      '출력자: %s · 예상 완료: %s',
      pg_catalog.btrim(p_user_name),
      pg_catalog.to_char(p_ends_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI')
    );
  elsif p_status = 'broken' then
    if nullif(pg_catalog.btrim(p_note), '') is null
       or pg_catalog.length(pg_catalog.btrim(p_note)) > 1000 then
      raise exception 'a short issue note is required' using errcode = '22023';
    end if;
    v_log_note := pg_catalog.btrim(p_note);
  else
    v_log_note := null;
  end if;

  update public.printers
  set status = p_status,
      user_name = case when p_status = 'printing' then pg_catalog.btrim(p_user_name) else null end,
      ends_at = case when p_status = 'printing' then p_ends_at else null end,
      note = case when p_status = 'broken' then pg_catalog.btrim(p_note) else null end,
      updated_at = pg_catalog.now()
  where id = p_printer_id;

  if not found then
    raise exception 'printer not found' using errcode = 'P0002';
  end if;

  insert into public.status_logs (printer_id, status, note)
  values (p_printer_id, p_status, v_log_note);
end;
$$;

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
    raise exception 'invalid admin password' using errcode = '28000';
  end if;

  select s.password_hash into v_hash
  from public.admin_secret as s
  where s.id = 1;

  if v_hash is null or extensions.crypt(pw, v_hash) <> v_hash then
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
    raise exception 'invalid admin password' using errcode = '28000';
  end if;

  select s.password_hash into v_hash
  from public.admin_secret as s
  where s.id = 1;

  if v_hash is null or extensions.crypt(pw, v_hash) <> v_hash then
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

revoke all on function public.update_printer_status(integer, text, text, timestamptz, text) from public;
revoke all on function public.admin_list_requests(text) from public;
revoke all on function public.admin_update_request(text, uuid, text, integer) from public;
grant execute on function public.update_printer_status(integer, text, text, timestamptz, text)
  to anon, authenticated;
grant execute on function public.admin_list_requests(text) to anon, authenticated;
grant execute on function public.admin_update_request(text, uuid, text, integer)
  to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('print-files', 'print-files', true)
on conflict (id) do update set public = excluded.public;

grant insert on table storage.objects to anon, authenticated;

drop policy if exists print_files_uuid_upload on storage.objects;
create policy print_files_uuid_upload
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'print-files'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(3mf|stl)$'
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'printers'
     ) then
    execute 'alter publication supabase_realtime add table public.printers';
  end if;
end;
$$;
