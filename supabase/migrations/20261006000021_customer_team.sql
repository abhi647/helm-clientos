-- The account team: the Seven Billion people who work with a customer, each with a role on that account
-- ("Account lead", "Data engineer"). Shown on the customer page and in the customer's portal; the team hears about
-- the customer's new requests. Managed by the PM, an admin or the CEO.
--
-- Optional, per organisation: "consultants see only their customers". When on, a consultant sees a customer only if
-- they are on its account team, run one of its projects, or own one of its tasks. Admins, the CEO, PMs and finance
-- always see every customer. Off by default, so nothing changes until an admin turns it on.

create table public.customer_team (
  customer_id uuid not null references public.customers (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role_label text not null default '' check (length(role_label) <= 60),
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (customer_id, profile_id)
);
create index on public.customer_team (profile_id);

alter table public.orgs add column consultants_see_own_customers boolean not null default false;

-- ---------------------------------------------------------------- who counts as staff of a customer
create or replace function private.is_staff_of(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.staff_session_ok() and exists (
    select 1 from public.profiles p join public.customers c on c.org_id = p.org_id join public.orgs o on o.id = p.org_id
    where p.id = (select auth.uid()) and p.kind = 'internal' and p.access_revoked_at is null and c.id = cid
      and (p.internal_role <> 'consultant' or not o.consultants_see_own_customers
           or exists (select 1 from public.customer_team t where t.customer_id = cid and t.profile_id = p.id)
           or exists (select 1 from public.projects pr where pr.customer_id = cid and pr.pm_id = p.id)
           or exists (select 1 from public.tasks tk where tk.customer_id = cid and tk.assignee_id = p.id)))
$$;
create index if not exists tasks_customer_assignee_idx on public.tasks (customer_id, assignee_id);
create index if not exists projects_customer_pm_idx on public.projects (customer_id, pm_id);

-- ---------------------------------------------------------------- the team table
alter table public.customer_team enable row level security;
revoke all on public.customer_team from anon, authenticated;
grant select on public.customer_team to authenticated;
-- staff of the customer, and the customer's own people (their portal shows who serves them)
create policy customer_team_read on public.customer_team for select to authenticated
  using (private.is_staff_of(customer_id) or customer_id = private.my_customer());

create or replace function public.add_to_customer_team(p_customer uuid, p_person uuid, p_role text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text; v_customer text;
begin
  if not private.can_manage(p_customer) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.profiles p join public.customers c on c.org_id = p.org_id
                 where p.id = p_person and c.id = p_customer and p.kind = 'internal' and p.access_revoked_at is null) then
    raise exception 'only Seven Billion people can be on the account team';
  end if;
  insert into public.customer_team (customer_id, profile_id, role_label, added_by)
  values (p_customer, p_person, left(trim(coalesce(p_role, '')), 60), (select auth.uid()))
  on conflict (customer_id, profile_id) do update set role_label = excluded.role_label;
  select full_name into v_name from public.profiles where id = p_person;
  select name into v_customer from public.customers where id = p_customer;
  perform private.log(p_customer, null, private.actor_name() || ' added ' || v_name || ' to the account team'
    || case when coalesce(trim(p_role), '') <> '' then ' as ' || trim(p_role) else '' end, 'customer', p_customer, 'internal');
  perform private.notify(p_person, 'team.added', 'You are on the ' || v_customer || ' account team',
    case when coalesce(trim(p_role), '') <> '' then 'Your role: ' || trim(p_role) || '. ' else '' end || 'You will hear about their new requests.',
    '/customers/' || p_customer, false, true);
end $$;

create or replace function public.remove_from_customer_team(p_customer uuid, p_person uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not private.can_manage(p_customer) then raise exception 'not allowed'; end if;
  delete from public.customer_team where customer_id = p_customer and profile_id = p_person;
  select full_name into v_name from public.profiles where id = p_person;
  perform private.log(p_customer, null, private.actor_name() || ' removed ' || coalesce(v_name, 'someone') || ' from the account team', 'customer', p_customer, 'internal');
end $$;

-- the admin switch
create or replace function public.set_consultants_see_own_customers(p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (private.is_staff() and private.staff_role() in ('admin', 'ceo')) then raise exception 'not allowed'; end if;
  update public.orgs set consultants_see_own_customers = p_on where id = private.my_org();
end $$;

-- whoever adds a customer is on its team from the start
create or replace function private.on_customer_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_staff() then
    insert into public.customer_team (customer_id, profile_id, role_label, added_by)
    values (new.id, (select auth.uid()), 'Account lead', (select auth.uid())) on conflict do nothing;
  end if;
  return null;
end $$;
create trigger customers_team_creator after insert on public.customers for each row execute function private.on_customer_created();

-- the account team hears about the customer's new requests (the owner or PM is already told by the request trigger)
create or replace function private.notify_team_of_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; v_pm uuid;
begin
  select pm_id into v_pm from public.projects where id = new.project_id;
  for r in select t.profile_id from public.customer_team t join public.profiles p on p.id = t.profile_id
           where t.customer_id = new.customer_id and p.access_revoked_at is null
             and t.profile_id is distinct from new.owner_id and t.profile_id is distinct from v_pm loop
    perform private.notify(r.profile_id, 'request.submitted', new.number || ' ' || new.title,
      'New ' || replace(new.type::text, '_', ' ') || ' from an account you are on, priority ' || new.priority, '/requests/' || new.id, false, true);
  end loop;
  return null;
end $$;
create trigger requests_notify_team after insert on public.requests for each row execute function private.notify_team_of_request();

revoke execute on function public.add_to_customer_team, public.remove_from_customer_team, public.set_consultants_see_own_customers from public, anon;
grant execute on function public.add_to_customer_team, public.remove_from_customer_team, public.set_consultants_see_own_customers to authenticated;
