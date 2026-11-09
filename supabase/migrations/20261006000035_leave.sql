-- Leave and holidays.
--
-- People apply for leave; their reporting manager (or, without one, an admin or the CEO) approves or declines it.
-- Approved leave becomes leave_days, the per-day record that dedicated billing and the timesheet already read, so
-- billing follows approved leave on its own. Company holidays are not working days anywhere: billing, leave counts
-- and the timesheet. Customers see only the dates their people are away, never the type or the reason.

-- ---------------------------------------------------------------- the company holiday list
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  name text not null check (char_length(name) between 2 and 80),
  -- optional (restricted) holidays: people may take a few of them, as the "Optional holiday" leave type
  optional boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.holidays enable row level security;
revoke all on public.holidays from anon;
grant select, insert, update, delete on public.holidays to authenticated;
create policy holidays_read on public.holidays for select to authenticated using (private.is_staff());
create policy holidays_admin on public.holidays for all to authenticated
  using (private.staff_role() in ('admin', 'ceo')) with check (private.staff_role() in ('admin', 'ceo'));

-- ---------------------------------------------------------------- leave types and yearly allowances
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_]{2,30}$'),
  name text not null check (char_length(name) between 2 and 40),
  -- days per calendar year; null: no limit
  yearly_allowance numeric(5, 1) check (yearly_allowance is null or yearly_allowance >= 0),
  paid boolean not null default true,
  -- taken only on optional holidays
  optional_holidays_only boolean not null default false,
  position int not null default 0,
  active boolean not null default true
);
alter table public.leave_types enable row level security;
revoke all on public.leave_types from anon;
grant select, insert, update on public.leave_types to authenticated;
create policy leave_types_read on public.leave_types for select to authenticated using (private.is_staff());
create policy leave_types_admin_insert on public.leave_types for insert to authenticated with check (private.staff_role() in ('admin', 'ceo'));
create policy leave_types_admin_update on public.leave_types for update to authenticated
  using (private.staff_role() in ('admin', 'ceo')) with check (private.staff_role() in ('admin', 'ceo'));

insert into public.leave_types (key, name, yearly_allowance, paid, optional_holidays_only, position) values
  ('casual', 'Casual leave', 12, true, false, 1),
  ('sick', 'Sick leave', 12, true, false, 2),
  ('earned', 'Earned leave', 15, true, false, 3),
  ('optional_holiday', 'Optional holiday', 2, true, true, 4),
  ('comp_off', 'Comp-off', null, true, false, 5),
  ('unpaid', 'Unpaid leave', null, false, false, 6);

-- a person's own allowance for a type and year, where it differs from the default (joined mid-year, carried over…)
create table public.leave_allowances (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  days numeric(5, 1) not null check (days >= 0),
  primary key (profile_id, leave_type_id, year)
);
alter table public.leave_allowances enable row level security;
revoke all on public.leave_allowances from anon;
grant select, insert, update, delete on public.leave_allowances to authenticated;

-- ---------------------------------------------------------------- who approves whose leave
create table public.reporting_managers (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  manager_id uuid not null references public.profiles (id) on delete cascade,
  check (profile_id <> manager_id)
);
alter table public.reporting_managers enable row level security;
revoke all on public.reporting_managers from anon;
grant select, insert, update, delete on public.reporting_managers to authenticated;
create policy reporting_read on public.reporting_managers for select to authenticated using (private.is_staff());
create policy reporting_admin on public.reporting_managers for all to authenticated
  using (private.staff_role() in ('admin', 'ceo')) with check (private.staff_role() in ('admin', 'ceo'));

-- can the signed-in person decide this person's leave: their manager, or an admin or the CEO (never their own)
create or replace function private.decides_leave_of(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_staff() and p_profile <> (select auth.uid()) and (
    private.staff_role() in ('admin', 'ceo')
    or exists (select 1 from public.reporting_managers r where r.profile_id = p_profile and r.manager_id = (select auth.uid())))
$$;

create policy allowances_read on public.leave_allowances for select to authenticated
  using (private.is_staff() and (profile_id = (select auth.uid()) or private.decides_leave_of(profile_id)));
create policy allowances_admin on public.leave_allowances for all to authenticated
  using (private.staff_role() in ('admin', 'ceo')) with check (private.staff_role() in ('admin', 'ceo'));

-- ---------------------------------------------------------------- requests
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id),
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  reason text not null default '' check (char_length(reason) <= 1000),
  -- working days it takes: weekdays that are not holidays, a half day counting 0.5
  days numeric(5, 1) not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  approver_id uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '' check (char_length(decision_note) <= 1000),
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (not half_day or start_date = end_date),
  check (extract(year from start_date) = extract(year from end_date))
);
create index leave_requests_profile_idx on public.leave_requests (profile_id, start_date desc);
create index leave_requests_pending_idx on public.leave_requests (approver_id) where status = 'pending';
alter table public.leave_requests enable row level security;
revoke all on public.leave_requests from anon;
-- changes go through apply_leave / decide_leave / cancel_leave, which check the rules
grant select on public.leave_requests to authenticated;
create policy leave_requests_read on public.leave_requests for select to authenticated
  using (private.is_staff() and (profile_id = (select auth.uid()) or private.decides_leave_of(profile_id)));

-- approved leave days point back at their request (days recorded by hand by an admin have none)
alter table public.leave_days add column request_id uuid references public.leave_requests (id) on delete cascade,
  add column portion numeric(2, 1) not null default 1 check (portion in (0.5, 1));
-- the per-day record now follows approved requests; only an admin or the CEO records leave directly
drop policy if exists leave_insert on public.leave_days;
drop policy if exists leave_delete on public.leave_days;
create policy leave_insert on public.leave_days for insert to authenticated with check (private.staff_role() in ('admin', 'ceo'));
create policy leave_delete on public.leave_days for delete to authenticated using (private.staff_role() in ('admin', 'ceo'));

-- ---------------------------------------------------------------- working days
create or replace function private.is_holiday(p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.holidays h where h.day = p_day and not h.optional)
$$;

-- weekdays that are not company holidays (optional holidays stay working days)
create or replace function private.weekdays(p_from date, p_to date) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from generate_series(p_from, p_to, interval '1 day') d
  where extract(isodow from d) < 6 and not exists (select 1 from public.holidays h where h.day = d::date and not h.optional)
$$;

-- working days a person is on leave in a period (half days count 0.5); leave on a holiday or weekend costs nothing
drop function if exists private.leave_weekdays(uuid, date, date);
create function private.leave_weekdays(p_profile uuid, p_start date, p_end date) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.portion), 0) from public.leave_days l
  where l.profile_id = p_profile and l.day between p_start and p_end and extract(isodow from l.day) < 6 and not private.is_holiday(l.day)
$$;

create or replace function private.line_quantity(p_line uuid, p_project uuid, p_start date, p_end date, out qty numeric, out basis text)
language plpgsql stable security definer set search_path = '' as $$
declare l public.rate_card_lines; v_person uuid; v_name text; v_work int; v_leave numeric; v_allow numeric; v_used numeric;
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
      qty := case when v_work = 0 then 0 else round((v_work - v_leave) / v_work, 3) end;   -- statements keep 3 decimals
    else
      qty := greatest(v_work - v_leave, 0);
    end if;
    basis := coalesce(v_name, l.label) || ': ' || v_work || ' working days' || case when v_leave > 0 then ' − ' || trim_scale(v_leave) || ' on leave' else '' end;
  elsif l.kind = 'retainer' then
    qty := 1; basis := 'Monthly fee';
  elsif l.kind = 'overage' then
    select monthly_hours into v_allow from public.credit_plans where customer_id = l.customer_id;
    v_used := private.credit_used(l.customer_id, p_start, p_end);
    qty := greatest(0, v_used - coalesce(v_allow, 0));
    basis := trim_scale(v_used)::text || ' h used, ' || trim_scale(coalesce(v_allow, 0))::text || ' h included';
  end if;
end $$;

-- ---------------------------------------------------------------- balances
create or replace function private.leave_allowance(p_profile uuid, p_type uuid, p_year int) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select a.days from public.leave_allowances a where a.profile_id = p_profile and a.leave_type_id = p_type and a.year = p_year),
                  (select t.yearly_allowance from public.leave_types t where t.id = p_type))
$$;

-- each type for a person and year: allowance (null: no limit), approved, waiting and what is left
create or replace function public.leave_balances(p_profile uuid, p_year int)
returns table (leave_type_id uuid, key text, name text, allowance numeric, used numeric, pending numeric, remaining numeric, paid boolean)
language sql stable security definer set search_path = '' as $$
  select t.id, t.key, t.name, private.leave_allowance(p_profile, t.id, p_year),
    coalesce(sum(r.days) filter (where r.status = 'approved'), 0),
    coalesce(sum(r.days) filter (where r.status = 'pending'), 0),
    private.leave_allowance(p_profile, t.id, p_year) - coalesce(sum(r.days) filter (where r.status in ('approved', 'pending')), 0),
    t.paid
  from public.leave_types t
  left join public.leave_requests r on r.leave_type_id = t.id and r.profile_id = p_profile and extract(year from r.start_date) = p_year
  where t.active and private.is_staff() and (p_profile = (select auth.uid()) or private.decides_leave_of(p_profile))
  group by t.id order by t.position
$$;

-- ---------------------------------------------------------------- apply, decide, cancel
create or replace function public.apply_leave(p_type uuid, p_start date, p_end date, p_half_day boolean default false, p_reason text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.leave_types; v_me uuid := (select auth.uid()); v_days numeric; v_left numeric; v_id uuid; v_approver uuid; v_name text; v_admin record;
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  select * into t from public.leave_types where id = p_type and active;
  if t.id is null then raise exception 'pick a leave type'; end if;
  if p_end < p_start then raise exception 'the leave ends before it starts'; end if;
  if extract(year from p_start) <> extract(year from p_end) then raise exception 'apply for each calendar year separately'; end if;
  if p_half_day and p_start <> p_end then raise exception 'a half day is a single day'; end if;
  select count(*) * case when p_half_day then 0.5 else 1 end into v_days
  from generate_series(p_start, p_end, interval '1 day') d where extract(isodow from d) < 6 and not private.is_holiday(d::date);
  if t.optional_holidays_only then
    if exists (select 1 from generate_series(p_start, p_end, interval '1 day') d
               where extract(isodow from d) < 6 and not exists (select 1 from public.holidays h where h.day = d::date and h.optional)) then
      raise exception 'optional holiday leave is only for the optional holidays on the holiday list';
    end if;
    select count(*) * case when p_half_day then 0.5 else 1 end into v_days
    from generate_series(p_start, p_end, interval '1 day') d where exists (select 1 from public.holidays h where h.day = d::date and h.optional);
  end if;
  if v_days = 0 then raise exception 'those dates are weekends or holidays: no leave is needed'; end if;
  if exists (select 1 from public.leave_requests r where r.profile_id = v_me and r.status in ('pending', 'approved')
             and r.start_date <= p_end and r.end_date >= p_start) then
    raise exception 'you already have leave on some of those days';
  end if;
  v_left := private.leave_allowance(v_me, t.id, extract(year from p_start)::int)
    - coalesce((select sum(r.days) from public.leave_requests r where r.profile_id = v_me and r.leave_type_id = t.id
                and r.status in ('approved', 'pending') and extract(year from r.start_date) = extract(year from p_start)), 0);
  if v_left is not null and v_days > v_left then
    raise exception '% has % days left this year; this takes %', t.name, trim_scale(greatest(v_left, 0)), trim_scale(v_days);
  end if;
  select manager_id into v_approver from public.reporting_managers where profile_id = v_me;
  insert into public.leave_requests (profile_id, leave_type_id, start_date, end_date, half_day, reason, days, approver_id)
  values (v_me, t.id, p_start, p_end, p_half_day, left(coalesce(p_reason, ''), 1000), v_days, v_approver) returning id into v_id;
  select full_name into v_name from public.profiles where id = v_me;
  if v_approver is not null then
    perform private.notify(v_approver, 'leave', v_name || ' applied for ' || lower(t.name),
      trim_scale(v_days) || ' day' || case when v_days = 1 then '' else 's' end || ': ' || to_char(p_start, 'DD Mon') ||
      case when p_end <> p_start then ' – ' || to_char(p_end, 'DD Mon') else '' end, '/leave?tab=approvals', true);
  else
    for v_admin in select id from public.profiles where kind = 'internal' and internal_role in ('admin', 'ceo') and access_revoked_at is null loop
      perform private.notify(v_admin.id, 'leave', v_name || ' applied for ' || lower(t.name),
        trim_scale(v_days) || ' day' || case when v_days = 1 then '' else 's' end || ': ' || to_char(p_start, 'DD Mon') ||
        case when p_end <> p_start then ' – ' || to_char(p_end, 'DD Mon') else '' end, '/leave?tab=approvals', true);
    end loop;
  end if;
  return v_id;
end $$;

-- the approved days of a request, written to the per-day record billing and timesheets read
create or replace function private.record_leave_days(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.leave_requests; t public.leave_types;
begin
  select * into r from public.leave_requests where id = p_request;
  select * into t from public.leave_types where id = r.leave_type_id;
  insert into public.leave_days (profile_id, day, kind, note, request_id, portion)
  select r.profile_id, d::date, case when t.key = 'sick' then 'sick' else 'leave' end, t.name, r.id, case when r.half_day then 0.5 else 1 end
  from generate_series(r.start_date, r.end_date, interval '1 day') d
  where extract(isodow from d) < 6 and not private.is_holiday(d::date)
  on conflict (profile_id, day) do update set kind = excluded.kind, note = excluded.note, request_id = excluded.request_id, portion = excluded.portion;
end $$;

create or replace function public.decide_leave(p_request uuid, p_approve boolean, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare r public.leave_requests; v_name text; v_type text;
begin
  select * into r from public.leave_requests where id = p_request for update;
  if r.id is null or not private.decides_leave_of(r.profile_id) then raise exception 'not allowed'; end if;
  if r.status <> 'pending' then raise exception 'this request was already decided'; end if;
  update public.leave_requests set status = case when p_approve then 'approved' else 'declined' end,
    decided_by = (select auth.uid()), decided_at = now(), decision_note = left(coalesce(p_note, ''), 1000)
  where id = p_request;
  if p_approve then perform private.record_leave_days(p_request); end if;
  select full_name into v_name from public.profiles where id = (select auth.uid());
  select name into v_type from public.leave_types where id = r.leave_type_id;
  perform private.notify(r.profile_id, 'leave', 'Your ' || lower(v_type) || ' was ' || case when p_approve then 'approved' else 'declined' end,
    to_char(r.start_date, 'DD Mon') || case when r.end_date <> r.start_date then ' – ' || to_char(r.end_date, 'DD Mon') else '' end ||
    ' · by ' || v_name || case when coalesce(p_note, '') <> '' then ': ' || p_note else '' end, '/leave', false);
end $$;

-- your own request: withdraw it while it waits, or cancel approved leave that has not started yet
create or replace function public.cancel_leave(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.leave_requests;
begin
  select * into r from public.leave_requests where id = p_request for update;
  if r.id is null or r.profile_id <> (select auth.uid()) or not private.is_staff() then raise exception 'not allowed'; end if;
  if r.status = 'approved' and r.start_date <= current_date then raise exception 'leave that has started can only be changed by your manager or an admin'; end if;
  if r.status not in ('pending', 'approved') then raise exception 'this request is already closed'; end if;
  update public.leave_requests set status = 'cancelled' where id = p_request;
  delete from public.leave_days where request_id = p_request;
  if r.status = 'approved' and r.approver_id is not null then
    perform private.notify(r.approver_id, 'leave', 'Leave cancelled',
      to_char(r.start_date, 'DD Mon') || case when r.end_date <> r.start_date then ' – ' || to_char(r.end_date, 'DD Mon') else '' end, '/leave?tab=team', false);
  end if;
end $$;

-- ---------------------------------------------------------------- who is away
-- the team: approved and pending leave in a period, without reasons
create or replace function public.team_leave(p_from date, p_to date)
returns table (profile_id uuid, full_name text, start_date date, end_date date, half_day boolean, status text, type_name text)
language sql stable security definer set search_path = '' as $$
  select r.profile_id, p.full_name, r.start_date, r.end_date, r.half_day, r.status, t.name
  from public.leave_requests r join public.profiles p on p.id = r.profile_id join public.leave_types t on t.id = r.leave_type_id
  where private.is_staff() and r.status in ('approved', 'pending') and r.start_date <= p_to and r.end_date >= p_from
  order by r.start_date, p.full_name
$$;

-- a customer: the dates their people (PMs, task owners, people on their rates) are away; never the type or reason
create or replace function public.customer_team_leave(p_from date, p_to date)
returns table (full_name text, start_date date, end_date date, half_day boolean)
language sql stable security definer set search_path = '' as $$
  with mine as (select private.my_customer() as cid),
  people as (
    select pr.pm_id as id from public.projects pr, mine where pr.customer_id = mine.cid and pr.status = 'active' and pr.pm_id is not null
    union select t.assignee_id from public.tasks t join public.projects pr on pr.id = t.project_id, mine
      where pr.customer_id = mine.cid and pr.status = 'active' and t.assignee_id is not null and t.status <> 'done'
    union select lp.profile_id from public.rate_line_people lp, mine where lp.customer_id = mine.cid
  )
  select p.full_name, r.start_date, r.end_date, r.half_day
  from public.leave_requests r join public.profiles p on p.id = r.profile_id
  where r.status = 'approved' and p.kind = 'internal' and r.profile_id in (select id from people)
    and r.start_date <= p_to and r.end_date >= p_from and (select cid from mine) is not null
  order by r.start_date, p.full_name
$$;

revoke execute on function public.apply_leave, public.decide_leave, public.cancel_leave, public.leave_balances,
  public.team_leave, public.customer_team_leave from anon, public;
grant execute on function public.apply_leave, public.decide_leave, public.cancel_leave, public.leave_balances,
  public.team_leave, public.customer_team_leave to authenticated;

notify pgrst, 'reload schema';
