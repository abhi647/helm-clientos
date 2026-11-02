-- One billing model per project, chosen up front, so nobody has to work out how a project is billed from its lines:
--
--   time_materials  every approved, billable hour bills at the person's own rate (per hour, or per day = 8 hours)
--   fixed_price     milestones at agreed amounts, billed one by one when delivered; time is tracked against the
--                   budget but not billed. Extra work agreed later can be billed at the people's rates (T&M extras).
--   retainer        a monthly fee with hours included (the customer's hours bank); time uses up the hours
--
-- It builds on the rate card: a person's rate is a day_rate line that names exactly that person (unit 'hour' or
-- 'day'), a milestone is a delivery line with unit 'milestone' (optionally on a phase), a retainer is a retainer line.
-- Rate cards are still sent to the customer and approved exactly as before.

create type public.billing_model as enum ('time_materials', 'fixed_price', 'retainer');
alter table public.projects
  add column billing_model public.billing_model,
  add column rate_unit text not null default 'hour' check (rate_unit in ('hour', 'day'));
-- how a project is billed is not a price: the team and the customer may read it (rates stay finance-only)
grant select (billing_model, rate_unit) on public.projects to authenticated;

-- existing projects: read the model from their latest card; their rates are per day
update public.projects p set rate_unit = 'day', billing_model = m.model
from (
  select c.project_id,
         case when bool_or(l.kind = 'retainer') then 'retainer'
              when bool_or(l.kind in ('delivery', 'unit')) then 'fixed_price'
              else 'time_materials' end::public.billing_model as model
  from public.rate_cards c join public.rate_card_lines l on l.rate_card_id = c.id
  where c.status in ('approved', 'draft', 'pending', 'changes_requested')
  group by c.project_id
) m where m.project_id = p.id;

-- how much of a line's unit an entry is: hours on an hourly line, days (8 hours) otherwise
create or replace function private.entry_qty(p_hours numeric, p_unit text) returns numeric
language sql immutable set search_path = '' as $$
  select case when lower(trim(p_unit)) in ('hour', 'hours', 'h') then p_hours else round(p_hours / 8, 4) end
$$;
create or replace function private.unit_word(p_qty numeric, p_unit text) returns text
language sql immutable set search_path = '' as $$
  select trim_scale(p_qty)::text || case when lower(trim(p_unit)) in ('hour', 'hours', 'h') then case when p_qty = 1 then ' hour' else ' hours' end
                                         else case when p_qty = 1 then ' day' else ' days' end end
$$;

-- approved, billable, unbilled time on this project in the period that bills on the line, in the line's unit
create or replace function private.line_days(p_line uuid, p_project uuid, p_start date, p_end date)
returns table (days numeric, people text) language sql stable security definer set search_path = '' as $$
  with l as (select unit from public.rate_card_lines where id = p_line),
  per_person as (
    select pr.full_name, sum(private.entry_qty(te.hours, (select unit from l))) as qty
    from public.time_entries te
    join public.tasks t on t.id = te.task_id and t.project_id = p_project
    join public.profiles pr on pr.id = te.user_id
    where te.billable and te.approved_at is not null and te.statement_id is null
      and te.worked_on between p_start and p_end
      and private.entry_bills_on(te.id, p_line)
    group by pr.id, pr.full_name
  )
  select coalesce(sum(qty), 0),
         coalesce(string_agg(full_name || ' ' || private.unit_word(qty, (select unit from l)), ', ' order by full_name), '')
  from per_person
$$;

-- statements from ticked tasks: the same, in the line's unit
create or replace function private.fill_from_tasks(p_statement uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.billing_statements; l record; v_qty numeric; v_note text; v_from date; v_to date;
begin
  select * into st from public.billing_statements where id = p_statement;
  delete from public.statement_entries where statement_id = p_statement;
  delete from public.statement_lines where statement_id = p_statement;

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
      select coalesce(sum(x.qty), 0), string_agg(x.title || ' ' || private.unit_word(x.qty, l.unit), ', ' order by x.title)
      into v_qty, v_note
      from (select coalesce(p.title, t.title) as title, sum(private.entry_qty(te.hours, l.unit)) as qty
            from public.statement_entries se join public.time_entries te on te.id = se.entry_id
            join public.tasks t on t.id = te.task_id left join public.tasks p on p.id = t.parent_id
            where se.statement_id = p_statement and private.entry_bills_on(te.id, l.id)
            group by coalesce(p.title, t.title)) x;
    elsif l.kind in ('delivery', 'unit') and lower(trim(l.unit)) <> 'milestone' then
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

  select least(min(te.worked_on), min(t.completed_at::date)), greatest(max(te.worked_on), max(t.completed_at::date)) into v_from, v_to
  from public.statement_tasks stt join public.tasks t on t.id = stt.task_id
  left join public.statement_entries se on se.statement_id = p_statement
  left join public.time_entries te on te.id = se.entry_id
  where stt.statement_id = p_statement;
  update public.billing_statements set period_start = coalesce(v_from, current_date), period_end = coalesce(v_to, v_from, current_date)
  where id = p_statement;
end $$;

-- statements for a period: milestones are billed on their own (bill_milestone), never by period
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
  from public.rate_card_lines l where l.rate_card_id = v_card.id and not (l.kind = 'delivery' and lower(trim(l.unit)) = 'milestone');
  perform private.fill_from_timesheets(v_id);
  -- a person with no billable time in the period is left off, so the statement reads like the invoice it becomes
  -- (delivery and unit lines stay at 0 for finance to fill in by hand, as before)
  delete from public.statement_lines sl using public.rate_line_people lp
  where sl.statement_id = v_id and sl.kind = 'day_rate' and sl.quantity = 0 and lp.rate_card_line_id = sl.rate_card_line_id;
  if not exists (select 1 from public.statement_lines where statement_id = v_id) then
    raise exception 'nothing to bill in this period: no approved, billable time yet';
  end if;
  return v_id;
end $$;

-- unbilled time per person, valued in the unit of the line it bills on (hours or days)
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
  group by pr.id, pr.name, cu.name, te.user_id, p.full_name
  order by min(te.worked_on)
$$;

-- ---------------------------------------------------------------- set up billing in one step
-- p_people:     [{"profile_id": uuid, "rate": number}]                 time and materials, and fixed-price extras
-- p_milestones: [{"label": text, "amount": number, "phase_id": uuid?}]  fixed price
-- p_retainer:   {"fee": number, "hours": number, "rollover": number?}   retainer
-- Writes a draft rate card (a new version when one is already approved) for the team to send or approve.
create or replace function public.setup_billing(p_project uuid, p_model public.billing_model, p_unit text, p_currency text,
  p_po text default null, p_notes text default '', p_people jsonb default '[]', p_milestones jsonb default '[]', p_retainer jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_project public.projects; v_card public.rate_cards; v_id uuid; v_line uuid; r jsonb; v_pos int := 0; v_name text;
begin
  select * into v_project from public.projects where id = p_project;
  if v_project.id is null or not private.can_price(v_project.customer_id) then raise exception 'not allowed'; end if;
  if p_unit not in ('hour', 'day') then raise exception 'rates are per hour or per day'; end if;
  if p_currency !~ '^[A-Z]{3}$' then raise exception 'choose a currency'; end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_people, '[]')) x) <> (select count(distinct x->>'profile_id') from jsonb_array_elements(coalesce(p_people, '[]')) x) then
    raise exception 'each person can have one rate';
  end if;
  if p_model = 'time_materials' and jsonb_array_length(coalesce(p_people, '[]')) = 0 then raise exception 'add at least one person and their rate'; end if;
  if p_model = 'fixed_price' and jsonb_array_length(coalesce(p_milestones, '[]')) = 0 then raise exception 'add at least one milestone'; end if;
  if p_model = 'retainer' and coalesce((p_retainer->>'fee')::numeric, -1) < 0 then raise exception 'enter the monthly fee'; end if;

  select * into v_card from public.rate_cards where project_id = p_project and status in ('draft', 'pending', 'changes_requested');
  if v_card.status = 'pending' then raise exception 'the customer is reviewing the rates; wait for their answer before changing them'; end if;
  if v_card.id is null then
    insert into public.rate_cards (project_id, customer_id, version, currency, po_number, notes)
    values (p_project, v_project.customer_id, coalesce((select max(version) from public.rate_cards where project_id = p_project), 0) + 1,
            p_currency, nullif(trim(p_po), ''), coalesce(p_notes, ''))
    returning id into v_id;
  else
    v_id := v_card.id;
    update public.phases set rate_line_id = null where rate_line_id in (select id from public.rate_card_lines where rate_card_id = v_id);
    update public.tasks set rate_line_id = null where rate_line_id in (select id from public.rate_card_lines where rate_card_id = v_id);
    delete from public.rate_card_lines where rate_card_id = v_id;
    update public.rate_cards set currency = p_currency, po_number = nullif(trim(p_po), ''), notes = coalesce(p_notes, '') where id = v_id;
  end if;
  update public.projects set billing_model = p_model, rate_unit = p_unit where id = p_project;

  if p_model = 'retainer' then
    insert into public.rate_card_lines (rate_card_id, customer_id, kind, label, unit, rate, planned_quantity, position)
    values (v_id, v_project.customer_id, 'retainer', 'Monthly retainer', 'month', (p_retainer->>'fee')::numeric, 1, v_pos);
    v_pos := v_pos + 1;
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
    insert into public.rate_card_lines (rate_card_id, customer_id, kind, label, unit, rate, planned_quantity, position)
    values (v_id, v_project.customer_id, 'delivery', trim(r->>'label'), 'milestone', (r->>'amount')::numeric, 1, v_pos)
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
    values (v_id, v_project.customer_id, 'day_rate', v_name, p_unit, (r->>'rate')::numeric, 1, v_pos)
    returning id into v_line;
    v_pos := v_pos + 1;
    insert into public.rate_line_people (rate_card_line_id, profile_id, customer_id) values (v_line, (r->>'profile_id')::uuid, v_project.customer_id);
  end loop;
  return v_id;
end $$;

-- bill one milestone of a fixed-price project: a statement with that milestone, once
create or replace function public.bill_milestone(p_line uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l public.rate_card_lines; c public.rate_cards; v_id uuid;
begin
  select * into l from public.rate_card_lines where id = p_line;
  select * into c from public.rate_cards where id = l.rate_card_id;
  if l.id is null or not private.can_bill(c.customer_id, c.project_id) then raise exception 'not allowed'; end if;
  if c.status <> 'approved' then raise exception 'the customer has not approved a rate card for this project yet'; end if;
  if l.kind <> 'delivery' or lower(trim(l.unit)) <> 'milestone' then raise exception 'that is not a milestone'; end if;
  if exists (select 1 from public.statement_lines sl join public.billing_statements s on s.id = sl.statement_id
             where s.project_id = c.project_id and sl.kind = 'delivery' and lower(trim(sl.unit)) = 'milestone'
               and lower(trim(sl.label)) = lower(trim(l.label))) then
    raise exception 'this milestone is already on a statement';
  end if;
  insert into public.billing_statements (project_id, customer_id, rate_card_id, period_start, period_end, note)
  values (c.project_id, c.customer_id, c.id, current_date, current_date, 'Milestone: ' || l.label) returning id into v_id;
  insert into public.statement_lines (statement_id, customer_id, rate_card_line_id, kind, label, unit, rate, quantity, note, position)
  values (v_id, c.customer_id, l.id, l.kind, l.label, l.unit, l.rate, 1, 'Milestone delivered', l.position);
  return v_id;
end $$;

revoke execute on function public.setup_billing, public.bill_milestone, public.unbilled_time from public, anon;
grant execute on function public.setup_billing, public.bill_milestone, public.unbilled_time to authenticated;
