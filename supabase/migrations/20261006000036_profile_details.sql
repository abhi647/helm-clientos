-- Profiles: a photo (or an initials avatar in a colour of your choosing) and a few details about you.
-- The photo, colour and job title are shown wherever your name is (customers on your work see them too); phone,
-- location, time zone and bio are for the Seven Billion team only. Everyone edits only their own.

alter table public.profiles
  add column avatar_path text check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'),
  add column avatar_color text check (avatar_color is null or avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  add column job_title text check (job_title is null or char_length(job_title) <= 80),
  add column phone text check (phone is null or phone ~ '^[0-9+()\- .]{5,30}$'),
  add column location text check (location is null or char_length(location) <= 80),
  add column timezone text check (timezone is null or char_length(timezone) <= 60),
  add column bio text check (bio is null or char_length(bio) <= 500);

-- shown with your name to anyone who can see you
grant select (avatar_path, avatar_color, job_title) on public.profiles to authenticated;
-- you change these on your own profile (the update policy already limits it to your row)
grant update (full_name, avatar_path, avatar_color, job_title, phone, location, timezone, bio) on public.profiles to authenticated;

-- the team directory gains the contact details (staff only, as before)
create or replace view public.directory with (security_barrier) as
  select p.id, p.full_name, p.email, p.kind, p.org_id, p.internal_role, p.customer_id, p.customer_role, p.can_view_invoices, p.created_at,
    p.access_revoked_at, p.avatar_path, p.avatar_color, p.job_title, p.phone, p.location, p.timezone, p.bio
  from public.profiles p
  where private.is_staff() and (
    p.org_id = (select org_id from private.my_profile())
    or (p.customer_id is not null and private.is_staff_of(p.customer_id)));

-- photos: public to read (random file names, small square images), each person writes only their own folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg'];

-- listing your own folder (to tidy old photos); the files themselves are public to read
create policy avatars_own_list on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_own_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

notify pgrst, 'reload schema';
