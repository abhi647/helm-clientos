-- Helm: billing. Each project has a rate card the customer approves once; each period's statement (days worked,
-- deliveries, units, retainer) is approved by the customer before it becomes a draft invoice in Zoho Books.
--
-- Rates are typed by Seven Billion from the signed contract. Statement lines copy the rate from the approved card, so
-- a statement can never carry a price the customer did not approve. Tax and invoice totals stay in Zoho.
--
-- Who does what
--   rate card   : admin, CEO and finance write it; customer executives and invoice contacts approve it
--   statements  : the same staff plus the project's PM write them; the same customer contacts approve them
--   status      : changes only through the functions at the end of this file, never by a direct update

create type public.billing_kind as enum ('day_rate', 'delivery', 'unit', 'retainer');
create type public.rate_card_status as enum ('draft', 'pending', 'approved', 'changes_requested', 'superseded');
create type public.statement_status as enum ('draft', 'pending', 'approved', 'changes_requested', 'invoiced');

create table public.rate_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  version int not null default 1,
  status public.rate_card_status not null default 'draft',
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  po_number text,
  notes text not null default '',
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  decision_note text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (project_id, version)
);
create unique index rate_cards_one_live on public.rate_cards (project_id) where status = 'approved';
create unique index rate_cards_one_open on public.rate_cards (project_id) where status in ('draft', 'pending', 'changes_requested');

create table public.rate_card_lines (
  id uuid primary key default gen_random_uuid(),
  rate_card_id uuid not null references public.rate_cards (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  kind public.billing_kind not null,
  label text not null check (length(trim(label)) > 0),       -- role, deliverable or unit name
  unit text not null default 'day',                           -- day, delivery, report, month ...
  rate numeric(14, 2) not null check (rate >= 0),
  planned_quantity numeric(10, 2) check (planned_quantity >= 0), -- day_rate: resources; unit: planned units
  description text not null default '',
  zoho_item_id text,                                          -- optional: Zoho applies the item's tax and HSN/SAC
  position int not null default 0
);
create index on public.rate_card_lines (rate_card_id);

create table public.billing_statements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  rate_card_id uuid not null references public.rate_cards (id),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  status public.statement_status not null default 'draft',
  note text not null default '',                              -- shown to the customer
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  decision_note text,
  zoho_invoice_id text unique,
  zoho_invoice_number text,
  invoiced_at timestamptz,
  invoice_error text,
  zoho_claimed_at timestamptz,                               -- the server is creating the draft invoice (stops doubles)
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.billing_statements (project_id);
create index on public.billing_statements (customer_id, status);

create table public.statement_lines (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.billing_statements (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  rate_card_line_id uuid not null references public.rate_card_lines (id),
  kind public.billing_kind not null,
  label text not null,
  unit text not null,
  rate numeric(14, 2) not null,
  quantity numeric(10, 2) not null default 0 check (quantity >= 0),
  amount numeric(16, 2) generated always as (round(rate * quantity, 2)) stored,   -- before tax; Zoho adds tax
  note text not null default '',
  position int not null default 0,
  unique (statement_id, rate_card_line_id)
);
create index on public.statement_lines (statement_id);

-- ---------------------------------------------------------------- access helpers
-- sets the rates: admin, CEO, finance
create or replace function private.can_price(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_staff_of(cid) and private.staff_role() in ('admin', 'ceo', 'finance')
$$;

-- prepares statements: the above, or the project's PM
create or replace function private.can_bill(cid uuid, pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_price(cid) or (
    private.is_staff_of(cid) and private.staff_role() = 'pm'
    and exists (select 1 from public.projects where id = pid and pm_id = (select auth.uid())))
$$;

-- approves for the customer: their executives and anyone with invoice access
create or replace function private.is_billing_contact(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.kind = 'customer' and p.access_revoked_at is null and p.customer_id = cid
      and (p.customer_role = 'customer_exec' or p.can_view_invoices))
$$;

create or replace function private.card_editable(p_card uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rate_cards where id = p_card and status in ('draft', 'changes_requested'))
$$;

create or replace function private.statement_editable(p_statement uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.billing_statements where id = p_statement and status in ('draft', 'changes_requested'))
$$;

create or replace function private.statement_project(p_statement uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select project_id from public.billing_statements where id = p_statement
$$;

grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['rate_cards', 'rate_card_lines', 'billing_statements', 'statement_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;
revoke all on public.rate_cards, public.rate_card_lines, public.billing_statements, public.statement_lines from anon;

-- headers: only the editable fields can be written directly; status and approval columns go through the functions
revoke insert, update on public.rate_cards, public.billing_statements from authenticated;
grant update (currency, po_number, notes) on public.rate_cards to authenticated;
grant update (period_start, period_end, note) on public.billing_statements to authenticated;
-- statement lines: only the quantity and a note; the rate always comes from the approved card
revoke insert, update on public.statement_lines from authenticated;
grant update (quantity, note) on public.statement_lines to authenticated;

create policy rate_cards_read on public.rate_cards for select to authenticated using (
  private.can_bill(customer_id, project_id) or (private.is_billing_contact(customer_id) and status <> 'draft'));
create policy rate_cards_edit on public.rate_cards for update to authenticated
  using (private.can_price(customer_id) and status in ('draft', 'changes_requested'))
  with check (private.can_price(customer_id) and status in ('draft', 'changes_requested'));
create policy rate_cards_delete on public.rate_cards for delete to authenticated
  using (private.can_price(customer_id) and status = 'draft');

create policy rate_card_lines_read on public.rate_card_lines for select to authenticated using (
  exists (select 1 from public.rate_cards c where c.id = rate_card_id));            -- visible when its card is
create policy rate_card_lines_write on public.rate_card_lines for all to authenticated
  using (private.can_price(customer_id) and private.card_editable(rate_card_id))
  with check (private.can_price(customer_id) and private.card_editable(rate_card_id)
    and customer_id = (select c.customer_id from public.rate_cards c where c.id = rate_card_id));

create policy statements_read on public.billing_statements for select to authenticated using (
  private.can_bill(customer_id, project_id) or (private.is_billing_contact(customer_id) and status <> 'draft'));
create policy statements_edit on public.billing_statements for update to authenticated
  using (private.can_bill(customer_id, project_id) and status in ('draft', 'changes_requested'))
  with check (private.can_bill(customer_id, project_id) and status in ('draft', 'changes_requested'));
create policy statements_delete on public.billing_statements for delete to authenticated
  using (private.can_bill(customer_id, project_id) and status = 'draft');

create policy statement_lines_read on public.statement_lines for select to authenticated using (
  exists (select 1 from public.billing_statements s where s.id = statement_id));
create policy statement_lines_edit on public.statement_lines for update to authenticated
  using (private.can_bill(customer_id, private.statement_project(statement_id)) and private.statement_editable(statement_id))
  with check (private.can_bill(customer_id, private.statement_project(statement_id)) and private.statement_editable(statement_id));

-- ---------------------------------------------------------------- notifications
create or replace function private.notify_billing_contacts(p_customer uuid, p_title text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.profiles
           where kind = 'customer' and customer_id = p_customer and access_revoked_at is null
             and (customer_role = 'customer_exec' or can_view_invoices)
  loop
    perform private.notify(r.id, 'billing', p_title, p_body, '/billing', true);
  end loop;
end $$;

-- the project's PM and the org's finance team
create or replace function private.notify_billing_staff(p_project uuid, p_title text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select distinct p.id from public.profiles p
           join public.projects pr on pr.id = p_project
           join public.customers c on c.id = pr.customer_id
           where p.kind = 'internal' and p.access_revoked_at is null and p.org_id = c.org_id
             and (p.id = pr.pm_id or p.internal_role = 'finance')
  loop
    perform private.notify(r.id, 'billing', p_title, p_body, '/projects/' || p_project || '/billing', false);
  end loop;
end $$;

-- ---------------------------------------------------------------- rate card steps
-- start the first card, or a new version copied from the latest one
create or replace function public.start_rate_card(p_project uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_customer uuid; v_prev public.rate_cards; v_id uuid;
begin
  select customer_id into v_customer from public.projects where id = p_project;
  if v_customer is null or not private.can_price(v_customer) then raise exception 'not allowed'; end if;
  if exists (select 1 from public.rate_cards where project_id = p_project and status in ('draft', 'pending', 'changes_requested')) then
    raise exception 'a rate card for this project is already being prepared';
  end if;
  select * into v_prev from public.rate_cards where project_id = p_project order by version desc limit 1;
  insert into public.rate_cards (project_id, customer_id, version, currency, po_number, notes)
  values (p_project, v_customer, coalesce(v_prev.version, 0) + 1, coalesce(v_prev.currency, 'INR'), v_prev.po_number, coalesce(v_prev.notes, ''))
  returning id into v_id;
  if v_prev.id is not null then
    insert into public.rate_card_lines (rate_card_id, customer_id, kind, label, unit, rate, planned_quantity, description, zoho_item_id, position)
    select v_id, customer_id, kind, label, unit, rate, planned_quantity, description, zoho_item_id, position
    from public.rate_card_lines where rate_card_id = v_prev.id;
  end if;
  return v_id;
end $$;

create or replace function public.add_rate_card_line(p_card uuid, p_kind public.billing_kind, p_label text, p_unit text,
  p_rate numeric, p_planned numeric default null, p_description text default '', p_zoho_item text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_card public.rate_cards; v_id uuid;
begin
  select * into v_card from public.rate_cards where id = p_card;
  if v_card.id is null or not private.can_price(v_card.customer_id) then raise exception 'not allowed'; end if;
  if v_card.status not in ('draft', 'changes_requested') then raise exception 'this rate card can no longer be edited'; end if;
  insert into public.rate_card_lines (rate_card_id, customer_id, kind, label, unit, rate, planned_quantity, description, zoho_item_id, position)
  values (p_card, v_card.customer_id, p_kind, trim(p_label), coalesce(nullif(trim(p_unit), ''), 'day'), p_rate, p_planned,
          coalesce(p_description, ''), nullif(trim(p_zoho_item), ''),
          coalesce((select max(position) + 1 from public.rate_card_lines where rate_card_id = p_card), 0))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.submit_rate_card(p_card uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_card public.rate_cards; v_project text;
begin
  select * into v_card from public.rate_cards where id = p_card for update;
  if v_card.id is null or not private.can_price(v_card.customer_id) then raise exception 'not allowed'; end if;
  if v_card.status not in ('draft', 'changes_requested') then raise exception 'this rate card is no longer a draft'; end if;
  if not exists (select 1 from public.rate_card_lines where rate_card_id = p_card) then raise exception 'add at least one line first'; end if;
  update public.rate_cards set status = 'pending', submitted_at = now(), submitted_by = (select auth.uid()), decision_note = null where id = p_card;
  select name into v_project from public.projects where id = v_card.project_id;
  perform private.notify_billing_contacts(v_card.customer_id, 'Rate card to approve: ' || v_project,
    private.actor_name() || ' sent the rates for ' || v_project || ' for your approval.');
  perform private.log(v_card.customer_id, v_card.project_id, 'sent the rate card (v' || v_card.version || ') for approval', 'rate_card', p_card, 'shared');
end $$;

create or replace function public.decide_rate_card(p_card uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_card public.rate_cards; v_project text;
begin
  select * into v_card from public.rate_cards where id = p_card for update;
  if v_card.id is null or not private.is_billing_contact(v_card.customer_id) then raise exception 'not allowed'; end if;
  if v_card.status <> 'pending' then raise exception 'this rate card is no longer pending'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'please say what should change'; end if;
  if p_approve then
    update public.rate_cards set status = 'superseded' where project_id = v_card.project_id and status = 'approved';
  end if;
  update public.rate_cards
  set status = case when p_approve then 'approved'::public.rate_card_status else 'changes_requested' end,
      decided_at = now(), decided_by = (select auth.uid()), decision_note = nullif(trim(p_note), '')
  where id = p_card;
  select name into v_project from public.projects where id = v_card.project_id;
  perform private.notify_billing_staff(v_card.project_id,
    case when p_approve then 'Rate card approved: ' else 'Changes requested on the rate card: ' end || v_project,
    private.actor_name() || case when p_approve then ' approved the rates.' else ' asked for changes: ' || trim(p_note) end);
  perform private.log(v_card.customer_id, v_card.project_id,
    case when p_approve then 'approved the rate card (v' || v_card.version || ')' else 'asked for changes to the rate card' end,
    'rate_card', p_card, 'shared');
end $$;

-- ---------------------------------------------------------------- statement steps
create or replace function private.weekdays(p_from date, p_to date) returns int language sql immutable as $$
  select count(*)::int from generate_series(p_from, p_to, interval '1 day') d where extract(isodow from d) < 6
$$;

-- a new statement on the approved card, pre-filled: day rates = resources x working days, retainers = 1, the rest 0
create or replace function public.create_statement(p_project uuid, p_start date, p_end date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_card public.rate_cards; v_id uuid; v_days int;
begin
  select * into v_card from public.rate_cards where project_id = p_project and status = 'approved';
  if v_card.id is null then raise exception 'the customer has not approved a rate card for this project yet'; end if;
  if not private.can_bill(v_card.customer_id, p_project) then raise exception 'not allowed'; end if;
  if p_end < p_start then raise exception 'the period ends before it starts'; end if;
  v_days := private.weekdays(p_start, p_end);
  insert into public.billing_statements (project_id, customer_id, rate_card_id, period_start, period_end)
  values (p_project, v_card.customer_id, v_card.id, p_start, p_end) returning id into v_id;
  insert into public.statement_lines (statement_id, customer_id, rate_card_line_id, kind, label, unit, rate, quantity, position)
  select v_id, l.customer_id, l.id, l.kind, l.label, l.unit, l.rate,
         case l.kind when 'day_rate' then coalesce(l.planned_quantity, 1) * v_days when 'retainer' then 1 else 0 end,
         l.position
  from public.rate_card_lines l where l.rate_card_id = v_card.id;
  return v_id;
end $$;

create or replace function public.submit_statement(p_statement uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_st public.billing_statements; v_project text;
begin
  select * into v_st from public.billing_statements where id = p_statement for update;
  if v_st.id is null or not private.can_bill(v_st.customer_id, v_st.project_id) then raise exception 'not allowed'; end if;
  if v_st.status not in ('draft', 'changes_requested') then raise exception 'this statement is no longer a draft'; end if;
  if not exists (select 1 from public.statement_lines where statement_id = p_statement and quantity > 0) then
    raise exception 'enter at least one quantity first';
  end if;
  update public.billing_statements set status = 'pending', submitted_at = now(), submitted_by = (select auth.uid()), decision_note = null
  where id = p_statement;
  select name into v_project from public.projects where id = v_st.project_id;
  perform private.notify_billing_contacts(v_st.customer_id, 'Statement to approve: ' || v_project,
    private.actor_name() || ' sent the statement for ' || to_char(v_st.period_start, 'DD Mon') || ' – ' || to_char(v_st.period_end, 'DD Mon YYYY') || ' for your approval.');
  perform private.log(v_st.customer_id, v_st.project_id, 'sent a billing statement for approval', 'statement', p_statement, 'shared');
end $$;

create or replace function public.decide_statement(p_statement uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_st public.billing_statements; v_project text;
begin
  select * into v_st from public.billing_statements where id = p_statement for update;
  if v_st.id is null or not private.is_billing_contact(v_st.customer_id) then raise exception 'not allowed'; end if;
  if v_st.status <> 'pending' then raise exception 'this statement is no longer pending'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'please say what should change'; end if;
  update public.billing_statements
  set status = case when p_approve then 'approved'::public.statement_status else 'changes_requested' end,
      decided_at = now(), decided_by = (select auth.uid()), decision_note = nullif(trim(p_note), '')
  where id = p_statement;
  select name into v_project from public.projects where id = v_st.project_id;
  perform private.notify_billing_staff(v_st.project_id,
    case when p_approve then 'Statement approved: ' else 'Changes requested on a statement: ' end || v_project,
    private.actor_name() || case when p_approve then ' approved the statement. A draft invoice is being created in Zoho.' else ' asked for changes: ' || trim(p_note) end);
  perform private.log(v_st.customer_id, v_st.project_id,
    case when p_approve then 'approved a billing statement' else 'asked for changes to a billing statement' end, 'statement', p_statement, 'shared');
end $$;

revoke execute on function public.start_rate_card, public.add_rate_card_line, public.submit_rate_card, public.decide_rate_card,
  public.create_statement, public.submit_statement, public.decide_statement from public, anon;
grant execute on function public.start_rate_card, public.add_rate_card_line, public.submit_rate_card, public.decide_rate_card,
  public.create_statement, public.submit_statement, public.decide_statement to authenticated;
