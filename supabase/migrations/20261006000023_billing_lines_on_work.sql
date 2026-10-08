-- Billing on the plan: a phase or a task is "billed as" a line of the project's rate card ("Data engineer
-- (man-day)", "Monthly report"). PMs and consultants pick the line by its name and never see its rate.
--
-- Which line a piece of work bills to, first match wins:
--   1. the task's line (a subtask uses its task's line: billing is on phases and tasks, never on subtasks)
--   2. the line of the task's phase
--   3. for days only: the day-rate line that names the person (as before)
-- Days (day-rate lines): approved, billable, unbilled days on that work fill the line on the next statement.
-- Deliveries and units: a task billed as such a line counts once it is Done (one delivery, or its estimate in
-- that unit, else 1), and is billed once, on the statement that is approved.
-- A line keeps its meaning across rate card versions: work linked to "Data engineer" on version 1 bills on
-- "Data engineer" of the approved version.
-- Who links: the PM, an admin or the CEO, finance, or a consultant on a task they own. Once days on the work are
-- approved (or the task is billed), only finance, an admin or the CEO can change the line.

alter table public.phases add column rate_line_id uuid references public.rate_card_lines (id) on delete set null;
alter table public.tasks add column rate_line_id uuid references public.rate_card_lines (id) on delete set null,
                         add column statement_id uuid references public.billing_statements (id) on delete set null;   -- billed on (deliveries, units)
create index on public.tasks (rate_line_id) where rate_line_id is not null;

-- a line's identity across versions of the card
create or replace function private.line_key(p_line uuid) returns text
language sql stable security definer set search_path = '' as $$
  select l.kind::text || ':' || lower(trim(l.label)) from public.rate_card_lines l where l.id = p_line
$$;

-- the line a task bills to (a subtask through its task), or its phase's
create or replace function private.task_line(p_task uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(t.rate_line_id, p.rate_line_id, ph.rate_line_id)
  from public.tasks t
  left join public.tasks p on p.id = t.parent_id
  left join public.phases ph on ph.id = coalesce(p.phase_id, t.phase_id)
  where t.id = p_task
$$;

-- does this time entry bill on this day-rate line?
create or replace function private.entry_bills_on(p_entry uuid, p_line uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when private.task_line(te.task_id) is not null
              then private.line_key(private.task_line(te.task_id)) = private.line_key(p_line)
              else exists (select 1 from public.rate_line_people lp where lp.rate_card_line_id = p_line and lp.profile_id = te.user_id) end
  from public.time_entries te where te.id = p_entry
$$;

-- ---------------------------------------------------------------- the line names, without rates
-- for anyone on the project's team: the lines of the latest card (approved first), plus any line work points at
create or replace function public.billing_lines(p_project uuid)
returns table (id uuid, label text, kind public.billing_kind, unit text, current boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_customer uuid; v_card uuid;
begin
  select customer_id into v_customer from public.projects where projects.id = p_project;
  if v_customer is null or not private.is_staff_of(v_customer) then return; end if;
  select c.id into v_card from public.rate_cards c where c.project_id = p_project
  order by (c.status = 'approved') desc, c.version desc limit 1;
  return query
    select l.id, l.label, l.kind, l.unit, l.rate_card_id = v_card
    from public.rate_card_lines l join public.rate_cards c on c.id = l.rate_card_id
    where c.project_id = p_project
      and (l.rate_card_id = v_card
           or l.id in (select t.rate_line_id from public.tasks t where t.project_id = p_project)
           or l.id in (select ph.rate_line_id from public.phases ph where ph.project_id = p_project))
    order by l.rate_card_id = v_card desc, l.position;
end $$;

-- ---------------------------------------------------------------- linking
create or replace function private.work_is_locked(p_task uuid, p_phase uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.time_entries te join public.tasks t on t.id = te.task_id
    where te.approved_at is not null
      and (t.id = p_task or t.parent_id = p_task or t.phase_id = p_phase))
  or exists (select 1 from public.tasks t where t.statement_id is not null and (t.id = p_task or t.phase_id = p_phase))
$$;

-- every change of a line goes through here, also a direct update: right project, right people, not once billed
create or replace function private.guard_rate_line() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_project uuid; v_line_project uuid; v_task uuid; v_phase uuid; v_customer uuid; v_owner uuid;
begin
  if new.rate_line_id is not distinct from old.rate_line_id then return new; end if;
  if tg_table_name = 'tasks' then
    if new.parent_id is not null then raise exception 'subtasks are billed through their task'; end if;
    v_task := new.id; v_project := new.project_id; v_customer := new.customer_id; v_owner := new.assignee_id;
  else
    v_phase := new.id; v_project := new.project_id; v_customer := new.customer_id;
  end if;
  if (select auth.uid()) is not null then   -- people (the service and migrations are trusted)
    if not (private.can_manage(v_customer) or private.can_price(v_customer)
            or (v_task is not null and v_owner = (select auth.uid()) and private.is_staff_of(v_customer))) then
      raise exception 'not allowed';
    end if;
    if private.work_is_locked(v_task, v_phase) and not private.can_price(v_customer) then
      raise exception 'approved days are logged on this work, so only finance, an admin or the CEO can change what it is billed as';
    end if;
  end if;
  if new.rate_line_id is not null then
    select c.project_id into v_line_project from public.rate_card_lines l join public.rate_cards c on c.id = l.rate_card_id where l.id = new.rate_line_id;
    if v_line_project is distinct from v_project then raise exception 'that line is not on this project''s rate card'; end if;
  end if;
  return new;
end $$;
create trigger tasks_guard_rate_line before update of rate_line_id on public.tasks for each row execute function private.guard_rate_line();
create trigger phases_guard_rate_line before update of rate_line_id on public.phases for each row execute function private.guard_rate_line();

-- a new task or phase may start with a line too (same checks)
create or replace function private.guard_rate_line_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_line_project uuid;
begin
  if new.rate_line_id is null then return new; end if;
  if tg_table_name = 'tasks' and new.parent_id is not null then raise exception 'subtasks are billed through their task'; end if;
  select c.project_id into v_line_project from public.rate_card_lines l join public.rate_cards c on c.id = l.rate_card_id where l.id = new.rate_line_id;
  if v_line_project is distinct from new.project_id then raise exception 'that line is not on this project''s rate card'; end if;
  return new;
end $$;
create trigger tasks_guard_rate_line_insert before insert on public.tasks for each row execute function private.guard_rate_line_insert();
create trigger phases_guard_rate_line_insert before insert on public.phases for each row execute function private.guard_rate_line_insert();

-- the one way people set it (a consultant cannot update tasks directly)
create or replace function public.set_billed_as(p_task uuid, p_phase uuid, p_line uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (p_task is null) = (p_phase is null) then raise exception 'pick a task or a phase'; end if;
  if p_task is not null then
    if not exists (select 1 from public.tasks where id = p_task and private.is_staff_of(customer_id)) then raise exception 'not allowed'; end if;
    update public.tasks set rate_line_id = p_line where id = p_task;
  else
    if not exists (select 1 from public.phases where id = p_phase and private.is_staff_of(customer_id)) then raise exception 'not allowed'; end if;
    update public.phases set rate_line_id = p_line where id = p_phase;
  end if;
end $$;

-- a billed task stays as billed; reopening it does not unbill it
create or replace function private.billed_task_kept() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.statement_id is not null and new.statement_id is distinct from old.statement_id and (select auth.uid()) is not null then
    raise exception 'this task is billed and stays on its statement';
  end if;
  return new;
end $$;
create trigger tasks_billed_kept before update of statement_id on public.tasks for each row execute function private.billed_task_kept();

-- ---------------------------------------------------------------- statements
-- approved, billable, unbilled days in the period that bill on this day-rate line, by person
create or replace function private.line_days(p_line uuid, p_project uuid, p_start date, p_end date)
returns table (days numeric, people text) language sql stable security definer set search_path = '' as $$
  with per_person as (
    select pr.full_name, sum(te.days) as days
    from public.time_entries te
    join public.tasks t on t.id = te.task_id and t.project_id = p_project
    join public.profiles pr on pr.id = te.user_id
    where te.billable and te.approved_at is not null and te.statement_id is null
      and te.worked_on between p_start and p_end
      and private.entry_bills_on(te.id, p_line)
    group by pr.id, pr.full_name
  )
  select coalesce(sum(days), 0),
         coalesce(string_agg(full_name || ' ' || trim_scale(days)::text || case when days = 1 then ' day' else ' days' end, ', ' order by full_name), '')
  from per_person
$$;

-- tasks done in the period, not billed yet, that bill on this delivery or unit line
create or replace function private.line_tasks(p_line uuid, p_project uuid, p_start date, p_end date)
returns table (task_id uuid, title text, quantity numeric) language sql stable security definer set search_path = '' as $$
  select t.id, t.title,
         case when l.kind = 'unit' and e.estimate is not null and lower(trim(e.unit)) = lower(trim(l.unit)) then e.estimate else 1 end
  from public.tasks t
  join public.rate_card_lines l on l.id = p_line
  left join public.task_estimates e on e.task_id = t.id
  where t.project_id = p_project and t.parent_id is null and t.status = 'done' and t.statement_id is null
    and t.completed_at::date between p_start and p_end
    and private.task_line(t.id) is not null and private.line_key(private.task_line(t.id)) = private.line_key(p_line)
$$;

-- does anything on the plan point at this line (any version)?
create or replace function private.line_has_work(p_line uuid, p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tasks t where t.project_id = p_project and t.rate_line_id is not null and private.line_key(t.rate_line_id) = private.line_key(p_line))
      or exists (select 1 from public.phases ph where ph.project_id = p_project and ph.rate_line_id is not null and private.line_key(ph.rate_line_id) = private.line_key(p_line))
$$;

create or replace function private.fill_from_timesheets(p_statement uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.billing_statements; l record; d record; v_qty numeric; v_titles text;
begin
  select * into st from public.billing_statements where id = p_statement;
  for l in select sl.id, sl.rate_card_line_id, sl.kind from public.statement_lines sl where sl.statement_id = p_statement loop
    if l.kind = 'day_rate' then
      if not (exists (select 1 from public.rate_line_people p where p.rate_card_line_id = l.rate_card_line_id)
              or private.line_has_work(l.rate_card_line_id, st.project_id)) then continue; end if;
      select * into d from private.line_days(l.rate_card_line_id, st.project_id, st.period_start, st.period_end);
      update public.statement_lines
      set quantity = d.days, note = case when d.days > 0 then 'From approved timesheets: ' || d.people else 'No approved days in this period' end
      where id = l.id;
    elsif l.kind in ('delivery', 'unit') and private.line_has_work(l.rate_card_line_id, st.project_id) then
      select coalesce(sum(x.quantity), 0), string_agg(x.title, ', ' order by x.title) into v_qty, v_titles
      from private.line_tasks(l.rate_card_line_id, st.project_id, st.period_start, st.period_end) x;
      update public.statement_lines
      set quantity = v_qty, note = case when v_qty > 0 then 'From tasks done: ' || v_titles else 'No tasks done in this period' end
      where id = l.id;
    end if;
  end loop;
end $$;

-- sent or approved: no line bills more than the work behind it; approved: that work is billed on this statement
create or replace function private.on_statement_approved() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l record;
begin
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
    and exists (select 1 from public.statement_lines sl
                where sl.statement_id = new.id and sl.kind = 'day_rate' and sl.quantity > 0
                  and private.entry_bills_on(te.id, sl.rate_card_line_id));
  update public.tasks t set statement_id = new.id
  where t.id in (select x.task_id from public.statement_lines sl,
                   lateral private.line_tasks(sl.rate_card_line_id, new.project_id, new.period_start, new.period_end) x
                 where sl.statement_id = new.id and sl.kind in ('delivery', 'unit') and sl.quantity > 0);
  return null;
end $$;

-- unbilled work, valued on the line the days bill on (task, phase, then person)
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
  left join live on live.project_id = pr.id and private.entry_bills_on(te.id, live.line_id)
  where te.billable and te.approved_at is not null and te.statement_id is null
    and (p_project is null or pr.id = p_project)
    and private.can_bill(pr.customer_id, pr.id)
  group by pr.id, pr.name, cu.name, te.user_id, p.full_name
  order by min(te.worked_on)
$$;

revoke execute on function public.billing_lines, public.set_billed_as from public, anon;
grant execute on function public.billing_lines, public.set_billed_as to authenticated;
