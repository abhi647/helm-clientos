-- Effort follows the billing unit.
-- Task estimates and estimates sent for approval carry a quantity and a unit taken from the project's rate card:
-- "day" for day-rate and retainer work, or the billed unit itself for delivery and unit lines ("dashboard", "report").
-- Time is logged in days. Existing hours are converted at 8 hours = 1 day.

-- ---------------------------------------------------------------- task estimates
alter table public.task_estimates rename column estimate_hours to estimate;
alter table public.task_estimates alter column estimate type numeric(9, 2);
update public.task_estimates set estimate = round(estimate / 8, 2);
alter table public.task_estimates add column unit text not null default 'day' check (length(trim(unit)) > 0);

-- ---------------------------------------------------------------- time logged, in days
alter table public.time_entries drop constraint if exists time_entries_hours_check;
alter table public.time_entries rename column hours to days;
alter table public.time_entries alter column days type numeric(5, 2);
update public.time_entries set days = greatest(round(days / 8, 2), 0.01);
alter table public.time_entries add constraint time_entries_days_check check (days > 0 and days <= 3);

-- ---------------------------------------------------------------- estimates sent for approval
alter table public.approvals rename column effort_hours to effort;
alter table public.approvals alter column effort type numeric(9, 2);
update public.approvals set effort = round(effort / 8, 2) where effort is not null;
alter table public.approvals add column effort_unit text not null default 'day' check (length(trim(effort_unit)) > 0);

-- "1 day", "2.5 days", "3 dashboards", "1 delivery", "2 deliveries"
create or replace function private.plural(u text) returns text language sql immutable set search_path = '' as $$
  select case when u ~ '[^aeiou]y$' then left(u, -1) || 'ies' when u ~ '(s|x|z|ch|sh)$' then u || 'es' else u || 's' end
$$;
create or replace function private.fmt_effort(q numeric, u text) returns text language sql immutable set search_path = '' as $$
  select trim_scale(q)::text || ' ' || case when q = 1 then u else private.plural(u) end
$$;

-- The units effort can be estimated in on a project, from its approved rate card (else its latest one).
-- Day-based work first. Staff only, and it returns units, never rates, so PMs can use it.
create or replace function public.effort_units(p_project uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare v_customer uuid; v_card uuid; v_units text[];
begin
  select customer_id into v_customer from public.projects where id = p_project;
  if v_customer is null or not private.is_staff_of(v_customer) then return array['day']; end if;
  select id into v_card from public.rate_cards where project_id = p_project
    order by (status = 'approved') desc, version desc limit 1;
  select array_agg(u order by ord, u) into v_units from (
    select u, min(ord) as ord from (
      select case when l.kind in ('day_rate', 'retainer') then 'day' else lower(trim(l.unit)) end as u,
             case when l.kind in ('day_rate', 'retainer') then -1 else l.position end as ord
      from public.rate_card_lines l where l.rate_card_id = v_card
    ) x group by u
  ) y;
  return coalesce(v_units, array['day']);
end $$;
revoke execute on function public.effort_units from public, anon;
grant execute on function public.effort_units to authenticated;

-- approval emails and history show effort in its unit
create or replace function private.on_approval_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.approval_events (approval_id, customer_id, action, version, actor_id)
  values (new.id, new.customer_id, 'requested', new.version, new.requested_by);
  insert into public.action_items (customer_id, project_id, type, title, assignee_id, due_date, priority, approval_id, request_id)
  values (new.customer_id, new.project_id, 'approval', new.title, new.approver_id, new.due_date, 'high', new.id, new.request_id);
  if new.request_id is not null then
    update public.requests set status = 'estimated'
    where id = new.request_id and status in ('submitted', 'under_review', 'clarification');
  end if;
  perform private.log(new.customer_id, new.project_id, private.actor_name() || ' requested approval: ' || new.title, 'approval', new.id, 'shared');
  perform private.notify(new.approver_id, 'approval.requested', 'Approval needed: ' || new.title,
    coalesce('Effort ' || private.fmt_effort(new.effort, new.effort_unit) || '. ', '') || coalesce('Target ' || to_char(new.target_date, 'Mon DD') || '.', ''),
    '/approvals/' || new.id, true, true);
  return null;
end $$;

drop function if exists public.resubmit_approval(uuid, text, numeric, date, text);
create or replace function public.resubmit_approval(p_approval uuid, p_summary text, p_effort numeric, p_target date default null,
  p_comment text default null, p_unit text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.approvals;
begin
  select * into a from public.approvals where id = p_approval for update;
  if not found or not private.is_staff_of(a.customer_id) then raise exception 'not allowed'; end if;
  if a.status <> 'changes_requested' then raise exception 'only an approval with requested changes can be resubmitted'; end if;
  update public.approvals set status = 'pending', version = a.version + 1, summary = coalesce(p_summary, a.summary),
    effort = coalesce(p_effort, a.effort), effort_unit = coalesce(nullif(trim(p_unit), ''), a.effort_unit),
    target_date = coalesce(p_target, a.target_date)
  where id = a.id;
  insert into public.approval_events (approval_id, customer_id, action, version, comment, actor_id)
  values (a.id, a.customer_id, 'resubmitted', a.version + 1, nullif(trim(p_comment), ''), (select auth.uid()));
  insert into public.action_items (customer_id, project_id, type, title, assignee_id, due_date, priority, approval_id, request_id)
  values (a.customer_id, a.project_id, 'approval', a.title || ' (v' || (a.version + 1) || ')', a.approver_id, a.due_date, 'high', a.id, a.request_id);
  perform private.notify(a.approver_id, 'approval.resubmitted', 'Revised for your approval: ' || a.title, coalesce(p_comment, ''), '/approvals/' || a.id, true, true);
end $$;
revoke execute on function public.resubmit_approval from public, anon;
grant execute on function public.resubmit_approval to authenticated;
