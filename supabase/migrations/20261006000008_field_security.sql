-- 7B Client OS: field-level security.
-- RLS decides which ROWS a user sees; this migration decides which FIELDS. Staff and customers share the same
-- database role, so sensitive columns are not readable through the tables at all. Staff read them through
-- views that only return rows when the caller is Seven Billion staff of that customer. Asking a table for a
-- hidden column fails with "permission denied", so it can never be returned by mistake.

-- ---------------------------------------------------------------- policies that read hidden columns move into helpers
-- (a policy runs with the caller's column rights, so it may not read a hidden column itself)
create or replace function private.my_org() returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select org_id from public.profiles where id = (select auth.uid()) and kind = 'internal'),
    (select c.org_id from public.profiles p join public.customers c on c.id = p.customer_id where p.id = (select auth.uid())))
$$;

create or replace function private.profile_visible(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_id and (
      p.id = (select auth.uid())
      or (private.is_staff() and (p.org_id = private.my_org() or (p.customer_id is not null and private.is_staff_of(p.customer_id))))
      -- customers see their own colleagues and the Seven Billion team serving them
      or (p.customer_id is not null and p.customer_id = private.my_customer())
      or (p.kind = 'internal' and private.my_customer() is not null and p.org_id = private.my_org())))
$$;

create or replace function private.customer_in_my_org(p_customer uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.customers c where c.id = p_customer and c.org_id = private.my_org())
$$;
grant execute on all functions in schema private to authenticated;

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (private.profile_visible(id));

drop policy customers_write on public.customers;
create policy customers_write on public.customers for all to authenticated
  using (private.can_manage(id))
  with check (private.staff_role() in ('admin', 'ceo', 'pm') and (private.customer_in_my_org(id) or org_id = private.my_org()));

-- ---------------------------------------------------------------- profiles
-- visible to everyone allowed to see the row: who someone is, nothing about their access
revoke select on public.profiles from authenticated;
grant select (id, full_name, kind, customer_id, created_at) on public.profiles to authenticated;

-- your own full profile (session, role checks in the app)
create or replace function public.get_my_profile() returns public.profiles
language sql stable security definer set search_path = '' as $$
  select p.* from public.profiles p where p.id = (select auth.uid())
$$;
revoke execute on function public.get_my_profile from public, anon;
grant execute on function public.get_my_profile to authenticated;

-- staff directory: emails, roles and invoice access, for Seven Billion staff only
create view public.directory with (security_barrier) as
  select p.id, p.full_name, p.email, p.kind, p.org_id, p.internal_role, p.customer_id, p.customer_role, p.can_view_invoices, p.created_at
  from public.profiles p
  where private.is_staff() and (
    p.org_id = (select org_id from private.my_profile())
    or (p.customer_id is not null and private.is_staff_of(p.customer_id)));

-- ---------------------------------------------------------------- customers
revoke select on public.customers from authenticated;
grant select (id, name, created_at) on public.customers to authenticated;

create view public.customers_internal with (security_barrier) as
  select c.id, c.org_id, c.name, c.hubspot_company_id, c.zoho_customer_id, c.account_owner_id, c.created_at
  from public.customers c where private.is_staff_of(c.id);

-- ---------------------------------------------------------------- projects
revoke select on public.projects from authenticated;
grant select (id, customer_id, name, status, health, start_date, end_date, pm_id, customer_lead_id, created_at) on public.projects to authenticated;

create view public.projects_internal with (security_barrier) as
  select p.id, p.customer_id, p.template_key, p.hubspot_deal_id
  from public.projects p where private.is_staff_of(p.customer_id);

revoke all on public.directory, public.customers_internal, public.projects_internal from public, anon;
grant select on public.directory, public.customers_internal, public.projects_internal to authenticated;

-- ---------------------------------------------------------------- rows that were too widely shared inside a customer
-- Feedback: anyone at the company sees feedback sent from the portal; a low-CSAT follow-up is private to the person who scored.
drop policy feedback_read on public.feedback;
create policy feedback_read on public.feedback for select to authenticated using (
  private.is_staff_of(customer_id)
  or (customer_id = private.my_customer() and (source = 'portal' or submitted_by = (select auth.uid())))
);

-- Form answers: the person who submitted them, and the customer's executives.
drop policy forms_read on public.form_submissions;
create policy forms_read on public.form_submissions for select to authenticated using (
  private.is_staff_of(customer_id)
  or submitted_by = (select auth.uid())
  or (customer_id = private.my_customer() and (select customer_role from private.my_profile()) = 'customer_exec')
);

-- Comments on feedback follow the feedback's own visibility (feedback RLS applies inside the subquery).
drop policy comments_read on public.comments;
create policy comments_read on public.comments for select to authenticated using (
  private.can_read(customer_id, visibility)
  and (entity_type <> 'feedback' or exists (select 1 from public.feedback f where f.id = entity_id))
);
