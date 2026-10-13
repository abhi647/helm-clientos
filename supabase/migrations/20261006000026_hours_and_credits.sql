-- Hours, and hours credit for customers.
--
-- 1. Time is logged in hours. `days` stays as a read-only figure (hours / 8) so day-rate billing keeps working:
--    a statement line for a day rate bills hours / 8 days. Statement quantities keep 3 decimals for that.
-- 2. Each customer can have an hours credit, set by finance:
--      prepaid  hours bought in blocks (top-ups); used hours come off until a new block is added
--      monthly  a fixed number of hours each month; unused hours carry over up to a cap (0 = none, empty = no cap)
--    Top-ups can be added to either (extra hours). Hours are used when the PM approves them (billable time on any
--    of the customer's projects). Going over is allowed: the meter shows the hours over, billed at the agreed rate.
-- 3. The customer's people and the team are told at 75%, 90% and 100% used (once per period).

-- ---------------------------------------------------------------- hours on time entries
alter table public.time_entries add column hours numeric(5, 2);
update public.time_entries set hours = round(days * 8, 2);
alter table public.time_entries alter column hours set not null;
alter table public.time_entries add constraint time_entries_hours_check check (hours > 0 and hours <= 24);
alter table public.time_entries drop column days;
alter table public.time_entries add column days numeric(7, 4) generated always as (hours / 8) stored;

-- statements keep fractions of a day (3 h = 0.375 day)
alter table public.statement_lines drop column amount;
alter table public.statement_lines alter column quantity type numeric(12, 3);
alter table public.statement_lines add column amount numeric(16, 2) generated always as (round(rate * quantity, 2)) stored;

-- ---------------------------------------------------------------- credit plans and top-ups
create table public.credit_plans (
  customer_id uuid primary key references public.customers (id) on delete cascade,
  kind text not null check (kind in ('prepaid', 'monthly')),
  monthly_hours numeric(8, 2) check (monthly_hours is null or monthly_hours >= 0),
  rollover_cap numeric(8, 2) check (rollover_cap is null or rollover_cap >= 0),   -- monthly: 0 none, null unlimited
  starts_on date not null default date_trunc('month', current_date)::date,
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now(),
  check (kind = 'prepaid' or monthly_hours is not null)
);
create table public.credit_topups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  hours numeric(8, 2) not null check (hours > 0),
  added_on date not null default current_date,
  note text not null default '' check (length(note) <= 300),
  added_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.credit_topups (customer_id, added_on);
create table public.credit_alerts (
  customer_id uuid not null references public.customers (id) on delete cascade,
  period_start date not null,
  level int not null,
  sent_at timestamptz not null default now(),
  primary key (customer_id, period_start, level)
);

alter table public.credit_plans enable row level security;
alter table public.credit_topups enable row level security;
alter table public.credit_alerts enable row level security;
revoke all on public.credit_plans, public.credit_topups, public.credit_alerts from anon, authenticated;
grant select, insert, update, delete on public.credit_plans, public.credit_topups to authenticated;
-- the team and the customer's own people read them; finance, an admin or the CEO change them
create policy credit_plans_read on public.credit_plans for select to authenticated
  using (private.is_staff_of(customer_id) or customer_id = private.my_customer());
create policy credit_plans_write on public.credit_plans for all to authenticated
  using (private.can_price(customer_id)) with check (private.can_price(customer_id));
create policy credit_topups_read on public.credit_topups for select to authenticated
  using (private.is_staff_of(customer_id) or customer_id = private.my_customer());
create policy credit_topups_write on public.credit_topups for all to authenticated
  using (private.can_price(customer_id)) with check (private.can_price(customer_id));

-- approved, billable hours on the customer's work in a date range
create or replace function private.credit_used(p_customer uuid, p_from date, p_to date) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(te.hours), 0) from public.time_entries te
  where te.customer_id = p_customer and te.billable and te.approved_at is not null and te.worked_on between p_from and p_to
$$;

-- the customer's balance now (public.credit_balance, below): what they have, what is used, what is left (negative = over)

-- what used the hours, for the customer's hours page: no internal task names, no notes
create or replace function public.credit_usage(p_customer uuid, p_from date, p_to date)
returns table (worked_on date, hours numeric, project text, work text, person text)
language sql stable security definer set search_path = '' as $$
  select te.worked_on, te.hours, pr.name,
         case when coalesce(par.visibility, t.visibility) = 'shared' and t.visibility = 'shared' then coalesce(par.title || ' › ', '') || t.title else 'Internal work' end,
         split_part(p.full_name, ' ', 1)
  from public.time_entries te
  join public.tasks t on t.id = te.task_id
  left join public.tasks par on par.id = t.parent_id
  join public.projects pr on pr.id = t.project_id
  join public.profiles p on p.id = te.user_id
  where te.customer_id = p_customer and te.billable and te.approved_at is not null and te.worked_on between p_from and p_to
    and (private.is_staff_of(p_customer) or p_customer = private.my_customer())
  order by te.worked_on desc, pr.name
$$;

-- ---------------------------------------------------------------- alerts at 75%, 90% and 100%
create or replace function private.credit_check(p_customer uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare b record; lvl int; v_name text; r record;
begin
  -- computed as the customer would see it (public.credit_balance checks the caller; this does not)
  select x.* into b from private.credit_balance_system(p_customer) x;
  if b.kind is null or b.used_pct is null then return; end if;
  lvl := case when b.used_pct >= 100 then 100 when b.used_pct >= 90 then 90 when b.used_pct >= 75 then 75 else 0 end;
  if lvl = 0 or exists (select 1 from public.credit_alerts where customer_id = p_customer and period_start = b.period_start and level >= lvl) then return; end if;
  insert into public.credit_alerts (customer_id, period_start, level) values (p_customer, b.period_start, lvl) on conflict do nothing;
  select name into v_name from public.customers where id = p_customer;
  -- the customer's executives and invoice contacts
  for r in select id from public.profiles where kind = 'customer' and customer_id = p_customer and access_revoked_at is null
           and (customer_role = 'customer_exec' or can_view_invoices) loop
    perform private.notify(r.id, 'credit', case when lvl = 100 then 'Your hours are used up' else 'You have used ' || lvl || '% of your hours' end,
      trim_scale(b.used)::text || ' of ' || trim_scale(b.available)::text || ' hours used'
      || case when b.kind = 'monthly' then ' this month.' else '.' end
      || case when lvl = 100 then ' Work continues; hours over are billed at the agreed rate.' else '' end, '/portal/hours', lvl = 100);
  end loop;
  -- the account team and finance
  for r in select distinct p.id from public.profiles p
           where p.kind = 'internal' and p.access_revoked_at is null
             and (p.id in (select profile_id from public.customer_team where customer_id = p_customer)
                  or p.internal_role in ('finance', 'admin', 'ceo'))
             and p.org_id = (select org_id from public.customers where id = p_customer) loop
    perform private.notify(r.id, 'credit', v_name || ': ' || lvl || '% of hours used',
      trim_scale(b.used)::text || ' of ' || trim_scale(b.available)::text || ' hours' || case when lvl = 100 then '. Consider a top-up.' else '.' end,
      '/customers/' || p_customer, lvl = 100);
  end loop;
end $$;

-- the same balance without the caller check, for the alert job only (not callable by people)
create or replace function private.credit_balance_system(p_customer uuid)
returns table (kind text, period_start date, period_end date, allowance numeric, carried numeric, topups numeric,
               available numeric, used numeric, remaining numeric, used_pct numeric)
language plpgsql stable security definer set search_path = '' as $$
declare pl public.credit_plans; m date; v_carry numeric := 0; v_month_end date; v_this date := date_trunc('month', current_date)::date; v_top numeric; v_used numeric;
begin
  select * into pl from public.credit_plans where customer_id = p_customer;
  if pl.customer_id is null then return; end if;
  if pl.kind = 'prepaid' then
    select coalesce(sum(t.hours), 0) into v_top from public.credit_topups t where t.customer_id = p_customer;
    v_used := private.credit_used(p_customer, pl.starts_on, 'infinity'::date);
    return query select 'prepaid'::text, pl.starts_on, current_date, 0::numeric, 0::numeric, v_top, v_top, v_used, v_top - v_used,
      case when v_top > 0 then round(100 * v_used / v_top, 1) else null end;
    return;
  end if;
  m := date_trunc('month', pl.starts_on)::date;
  while m < v_this loop
    v_month_end := (m + interval '1 month - 1 day')::date;
    select coalesce(sum(t.hours), 0) into v_top from public.credit_topups t where t.customer_id = p_customer and t.added_on between m and v_month_end;
    v_carry := greatest(0, v_carry + pl.monthly_hours + v_top - private.credit_used(p_customer, m, v_month_end));
    if pl.rollover_cap is not null then v_carry := least(v_carry, pl.rollover_cap); end if;
    m := (m + interval '1 month')::date;
  end loop;
  v_month_end := (v_this + interval '1 month - 1 day')::date;
  select coalesce(sum(t.hours), 0) into v_top from public.credit_topups t where t.customer_id = p_customer and t.added_on between v_this and v_month_end;
  v_used := private.credit_used(p_customer, greatest(v_this, pl.starts_on), v_month_end);
  return query select 'monthly'::text, v_this, v_month_end, pl.monthly_hours, v_carry, v_top, pl.monthly_hours + v_carry + v_top,
    v_used, pl.monthly_hours + v_carry + v_top - v_used,
    case when pl.monthly_hours + v_carry + v_top > 0 then round(100 * v_used / (pl.monthly_hours + v_carry + v_top), 1) else null end;
end $$;
revoke execute on function private.credit_balance_system from public, anon, authenticated;

-- public.credit_balance is the checked wrapper over the same calculation
create or replace function public.credit_balance(p_customer uuid)
returns table (kind text, period_start date, period_end date, allowance numeric, carried numeric, topups numeric,
               available numeric, used numeric, remaining numeric, used_pct numeric)
language sql stable security definer set search_path = '' as $$
  select * from private.credit_balance_system(p_customer)
  where private.is_staff_of(p_customer) or p_customer = private.my_customer()
$$;

create or replace function private.on_time_approved() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.credit_check(new.customer_id);
  return null;
end $$;
create trigger time_entries_credit after update of approved_at on public.time_entries
  for each row when (new.approved_at is not null and old.approved_at is null and new.billable) execute function private.on_time_approved();

-- a top-up or a changed plan starts the alerts again (the next approval checks the new balance)
create or replace function private.credit_reset_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.credit_alerts where customer_id = new.customer_id;
  return null;
end $$;
create trigger credit_topups_reset after insert on public.credit_topups for each row execute function private.credit_reset_alerts();
create trigger credit_plans_reset after insert or update on public.credit_plans for each row execute function private.credit_reset_alerts();

revoke execute on function public.credit_balance, public.credit_usage from public, anon;
grant execute on function public.credit_balance, public.credit_usage to authenticated;
