-- QR 토큰 2단계: 새 사이트가 배포된 뒤에 실행한다.
-- 토큰 없이 상태를 바꾸던 기존 함수를 공개 키로는 못 부르게 막는다.
revoke execute on function public.update_printer_status(integer, text, text, timestamptz, text) from public, anon, authenticated;
