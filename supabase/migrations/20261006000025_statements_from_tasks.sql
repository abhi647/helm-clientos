-- Billing in three steps, each started by a person:
--   1. Statement from the work: finance ticks finished (or partly done) tasks and creates a statement. It bills
--      exactly that work: the approved, unbilled days logged on those tasks and their subtasks, and the tasks billed
--      as a delivery or unit that are Done. Each task and each day is on one open statement at a time.
--   2. The customer approves the statement (or asks for changes) in the portal, as before.
--   3. Invoice: finance ticks approved statements and creates one draft invoice in Zoho for them. Approving a
--      statement no longer creates an invoice by itself.
-- GST: finance sets, per customer, the Zoho tax (or tax exemption) that every invoice line carries.

-- ---------------------------------------------------------------- one Zoho invoice can cover several statements
alter table public.billing_statements drop constraint if exists billing_statements_zoho_invoice_id_key;
create index if not exists billing_statements_zoho_invoice_idx on public.billing_statements (zoho_invoice_id) where zoho_invoice_id is not null;
alter table public.billing_statements add column from_tasks boolean not null default false;

-- ---------------------------------------------------------------- what a statement made from tasks bills
create table public.statement_tasks (
  statement_id uuid not null references public.billing_statements (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  primary key (statement_id, task_id)
);
create index on public.statement_tasks (task_id);
create table public.statement_entries (
  statement_id uuid not null references public.billing_statements (id) on delete cascade,
  entry_id uuid not null references public.time_entries (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  primary key (statement_id, entry_id)
);
create index on public.statement_entries (entry_id);
alter table public.statement_tasks enable row level security;
alter table public.statement_entries enable row level security;
revoke all on public.statement_tasks, public.statement_entries from anon, authenticated;
grant select on public.statement_tasks, public.statement_entries to authenticated;
create policy statement_tasks_read on public.statement_tasks for select to authenticated
  using (exists (select 1 from public.billing_statements s where s.id = statement_id));
create policy statement_entries_read on public.statement_entries for select to authenticated
  using (private.can_bill(customer_id, private.statement_project(statement_id)));

-- an open statement: not discarded and not yet billed elsewhere
create or replace function private.statement_open(p_statement uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.billing_statements where id = p_statement and status in ('draft', 'pending', 'changes_requested', 'approved') and zoho_invoice_id is null)
$$;

-- (re)fills a statement from its tasks: their approved, unbilled days not on another open statement, and their
-- deliveries/units once done. Lines are the approved card's lines the work bills on.
create or replace function private.fill_from_tasks(p_statement uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.billing_statements; l record; v_qty numeric; v_note text; v_from date; v_to date;
begin
  select * into st from public.billing_statements where id = p_statement;
  delete from public.statement_entries where statement_id = p_statement;
  delete from public.statement_lines where statement_id = p_statement;

  -- the days: billable, approved, unbilled, on these tasks or their subtasks, not held by another open statement
  insert into public.statement_entries (statement_id, entry_id, customer_id)
  select p_statement, te.id, st.customer_id
  from public.time_entries te join public.tasks t on t.id = te.task_id
  where (t.id in (select task_id from public.statement_tasks where statement_id = p_statement)
         or t.parent_id in (select task_id from public.statement_tasks where statement_id = p_statement))
    and te.billable and te.approved_at is not null and te.statement_id is null
    and not exists (select 1 from public.statement_entries o where o.entry_id = te.id and o.statement_id <> p_statement and private.statement_open(o.statement_id))
    and exists (select 1 from public.rate_card_lines cl where cl.rate_card_id = st.rate_card_id and cl.kind = 'day_rate' and private.entry_bills_on(te.id, cl.id));

  for l in select cl.* from public.rate_card_lines cl where cl.rate_card_id = st.rate_card_id order by cl.position loop
    v_qty := 0; v_note := null;
    if l.kind = 'day_rate' then
      select coalesce(sum(x.days), 0), string_agg(x.title || ' ' || trim_scale(x.days)::text || case when x.days = 1 then ' day' else ' days' end, ', ' order by x.title)
      into v_qty, v_note
      from (select coalesce(p.title, t.title) as title, sum(te.days) as days
            from public.statement_entries se join public.time_entries te on te.id = se.entry_id
            join public.tasks t on t.id = te.task_id left join public.tasks p on p.id = t.parent_id
            where se.statement_id = p_statement and private.entry_bills_on(te.id, l.id)
            group by coalesce(p.title, t.title)) x;
    elsif l.kind in ('delivery', 'unit') then
      select coalesce(sum(case when l.kind = 'unit' and e.estimate is not null and lower(trim(e.unit)) = lower(trim(l.unit)) then e.estimate else 1 end), 0),
             string_agg(t.title, ', ' order by t.title)
      into v_qty, v_note
      from public.statement_tasks stt join public.tasks t on t.id = stt.task_id
      left join public.task_estimates e on e.task_id = t.id
      where stt.statement_id = p_statement and t.status = 'done' and t.statement_id is null
        and private.task_line(t.id) is not null and private.line_key(private.task_line(t.id)) = private.line_key(l.id);
    end if;
    if v_qty > 0 then
      insert into public.statement_lines (statement_id, customer_id, rate_card_line_id, kind, label, unit, rate, quantity, note, position)
      values (p_statement, st.customer_id, l.id, l.kind, l.label, l.unit, l.rate, v_qty, 'From tasks: ' || v_note, l.position);
    end if;
  end loop;

  -- the period covers the work billed
  select least(min(te.worked_on), min(t.completed_at::date)), greatest(max(te.worked_on), max(t.completed_at::date)) into v_from, v_to
  from public.statement_tasks stt join public.tasks t on t.id = stt.task_id
  left join public.statement_entries se on se.statement_id = p_statement
  left join public.time_entries te on te.id = se.entry_id
  where stt.statement_id = p_statement;
  update public.billing_statements set period_start = coalesce(v_from, current_date), period_end = coalesce(v_to, v_from, current_date)
  where id = p_statement;
end $$;

create or replace function public.create_statement_from_tasks(p_project uuid, p_tasks uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_card public.rate_cards; v_id uuid; v_bad text;
begin
  select * into v_card from public.rate_cards where project_id = p_project and status = 'approved';
  if v_card.id is null then raise exception 'the customer has not approved a rate card for this project yet'; end if;
  if not private.can_bill(v_card.customer_id, p_project) then raise exception 'not allowed'; end if;
  if coalesce(array_length(p_tasks, 1), 0) = 0 then raise exception 'tick the tasks to bill first'; end if;
  if exists (select 1 from unnest(p_tasks) x(id) left join public.tasks t on t.id = x.id
             where t.id is null or t.project_id <> p_project or t.parent_id is not null) then
    raise exception 'pick tasks of this project (subtasks are billed with their task)';
  end if;
  select string_agg(t.title, ', ') into v_bad from public.tasks t
  where t.id = any (p_tasks) and exists (select 1 from public.statement_tasks o where o.task_id = t.id and private.statement_open(o.statement_id)
                                         and exists (select 1 from public.billing_statements s where s.id = o.statement_id and s.status <> 'approved'));
  if v_bad is not null then raise exception 'already on an open statement: %', v_bad; end if;

  insert into public.billing_statements (project_id, customer_id, rate_card_id, period_start, period_end, from_tasks)
  values (p_project, v_card.customer_id, v_card.id, current_date, current_date, true) returning id into v_id;
  insert into public.statement_tasks (statement_id, task_id, customer_id) select v_id, x, v_card.customer_id from unnest(p_tasks) x;
  perform private.fill_from_tasks(v_id);

  if not exists (select 1 from public.statement_lines where statement_id = v_id) then
    raise exception 'nothing to bill on the ticked tasks yet: day-rate work needs approved days, deliveries and units need the task Done and billed as that line';
  end if;
  return v_id;
end $$;

-- "Fill again" on a statement made from tasks refills it from the same tasks
create or replace function public.refill_statement(p_statement uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.billing_statements;
begin
  select * into st from public.billing_statements where id = p_statement;
  if st.id is null or not private.can_bill(st.customer_id, st.project_id) then raise exception 'not allowed'; end if;
  if st.status not in ('draft', 'changes_requested') then raise exception 'this statement can no longer be edited'; end if;
  if st.from_tasks then perform private.fill_from_tasks(p_statement); else perform private.fill_from_timesheets(p_statement); end if;
end $$;

-- sent or approved: a period statement may not bill more days than are left; approved: the work is billed on it
create or replace function private.on_statement_approved() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l record;
begin
  if new.from_tasks then
    if new.status <> 'approved' then return null; end if;
    update public.time_entries te set statement_id = new.id
    from public.statement_entries se where se.statement_id = new.id and se.entry_id = te.id and te.statement_id is null;
    update public.tasks t set statement_id = new.id
    where t.id in (select task_id from public.statement_tasks where statement_id = new.id) and t.status = 'done' and t.statement_id is null
      and exists (select 1 from public.statement_lines sl where sl.statement_id = new.id and sl.kind in ('delivery', 'unit')
                  and private.task_line(t.id) is not null and private.line_key(private.task_line(t.id)) = private.line_key(sl.rate_card_line_id));
    return null;
  end if;

  for l in select sl.label, sl.quantity, (select d.days from private.line_days(sl.rate_card_line_id, new.project_id, new.period_start, new.period_end) d) as available
           from public.statement_lines sl
           where sl.statement_id = new.id and sl.kind = 'day_rate'
             and (exists (select 1 from public.rate_line_people p where p.rate_card_line_id = sl.rate_card_line_id)
                  or private.line_has_work(sl.rate_card_line_id, new.project_id)) loop
    if l.quantity > l.available then
      raise exception '% bills % days but only % approved, unbilled days are left in this period. Fill from timesheets again.',
        l.label, trim_scale(l.quantity), trim_scale(l.available);
    end if;
  end loop;
  if new.status <> 'approved' then return null; end if;
  update public.time_entries te set statement_id = new.id
  from public.tasks t
  where t.id = te.task_id and t.project_id = new.project_id
    and te.billable and te.approved_at is not null and te.statement_id is null
    and te.worked_on between new.period_start and new.period_end
    and not exists (select 1 from public.statement_entries o where o.entry_id = te.id and private.statement_open(o.statement_id) and o.statement_id <> new.id)
    and exists (select 1 from public.statement_lines sl
                where sl.statement_id = new.id and sl.kind = 'day_rate' and sl.quantity > 0
                  and private.entry_bills_on(te.id, sl.rate_card_line_id));
  update public.tasks t set statement_id = new.id
  where t.id in (select x.task_id from public.statement_lines sl,
                   lateral private.line_tasks(sl.rate_card_line_id, new.project_id, new.period_start, new.period_end) x
                 where sl.statement_id = new.id and sl.kind in ('delivery', 'unit') and sl.quantity > 0)
    and not exists (select 1 from public.statement_tasks o where o.task_id = t.id and private.statement_open(o.statement_id) and o.statement_id <> new.id);
  return null;
end $$;

-- the customer's decision no longer promises an invoice: finance creates it from approved statements
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
    private.actor_name() || case when p_approve then ' approved the statement. It is ready to invoice.' else ' asked for changes: ' || trim(p_note) end);
  perform private.log(v_st.customer_id, v_st.project_id,
    case when p_approve then 'approved a billing statement' else 'asked for changes to a billing statement' end, 'statement', p_statement, 'shared');
end $$;

-- fix: a new phase that starts with a line (the check read a task-only field on phases)
create or replace function private.guard_rate_line_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_line_project uuid;
begin
  if new.rate_line_id is null then return new; end if;
  if tg_table_name = 'tasks' then
    if new.parent_id is not null then raise exception 'subtasks are billed through their task'; end if;
  end if;
  select c.project_id into v_line_project from public.rate_card_lines l join public.rate_cards c on c.id = l.rate_card_id where l.id = new.rate_line_id;
  if v_line_project is distinct from new.project_id then raise exception 'that line is not on this project''s rate card'; end if;
  return new;
end $$;

-- ---------------------------------------------------------------- GST per customer (finance)
create table public.customer_billing (
  customer_id uuid primary key references public.customers (id) on delete cascade,
  zoho_tax_id text,             -- a Zoho tax or tax group (e.g. GST18, IGST18)
  zoho_tax_exemption_id text,   -- or a Zoho tax exemption (e.g. export under LUT)
  tax_label text not null default '',
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now(),
  check (zoho_tax_id is null or zoho_tax_exemption_id is null)
);
alter table public.customer_billing enable row level security;
revoke all on public.customer_billing from anon, authenticated;
grant select, insert, update, delete on public.customer_billing to authenticated;
create policy customer_billing_all on public.customer_billing for all to authenticated
  using (private.can_price(customer_id)) with check (private.can_price(customer_id));

revoke execute on function public.create_statement_from_tasks from public, anon;
grant execute on function public.create_statement_from_tasks to authenticated;
