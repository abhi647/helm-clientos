-- Sign-in and invite emails are rendered by Supabase, which can only read the account's user_metadata.
-- Keep each person's name and workspace there, so the templates can say
-- "Hi Omar, here is your way into the Nesma Group workspace". Display text only; access never reads it.
--
-- Supabase Auth writes the whole user row back after creating or updating a user, which would wipe values a
-- separate update put there. So the names are merged in by a trigger on the row itself, every time it is written.

create or replace function private.email_names(p_user uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'full_name', p.full_name,
    'first_name', coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'there'),
    'workspace', coalesce(case when p.kind = 'customer' then c.name else o.name end, 'Helm'))
  from public.profiles p
  left join public.customers c on c.id = p.customer_id
  left join public.orgs o on o.id = p.org_id
  where p.id = p_user
$$;

-- every write to the account keeps the names (no profile yet, e.g. a brand-new invite: leave what was sent)
create or replace function private.keep_email_names() returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  v := private.email_names(new.id);
  if v is not null then
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) || v;
  end if;
  return new;
end $$;
create trigger users_keep_email_names before insert or update on auth.users
  for each row execute function private.keep_email_names();

-- a profile is created or renamed: touch the account so the trigger above refreshes the names
create or replace function private.sync_email_names() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) where id = new.id;
  return null;
end $$;
create trigger profiles_sync_email_names after insert or update of full_name, customer_id, org_id on public.profiles
  for each row execute function private.sync_email_names();

-- everyone who already has an account
update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb);
