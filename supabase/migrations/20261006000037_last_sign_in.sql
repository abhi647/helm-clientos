-- How each person last signed in (Google, Microsoft, passkey, password or email code), and when.
-- Auth keeps the time of the last sign-in but not the method (a passkey sign-in leaves no trace on an identity),
-- so the sign-in routes note it here. Shown to the person on their profile and to admins on the Admin page.

alter table public.profiles
  add column last_sign_in_via text check (last_sign_in_via is null or last_sign_in_via in ('google', 'azure', 'passkey', 'password', 'code')),
  add column last_sign_in_via_at timestamptz;

-- Not readable by other signed-in users (no select grant). The sign-in routes write them through this function,
-- which touches only the caller's row.
create or replace function public.note_sign_in(via text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set last_sign_in_via = via, last_sign_in_via_at = now()
   where id = (select auth.uid());
$$;

revoke all on function public.note_sign_in(text) from public, anon;
grant execute on function public.note_sign_in(text) to authenticated;
