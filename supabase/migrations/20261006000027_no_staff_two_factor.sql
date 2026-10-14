-- Staff no longer need the authenticator app: any signed-in staff session sees staff data again.
-- Sign-in is by email link or code, or with Google or Microsoft (whose own two-step sign-in protects the account).
-- Instant lock-out (access_revoked_at) and every other check stay as they are; the helpers still call this function,
-- so turning two-factor back on is a one-line change here.
create or replace function private.staff_session_ok() returns boolean language sql stable as $$
  select (select auth.uid()) is not null
$$;
