-- Assigning and reassigning tasks.
-- A Seven Billion person is told when a task is given to them: one notification per batch of new tasks (a template
-- creates many at once), and one per reassignment. A customer's open action follows its task to the new owner, and
-- closes when the task moves back to Seven Billion or is left unassigned.

create or replace function private.on_tasks_inserted() returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select n.assignee_id, n.project_id, count(*) as cnt, min(n.title) as first_title, min(n.id::text) as first_id
    from new_rows n join public.profiles p on p.id = n.assignee_id
    where p.kind = 'internal'
    group by n.assignee_id, n.project_id
  loop
    perform private.notify(r.assignee_id, 'task.assigned',
      case when r.cnt = 1 then 'Task for you: ' || r.first_title else r.cnt || ' new tasks for you' end,
      coalesce((select name from public.projects where id = r.project_id), ''),
      case when r.cnt = 1 then '/projects/' || r.project_id || '?task=' || r.first_id else '/my-work' end, false, true);
  end loop;
  return null;
end $$;
create trigger tasks_after_insert_assign after insert on public.tasks
  referencing new table as new_rows for each statement execute function private.on_tasks_inserted();

create or replace function private.on_task_reassigned() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind public.user_kind;
begin
  if new.assignee_id is not distinct from old.assignee_id then return null; end if;
  select kind into v_kind from public.profiles where id = new.assignee_id;

  if v_kind = 'customer' then
    -- the customer's open action moves with the task (on_task_change creates one if there was none)
    update public.action_items set assignee_id = new.assignee_id
    where task_id = new.id and status = 'open' and assignee_id is distinct from new.assignee_id;
    if found then
      perform private.notify(new.assignee_id, 'action.assigned', 'Action for you: ' || new.title,
        coalesce('Due ' || to_char(new.due_date, 'Mon DD'), ''), '/', true, true);
    end if;
  else
    update public.action_items set status = 'cancelled' where task_id = new.id and status = 'open';
  end if;

  if v_kind = 'internal' then
    perform private.notify(new.assignee_id, 'task.assigned', 'Task for you: ' || new.title,
      coalesce((select name from public.projects where id = new.project_id), '') || coalesce(' · due ' || to_char(new.due_date, 'Mon DD'), ''),
      '/projects/' || new.project_id || '?task=' || new.id, false, true);
  end if;
  perform private.log(new.customer_id, new.project_id,
    private.actor_name() || ' assigned ' || new.title || ' to ' || coalesce((select full_name from public.profiles where id = new.assignee_id), 'nobody'),
    'task', new.id, new.visibility);
  return null;
end $$;
create trigger tasks_after_reassign after update of assignee_id on public.tasks
  for each row execute function private.on_task_reassigned();
