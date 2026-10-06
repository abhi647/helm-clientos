-- 7B Client OS: core schema.
-- Every customer-scoped row carries customer_id and (where it can be hidden) a visibility flag.
-- Row Level Security in 20261006000002_rls.sql is the only thing that decides who sees a row.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type public.user_kind as enum ('internal', 'customer');
create type public.internal_role as enum ('admin', 'ceo', 'pm', 'consultant', 'finance');
create type public.customer_role as enum ('customer_exec', 'customer_member');
create type public.visibility as enum ('internal', 'shared');
create type public.health as enum ('on_track', 'needs_attention', 'at_risk');
create type public.project_status as enum ('active', 'on_hold', 'completed');
create type public.task_status as enum ('todo', 'in_progress', 'in_review', 'waiting_customer', 'blocked', 'done');
create type public.owner_side as enum ('seven_billion', 'customer');
create type public.request_type as enum ('requirement', 'enhancement', 'change_request', 'bug', 'new_report', 'data_request', 'access_request', 'support', 'other');
create type public.request_status as enum ('submitted', 'under_review', 'clarification', 'estimated', 'approved', 'scheduled', 'in_development', 'uat', 'delivered', 'cancelled');
create type public.priority as enum ('low', 'normal', 'high', 'critical');
create type public.approval_status as enum ('pending', 'approved', 'changes_requested', 'cancelled');
create type public.approval_action as enum ('requested', 'approved', 'changes_requested', 'resubmitted', 'cancelled');
create type public.action_type as enum ('approval', 'form', 'task', 'clarification', 'uat', 'upload', 'decision', 'invoice', 'meeting_action');
create type public.action_status as enum ('open', 'completed', 'cancelled');
create type public.update_status as enum ('draft', 'published');

-- ---------------------------------------------------------------- tenancy and people
create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  hubspot_company_id text unique,
  zoho_customer_id text unique,
  created_at timestamptz not null default now()
);
create index on public.customers (org_id);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  kind public.user_kind not null,
  org_id uuid references public.orgs (id) on delete cascade,            -- internal users
  internal_role public.internal_role,
  customer_id uuid references public.customers (id) on delete cascade,  -- customer users
  customer_role public.customer_role,
  can_view_invoices boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profile_shape check (
    (kind = 'internal' and org_id is not null and internal_role is not null and customer_id is null)
    or (kind = 'customer' and customer_id is not null and customer_role is not null and internal_role is null)
  )
);
create index on public.profiles (customer_id);

-- ---------------------------------------------------------------- delivery
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text not null,
  template_key text,
  status public.project_status not null default 'active',
  health public.health not null default 'on_track',
  start_date date,
  end_date date,
  pm_id uuid references public.profiles (id),
  customer_lead_id uuid references public.profiles (id),
  hubspot_deal_id text unique,
  created_at timestamptz not null default now()
);
create index on public.projects (customer_id);

-- commercials live in their own table so no customer query can ever select them
create table public.project_commercials (
  project_id uuid primary key references public.projects (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  billing_model text,
  contract_value numeric(14, 2),
  currency text not null default 'INR',
  po_number text,
  notes text,
  updated_at timestamptz not null default now()
);

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text not null,
  position int not null default 0,
  start_date date,
  end_date date,
  visibility public.visibility not null default 'shared'
);
create index on public.phases (project_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  phase_id uuid references public.phases (id) on delete set null,
  customer_id uuid not null references public.customers (id) on delete cascade,
  title text not null,
  description text not null default '',
  status public.task_status not null default 'todo',
  owner_side public.owner_side not null default 'seven_billion',
  assignee_id uuid references public.profiles (id),
  start_date date,
  due_date date,
  spotlight boolean not null default false,
  visibility public.visibility not null default 'internal',
  position int not null default 0,
  completed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tasks (project_id);
create index on public.tasks (assignee_id) where status <> 'done';

-- effort and hours are internal: they live outside tasks so a customer can never select them
create table public.task_estimates (
  task_id uuid primary key references public.tasks (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  estimate_hours numeric(7, 1) not null check (estimate_hours >= 0)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  hours numeric(5, 2) not null check (hours > 0 and hours <= 24),
  worked_on date not null default current_date,
  billable boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create index on public.time_entries (task_id);

-- ---------------------------------------------------------------- requests and approvals
create sequence public.request_number_seq start 1001;

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('REQ-' || nextval('public.request_number_seq')),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null check (length(title) between 3 and 200),
  what text not null default '',
  why text not null default '',
  type public.request_type not null default 'requirement',
  priority public.priority not null default 'normal',
  desired_date date,
  status public.request_status not null default 'submitted',
  owner_id uuid references public.profiles (id),
  requested_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.requests (customer_id, status);

create table public.request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.requests (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  status public.request_status not null,
  note text,
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.request_events (request_id);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  request_id uuid references public.requests (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  kind text not null default 'scope',
  title text not null,
  summary text not null default '',
  effort_hours numeric(7, 1),
  target_date date,
  due_date date,
  approver_id uuid not null references public.profiles (id),
  requested_by uuid references public.profiles (id),
  status public.approval_status not null default 'pending',
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index on public.approvals (customer_id, status);

-- append-only audit trail: never updated or deleted
create table public.approval_events (
  id bigint generated always as identity primary key,
  approval_id uuid not null references public.approvals (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  action public.approval_action not null,
  version int not null,
  comment text,
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.approval_events (approval_id);

create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  type public.action_type not null,
  title text not null,
  assignee_id uuid references public.profiles (id),
  due_date date,
  priority public.priority not null default 'normal',
  status public.action_status not null default 'open',
  approval_id uuid references public.approvals (id) on delete cascade,
  request_id uuid references public.requests (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index on public.action_items (assignee_id) where status = 'open';

-- ---------------------------------------------------------------- collaboration
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  entity_type text not null check (entity_type in ('task', 'request', 'approval', 'document', 'meeting', 'update')),
  entity_id uuid not null,
  author_id uuid not null references public.profiles (id),
  body text not null check (length(body) between 1 and 10000),
  visibility public.visibility not null default 'internal',
  created_at timestamptz not null default now()
);
create index on public.comments (entity_type, entity_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  folder text not null default '02-requirements',
  name text not null,
  storage_path text unique,
  version int not null default 1,
  visibility public.visibility not null default 'internal',
  request_id uuid references public.requests (id) on delete set null,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.documents (customer_id, project_id);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null,
  held_on date not null,
  summary text not null default '',
  visibility public.visibility not null default 'shared',
  created_at timestamptz not null default now()
);

create sequence public.decision_number_seq start 1;

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('DEC-' || lpad(nextval('public.decision_number_seq')::text, 3, '0')),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  meeting_id uuid references public.meetings (id) on delete set null,
  decision text not null,
  decided_on date not null default current_date,
  decided_by text not null default '',
  visibility public.visibility not null default 'shared',
  created_at timestamptz not null default now()
);

create table public.updates (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  week_of date not null,
  health public.health not null,
  completed text not null default '',
  in_progress text not null default '',
  waiting_on_customer text not null default '',
  next_week text not null default '',
  status public.update_status not null default 'draft',
  author_id uuid references public.profiles (id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- finance (synced from Zoho Books, never typed here)
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  zoho_invoice_id text unique,
  number text not null,
  currency text not null default 'INR',
  total numeric(14, 2),      -- always from Zoho; never typed or computed in this app
  balance numeric(14, 2),
  status text not null,
  issued_on date not null,
  due_on date,
  synced_at timestamptz not null default now()
);
create index on public.invoices (customer_id);

-- ---------------------------------------------------------------- notifications, email outbox, activity, integrations
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  needs_action boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications (id) on delete cascade,
  to_email text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  provider_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.email_outbox (status, created_at);

create table public.activity (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  actor_id uuid references public.profiles (id),
  summary text not null,
  entity_type text,
  entity_id uuid,
  visibility public.visibility not null default 'internal',
  created_at timestamptz not null default now()
);
create index on public.activity (customer_id, created_at desc);

create table public.integration_events (
  id bigint generated always as identity primary key,
  source text not null,
  external_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

-- updated_at bookkeeping
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();
create trigger requests_touch before update on public.requests for each row execute function public.touch_updated_at();
