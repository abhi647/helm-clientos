-- 1. A request can become a plan task, with an owner, and the PM decides whether the customer sees it.
-- 2. Staff can log a request a customer gave them verbally (a call, a meeting). It is raised on behalf of the
--    customer company or a named person on their team, shows in their portal, and says who logged it.

-- ---------------------------------------------------------------- requests logged on a customer's behalf
alter table public.requests add column raised_by uuid references public.profiles (id);   -- staff who logged it; null when the customer raised it

-- the requester belongs to the request's customer; whoever logs one for a customer is staff of that customer
create or replace function private.check_request_people() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.requested_by is not null and exists (select 1 from public.profiles where id = new.requested_by and kind = 'customer')
     and not exists (select 1 from public.profiles where id = new.requested_by and customer_id = new.customer_id) then
    raise exception 'the requester must be someone at this customer';
  end if;
  if new.raised_by is not null and (select auth.uid()) is not null and new.raised_by <> (select auth.uid())
     and (tg_op = 'INSERT' or new.raised_by is distinct from old.raised_by) then
    raise exception 'you can only log a request as yourself';
  end if;
  if new.raised_by is not null and not exists (
       select 1 from public.profiles p join public.customers c on c.org_id = p.org_id
       where p.id = new.raised_by and p.kind = 'internal' and c.id = new.customer_id) then
    raise exception 'only Seven Billion staff can log a request on a customer''s behalf';
  end if;
  return new;
end $$;
create trigger requests_check_people before insert or update of requested_by, raised_by, customer_id on public.requests
  for each row execute function private.check_request_people();

create or replace function private.on_request_insert() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pm uuid; r record; v_for text; v_note text;
begin
  if new.raised_by is not null then
    v_for := coalesce((select full_name from public.profiles where id = new.requested_by and kind = 'customer'),
                      (select name from public.customers where id = new.customer_id));
    v_note := 'Logged by ' || coalesce((select full_name from public.profiles where id = new.raised_by), 'Seven Billion') || ' on behalf of ' || v_for;
  end if;
  insert into public.request_events (request_id, customer_id, status, actor_id, note)
  values (new.id, new.customer_id, new.status, coalesce((select auth.uid()), new.requested_by), coalesce(v_note, 'Request received'));
  perform private.log(new.customer_id, new.project_id,
    case when v_note is not null then v_note || ': ' || new.number || ' ' || new.title
         else private.actor_name() || ' submitted ' || new.number || ': ' || new.title end, 'request', new.id, 'shared');

  -- the customer hears about a request logged for them, so it is never a surprise in their portal
  if new.raised_by is not null and new.requested_by is not null and new.requested_by <> new.raised_by then
    perform private.notify(new.requested_by, 'request.logged', 'We logged your request: ' || new.number || ' ' || new.title,
      v_note || '. You can follow it and reply here.', '/requests/' || new.id, false, true);
  end if;

  select pm_id into v_pm from public.projects where id = new.project_id;
  if coalesce(new.owner_id, v_pm) is not null then
    perform private.notify(coalesce(new.owner_id, v_pm), 'request.submitted', new.number || ' ' || new.title,
      'New ' || replace(new.type::text, '_', ' ') || ', priority ' || new.priority, '/requests/' || new.id, true, true);
  else
    for r in select p.id from public.profiles p join public.customers c on c.org_id = p.org_id
             where c.id = new.customer_id and p.internal_role in ('pm', 'admin') loop
      perform private.notify(r.id, 'request.submitted', new.number || ' ' || new.title, 'New request, not yet assigned', '/requests/' || new.id, true, true);
    end loop;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- a request becomes a plan task
alter table public.tasks add column request_id uuid references public.requests (id) on delete set null;
create index on public.tasks (request_id) where request_id is not null;

-- Shared: the customer sees the task on the plan, and the request moves to Scheduled with a note on its timeline.
-- Internal: only Seven Billion sees the task; the request's stage is left as it is.
create or replace function public.request_to_task(p_request uuid, p_assignee uuid default null, p_shared boolean default true,
  p_due date default null, p_project uuid default null, p_phase uuid default null, p_estimate numeric default null, p_unit text default 'day')
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.requests; v_project uuid; v_phase uuid := p_phase; v_task uuid; v_kind public.user_kind; v_vis public.visibility;
begin
  select * into r from public.requests where id = p_request for update;
  if not found or not private.is_staff_of(r.customer_id) then raise exception 'not allowed'; end if;
  v_project := coalesce(p_project, r.project_id);
  if v_project is null then raise exception 'choose the project this request belongs to'; end if;
  if not exists (select 1 from public.projects where id = v_project and customer_id = r.customer_id) then
    raise exception 'that project belongs to another customer';
  end if;
  if p_assignee is not null then
    select kind into v_kind from public.profiles where id = p_assignee and (customer_id = r.customer_id or kind = 'internal');
    if v_kind is null then raise exception 'the owner must be on the team or at this customer'; end if;
  end if;
  if v_phase is null then   -- the first phase that still has open work, else the last phase
    select ph.id into v_phase from public.phases ph
    where ph.project_id = v_project
    order by (exists (select 1 from public.tasks t where t.phase_id = ph.id and t.status <> 'done')) desc,
             case when exists (select 1 from public.tasks t where t.phase_id = ph.id and t.status <> 'done') then ph.position else -ph.position end
    limit 1;
  end if;
  v_vis := case when p_shared then 'shared' else 'internal' end;

  insert into public.tasks (project_id, phase_id, customer_id, title, description, owner_side, assignee_id, due_date, visibility,
                            created_by, position, request_id)
  values (v_project, v_phase, r.customer_id, r.number || ' ' || r.title, r.what,
          case when v_kind = 'customer' then 'customer' else 'seven_billion' end::public.owner_side, p_assignee,
          coalesce(p_due, r.desired_date), v_vis, (select auth.uid()), 999, r.id)
  returning id into v_task;
  if p_estimate is not null then
    insert into public.task_estimates (task_id, customer_id, estimate, unit) values (v_task, r.customer_id, p_estimate, coalesce(nullif(trim(p_unit), ''), 'day'));
  end if;

  update public.requests set project_id = v_project where id = r.id and project_id is null;
  if p_shared and r.status in ('submitted', 'under_review', 'clarification', 'estimated', 'approved') then
    perform set_config('app.status_note', 'Added to the project plan', true);
    update public.requests set status = 'scheduled' where id = r.id;
  end if;
  perform private.log(r.customer_id, v_project, private.actor_name() || ' turned ' || r.number || ' into a task', 'task', v_task, v_vis);
  return v_task;
end $$;
revoke execute on function public.request_to_task from public, anon;
grant execute on function public.request_to_task to authenticated;
