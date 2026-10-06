-- 7B Client OS: security for real customers.
-- 1. Staff two-factor: Seven Billion staff see staff data only in a session verified with an authenticator app (aal2).
--    It is enforced in the access helpers, so every RLS policy, view and RPC inherits it.
-- 2. Instant lock-out: removing someone's access takes effect on their very next request, not when their token expires.
-- 3. Files: an allowlist of types, a scan status (nothing is downloadable until it has been checked), and archiving.

-- ---------------------------------------------------------------- access helpers
alter table public.profiles add column access_revoked_at timestamptz;   -- not granted to signed-in users (see field security)

create or replace function private.staff_session_ok() returns boolean language sql stable as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
$$;

create or replace function private.my_profile()
returns public.profiles language sql stable security definer set search_path = '' as $$
  select p.* from public.profiles p where p.id = (select auth.uid()) and p.access_revoked_at is null
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.staff_session_ok() and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.kind = 'internal' and p.access_revoked_at is null)
$$;

create or replace function private.staff_role()
returns public.internal_role language sql stable security definer set search_path = '' as $$
  select p.internal_role from public.profiles p
  where p.id = (select auth.uid()) and p.kind = 'internal' and p.access_revoked_at is null and private.staff_session_ok()
$$;

create or replace function private.my_customer()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.customer_id from public.profiles p where p.id = (select auth.uid()) and p.kind = 'customer' and p.access_revoked_at is null
$$;

create or replace function private.is_staff_of(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.staff_session_ok() and exists (
    select 1 from public.profiles p join public.customers c on c.org_id = p.org_id
    where p.id = (select auth.uid()) and p.kind = 'internal' and p.access_revoked_at is null and c.id = cid)
$$;

-- your own profile; null once access is removed, so the app signs you out
create or replace function public.get_my_profile() returns public.profiles
language sql stable security definer set search_path = '' as $$
  select p.* from public.profiles p where p.id = (select auth.uid()) and p.access_revoked_at is null
$$;

-- remove or restore access (server only): blocks every policy at once and ends all sessions
create or replace function public.set_access(p_user uuid, p_revoked boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set access_revoked_at = case when p_revoked then now() else null end where id = p_user;
  if p_revoked then
    delete from auth.sessions where user_id = p_user;          -- refresh tokens go with their sessions
  end if;
end $$;
revoke execute on function public.set_access from public, anon, authenticated;
grant execute on function public.set_access to service_role;

-- ---------------------------------------------------------------- files
alter table public.documents
  add column scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'not_scanned', 'infected', 'rejected')),
  add column scanned_at timestamptz,
  add column mime_type text,
  add column size_bytes bigint,
  add column archived_at timestamptz;
alter table public.document_versions add column scan_status text not null default 'clean';
update public.documents set scan_status = 'clean' where storage_path is null;    -- placeholders have no file

-- only the server's scanner can mark a file clean; any new or replaced file starts as pending
create or replace function private.guard_scan_status() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.storage_path is null then new.scan_status := 'clean'; return new; end if;   -- placeholder without a file
  if coalesce((select auth.role()), '') = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    new.scan_status := 'pending';
    new.scanned_at := null;
  elsif new.storage_path is distinct from old.storage_path then
    new.scan_status := 'pending'; new.scanned_at := null;
  else
    new.scan_status := old.scan_status; new.scanned_at := old.scanned_at;
  end if;
  return new;
end $$;
create trigger documents_scan_guard before insert or update on public.documents for each row execute function private.guard_scan_status();

-- versions keep the scan result of the file they held
create or replace function public.add_document_version(p_document uuid, p_path text, p_name text, p_note text default '')
returns int language plpgsql security definer set search_path = '' as $$
declare d public.documents;
begin
  select * into d from public.documents where id = p_document for update;
  if not found or d.archived_at is not null
     or not (private.is_staff_of(d.customer_id) or (d.visibility = 'shared' and d.customer_id = private.my_customer())) then
    raise exception 'not allowed';
  end if;
  if p_path not like d.customer_id || '/' || d.id || '/%' then raise exception 'not allowed'; end if;
  if d.storage_path is not null then
    insert into public.document_versions (document_id, customer_id, version, name, storage_path, note, uploaded_by, created_at, scan_status)
    values (d.id, d.customer_id, d.version, d.name, d.storage_path, d.note, d.uploaded_by, d.created_at, d.scan_status);
  end if;
  update public.documents set storage_path = p_path, name = left(p_name, 160), version = d.version + 1, note = coalesce(p_note, ''),
    uploaded_by = (select auth.uid()), created_at = now()
  where id = d.id;
  perform private.log(d.customer_id, d.project_id, private.actor_name() || ' uploaded v' || (d.version + 1) || ' of ' || d.name, 'document', d.id, d.visibility);
  return d.version + 1;
end $$;

-- customers never see archived files or files that failed the check
drop policy documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated using (
  private.is_staff_of(customer_id)
  or (visibility = 'shared' and customer_id = private.my_customer() and archived_at is null and scan_status not in ('infected', 'rejected'))
);

-- the storage bucket accepts only business document and image types, up to 50 MB
update storage.buckets set file_size_limit = 52428800, allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint',
  'text/csv', 'text/plain', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/zip'
] where id = 'documents';

grant execute on all functions in schema private to authenticated;

-- the staff directory shows who has had access removed
create or replace view public.directory with (security_barrier) as
  select p.id, p.full_name, p.email, p.kind, p.org_id, p.internal_role, p.customer_id, p.customer_role, p.can_view_invoices, p.created_at, p.access_revoked_at
  from public.profiles p
  where private.is_staff() and (
    p.org_id = (select org_id from private.my_profile())
    or (p.customer_id is not null and private.is_staff_of(p.customer_id)));

-- archive / restore a file (staff); customers stop seeing it at once, history is kept
create or replace function public.archive_document(p_document uuid, p_archive boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.documents;
begin
  select * into d from public.documents where id = p_document for update;
  if not found or not private.is_staff_of(d.customer_id) then raise exception 'not allowed'; end if;
  update public.documents set archived_at = case when p_archive then now() else null end where id = d.id;
  perform private.log(d.customer_id, d.project_id, private.actor_name() || case when p_archive then ' archived ' else ' restored ' end || d.name, 'document', d.id, 'internal');
end $$;
revoke execute on function public.archive_document from public, anon;
grant execute on function public.archive_document to authenticated;
