-- Deleting things. Every delete goes through a function that checks who may delete it and what must be kept:
--   project            admins and the CEO, after typing its name; never once it has billing history
--   phase, task        the PM, an admin or the CEO; not while approved or billed days are logged on it
--   request, meeting,
--   decision, update   the PM, an admin or the CEO (a draft update also by its author)
--   document           the PM, an admin or the CEO, or whoever uploaded it; only once it is archived
--   comment            its author within 15 minutes (as before), or the PM, an admin or the CEO
-- Direct deletes of these rows through the API are refused, so the checks cannot be skipped.
-- Each delete is written to the customer's activity (internal).

create or replace function private.billed_days_on(p_tasks uuid[]) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(days), 0) from public.time_entries where task_id = any (p_tasks) and approved_at is not null
$$;

-- ---------------------------------------------------------------- project
create or replace function public.delete_project(p_project uuid, p_confirm text) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare v public.projects; v_docs uuid[];
begin
  select * into v from public.projects where id = p_project for update;
  if v.id is null or not (private.is_staff_of(v.customer_id) and private.staff_role() in ('admin', 'ceo')) then
    raise exception 'not allowed';
  end if;
  if coalesce(trim(p_confirm), '') <> v.name then raise exception 'type the project name exactly to confirm'; end if;
  if exists (select 1 from public.billing_statements where project_id = p_project and status in ('pending', 'approved', 'invoiced'))
     or exists (select 1 from public.invoices where project_id = p_project)
     or exists (select 1 from public.time_entries te join public.tasks t on t.id = te.task_id where t.project_id = p_project and te.statement_id is not null) then
    raise exception 'this project has billing history, so it is kept: mark it Completed instead';
  end if;
  select coalesce(array_agg(id), '{}') into v_docs from public.documents where project_id = p_project;
  -- what belongs to the project only (the rest goes with it through the database's cascade)
  delete from public.documents where project_id = p_project;
  delete from public.meetings where project_id = p_project;
  delete from public.decisions where project_id = p_project;
  delete from public.approvals where project_id = p_project;
  delete from public.action_items where project_id = p_project;
  delete from public.requests where project_id = p_project;
  delete from public.activity where project_id = p_project;
  delete from public.projects where id = p_project;
  perform private.log(v.customer_id, null, 'deleted the project ' || v.name, 'project', p_project, 'internal');
  return v_docs;   -- the app removes their files from storage
end $$;

-- ---------------------------------------------------------------- plan
create or replace function public.delete_task(p_task uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.tasks; v_days numeric;
begin
  select * into v from public.tasks where id = p_task;
  if v.id is null or not private.can_manage(v.customer_id) then raise exception 'not allowed'; end if;
  v_days := private.billed_days_on(array[p_task]);
  if v_days > 0 then
    raise exception 'approved or billed days are logged on this task (% days), so it is kept: mark it Done instead', trim_scale(v_days);
  end if;
  delete from public.tasks where id = p_task;   -- its unapproved time, estimate and comments go with it
  delete from public.comments where entity_type = 'task' and entity_id = p_task;
  perform private.log(v.customer_id, v.project_id, 'deleted the task ' || v.title, 'task', p_task, 'internal');
end $$;

create or replace function public.delete_phase(p_phase uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v public.phases; v_tasks uuid[]; v_days numeric;
begin
  select * into v from public.phases where id = p_phase;
  if v.id is null or not private.can_manage(v.customer_id) then raise exception 'not allowed'; end if;
  select coalesce(array_agg(id), '{}') into v_tasks from public.tasks where phase_id = p_phase;
  v_days := private.billed_days_on(v_tasks);
  if v_days > 0 then
    raise exception 'approved or billed days are logged in this phase (% days), so it is kept', trim_scale(v_days);
  end if;
  delete from public.comments where entity_type = 'task' and entity_id = any (v_tasks);
  delete from public.tasks where id = any (v_tasks);
  delete from public.phases where id = p_phase;
  perform private.log(v.customer_id, v.project_id, 'deleted the phase ' || v.name || ' and its ' || coalesce(array_length(v_tasks, 1), 0) || ' tasks', 'phase', p_phase, 'internal');
  return coalesce(array_length(v_tasks, 1), 0);
end $$;

-- ---------------------------------------------------------------- requests, meetings, decisions, updates
create or replace function public.delete_request(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.requests;
begin
  select * into v from public.requests where id = p_request;
  if v.id is null or not private.can_manage(v.customer_id) then raise exception 'not allowed'; end if;
  delete from public.comments where entity_type = 'request' and entity_id = p_request;
  delete from public.requests where id = p_request;   -- its timeline, approvals and to-dos go with it; tasks stay on the plan
  perform private.log(v.customer_id, v.project_id, 'deleted the request ' || v.number || ' ' || v.title, 'request', p_request, 'internal');
end $$;

create or replace function public.delete_meeting(p_meeting uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.meetings;
begin
  select * into v from public.meetings where id = p_meeting;
  if v.id is null or not private.can_manage(v.customer_id) then raise exception 'not allowed'; end if;
  delete from public.comments where entity_type = 'meeting' and entity_id = p_meeting;
  delete from public.meetings where id = p_meeting;   -- its action lines go; tasks made from them and its decisions stay
  perform private.log(v.customer_id, v.project_id, 'deleted the meeting ' || v.title, 'meeting', p_meeting, 'internal');
end $$;

create or replace function public.delete_decision(p_decision uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.decisions;
begin
  select * into v from public.decisions where id = p_decision;
  if v.id is null or not private.can_manage(v.customer_id) then raise exception 'not allowed'; end if;
  delete from public.decisions where id = p_decision;
  perform private.log(v.customer_id, v.project_id, 'deleted the decision ' || v.number, 'decision', p_decision, 'internal');
end $$;

create or replace function public.delete_update(p_update uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.updates;
begin
  select * into v from public.updates where id = p_update;
  if v.id is null or not (private.can_manage(v.customer_id)
     or (v.status = 'draft' and v.author_id = (select auth.uid()) and private.is_staff_of(v.customer_id))) then
    raise exception 'not allowed';
  end if;
  delete from public.updates where id = p_update;
  perform private.log(v.customer_id, v.project_id, 'deleted the ' || v.status::text || ' update for the week of ' || to_char(v.week_of, 'DD Mon'), 'update', p_update, 'internal');
end $$;

-- ---------------------------------------------------------------- documents
create or replace function public.delete_document(p_document uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.documents;
begin
  select * into v from public.documents where id = p_document;
  if v.id is null or not (private.can_manage(v.customer_id)
     or (v.uploaded_by = (select auth.uid()) and private.can_read(v.customer_id, v.visibility))) then
    raise exception 'not allowed';
  end if;
  if v.archived_at is null then raise exception 'archive the file first, then delete it'; end if;
  delete from public.comments where entity_type = 'document' and entity_id = p_document;
  delete from public.documents where id = p_document;   -- its versions go with it; the app removes the files
  perform private.log(v.customer_id, v.project_id, 'deleted the file ' || v.name, 'document', p_document, 'internal');
end $$;

-- ---------------------------------------------------------------- comments: managers may remove any
create or replace function public.delete_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.comments;
begin
  select * into v from public.comments where id = p_comment;
  if v.id is null or not (private.can_manage(v.customer_id)
     or (v.author_id = (select auth.uid()) and v.created_at > now() - interval '15 minutes')) then
    raise exception 'not allowed';
  end if;
  delete from public.comments where id = p_comment;
end $$;

-- ---------------------------------------------------------------- no direct deletes past the checks above
do $$
declare t text;
begin
  foreach t in array array['projects', 'phases', 'tasks', 'requests', 'meetings', 'decisions', 'updates', 'documents'] loop
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (false)', t || '_delete_via_function', t);
  end loop;
end $$;

revoke execute on function public.delete_project, public.delete_task, public.delete_phase, public.delete_request, public.delete_meeting,
  public.delete_decision, public.delete_update, public.delete_document, public.delete_comment from public, anon;
grant execute on function public.delete_project, public.delete_task, public.delete_phase, public.delete_request, public.delete_meeting,
  public.delete_decision, public.delete_update, public.delete_document, public.delete_comment to authenticated;
