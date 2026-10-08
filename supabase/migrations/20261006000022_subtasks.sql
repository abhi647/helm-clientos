-- The plan's hierarchy: project → phase → task → subtask. A subtask is a task with a parent (one level only: a
-- subtask has no subtasks of its own). It has its own owner, dates, status, estimate and logged time, and always
-- sits in its parent's project and phase. It is never wider than its parent: a subtask of an internal task is
-- internal. Progress counts tasks, not subtasks; a task shows how many of its subtasks are done.
-- Billing (later) attaches to phases and tasks; a subtask's time counts towards its parent task.

alter table public.tasks add column parent_id uuid references public.tasks (id) on delete cascade;
create index on public.tasks (parent_id) where parent_id is not null;

-- keep a subtask in its parent's place
create or replace function private.subtask_follows_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.tasks;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception 'a task cannot be its own subtask'; end if;
  select * into p from public.tasks where id = new.parent_id;
  if p.id is null then raise exception 'parent task not found'; end if;
  if p.parent_id is not null then raise exception 'a subtask cannot have subtasks of its own'; end if;
  if p.project_id <> new.project_id then raise exception 'a subtask belongs to the same project as its task'; end if;
  if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id
     and exists (select 1 from public.tasks c where c.parent_id = new.id) then
    raise exception 'this task has subtasks, so it cannot become a subtask';
  end if;
  new.customer_id := p.customer_id;
  new.phase_id := p.phase_id;
  if p.visibility = 'internal' then new.visibility := 'internal'; end if;
  return new;
end $$;
create trigger tasks_subtask_follows_parent before insert or update of parent_id, phase_id, visibility, project_id on public.tasks
  for each row execute function private.subtask_follows_parent();

-- moving a task to another phase, or making it internal, takes its subtasks along
create or replace function private.subtasks_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks set phase_id = new.phase_id
  where parent_id = new.id and phase_id is distinct from new.phase_id;
  if new.visibility = 'internal' then
    update public.tasks set visibility = 'internal' where parent_id = new.id and visibility <> 'internal';
  end if;
  return null;
end $$;
create trigger tasks_subtasks_follow after update of phase_id, visibility on public.tasks
  for each row when (new.parent_id is null) execute function private.subtasks_follow();

-- progress counts tasks; subtasks are the breakdown of a task
create or replace view public.project_progress with (security_invoker = on) as
  select project_id, count(*) filter (where status = 'done')::int as done, count(*)::int as total
  from public.tasks where parent_id is null group by project_id;

-- deleting a task takes its subtasks, so their billed days keep it too
create or replace function public.delete_task(p_task uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.tasks; v_ids uuid[]; v_days numeric;
begin
  select * into v from public.tasks where id = p_task;
  if v.id is null or not private.can_manage(v.customer_id) then raise exception 'not allowed'; end if;
  select array_agg(id) into v_ids from public.tasks where id = p_task or parent_id = p_task;
  v_days := private.billed_days_on(v_ids);
  if v_days > 0 then
    raise exception 'approved or billed days are logged on this task (% days), so it is kept: mark it Done instead', trim_scale(v_days);
  end if;
  delete from public.comments where entity_type = 'task' and entity_id = any (v_ids);
  delete from public.tasks where id = p_task;   -- its subtasks, unapproved time, estimates go with it
  perform private.log(v.customer_id, v.project_id,
    'deleted the ' || case when v.parent_id is null then 'task ' else 'subtask ' end || v.title
    || case when coalesce(array_length(v_ids, 1), 1) > 1 then ' and its ' || (array_length(v_ids, 1) - 1) || ' subtasks' else '' end,
    'task', p_task, 'internal');
end $$;
