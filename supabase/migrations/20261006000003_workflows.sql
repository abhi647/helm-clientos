-- 7B Client OS: workflow triggers and safe RPCs.
-- History (request events, approval events, activity), action items and notifications are written here, inside
-- the same transaction as the change, so the audit trail can never be skipped by a client.

-- ---------------------------------------------------------------- profiles from invited auth users
-- app_metadata is set by the server (service role) only, so users cannot grant themselves access.
create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
  if m ? 'kind' then
    insert into public.profiles (id, email, full_name, kind, org_id, internal_role, customer_id, customer_role, can_view_invoices)
    values (
      new.id, new.email, coalesce(m ->> 'full_name', split_part(new.email, '@', 1)), (m ->> 'kind')::public.user_kind,
      nullif(m ->> 'org_id', '')::uuid, nullif(m ->> 'internal_role', '')::public.internal_role,
      nullif(m ->> 'customer_id', '')::uuid, nullif(m ->> 'customer_role', '')::public.customer_role,
      coalesce((m ->> 'can_view_invoices')::boolean, false)
    )
    on conflict (id) do update set
      email = excluded.email, full_name = excluded.full_name, kind = excluded.kind, org_id = excluded.org_id,
      internal_role = excluded.internal_role, customer_id = excluded.customer_id, customer_role = excluded.customer_role,
      can_view_invoices = excluded.can_view_invoices;
  end if;
  return new;
end $$;
-- Auth may write app_metadata in a second statement, so react to inserts and to metadata changes.
-- Changing a user's app_metadata (server side only) is also how an admin changes their access.
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
create trigger on_auth_user_access_changed after update of raw_app_meta_data, email on auth.users
  for each row when (old.raw_app_meta_data is distinct from new.raw_app_meta_data or old.email is distinct from new.email)
  execute function private.handle_new_user();

-- ---------------------------------------------------------------- notifications
-- link is app-relative ('/requests/<id>'); customers get the same path under /portal
create or replace function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text,
  p_needs_action boolean default false, p_email boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_profile public.profiles;
begin
  if p_user is null or p_user = (select auth.uid()) then return; end if;   -- never notify yourself
  select * into v_profile from public.profiles where id = p_user;
  if not found then return; end if;
  insert into public.notifications (user_id, kind, title, body, link, needs_action)
  values (p_user, p_kind, p_title, coalesce(p_body, ''),
          case when v_profile.kind = 'customer' and p_link is not null then '/portal' || p_link else p_link end, p_needs_action)
  returning id into v_id;
  if p_email then
    insert into public.email_outbox (notification_id, to_email) values (v_id, v_profile.email);
  end if;
end $$;

create or replace function private.actor_name() returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(full_name, '') from public.profiles where id = (select auth.uid())), 'Seven Billion')
$$;

create or replace function private.log(p_customer uuid, p_project uuid, p_summary text, p_type text, p_id uuid, p_vis public.visibility)
returns void language sql security definer set search_path = '' as $$
  insert into public.activity (customer_id, project_id, actor_id, summary, entity_type, entity_id, visibility)
  values (p_customer, p_project, (select auth.uid()), p_summary, p_type, p_id, p_vis)
$$;

-- ---------------------------------------------------------------- requests
create or replace function private.request_label(s public.request_status) returns text language sql immutable as $$
  select initcap(replace(s::text, '_', ' '))
$$;

create or replace function private.on_request_insert() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pm uuid; r record;
begin
  insert into public.request_events (request_id, customer_id, status, actor_id, note)
  values (new.id, new.customer_id, new.status, coalesce((select auth.uid()), new.requested_by), 'Request received');
  perform private.log(new.customer_id, new.project_id, private.actor_name() || ' submitted ' || new.number || ': ' || new.title, 'request', new.id, 'shared');
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
create trigger requests_after_insert after insert on public.requests for each row execute function private.on_request_insert();

create or replace function private.on_request_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.request_events (request_id, customer_id, status, actor_id, note)
    values (new.id, new.customer_id, new.status, (select auth.uid()), nullif(current_setting('app.status_note', true), ''));
    perform private.log(new.customer_id, new.project_id, new.number || ' moved to ' || private.request_label(new.status), 'request', new.id, 'shared');
    -- 'estimated' is announced by the approval request itself, so the customer gets one email, not two
    if new.status <> 'estimated' then
      perform private.notify(new.requested_by, 'request.status', new.number || ' is now ' || private.request_label(new.status),
        new.title, '/requests/' || new.id, new.status = 'clarification', true);
    end if;
  end if;
  return null;
end $$;
create trigger requests_after_update after update on public.requests for each row execute function private.on_request_update();

-- staff move a request through its stages, with an optional note shown on the timeline
create or replace function public.set_request_status(p_request uuid, p_status public.request_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_customer uuid;
begin
  select customer_id into v_customer from public.requests where id = p_request;
  if v_customer is null or not private.is_staff_of(v_customer) then raise exception 'not allowed'; end if;
  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.requests set status = p_status where id = p_request;
end $$;

-- ---------------------------------------------------------------- approvals
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
    coalesce('Effort ' || new.effort_hours || ' h. ', '') || coalesce('Target ' || to_char(new.target_date, 'Mon DD') || '.', ''),
    '/approvals/' || new.id, true, true);
  return null;
end $$;
create trigger approvals_after_insert after insert on public.approvals for each row execute function private.on_approval_insert();

create or replace function public.decide_approval(p_approval uuid, p_decision public.approval_action, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.approvals;
begin
  select * into a from public.approvals where id = p_approval for update;
  if not found or a.approver_id <> (select auth.uid()) then raise exception 'only the named approver can decide'; end if;
  if a.status <> 'pending' then raise exception 'this approval is no longer pending'; end if;
  if p_decision not in ('approved', 'changes_requested') then raise exception 'decision must be approved or changes_requested'; end if;
  if p_decision = 'changes_requested' and coalesce(trim(p_comment), '') = '' then raise exception 'please say what should change'; end if;

  update public.approvals set status = p_decision::text::public.approval_status where id = a.id;
  insert into public.approval_events (approval_id, customer_id, action, version, comment, actor_id)
  values (a.id, a.customer_id, p_decision, a.version, nullif(trim(p_comment), ''), (select auth.uid()));
  update public.action_items set status = 'completed', completed_at = now() where approval_id = a.id and status = 'open';
  if p_decision = 'approved' and a.request_id is not null then
    perform set_config('app.status_note', 'Estimate v' || a.version || ' approved', true);
    update public.requests set status = 'approved' where id = a.request_id;
  end if;
  perform private.log(a.customer_id, a.project_id, private.actor_name() || case when p_decision = 'approved' then ' approved ' else ' requested changes to ' end || a.title, 'approval', a.id, 'shared');
  perform private.notify(a.requested_by, 'approval.' || p_decision,
    private.actor_name() || case when p_decision = 'approved' then ' approved ' else ' requested changes: ' end || a.title,
    coalesce(p_comment, ''), '/approvals/' || a.id, p_decision = 'changes_requested', true);
end $$;

create or replace function public.resubmit_approval(p_approval uuid, p_summary text, p_effort numeric, p_target date default null, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.approvals;
begin
  select * into a from public.approvals where id = p_approval for update;
  if not found or not private.is_staff_of(a.customer_id) then raise exception 'not allowed'; end if;
  if a.status <> 'changes_requested' then raise exception 'only an approval with requested changes can be resubmitted'; end if;
  update public.approvals set status = 'pending', version = a.version + 1, summary = coalesce(p_summary, a.summary),
    effort_hours = coalesce(p_effort, a.effort_hours), target_date = coalesce(p_target, a.target_date)
  where id = a.id;
  insert into public.approval_events (approval_id, customer_id, action, version, comment, actor_id)
  values (a.id, a.customer_id, 'resubmitted', a.version + 1, nullif(trim(p_comment), ''), (select auth.uid()));
  insert into public.action_items (customer_id, project_id, type, title, assignee_id, due_date, priority, approval_id, request_id)
  values (a.customer_id, a.project_id, 'approval', a.title || ' (v' || (a.version + 1) || ')', a.approver_id, a.due_date, 'high', a.id, a.request_id);
  perform private.notify(a.approver_id, 'approval.resubmitted', 'Revised for your approval: ' || a.title, coalesce(p_comment, ''), '/approvals/' || a.id, true, true);
end $$;

-- ---------------------------------------------------------------- action items and customer-owned tasks
create or replace function private.on_action_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.approval_id is null and new.assignee_id is not null then
    perform private.notify(new.assignee_id, 'action.assigned', 'Action for you: ' || new.title,
      coalesce('Due ' || to_char(new.due_date, 'Mon DD'), ''), '/', true, true);
  end if;
  return null;
end $$;
create trigger actions_after_insert after insert on public.action_items for each row execute function private.on_action_insert();

create or replace function public.complete_action_item(p_action uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare x public.action_items;
begin
  select * into x from public.action_items where id = p_action for update;
  if not found or not (x.assignee_id = (select auth.uid()) or private.is_staff_of(x.customer_id)) then raise exception 'not allowed'; end if;
  if x.type = 'approval' then raise exception 'approvals are completed by approving or requesting changes'; end if;
  if x.status <> 'open' then return; end if;
  update public.action_items set status = 'completed', completed_at = now() where id = x.id;
  if x.task_id is not null then
    update public.tasks set status = 'done', completed_at = now() where id = x.task_id;
  end if;
  perform private.log(x.customer_id, x.project_id, private.actor_name() || ' completed: ' || x.title, 'action', x.id, 'shared');
end $$;

-- a shared task owned by the customer becomes an action item on their home page
create or replace function private.on_task_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_side = 'customer' and new.visibility = 'shared' and new.assignee_id is not null and new.status <> 'done'
     and not exists (select 1 from public.action_items where task_id = new.id and status = 'open') then
    insert into public.action_items (customer_id, project_id, type, title, assignee_id, due_date, priority, task_id)
    values (new.customer_id, new.project_id, 'task', new.title, new.assignee_id, new.due_date,
            case when new.spotlight then 'high' else 'normal' end::public.priority, new.id);
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    update public.action_items set status = 'completed', completed_at = now() where task_id = new.id and status = 'open';
    if new.visibility = 'shared' then
      perform private.log(new.customer_id, new.project_id, private.actor_name() || ' completed ' || new.title, 'task', new.id, 'shared');
    end if;
  end if;
  return null;
end $$;
create trigger tasks_after_change after insert or update of status, assignee_id, owner_side, visibility on public.tasks
  for each row execute function private.on_task_change();

-- ---------------------------------------------------------------- comments
create or replace function private.entity_scope(p_type text, p_id uuid, out customer_id uuid, out vis public.visibility, out project_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  case p_type
    when 'task' then select t.customer_id, t.visibility, t.project_id into customer_id, vis, project_id from public.tasks t where t.id = p_id;
    when 'request' then select r.customer_id, 'shared'::public.visibility, r.project_id into customer_id, vis, project_id from public.requests r where r.id = p_id;
    when 'approval' then select a.customer_id, 'shared'::public.visibility, a.project_id into customer_id, vis, project_id from public.approvals a where a.id = p_id;
    when 'document' then select d.customer_id, d.visibility, d.project_id into customer_id, vis, project_id from public.documents d where d.id = p_id;
    when 'meeting' then select m.customer_id, m.visibility, m.project_id into customer_id, vis, project_id from public.meetings m where m.id = p_id;
    when 'update' then select u.customer_id, case when u.status = 'published' then 'shared' else 'internal' end::public.visibility, u.project_id
      into customer_id, vis, project_id from public.updates u where u.id = p_id;
  end case;
end $$;

create or replace function private.before_comment() returns trigger language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select * into s from private.entity_scope(new.entity_type, new.entity_id);
  if s.customer_id is null or s.customer_id <> new.customer_id then raise exception 'comment target not found'; end if;
  if s.vis = 'internal' then
    if not private.is_staff_of(new.customer_id) then raise exception 'comment target not found'; end if;
    new.visibility := 'internal';   -- a comment can never be more visible than what it is attached to
  end if;
  return new;
end $$;
create trigger comments_before_insert before insert on public.comments for each row execute function private.before_comment();

create or replace function private.after_comment() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_staff boolean := private.is_staff_of(new.customer_id); v_to uuid; v_project uuid; v_link text;
begin
  select project_id into v_project from private.entity_scope(new.entity_type, new.entity_id);
  if new.entity_type = 'request' then
    select case when v_staff then r.requested_by else coalesce(r.owner_id, p.pm_id) end into v_to
    from public.requests r left join public.projects p on p.id = r.project_id where r.id = new.entity_id;
    v_link := '/requests/' || new.entity_id;
  elsif new.entity_type = 'approval' then
    select case when v_staff then a.approver_id else a.requested_by end into v_to from public.approvals a where a.id = new.entity_id;
    v_link := '/approvals/' || new.entity_id;
  elsif new.entity_type = 'task' then
    select case when v_staff then case when t.owner_side = 'customer' then t.assignee_id else p.customer_lead_id end else p.pm_id end into v_to
    from public.tasks t join public.projects p on p.id = t.project_id where t.id = new.entity_id;
    v_link := '/projects/' || v_project || '?task=' || new.entity_id;
  else
    select case when v_staff then customer_lead_id else pm_id end into v_to from public.projects where id = v_project;
    v_link := '/projects/' || v_project;
  end if;
  if new.visibility = 'shared' then
    perform private.notify(v_to, 'comment.' || new.entity_type, private.actor_name() || ' commented', left(new.body, 280), v_link, false, true);
  end if;
  return null;
end $$;
create trigger comments_after_insert after insert on public.comments for each row execute function private.after_comment();

-- ---------------------------------------------------------------- weekly updates
create or replace function private.on_update_published() returns trigger language plpgsql security definer set search_path = '' as $$
declare r record; v_project text;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    select name into v_project from public.projects where id = new.project_id;
    perform private.log(new.customer_id, new.project_id, private.actor_name() || ' published the weekly update for ' || v_project, 'update', new.id, 'shared');
    for r in select id from public.profiles where customer_id = new.customer_id loop
      perform private.notify(r.id, 'update.published', 'Weekly update: ' || v_project, left(new.completed, 280), '/projects/' || new.project_id, false, true);
    end loop;
  end if;
  return null;
end $$;
create trigger updates_after_write after insert or update of status on public.updates for each row execute function private.on_update_published();

create or replace function public.publish_update(p_update uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_customer uuid;
begin
  select customer_id into v_customer from public.updates where id = p_update;
  if v_customer is null or not private.is_staff_of(v_customer) then raise exception 'not allowed'; end if;
  update public.updates set status = 'published', published_at = now() where id = p_update;
end $$;

-- RPCs are for signed-in users only
revoke execute on function public.set_request_status, public.decide_approval, public.resubmit_approval,
  public.complete_action_item, public.publish_update from public, anon;
grant execute on function public.set_request_status, public.decide_approval, public.resubmit_approval,
  public.complete_action_item, public.publish_update to authenticated;
-- private helpers must never be reachable by anonymous callers
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
