-- 7B Client OS: who can see and change what.
-- Rule: Seven Billion staff see everything for their org's customers. Customer users see only rows of their
-- own customer that are marked 'shared'. Commercials, estimates and time are staff-only tables.
-- Helpers live in the `private` schema, which the Data API does not expose.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.my_profile()
returns public.profiles language sql stable security definer set search_path = '' as $$
  select p.* from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.kind = 'internal')
$$;

create or replace function private.staff_role()
returns public.internal_role language sql stable security definer set search_path = '' as $$
  select p.internal_role from public.profiles p where p.id = (select auth.uid()) and p.kind = 'internal'
$$;

create or replace function private.my_customer()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.customer_id from public.profiles p where p.id = (select auth.uid()) and p.kind = 'customer'
$$;

-- staff of the org that owns this customer
create or replace function private.is_staff_of(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.customers c on c.org_id = p.org_id
    where p.id = (select auth.uid()) and p.kind = 'internal' and c.id = cid
  )
$$;

create or replace function private.can_read(cid uuid, vis public.visibility)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_staff_of(cid) or (vis = 'shared' and private.my_customer() = cid)
$$;

create or replace function private.can_manage(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_staff_of(cid) and private.staff_role() in ('admin', 'ceo', 'pm')
$$;

grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------- enable RLS everywhere
do $$
declare t text;
begin
  foreach t in array array['orgs','customers','profiles','projects','project_commercials','phases','tasks','task_estimates',
    'time_entries','requests','request_events','approvals','approval_events','action_items','comments','documents',
    'meetings','decisions','updates','invoices','notifications','email_outbox','activity','integration_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- audit tables are append-only for everyone except the database owner
revoke update, delete on public.approval_events, public.request_events, public.activity from authenticated, anon;
-- service-only tables
revoke all on public.email_outbox, public.integration_events from authenticated, anon;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------- orgs, customers, profiles
create policy orgs_read on public.orgs for select to authenticated
  using (id = (select org_id from private.my_profile()));

create policy customers_read on public.customers for select to authenticated
  using (private.is_staff_of(id) or private.my_customer() = id);
create policy customers_write on public.customers for all to authenticated
  using (private.can_manage(id))
  with check (org_id = (select org_id from private.my_profile()) and private.staff_role() in ('admin', 'ceo', 'pm'));

create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (private.is_staff() and (org_id = (select org_id from private.my_profile()) or private.is_staff_of(customer_id)))
  -- customers see their own colleagues and the Seven Billion team serving them
  or (customer_id is not null and customer_id = private.my_customer())
  or (kind = 'internal' and org_id = (select c.org_id from public.customers c where c.id = private.my_customer()))
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- a user may rename themselves but never change their kind, role, customer or invoice access
create or replace function private.guard_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and (
    new.kind is distinct from old.kind or new.org_id is distinct from old.org_id
    or new.internal_role is distinct from old.internal_role or new.customer_id is distinct from old.customer_id
    or new.customer_role is distinct from old.customer_role or new.can_view_invoices is distinct from old.can_view_invoices
    or new.email is distinct from old.email
  ) then
    raise exception 'profile access fields can only be changed by an administrator';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function private.guard_profile();

-- ---------------------------------------------------------------- delivery
create policy projects_read on public.projects for select to authenticated using (private.can_read(customer_id, 'shared'));
create policy projects_write on public.projects for all to authenticated
  using (private.can_manage(customer_id)) with check (private.can_manage(customer_id));

create policy commercials_staff on public.project_commercials for all to authenticated
  using (private.is_staff_of(customer_id) and private.staff_role() in ('admin', 'ceo', 'finance'))
  with check (private.is_staff_of(customer_id) and private.staff_role() in ('admin', 'ceo', 'finance'));

create policy phases_read on public.phases for select to authenticated using (private.can_read(customer_id, visibility));
create policy phases_write on public.phases for all to authenticated
  using (private.can_manage(customer_id)) with check (private.can_manage(customer_id));

create policy tasks_read on public.tasks for select to authenticated using (private.can_read(customer_id, visibility));
create policy tasks_write on public.tasks for all to authenticated
  using (private.is_staff_of(customer_id)) with check (private.is_staff_of(customer_id));

create policy estimates_staff on public.task_estimates for all to authenticated
  using (private.is_staff_of(customer_id)) with check (private.is_staff_of(customer_id));

create policy time_read on public.time_entries for select to authenticated using (private.is_staff_of(customer_id));
create policy time_insert on public.time_entries for insert to authenticated
  with check (private.is_staff_of(customer_id) and user_id = (select auth.uid()));
create policy time_delete_own on public.time_entries for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- requests, approvals, action items
create policy requests_read on public.requests for select to authenticated using (private.can_read(customer_id, 'shared'));
create policy requests_staff_write on public.requests for all to authenticated
  using (private.is_staff_of(customer_id)) with check (private.is_staff_of(customer_id));
create policy requests_customer_insert on public.requests for insert to authenticated with check (
  customer_id = private.my_customer() and requested_by = (select auth.uid()) and status = 'submitted' and owner_id is null
);

create policy request_events_read on public.request_events for select to authenticated using (private.can_read(customer_id, 'shared'));

create policy approvals_read on public.approvals for select to authenticated using (private.can_read(customer_id, 'shared'));
create policy approvals_staff_insert on public.approvals for insert to authenticated
  with check (private.is_staff_of(customer_id) and requested_by = (select auth.uid()) and status = 'pending');
-- status changes go through decide_approval / resubmit_approval so the audit trail is always written

create policy approval_events_read on public.approval_events for select to authenticated using (private.can_read(customer_id, 'shared'));

create policy actions_read on public.action_items for select to authenticated using (private.can_read(customer_id, 'shared'));
create policy actions_staff_write on public.action_items for all to authenticated
  using (private.is_staff_of(customer_id)) with check (private.is_staff_of(customer_id));

-- ---------------------------------------------------------------- collaboration
create policy comments_read on public.comments for select to authenticated using (private.can_read(customer_id, visibility));
create policy comments_insert on public.comments for insert to authenticated with check (
  author_id = (select auth.uid())
  and (private.is_staff_of(customer_id) or (customer_id = private.my_customer() and visibility = 'shared'))
);
create policy comments_delete_own on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) and created_at > now() - interval '15 minutes');

create policy documents_read on public.documents for select to authenticated using (private.can_read(customer_id, visibility));
create policy documents_staff_write on public.documents for all to authenticated
  using (private.is_staff_of(customer_id)) with check (private.is_staff_of(customer_id));
create policy documents_customer_insert on public.documents for insert to authenticated with check (
  customer_id = private.my_customer() and visibility = 'shared' and uploaded_by = (select auth.uid())
);

create policy meetings_read on public.meetings for select to authenticated using (private.can_read(customer_id, visibility));
create policy meetings_write on public.meetings for all to authenticated
  using (private.is_staff_of(customer_id)) with check (private.is_staff_of(customer_id));

create policy decisions_read on public.decisions for select to authenticated using (private.can_read(customer_id, visibility));
create policy decisions_write on public.decisions for all to authenticated
  using (private.is_staff_of(customer_id)) with check (private.is_staff_of(customer_id));

create policy updates_read on public.updates for select to authenticated using (
  private.is_staff_of(customer_id) or (customer_id = private.my_customer() and status = 'published')
);
create policy updates_write on public.updates for all to authenticated
  using (private.is_staff_of(customer_id)) with check (private.is_staff_of(customer_id));

create policy activity_read on public.activity for select to authenticated using (private.can_read(customer_id, visibility));

-- ---------------------------------------------------------------- finance and notifications
create policy invoices_read on public.invoices for select to authenticated using (
  (private.is_staff_of(customer_id) and private.staff_role() in ('admin', 'ceo', 'finance', 'pm'))
  or (customer_id = private.my_customer() and coalesce((select can_view_invoices from private.my_profile()), false))
);

create policy notifications_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- progress per project, computed with the caller's own rights (customers count shared tasks only)
create view public.project_progress with (security_invoker = on) as
  select project_id, count(*) filter (where status = 'done')::int as done, count(*)::int as total
  from public.tasks group by project_id;
grant select on public.project_progress to authenticated;
