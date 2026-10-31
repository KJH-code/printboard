-- QR 토큰 1단계: 토큰 테이블 + 토큰 확인 함수 + 관리자용 토큰 조회 함수
-- 기존 update_printer_status는 그대로 두고, 그 앞에 토큰 확인만 덧붙인다.

create table if not exists private.printer_qr_tokens (
  printer_id integer primary key references public.printers(id) on delete cascade,
  token text not null
);
alter table private.printer_qr_tokens enable row level security;
revoke all on table private.printer_qr_tokens from public, anon, authenticated;

insert into private.printer_qr_tokens (printer_id, token)
select p.id, encode(extensions.gen_random_bytes(9), 'hex')
from public.printers as p
on conflict (printer_id) do nothing;

create or replace function public.update_printer_status_qr(
  p_printer_id integer,
  p_token text,
  p_status text,
  p_user_name text,
  p_ends_at timestamptz,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_token is null or not exists (
    select 1 from private.printer_qr_tokens as t
    where t.printer_id = p_printer_id and t.token = p_token
  ) then
    raise exception 'qr token required' using errcode = '42501';
  end if;
  perform public.update_printer_status(p_printer_id, p_status, p_user_name, p_ends_at, p_note);
end;
$fn$;
revoke all on function public.update_printer_status_qr(integer, text, text, text, timestamptz, text) from public;
grant execute on function public.update_printer_status_qr(integer, text, text, text, timestamptz, text) to anon, authenticated;

create or replace function public.admin_qr_tokens(pw text)
returns table (printer_id integer, token text)
language plpgsql
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_hash text;
begin
  if pw is null or pg_catalog.length(pw) > 72 then
    if not private.consume_current_admin_attempt() then
      raise exception 'too many admin attempts' using errcode = 'P0001';
    end if;
    raise exception 'invalid admin password' using errcode = '28000';
  end if;

  v_hash := (select s.password_hash from public.admin_secret as s where s.id = 1);
  if v_hash is null or extensions.crypt(pw, v_hash) <> v_hash then
    if not private.consume_current_admin_attempt() then
      raise exception 'too many admin attempts' using errcode = 'P0001';
    end if;
    raise exception 'invalid admin password' using errcode = '28000';
  end if;

  return query
  select t.printer_id, t.token from private.printer_qr_tokens as t order by t.printer_id;
end;
$fn$;
revoke all on function public.admin_qr_tokens(text) from public;
grant execute on function public.admin_qr_tokens(text) to anon, authenticated;
