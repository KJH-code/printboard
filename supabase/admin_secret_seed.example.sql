-- Example only: do not run until the placeholder has been replaced with a
-- locally generated bcrypt hash compatible with pgcrypto's `crypt()`.
-- Never put the plaintext admin password in this file or in Git.
insert into public.admin_secret (id, password_hash)
values (1, '__REPLACE_WITH_LOCAL_BCRYPT_HASH__')
on conflict (id) do update
set password_hash = excluded.password_hash,
    updated_at = now();
