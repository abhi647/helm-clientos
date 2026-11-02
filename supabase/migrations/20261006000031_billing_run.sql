-- Billing the way PSA tools do it: the billing type sits on each contract line, everyone logs time, and timesheets
-- only become the invoice on time-and-materials lines. Every line works out its own amount for a period:
--
--   day_rate  (T&M)         approved billable time in the line's unit (hour, or day = 8 hours); an optional monthly
--                           cap on the project's T&M total (a not-to-exceed)
--   resource  (dedicated)   a person reserved for the customer: per month (less leave, pro rata) or per working day
--                           (working days less leave). Their timesheets are for utilisation, not the bill
--   delivery 'milestone'    fixed-fee billing schedule: due when its phase is all done, or on its date
--   retainer                the monthly fee
--   overage                 retainer hours beyond the monthly allowance, at an hourly rate
--
-- Finance runs billing once a month (billing_preview): every project, every line, the amount and why.

-- ---------------------------------------------------------------- line and card options
alter table public.rate_card_lines add column bill_on date;   -- a milestone due on a date rather than (or as well as) a phase
alter table public.rate_cards add column monthly_cap numeric(14, 2) check (monthly_cap >= 0);   -- T&M not-to-exceed per month
alter table public.projects drop constraint if exists projects_rate_unit_check;
alter table public.projects add constraint projects_rate_unit_check check (rate_unit in ('hour', 'day', 'month'));

-- ---------------------------------------------------------------- leave (deducted from dedicated people; shown on the timesheet)
create table public.leave_days (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  kind text not null default 'leave' check (kind in ('leave', 'sick', 'holiday')),
  note text,
  created_at timestamptz not null default now(),
  primary key (profile_id, day)
);
alter table public.leave_days enable row level security;
grant select, insert, delete on public.leave_days to authenticated;
create policy leave_read on public.leave_days for select to authenticated using (private.is_staff());
-- your own leave; admins and the CEO can record anyone's
create policy leave_insert on public.leave_days for insert to authenticated
  with check (private.is_staff() and (profile_id = (select auth.uid()) or private.staff_role() in ('admin', 'ceo')));
create policy leave_delete on public.leave_days for delete to authenticated
  using (private.is_staff() and (profile_id = (select auth.uid()) or private.staff_role() in ('admin', 'ceo')));

-- ---------------------------------------------------------------- what an hour of each person costs us (finance only)
create table public.cost_rates (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  hourly_cost numeric(12, 2) not null check (hourly_cost >= 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.cost_rates enable row level security;
grant select, insert, update, delete on public.cost_rates to authenticated;
create policy cost_rates_finance on public.cost_rates for all to authenticated
  using (private.is_staff() and private.staff_role() in ('admin', 'ceo', 'finance'))
  with check (private.is_staff() and private.staff_role() in ('admin', 'ceo', 'finance'));

-- ---------------------------------------------------------------- how much of a line a period holds, and why
create or replace function private.leave_weekdays(p_profile uuid, p_start date, p_end date) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.leave_days where profile_id = p_profile and day between p_start and p_end and extract(isodow from day) < 6
$$;

create or replace function private.line_quantity(p_line uuid, p_project uuid, p_start date, p_end date, out qty numeric, out basis text)
language plpgsql stable security definer set search_path = '' as $$
declare l public.rate_card_lines; v_person uuid; v_name text; v_work int; v_leave int; v_allow numeric; v_used numeric;
begin
  select * into l from public.rate_card_lines where id = p_line;
  qty := 0; basis := null;
  if l.kind = 'day_rate' then
    if exists (select 1 from public.rate_line_people where rate_card_line_id = p_line) or private.line_has_work(p_line, p_project) then
      select d.days, d.people into qty, basis from private.line_days(p_line, p_project, p_start, p_end) d;
      basis := case when qty > 0 then 'From approved timesheets: ' || basis else 'No approved time in this period' end;
    else
      qty := coalesce(l.planned_quantity, 1) * private.weekdays(p_start, p_end);
      basis := 'Resources × working days';
    end if;
  elsif l.kind = 'resource' then
    select lp.profile_id, p.full_name into v_person, v_name from public.rate_line_people lp join public.profiles p on p.id = lp.profile_id
    where lp.rate_card_line_id = p_line limit 1;
    v_work := private.weekdays(p_start, p_end);
    v_leave := case when v_person is null then 0 else private.leave_weekdays(v_person, p_start, p_end) end;
    if lower(trim(l.unit)) = 'month' then
      qty := case when v_work = 0 then 0 else round((v_work - v_leave)::numeric / v_work, 3) end;   -- statements keep 3 decimals
    else
      qty := greatest(v_work - v_leave, 0);
    end if;
    basis := coalesce(v_name, l.label) || ': ' || v_work || ' working days' || case when v_leave > 0 then ' − ' || v_leave || ' on leave' else '' end;
  elsif l.kind = 'retainer' then
    qty := 1; basis := 'Monthly fee';
  elsif l.kind = 'overage' then
    select monthly_hours into v_allow from public.credit_plans where customer_id = l.customer_id;
    v_used := private.credit_used(l.customer_id, p_start, p_end);
    qty := greatest(0, v_used - coalesce(v_allow, 0));
    basis := trim_scale(v_used)::text || ' h used, ' || trim_scale(coalesce(v_allow, 0))::text || ' h included';
  end if;
end $$;

-- is a fixed-fee milestone due by the end of the period: on its date, or when every task of its phase is done
create or replace function private.milestone_due(p_line uuid, p_project uuid, p_end date, out due boolean, out basis text)
language plpgsql stable security definer set search_path = '' as $$
declare l public.rate_card_lines; ph public.phases; v_total int; v_done int;
begin
  select * into l from public.rate_card_lines where id = p_line;
  select * into ph from public.phases where project_id = p_project and rate_line_id is not null and private.line_key(rate_line_id) = private.line_key(p_line) limit 1;
  if ph.id is not null then
    select count(*), count(*) filter (where status = 'done') into v_total, v_done from public.tasks where phase_id = ph.id and parent_id is null;
  end if;
  due := (l.bill_on is not null and l.bill_on <= p_end) or (ph.id is not null and v_total > 0 and v_done = v_total);
  basis := case when ph.id is not null and v_total > 0 and v_done = v_total then 'Phase "' || ph.name || '" is done'
                when l.bill_on is not null and l.bill_on <= p_end then 'Due on ' || to_char(l.bill_on, 'DD Mon YYYY')
                when ph.id is not null then 'Phase "' || ph.name || '": ' || coalesce(v_done, 0) || ' of ' || coalesce(v_total, 0) || ' tasks done'
                when l.bill_on is not null then 'Due on ' || to_char(l.bill_on, 'DD Mon YYYY')
                else 'Bill by hand' end;
end $$;

-- the T&M cap: scale the time lines of a statement down to the card's monthly not-to-exceed
create or replace function private.apply_cap(p_statement uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_cap numeric; v_total numeric;
begin
  select c.monthly_cap into v_cap from public.billing_statements s join public.rate_cards c on c.id = s.rate_card_id where s.id = p_statement;
  if v_cap is null then return; end if;
  select coalesce(sum(rate * quantity), 0) into v_total from public.statement_lines where statement_id = p_statement and kind = 'day_rate';
  if v_total <= v_cap or v_total = 0 then return; end if;
  update public.statement_lines set quantity = round(quantity * v_cap / v_total, 4),
    note = coalesce(note, '') || ' · capped at the monthly limit of ' || trim_scale(v_cap)::text
  where statement_id = p_statement and kind = 'day_rate';
end $$;

-- statements for a period, filled line by line with the rules above
create or replace function private.fill_from_timesheets(p_statement uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.billing_statements; l record; q record; v_qty numeric; v_titles text;
begin
  select * into st from public.billing_statements where id = p_statement;
  for l in select sl.id, sl.rate_card_line_id, sl.kind from public.statement_lines sl where sl.statement_id = p_statement loop
    if l.kind in ('day_rate', 'resource', 'overage', 'retainer') then
      select * into q from private.line_quantity(l.rate_card_line_id, st.project_id, st.period_start, st.period_end);
      update public.statement_lines set quantity = q.qty, note = q.basis where id = l.id;
    elsif l.kind in ('delivery', 'unit') and private.line_has_work(l.rate_card_line_id, st.project_id) then
      select coalesce(sum(x.quantity), 0), string_agg(x.title, ', ' order by x.title) into v_qty, v_titles
      from private.line_tasks(l.rate_card_line_id, st.project_id, st.period_start, st.period_end) x;
      update public.statement_lines
      set quantity = v_qty, note = case when v_qty > 0 then 'From tasks done: ' || v_titles else 'No tasks done in this period' end
      where id = l.id;
    end if;
  end loop;
  perform private.apply_cap(p_statement);
end $$;

create or replace function public.create_statement(p_project uuid, p_start date, p_end date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_card public.rate_cards; v_id uuid;
begin
  select * into v_card from public.rate_cards where project_id = p_project and status = 'approved';
  if v_card.id is null then raise exception 'the customer has not approved a rate card for this project yet'; end if;
  if not private.can_bill(v_card.customer_id, p_project) then raise exception 'not allowed'; end if;
  if p_end < p_start then raise exception 'the period ends before it starts'; end if;
  insert into public.billing_statements (project_id, customer_id, rate_card_id, period_start, period_end)
  values (p_project, v_card.customer_id, v_card.id, p_start, p_end) returning id into v_id;
  insert into public.statement_lines (statement_id, customer_id, rate_card_line_id, kind, label, unit, rate, quantity, position)
  select v_id, l.customer_id, l.id, l.kind, l.label, l.unit, l.rate, 0, l.position
  from public.rate_card_lines l where l.rate_card_id = v_card.id and not (l.kind = 'delivery' and lower(trim(l.unit)) = 'milestone');
  perform private.fill_from_timesheets(v_id);
  -- lines with nothing to bill are left off (hand-filled delivery and unit lines stay, as before)
  delete from public.statement_lines where statement_id = v_id and quantity = 0 and kind in ('day_rate', 'resource', 'overage');
  if not exists (select 1 from public.statement_lines where statement_id = v_id) then
    raise exception 'nothing to bill in this period: no approved, billable time yet';
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------- the monthly billing run
-- Every active project with approved rates: each line's quantity and amount for the period and why, whether a
-- statement already covers the period, and the fixed-fee milestones that are due and not billed yet.
create or replace function public.billing_preview(p_start date, p_end date)
returns table (project_id uuid, project_name text, customer_name text, model public.billing_model, currency text,
               line_id uuid, kind public.billing_kind, label text, unit text, rate numeric, quantity numeric, amount numeric,
               basis text, milestone boolean, statement_id uuid, cap numeric)
language plpgsql stable security definer set search_path = '' as $$
declare p record; l record; q record; d record; v_st uuid;
begin
  for p in select pr.id, pr.name, cu.name as customer, pr.billing_model, c.id as card, c.currency, c.monthly_cap, pr.customer_id
           from public.projects pr join public.customers cu on cu.id = pr.customer_id
           join public.rate_cards c on c.project_id = pr.id and c.status = 'approved'
           where pr.status = 'active' and private.can_bill(pr.customer_id, pr.id) order by cu.name, pr.name loop
    select s.id into v_st from public.billing_statements s
    where s.project_id = p.id and s.period_start <= p_end and s.period_end >= p_start
      and not exists (select 1 from public.statement_lines x where x.statement_id = s.id and x.kind = 'delivery' and lower(trim(x.unit)) = 'milestone')
    order by s.created_at desc limit 1;
    for l in select * from public.rate_card_lines where rate_card_id = p.card order by position loop
      if l.kind = 'delivery' and lower(trim(l.unit)) = 'milestone' then
        if exists (select 1 from public.statement_lines sl join public.billing_statements s on s.id = sl.statement_id
                   where s.project_id = p.id and sl.kind = 'delivery' and lower(trim(sl.unit)) = 'milestone' and lower(trim(sl.label)) = lower(trim(l.label))) then
          continue;   -- billed already
        end if;
        select * into d from private.milestone_due(l.id, p.id, p_end);
        if not d.due then continue; end if;
        return query select p.id, p.name, p.customer, p.billing_model, p.currency, l.id, l.kind, l.label, l.unit, l.rate, 1::numeric, l.rate, d.basis, true, null::uuid, p.monthly_cap;
      elsif l.kind in ('day_rate', 'resource', 'retainer', 'overage') then
        select * into q from private.line_quantity(l.id, p.id, p_start, p_end);
        if q.qty = 0 and l.kind <> 'retainer' then continue; end if;
        return query select p.id, p.name, p.customer, p.billing_model, p.currency, l.id, l.kind, l.label, l.unit, l.rate, q.qty, round(q.qty * l.rate, 2), q.basis, false, v_st, p.monthly_cap;
      end if;
    end loop;
  end loop;
end $$;

-- unbilled time is a T&M idea: dedicated people and retainers are billed by the month, fixed-fee time is effort
drop function if exists public.unbilled_time(uuid);
create function public.unbilled_time(p_project uuid default null)
returns table (project_id uuid, project_name text, customer_name text, user_id uuid, full_name text,
               days numeric, oldest date, rate numeric, currency text, line_label text, hours numeric, unit text, amount numeric)
language sql stable security definer set search_path = '' as $$
  with live as (
    select c.project_id, c.currency, l.id as line_id, l.label, l.rate, l.unit
    from public.rate_cards c join public.rate_card_lines l on l.rate_card_id = c.id
    where c.status = 'approved' and l.kind = 'day_rate'
  )
  select pr.id, pr.name, cu.name, te.user_id, p.full_name, sum(te.days), min(te.worked_on),
         max(live.rate), max(live.currency), max(live.label), sum(te.hours), max(live.unit),
         sum(private.entry_qty(te.hours, live.unit) * live.rate)
  from public.time_entries te
  join public.tasks t on t.id = te.task_id
  join public.projects pr on pr.id = t.project_id
  join public.customers cu on cu.id = pr.customer_id
  join public.profiles p on p.id = te.user_id
  left join live on live.project_id = pr.id and private.entry_bills_on(te.id, live.line_id)
  where te.billable and te.approved_at is not null and te.statement_id is null
    and (p_project is null or pr.id = p_project)
    and private.can_bill(pr.customer_id, pr.id)
    and (pr.billing_model is null or pr.billing_model = 'time_materials' or (pr.billing_model = 'fixed_price' and live.line_id is not null))
  group by pr.id, pr.name, cu.name, te.user_id, p.full_name
  order by min(te.worked_on)
$$;

-- ---------------------------------------------------------------- set-up, now with dedicated people, schedules, caps and overage
-- p_people:     [{"profile_id", "rate"}]                         T&M (and fixed-fee extras) per p_unit hour|day; dedicated per p_unit month|day
-- p_milestones: [{"label", "amount", "phase_id"?, "bill_on"?}]    fixed-fee billing schedule
-- p_retainer:   {"fee", "hours", "rollover"?, "overage_rate"?}    retainer
-- p_cap:        T&M monthly not-to-exceed (optional)
drop function if exists public.setup_billing(uuid, public.billing_model, text, text, text, text, jsonb, jsonb, jsonb);
create or replace function public.setup_billing(p_project uuid, p_model public.billing_model, p_unit text, p_currency text,
  p_po text default null, p_notes text default '', p_people jsonb default '[]', p_milestones jsonb default '[]', p_retainer jsonb default null,
  p_cap numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_project public.projects; v_card public.rate_cards; v_id uuid; v_line uuid; r jsonb; v_pos int := 0; v_name text;
begin
  select * into v_project from public.projects where id = p_project;
  if v_project.id is null or not private.can_price(v_project.customer_id) then raise exception 'not allowed'; end if;
  if p_model = 'dedicated' and p_unit not in ('month', 'day') then raise exception 'dedicated people are billed per month or per day'; end if;
  if p_model <> 'dedicated' and p_unit not in ('hour', 'day') then raise exception 'rates are per hour or per day'; end if;
  if p_currency !~ '^[A-Z]{3}$' then raise exception 'choose a currency'; end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_people, '[]')) x) <> (select count(distinct x->>'profile_id') from jsonb_array_elements(coalesce(p_people, '[]')) x) then
    raise exception 'each person can have one rate';
  end if;
  if p_model in ('time_materials', 'dedicated') and jsonb_array_length(coalesce(p_people, '[]')) = 0 then raise exception 'add at least one person and their rate'; end if;
  if p_model = 'fixed_price' and jsonb_array_length(coalesce(p_milestones, '[]')) = 0 then raise exception 'add at least one milestone'; end if;
  if p_model = 'retainer' and coalesce((p_retainer->>'fee')::numeric, -1) < 0 then raise exception 'enter the monthly fee'; end if;

  select * into v_card from public.rate_cards where project_id = p_project and status in ('draft', 'pending', 'changes_requested');
  if v_card.status = 'pending' then raise exception 'the customer is reviewing the rates; wait for their answer before changing them'; end if;
  if v_card.id is null then
    insert into public.rate_cards (project_id, customer_id, version, currency, po_number, notes, monthly_cap)
    values (p_project, v_project.customer_id, coalesce((select max(version) from public.rate_cards where project_id = p_project), 0) + 1,
            p_currency, nullif(trim(p_po), ''), coalesce(p_notes, ''), case when p_model = 'time_materials' then p_cap end)
    returning id into v_id;
  else
    v_id := v_card.id;
    update public.phases set rate_line_id = null where rate_line_id in (select id from public.rate_card_lines where rate_card_id = v_id);
    update public.tasks set rate_line_id = null where rate_line_id in (select id from public.rate_card_lines where rate_card_id = v_id);
    delete from public.rate_card_lines where rate_card_id = v_id;
    update public.rate_cards set currency = p_currency, po_number = nullif(trim(p_po), ''), notes = coalesce(p_notes, ''),
      monthly_cap = case when p_model = 'time_materials' then p_cap end where id = v_id;
  end if;
  update public.projects set billing_model = p_model, rate_unit = p_unit where id = p_project;

  if p_model = 'retainer' then
    insert into public.rate_card_lines (rate_card_id, customer_id, kind, label, unit, rate, planned_quantity, position)
    values (v_id, v_project.customer_id, 'retainer', 'Monthly retainer', 'month', (p_retainer->>'fee')::numeric, 1, v_pos);
    v_pos := v_pos + 1;
    if coalesce((p_retainer->>'overage_rate')::numeric, 0) > 0 then
      insert into public.rate_card_lines (rate_card_id, customer_id, kind, label, unit, rate, planned_quantity, position)
      values (v_id, v_project.customer_id, 'overage', 'Hours over the allowance', 'hour', (p_retainer->>'overage_rate')::numeric, null, v_pos);
      v_pos := v_pos + 1;
    end if;
    if coalesce((p_retainer->>'hours')::numeric, 0) > 0 then
      insert into public.credit_plans (customer_id, kind, monthly_hours, rollover_cap, starts_on, updated_by)
      values (v_project.customer_id, 'monthly', (p_retainer->>'hours')::numeric, nullif(p_retainer->>'rollover', '')::numeric,
              date_trunc('month', current_date)::date, (select auth.uid()))
      on conflict (customer_id) do update set kind = 'monthly', monthly_hours = excluded.monthly_hours, rollover_cap = excluded.rollover_cap,
        updated_by = excluded.updated_by, updated_at = now();
    end if;
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_milestones, '[]')) loop
    if coalesce(trim(r->>'label'), '') = '' or coalesce((r->>'amount')::numeric, -1) < 0 then raise exception 'each milestone needs a name and an amount'; end if;
    insert into public.rate_card_lines (rate_card_id, customer_id, kind, label, unit, rate, planned_quantity, bill_on, position)
    values (v_id, v_project.customer_id, 'delivery', trim(r->>'label'), 'milestone', (r->>'amount')::numeric, 1, nullif(r->>'bill_on', '')::date, v_pos)
    returning id into v_line;
    v_pos := v_pos + 1;
    if nullif(r->>'phase_id', '') is not null then
      update public.phases set rate_line_id = v_line where id = (r->>'phase_id')::uuid and project_id = p_project;
    end if;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_people, '[]')) loop
    select full_name into v_name from public.profiles where id = (r->>'profile_id')::uuid and kind = 'internal' and access_revoked_at is null;
    if v_name is null then raise exception 'only Seven Billion people can be billed on a line'; end if;
    if coalesce((r->>'rate')::numeric, -1) < 0 then raise exception 'enter a rate for %', v_name; end if;
    insert into public.rate_card_lines (rate_card_id, customer_id, kind, label, unit, rate, planned_quantity, position)
    values (v_id, v_project.customer_id, case when p_model = 'dedicated' then 'resource' else 'day_rate' end::public.billing_kind,
            v_name, p_unit, (r->>'rate')::numeric, 1, v_pos)
    returning id into v_line;
    v_pos := v_pos + 1;
    insert into public.rate_line_people (rate_card_line_id, profile_id, customer_id) values (v_line, (r->>'profile_id')::uuid, v_project.customer_id);
  end loop;
  return v_id;
end $$;

-- a new version of a card keeps its schedule dates and cap
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
  insert into public.rate_cards (project_id, customer_id, version, currency, po_number, notes, monthly_cap)
  values (p_project, v_customer, coalesce(v_prev.version, 0) + 1, coalesce(v_prev.currency, 'INR'), v_prev.po_number, coalesce(v_prev.notes, ''), v_prev.monthly_cap)
  returning id into v_id;
  if v_prev.id is not null then
    insert into public.rate_card_lines (rate_card_id, customer_id, kind, label, unit, rate, planned_quantity, description, zoho_item_id, bill_on, position)
    select v_id, customer_id, kind, label, unit, rate, planned_quantity, description, zoho_item_id, bill_on, position
    from public.rate_card_lines where rate_card_id = v_prev.id;
    insert into public.rate_line_people (rate_card_line_id, profile_id, customer_id)
    select n.id, p.profile_id, p.customer_id
    from public.rate_line_people p
    join public.rate_card_lines o on o.id = p.rate_card_line_id and o.rate_card_id = v_prev.id
    join public.rate_card_lines n on n.rate_card_id = v_id and n.position = o.position and n.label = o.label;
  end if;
  return v_id;
end $$;

revoke execute on function public.setup_billing, public.billing_preview, public.unbilled_time from public, anon;
grant execute on function public.setup_billing, public.billing_preview, public.unbilled_time to authenticated;
