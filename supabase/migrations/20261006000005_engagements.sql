-- 7B Client OS: "Closed Won" in HubSpot becomes a suggested engagement the PM can create in one click.

create type public.setup_status as enum ('pending', 'created', 'dismissed');

create table public.engagement_setups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  hubspot_deal_id text not null unique,
  deal_name text not null,
  company_name text not null,
  hubspot_company_id text,
  service text,
  suggested_template text not null default 'bi_implementation',
  owner_email text,
  status public.setup_status not null default 'pending',
  project_id uuid references public.projects (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.engagement_setups enable row level security;
alter table public.engagement_setups force row level security;

create policy setups_staff_read on public.engagement_setups for select to authenticated
  using (private.is_staff() and org_id = (select org_id from private.my_profile()));
create policy setups_manage on public.engagement_setups for update to authenticated
  using (org_id = (select org_id from private.my_profile()) and private.staff_role() in ('admin', 'ceo', 'pm'))
  with check (org_id = (select org_id from private.my_profile()));
