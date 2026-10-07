-- Time to billing.
-- 1. Timesheets: the project's PM (or an admin or the CEO) approves logged days, or returns them with a note.
--    Nobody but an admin or the CEO approves their own days.
--    Approved days are locked; days already billed can never change.
-- 2. A day-rate line on the rate card names the people it covers (e.g. "Data engineer" = Sahil and Priya). This is
--    internal (the customer never sees it) and can be set on the live card too.
-- 3. A statement fills each such line with those people's approved, billable, not yet billed days in the period.
--    When the statement is approved, those days are marked as billed on it, so they are never billed twice.
-- 4. Unbilled work: approved billable days not on any approved statement yet, with their value at the agreed rate.

-- ---------------------------------------------------------------- timesheet state
alter table public.time_entries
  add column approved_at timestamptz,
  add column approved_by uuid references public.profiles (id),
  add column returned_at timestamptz,
  add column returned_note text,
  add column statement_id uuid references public.billing_statements (id) on delete set null;   -- billed on
create index on public.time_entries (user_id, worked_on);
create index on public.time_entries (statement_id) where statement_id is not null;

-- days are logged unapproved; only the functions below approve, return or bill them
drop policy time_insert on public.time_entries;
create policy time_insert on public.time_entries for insert to authenticated
  with check (private.is_staff_of(customer_id) and user_id = (select auth.uid())
              and approved_at is null and approved_by is null and returned_at is null and returned_note is null and statement_id is null);

-- people delete their own days only while nobody has approved them
drop policy time_delete_own on public.time_entries;
create policy time_delete_own on public.time_entries for delete to authenticated
  using (user_id = (select auth.uid()) and approved_at is null and statement_id is null);

-- the project's PM, or an admin or the CEO of the same organisation
create or replace function private.can_approve_time(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects pr
    where pr.id = p_project and private.is_staff_of(pr.customer_id)
      and (pr.pm_id = (select auth.uid()) or private.staff_role() in ('admin', 'ceo')))
$$;

create or replace function public.approve_time(p_entries uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if exists (select 1 from public.time_entries te join public.tasks t on t.id = te.task_id
             where te.id = any (p_entries) and not private.can_approve_time(t.project_id)) then
    raise exception 'not allowed';
  end if;
  -- a PM's own days are approved by an admin or the CEO
  if private.staff_role() not in ('admin', 'ceo')
     and exists (select 1 from public.time_entries where id = any (p_entries) and user_id = (select auth.uid())) then
    raise exception 'your own days are approved by an admin or the CEO';
  end if;
  update public.time_entries set approved_at = now(), approved_by = (select auth.uid()), returned_at = null, returned_note = null
  where id = any (p_entries) and approved_at is null and statement_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- undo an approval (a mistake), while the days are not billed yet
create or replace function public.unapprove_time(p_entries uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if exists (select 1 from public.time_entries te join public.tasks t on t.id = te.task_id
             where te.id = any (p_entries) and not private.can_approve_time(t.project_id)) then
    raise exception 'not allowed';
  end if;
  if exists (select 1 from public.time_entries where id = any (p_entries) and statement_id is not null) then
    raise exception 'these days are already billed';
  end if;
  update public.time_entries set approved_at = null, approved_by = null where id = any (p_entries);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- send days back to the person with a note; they fix them (delete and log again)
create or replace function public.return_time(p_entries uuid[], p_note text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int; r record;
begin
  if coalesce(trim(p_note), '') = '' then raise exception 'say what should change'; end if;
  if exists (select 1 from public.time_entries te join public.tasks t on t.id = te.task_id
             where te.id = any (p_entries) and not private.can_approve_time(t.project_id)) then
    raise exception 'not allowed';
  end if;
  update public.time_entries set returned_at = now(), returned_note = trim(p_note)
  where id = any (p_entries) and approved_at is null and statement_id is null;
  get diagnostics v_n = row_count;
  for r in select user_id, count(*) as n from public.time_entries where id = any (p_entries) and returned_at is not null group by user_id loop
    perform private.notify(r.user_id, 'time.returned', private.actor_name() || ' returned ' || r.n || ' time ' || case when r.n = 1 then 'entry' else 'entries' end,
      trim(p_note), '/my-work', true, true);
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------- who a day-rate line covers
create table public.rate_line_people (
  rate_card_line_id uuid not null references public.rate_card_lines (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  primary key (rate_card_line_id, profile_id)
);
alter table public.rate_line_people enable row level security;
revoke all on public.rate_line_people from anon, authenticated;
grant select on public.rate_line_people to authenticated;
create policy rate_line_people_read on public.rate_line_people for select to authenticated
  using (exists (select 1 from public.rate_card_lines l join public.rate_cards c on c.id = l.rate_card_id
                 where l.id = rate_card_line_id and private.can_bill(c.customer_id, c.project_id)));

create or replace function public.set_line_people(p_line uuid, p_people uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_line public.rate_card_lines;
begin
  select * into v_line from public.rate_card_lines where id = p_line;
  if v_line.id is null or not private.can_price(v_line.customer_id) then raise exception 'not allowed'; end if;
  if v_line.kind <> 'day_rate' then raise exception 'only day-rate lines name people'; end if;
  -- who a line covers is ours, not a price: it can be set on a draft or on the approved (live) card
  if not private.card_editable(v_line.rate_card_id)
     and not exists (select 1 from public.rate_cards where id = v_line.rate_card_id and status = 'approved') then
    raise exception 'this rate card can no longer be edited';
  end if;
  if exists (select 1 from unnest(coalesce(p_people, '{}')) x(id)
             where not exists (select 1 from public.profiles p where p.id = x.id and p.kind = 'internal')) then
    raise exception 'only Seven Billion people can be billed on a line';
  end if;
  -- one person on two lines of the same card would bill their days twice
  if exists (select 1 from public.rate_line_people lp join public.rate_card_lines o on o.id = lp.rate_card_line_id
             where o.rate_card_id = v_line.rate_card_id and o.id <> p_line and lp.profile_id = any (coalesce(p_people, '{}'))) then
    raise exception 'someone here is already on another line of this rate card';
  end if;
  delete from public.rate_line_people where rate_card_line_id = p_line;
  insert into public.rate_line_people (rate_card_line_id, profile_id, customer_id)
  select p_line, x.id, v_line.customer_id from unnest(coalesce(p_people, '{}')) x(id) on conflict do nothing;
end $$;

-- a new version of the rate card keeps who each line covers
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
    insert into public.rate_line_people (rate_card_line_id, profile_id, customer_id)
    select n.id, p.profile_id, p.customer_id
    from public.rate_line_people p
    join public.rate_card_lines o on o.id = p.rate_card_line_id and o.rate_card_id = v_prev.id
    join public.rate_card_lines n on n.rate_card_id = v_id and n.position = o.position and n.label = o.label;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------- statements from timesheets
-- approved, billable, unbilled days on this project in the period, by the people a line covers
create or replace function private.line_days(p_line uuid, p_project uuid, p_start date, p_end date)
returns table (days numeric, people text) language sql stable security definer set search_path = '' as $$
  with per_person as (
    select pr.full_name, sum(te.days) as days
    from public.rate_line_people lp
    join public.time_entries te on te.user_id = lp.profile_id
    join public.tasks t on t.id = te.task_id and t.project_id = p_project
    join public.profiles pr on pr.id = te.user_id
    where lp.rate_card_line_id = p_line and te.billable and te.approved_at is not null and te.statement_id is null
      and te.worked_on between p_start and p_end
    group by pr.id, pr.full_name
  )
  select coalesce(sum(days), 0),
         coalesce(string_agg(full_name || ' ' || trim_scale(days)::text || case when days = 1 then ' day' else ' days' end, ', ' order by full_name), '')
  from per_person
$$;

create or replace function private.fill_from_timesheets(p_statement uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.billing_statements; l record; d record;
begin
  select * into st from public.billing_statements where id = p_statement;
  for l in select sl.id, sl.rate_card_line_id from public.statement_lines sl
           where sl.statement_id = p_statement and sl.kind = 'day_rate'
             and exists (select 1 from public.rate_line_people p where p.rate_card_line_id = sl.rate_card_line_id) loop
    select * into d from private.line_days(l.rate_card_line_id, st.project_id, st.period_start, st.period_end);
    update public.statement_lines
    set quantity = d.days, note = case when d.days > 0 then 'From approved timesheets: ' || d.people else 'No approved days in this period' end
    where id = l.id;
  end loop;
end $$;

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
  -- day rates: resources x working days, unless the line names its people (then their approved days, below)
  insert into public.statement_lines (statement_id, customer_id, rate_card_line_id, kind, label, unit, rate, quantity, position)
  select v_id, l.customer_id, l.id, l.kind, l.label, l.unit, l.rate,
         case l.kind when 'day_rate' then coalesce(l.planned_quantity, 1) * v_days when 'retainer' then 1 else 0 end,
         l.position
  from public.rate_card_lines l where l.rate_card_id = v_card.id;
  perform private.fill_from_timesheets(v_id);
  return v_id;
end $$;

-- the period or the approvals changed: fill the day-rate lines again
create or replace function public.refill_statement(p_statement uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.billing_statements;
begin
  select * into st from public.billing_statements where id = p_statement;
  if st.id is null or not private.can_bill(st.customer_id, st.project_id) then raise exception 'not allowed'; end if;
  if st.status not in ('draft', 'changes_requested') then raise exception 'this statement can no longer be edited'; end if;
  perform private.fill_from_timesheets(p_statement);
end $$;

-- Sent or approved: a line that names people may not bill more days than they have approved and unbilled in the
-- period (another statement may have billed some since this one was filled). Once approved, the days are billed on
-- this statement, whoever approved it: the customer, or Seven Billion for them.
create or replace function private.on_statement_approved() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l record;
begin
  for l in select sl.label, sl.quantity, (select d.days from private.line_days(sl.rate_card_line_id, new.project_id, new.period_start, new.period_end) d) as available
           from public.statement_lines sl
           where sl.statement_id = new.id and sl.kind = 'day_rate'
             and exists (select 1 from public.rate_line_people p where p.rate_card_line_id = sl.rate_card_line_id) loop
    if l.quantity > l.available then
      raise exception '% bills % days but only % approved, unbilled days are left in this period. Fill from timesheets again.',
        l.label, trim_scale(l.quantity), trim_scale(l.available);
    end if;
  end loop;
  if new.status <> 'approved' then return null; end if;
  update public.time_entries te set statement_id = new.id
  from public.tasks t, public.statement_lines sl, public.rate_line_people lp
  where t.id = te.task_id and t.project_id = new.project_id
    and sl.statement_id = new.id and sl.kind = 'day_rate' and sl.quantity > 0
    and lp.rate_card_line_id = sl.rate_card_line_id and lp.profile_id = te.user_id
    and te.billable and te.approved_at is not null and te.statement_id is null
    and te.worked_on between new.period_start and new.period_end;
  return null;
end $$;
create trigger statements_bill_time after update of status on public.billing_statements
  for each row when (new.status in ('pending', 'approved') and old.status is distinct from new.status)
  execute function private.on_statement_approved();

-- ---------------------------------------------------------------- unbilled work
-- approved billable days not on an approved statement yet, per project and person, valued at the live rate
create or replace function public.unbilled_time(p_project uuid default null)
returns table (project_id uuid, project_name text, customer_name text, user_id uuid, full_name text,
               days numeric, oldest date, rate numeric, currency text, line_label text)
language sql stable security definer set search_path = '' as $$
  with live as (
    select c.project_id, c.currency, l.id as line_id, l.label, l.rate
    from public.rate_cards c join public.rate_card_lines l on l.rate_card_id = c.id
    where c.status = 'approved' and l.kind = 'day_rate'
  )
  select pr.id, pr.name, cu.name, te.user_id, p.full_name, sum(te.days), min(te.worked_on),
         max(live.rate), max(live.currency), max(live.label)
  from public.time_entries te
  join public.tasks t on t.id = te.task_id
  join public.projects pr on pr.id = t.project_id
  join public.customers cu on cu.id = pr.customer_id
  join public.profiles p on p.id = te.user_id
  left join live on live.project_id = pr.id
    and exists (select 1 from public.rate_line_people lp where lp.rate_card_line_id = live.line_id and lp.profile_id = te.user_id)
  where te.billable and te.approved_at is not null and te.statement_id is null
    and (p_project is null or pr.id = p_project)
    and private.can_bill(pr.customer_id, pr.id)
  group by pr.id, pr.name, cu.name, te.user_id, p.full_name
  order by min(te.worked_on)
$$;

revoke execute on function public.approve_time, public.unapprove_time, public.return_time, public.set_line_people,
  public.refill_statement, public.unbilled_time from public, anon;
grant execute on function public.approve_time, public.unapprove_time, public.return_time, public.set_line_people,
  public.refill_statement, public.unbilled_time to authenticated;
