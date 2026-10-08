-- 1. A request goes on the plan once. Pressing "Add to the plan" again no longer adds another task: the request
--    already has its task, and further work on it is split into that task's subtasks.
-- 2. A task follows its subtasks: when work starts on a subtask, a task that is still Not started moves to
--    In progress; when a subtask of a Done task is reopened, the task is reopened (In progress). Finishing every
--    subtask does not close the task: the owner marks it Done. (A phase shows its state from its tasks.)

-- ---------------------------------------------------------------- one task per request
-- "Add to the plan" again: sharing a request that is on the plan as an internal task shares that task (and
-- schedules the request); otherwise it is refused with a pointer to subtasks.
create or replace function public.request_to_task(p_request uuid, p_assignee uuid default null, p_shared boolean default true,
  p_due date default null, p_project uuid default null, p_phase uuid default null, p_estimate numeric default null, p_unit text default 'day')
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.requests; v_project uuid; v_phase uuid := p_phase; v_task uuid; v_kind public.user_kind; v_vis public.visibility; v_existing public.tasks;
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

  -- already on the plan: sharing an internal task shares that task; anything else is refused
  select * into v_existing from public.tasks where request_id = r.id and parent_id is null order by created_at limit 1;
  if v_existing.id is not null then
    if not (p_shared and v_existing.visibility = 'internal') then
      raise exception 'this request is already on the plan: add subtasks to its task instead';
    end if;
    update public.tasks set visibility = 'shared' where id = v_existing.id;
    if p_estimate is not null then
      insert into public.task_estimates (task_id, customer_id, estimate, unit) values (v_existing.id, r.customer_id, p_estimate, coalesce(nullif(trim(p_unit), ''), 'day'))
      on conflict (task_id) do update set estimate = excluded.estimate, unit = excluded.unit;
    end if;
    if r.status in ('submitted', 'under_review', 'clarification', 'estimated', 'approved') then
      perform set_config('app.status_note', 'Added to the project plan', true);
      update public.requests set status = 'scheduled' where id = r.id;
    end if;
    perform private.log(r.customer_id, v_existing.project_id, private.actor_name() || ' shared the task for ' || r.number || ' with the customer', 'task', v_existing.id, 'shared');
    return v_existing.id;
  end if;

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

create or replace function private.request_on_plan_once() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.request_id is not null and new.parent_id is null
     and exists (select 1 from public.tasks t where t.request_id = new.request_id and t.parent_id is null and t.id <> new.id) then
    raise exception 'this request is already on the plan: add subtasks to its task instead';
  end if;
  return new;
end $$;
create trigger tasks_request_once before insert or update of request_id, parent_id on public.tasks
  for each row execute function private.request_on_plan_once();

-- ---------------------------------------------------------------- a task follows its subtasks
create or replace function private.task_follows_subtasks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'todo' then
    update public.tasks set status = 'in_progress'
    where id = new.parent_id and status = 'todo';
  end if;
  if new.status <> 'done' then
    update public.tasks set status = 'in_progress', completed_at = null
    where id = new.parent_id and status = 'done';
  end if;
  return null;
end $$;
create trigger tasks_follow_subtasks after insert or update of status on public.tasks
  for each row when (new.parent_id is not null) execute function private.task_follows_subtasks();
