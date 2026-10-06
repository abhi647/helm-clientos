-- Helm: import from HubSpot and Zoho.
--   customer_contacts : people at a customer, imported from HubSpot, waiting to be invited (nobody is emailed automatically)
--   project_deals     : the HubSpot deals (one per billing period) behind a project, with their Zoho invoice number
--   invoices.project_id: which project a Zoho invoice belongs to, linked through the deal's invoice number
-- Deals and invoices are money: admin, CEO and finance only. Contacts are delivery data: any staff member of the customer.

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  full_name text not null,
  email text not null check (email = lower(email)),
  phone text,
  job_title text,
  source text not null default 'hubspot' check (source in ('hubspot', 'zoho', 'manual')),
  external_id text,
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (customer_id, email)
);
create index on public.customer_contacts (customer_id);

create table public.project_deals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  hubspot_deal_id text not null unique,
  deal_name text not null,
  stage_label text not null default '',
  closed_on date,
  invoice_number text,
  imported_at timestamptz not null default now()
);
create index on public.project_deals (project_id);
create index on public.project_deals (invoice_number);

alter table public.invoices add column project_id uuid references public.projects (id) on delete set null;
create index on public.invoices (project_id);

alter table public.customer_contacts enable row level security;
alter table public.customer_contacts force row level security;
alter table public.project_deals enable row level security;
alter table public.project_deals force row level security;
revoke all on public.customer_contacts, public.project_deals from anon;
revoke insert, update, delete on public.project_deals from authenticated;     -- written by the import (server) only

create policy contacts_read on public.customer_contacts for select to authenticated using (private.is_staff_of(customer_id));
create policy contacts_write on public.customer_contacts for all to authenticated
  using (private.can_manage(customer_id)) with check (private.can_manage(customer_id));

create policy project_deals_read on public.project_deals for select to authenticated using (private.can_price(customer_id));
