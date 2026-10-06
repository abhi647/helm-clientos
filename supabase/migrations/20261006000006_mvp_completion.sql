-- 7B Client OS: completes the MVP.
-- Meetings with action lines that become tasks, the fixed forms, the six playbook automations (each can be
-- switched off per organisation), @mentions, document versions, Zoho payments and an account owner per customer.
-- Same rules as before: RLS on every table, customers only ever see shared rows of their own company.

alter table public.customers add column account_owner_id uuid references public.profiles (id) on delete set null;
alter table public.meetings add column attendees text not null default '';
alter table public.action_items add column form_key text;
alter table public.comments add column mentions uuid[] not null default '{}';

-- ---------------------------------------------------------------- meeting action lines
create table public.meeting_actions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  text text not null check (length(text) between 2 and 300),
  owner_side public.owner_side not null default 'seven_billion',
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  task_id uuid references public.tasks (id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.meeting_actions (meeting_id);

-- ---------------------------------------------------------------- fixed forms
-- Kickoff, data access, UAT feedback and closure are stored as submissions. New request, change request and
-- access request are requests (with their own lifecycle), so they live in public.requests.
create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  form_key text not null check (form_key in ('kickoff', 'data_access', 'uat_feedback', 'closure')),
  action_item_id uuid references public.action_items (id) on delete set null,
  answers jsonb not null default '{}'::jsonb,
  submitted_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.form_submissions (project_id, form_key);

-- ---------------------------------------------------------------- automation switches
create table public.automation_rules (
  org_id uuid not null references public.orgs (id) on delete cascade,
  key text not null check (key in ('kickoff_data_access', 'uat_start_action', 'uat_done_approval', 'at_risk_alert', 'critical_request_alert', 'closure_form')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);

-- ---------------------------------------------------------------- document versions
-- documents keeps the current file; earlier files move here when a new version is uploaded.
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  version int not null,
  name text not null,
  storage_path text not null unique,
  note text not null default '',
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null,
  unique (document_id, version)
);
alter table public.documents add column note text not null default '';

-- ---------------------------------------------------------------- payments from Zoho Books
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  zoho_payment_id text unique,
  invoice_id uuid references public.invoices (id) on delete set null,
  number text,
  currency text not null default 'INR',
  amount numeric(14, 2),      -- always from Zoho; never typed or computed in this app
  paid_on date not null,
  mode text,
  reference text,
  synced_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['meeting_actions', 'form_submissions', 'automation_rules', 'document_versions', 'payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;
revoke all on public.meeting_actions, public.form_submissions, public.automation_rules, public.document_versions, public.payments from anon;
revoke update, delete on public.form_submissions from authenticated;      -- submissions are a record, never edited
revoke insert, update, delete on public.document_versions, public.payments from authenticated;

create policy meeting_actions_read on public.meeting_actions for select to authenticated using (
  exists (select 1 from public.meetings m where m.id = meeting_id and private.can_read(m.customer_id, m.visibility))
);
create policy meeting_actions_write on public.meeting_actions for all to authenticated
  using (private.is_staff_of(customer_id)) with check (private.is_staff_of(customer_id));

create policy forms_read on public.form_submissions for select to authenticated using (private.can_read(customer_id, 'shared'));
create policy forms_insert on public.form_submissions for insert to authenticated with check (
  submitted_by = (select auth.uid()) and (private.is_staff_of(customer_id) or customer_id = private.my_customer())
);

create policy rules_read on public.automation_rules for select to authenticated
  using (private.is_staff() and org_id = (select org_id from private.my_profile()));
create policy rules_write on public.automation_rules for all to authenticated
  using (org_id = (select org_id from private.my_profile()) and private.staff_role() in ('admin', 'ceo'))
  with check (org_id = (select org_id from private.my_profile()) and private.staff_role() in ('admin', 'ceo'));

-- a version is readable exactly when its document is readable (documents RLS applies inside the subquery)
create policy versions_read on public.document_versions for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id));

create policy payments_read on public.payments for select to authenticated using (
  (private.is_staff_of(customer_id) and private.staff_role() in ('admin', 'ceo', 'finance', 'pm'))
  or (customer_id = private.my_customer() and coalesce((select can_view_invoices from private.my_profile()), false))
);

drop policy documents_objects_read on storage.objects;
create policy documents_objects_read on storage.objects for select to authenticated using (
  bucket_id = 'documents' and (
    exists (select 1 from public.documents d where d.storage_path = storage.objects.name)
    or exists (select 1 from public.document_versions v where v.storage_path = storage.objects.name)
  )
);

-- ---------------------------------------------------------------- helpers
create or replace function private.rule_on(p_customer uuid, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select r.enabled from public.automation_rules r join public.customers c on c.org_id = r.org_id
                   where c.id = p_customer and r.key = p_key), true)
$$;

-- automation entries in the activity log have no actor and are internal
create or replace function private.log_automation(p_customer uuid, p_project uuid, p_summary text, p_type text, p_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.activity (customer_id, project_id, actor_id, summary, entity_type, entity_id, visibility)
  values (p_customer, p_project, null, 'Automation · ' || p_summary, p_type, p_id, 'internal')
$$;

create or replace function private.form_label(p_key text) returns text language sql immutable as $$
  select case p_key when 'kickoff' then 'Kickoff' when 'data_access' then 'Data access' when 'uat_feedback' then 'UAT feedback'
                    when 'closure' then 'Project closure' else initcap(replace(p_key, '_', ' ')) end
$$;

-- ---------------------------------------------------------------- meetings → tasks
create or replace function public.create_task_from_meeting_action(p_action uuid, p_phase uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.meeting_actions; m public.meetings; v_phase uuid := p_phase; v_task uuid;
begin
  select * into a from public.meeting_actions where id = p_action for update;
  if not found or not private.is_staff_of(a.customer_id) then raise exception 'not allowed'; end if;
  if a.task_id is not null then return a.task_id; end if;
  select * into m from public.meetings where id = a.meeting_id;
  if m.project_id is null then raise exception 'link the meeting to a project first'; end if;
  if v_phase is null then   -- the first phase that still has open work, else the last phase
    select ph.id into v_phase from public.phases ph
    where ph.project_id = m.project_id
    order by (exists (select 1 from public.tasks t where t.phase_id = ph.id and t.status <> 'done')) desc,
             case when exists (select 1 from public.tasks t where t.phase_id = ph.id and t.status <> 'done') then ph.position else -ph.position end
    limit 1;
  end if;
  insert into public.tasks (project_id, phase_id, customer_id, title, description, owner_side, assignee_id, due_date, visibility, created_by, position)
  values (m.project_id, v_phase, a.customer_id, a.text, 'From meeting: ' || m.title || ' (' || to_char(m.held_on, 'Mon DD') || ')',
          a.owner_side, a.assignee_id, a.due_date, m.visibility, (select auth.uid()), 999)
  returning id into v_task;
  update public.meeting_actions set task_id = v_task where id = a.id;
  perform private.log(a.customer_id, m.project_id, private.actor_name() || ' created a task from ' || m.title || ': ' || a.text, 'task', v_task, m.visibility);
  return v_task;
end $$;

-- ---------------------------------------------------------------- the six playbook rules
-- Rule 3: UAT done → sign-off approval for the customer lead (once per project while pending or approved)
create or replace function private.request_uat_signoff(p_project uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.projects;
begin
  select * into p from public.projects where id = p_project;
  if not found or p.customer_lead_id is null or not private.rule_on(p.customer_id, 'uat_done_approval') then return; end if;
  if exists (select 1 from public.approvals where project_id = p.id and kind = 'uat_signoff' and status in ('pending', 'approved')) then return; end if;
  insert into public.approvals (customer_id, project_id, kind, title, summary, due_date, approver_id, requested_by)
  values (p.customer_id, p.id, 'uat_signoff', 'UAT sign-off: ' || p.name,
          'UAT is complete. Please confirm the solution is accepted so we can move to deployment.',
          current_date + 5, p.customer_lead_id, p.pm_id);
  perform private.log_automation(p.customer_id, p.id, p_reason || ': asked for UAT sign-off', 'project', p.id);
end $$;

-- Rules 2 and 3 on task changes in a UAT phase
create or replace function private.on_task_automation() returns trigger language plpgsql security definer set search_path = '' as $$
declare ph public.phases; p public.projects;
begin
  if new.phase_id is null then return null; end if;
  select * into ph from public.phases where id = new.phase_id;
  if ph.name !~* '\muat\M' then return null; end if;
  select * into p from public.projects where id = new.project_id;

  -- Rule 2: the first UAT task starts → ask the customer lead to test and give feedback
  if new.status <> 'todo' and (tg_op = 'INSERT' or old.status = 'todo') and p.customer_lead_id is not null
     and private.rule_on(p.customer_id, 'uat_start_action')
     and not exists (select 1 from public.action_items where project_id = p.id and type = 'uat') then
    insert into public.action_items (customer_id, project_id, type, title, assignee_id, due_date, priority, form_key)
    values (p.customer_id, p.id, 'uat', 'UAT has started: test ' || p.name || ' and share feedback', p.customer_lead_id,
            coalesce(ph.end_date, current_date + 7), 'high', 'uat_feedback');
    perform private.log_automation(p.customer_id, p.id, 'UAT started on ' || p.name || ': sent the customer the UAT feedback form', 'project', p.id);
  end if;

  -- Rule 3: every Seven Billion task in the UAT phase is done
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done')
     and not exists (select 1 from public.tasks t where t.phase_id = ph.id and t.owner_side = 'seven_billion' and t.status <> 'done') then
    perform private.request_uat_signoff(p.id, 'UAT tasks complete on ' || p.name);
  end if;
  return null;
end $$;
create trigger tasks_automation after insert or update of status on public.tasks
  for each row execute function private.on_task_automation();

-- Rules 4 and 6 on project changes
create or replace function private.on_project_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  -- Rule 4: project turns At Risk → PM and CEO are told straight away
  if new.health = 'at_risk' and old.health <> 'at_risk' and private.rule_on(new.customer_id, 'at_risk_alert') then
    for r in select distinct p.id from public.profiles p join public.customers c on c.org_id = p.org_id
             where c.id = new.customer_id and (p.id = new.pm_id or p.internal_role = 'ceo') loop
      perform private.notify(r.id, 'project.at_risk', new.name || ' is now At Risk', 'Health changed by ' || private.actor_name(), '/projects/' || new.id, true, true);
    end loop;
    perform private.log_automation(new.customer_id, new.id, new.name || ' turned At Risk: PM and CEO notified', 'project', new.id);
  end if;
  if new.health is distinct from old.health then
    perform private.log(new.customer_id, new.id, private.actor_name() || ' set project health to ' || replace(new.health::text, '_', ' '), 'project', new.id, 'internal');
  end if;

  -- Rule 6: project closed → closure form for the customer lead
  if new.status = 'completed' and old.status <> 'completed' then
    perform private.log(new.customer_id, new.id, private.actor_name() || ' closed ' || new.name, 'project', new.id, 'shared');
    if new.customer_lead_id is not null and private.rule_on(new.customer_id, 'closure_form')
       and not exists (select 1 from public.action_items where project_id = new.id and form_key = 'closure') then
      insert into public.action_items (customer_id, project_id, type, title, assignee_id, due_date, priority, form_key)
      values (new.customer_id, new.id, 'form', 'Project closure: confirm handover for ' || new.name, new.customer_lead_id, current_date + 7, 'normal', 'closure');
      perform private.log_automation(new.customer_id, new.id, new.name || ' closed: sent the closure form', 'project', new.id);
    end if;
  end if;
  return null;
end $$;
create trigger projects_after_update after update of health, status on public.projects
  for each row execute function private.on_project_change();

-- Rule 5: a critical request → PM and the customer's account owner
create or replace function private.on_request_critical() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pm uuid; v_owner uuid; r uuid;
begin
  if new.priority <> 'critical' or (tg_op = 'UPDATE' and old.priority = 'critical') then return null; end if;
  if not private.rule_on(new.customer_id, 'critical_request_alert') then return null; end if;
  select pm_id into v_pm from public.projects where id = new.project_id;
  select account_owner_id into v_owner from public.customers where id = new.customer_id;
  foreach r in array array_remove(array[coalesce(new.owner_id, v_pm), v_owner], null) loop
    -- on insert the PM already gets the 'new request' notice, so only the account owner is added then
    if tg_op = 'INSERT' and r = coalesce(new.owner_id, v_pm) then continue; end if;
    perform private.notify(r, 'request.critical', 'Critical: ' || new.number || ' ' || new.title, 'Raised as critical. Please look today.', '/requests/' || new.id, true, true);
  end loop;
  perform private.log_automation(new.customer_id, new.project_id, new.number || ' is critical: PM and account owner notified', 'request', new.id);
  return null;
end $$;
create trigger requests_critical after insert or update of priority on public.requests
  for each row execute function private.on_request_critical();

-- ---------------------------------------------------------------- form submissions (rule 1 lives here)
create or replace function private.on_form_submitted() returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.projects; v_to uuid; r record;
begin
  select * into p from public.projects where id = new.project_id;
  -- the action item that asked for this form is done
  update public.action_items set status = 'completed', completed_at = now()
  where status = 'open' and customer_id = new.customer_id and form_key = new.form_key
    and (id = new.action_item_id or (new.action_item_id is null and project_id is not distinct from new.project_id));
  perform private.log(new.customer_id, new.project_id, private.actor_name() || ' submitted the ' || private.form_label(new.form_key) || ' form', 'form', new.id, 'shared');

  if p.id is not null then
    perform private.notify(p.pm_id, 'form.submitted', private.form_label(new.form_key) || ' form submitted · ' || p.name,
      'From ' || private.actor_name(), '/projects/' || p.id || '/forms', false, true);
  else
    for r in select pr.id from public.profiles pr join public.customers c on c.org_id = pr.org_id
             where c.id = new.customer_id and pr.internal_role in ('pm', 'admin') loop
      perform private.notify(r.id, 'form.submitted', private.form_label(new.form_key) || ' form submitted', 'From ' || private.actor_name(), '/customers/' || new.customer_id, false, true);
    end loop;
  end if;

  -- Rule 1: kickoff done → ask for data access
  if new.form_key = 'kickoff' and private.rule_on(new.customer_id, 'kickoff_data_access')
     and not exists (select 1 from public.action_items where customer_id = new.customer_id and project_id is not distinct from new.project_id and form_key = 'data_access') then
    v_to := coalesce(p.customer_lead_id, new.submitted_by);
    insert into public.action_items (customer_id, project_id, type, title, assignee_id, due_date, priority, form_key)
    values (new.customer_id, new.project_id, 'form', 'Share data access' || coalesce(' for ' || p.name, ''), v_to, current_date + 5, 'high', 'data_access');
    perform private.log_automation(new.customer_id, new.project_id, 'Kickoff complete: sent the data access form', 'form', new.id);
  end if;

  if new.form_key = 'uat_feedback' then
    if new.answers ->> 'outcome' = 'accepted' then
      perform private.request_uat_signoff(new.project_id, 'Customer accepted UAT');
    elsif new.answers ->> 'outcome' = 'issues' and coalesce(trim(new.answers ->> 'issues'), '') <> '' then
      insert into public.requests (customer_id, project_id, title, what, why, type, priority, requested_by)
      values (new.customer_id, new.project_id, left('UAT issues' || coalesce(': ' || p.name, ''), 200), new.answers ->> 'issues',
              'Raised from UAT feedback', 'bug', case when new.answers ->> 'severity' = 'blocking' then 'critical' else 'high' end::public.priority,
              new.submitted_by);
    end if;
  end if;
  return null;
end $$;
create trigger forms_after_insert after insert on public.form_submissions for each row execute function private.on_form_submitted();

-- ---------------------------------------------------------------- @mentions
-- Mentions are kept only for people who can read the comment: staff of this customer's org always,
-- customer users of the same company only when the comment is shared.
create or replace function private.before_comment() returns trigger language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select * into s from private.entity_scope(new.entity_type, new.entity_id);
  if s.customer_id is null or s.customer_id <> new.customer_id then raise exception 'comment target not found'; end if;
  if s.vis = 'internal' then
    if not private.is_staff_of(new.customer_id) then raise exception 'comment target not found'; end if;
    new.visibility := 'internal';   -- a comment can never be more visible than what it is attached to
  end if;
  new.mentions := coalesce(array(
    select p.id from public.profiles p
    where p.id = any(new.mentions) and p.id <> new.author_id and (
      (p.kind = 'internal' and p.org_id = (select c.org_id from public.customers c where c.id = new.customer_id))
      or (p.kind = 'customer' and p.customer_id = new.customer_id and new.visibility = 'shared'))
  ), '{}');
  return new;
end $$;

create or replace function private.after_comment() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_staff boolean := private.is_staff_of(new.customer_id); v_to uuid; v_project uuid; v_link text; m uuid;
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
  elsif new.entity_type = 'meeting' then
    select case when v_staff then customer_lead_id else pm_id end into v_to from public.projects where id = v_project;
    v_link := '/meetings/' || new.entity_id;
  else
    select case when v_staff then customer_lead_id else pm_id end into v_to from public.projects where id = v_project;
    v_link := '/projects/' || v_project;
  end if;
  foreach m in array new.mentions loop
    perform private.notify(m, 'comment.mention', private.actor_name() || ' mentioned you', left(new.body, 280), v_link, true, true);
  end loop;
  if new.visibility = 'shared' and not coalesce(v_to = any(new.mentions), false) then
    perform private.notify(v_to, 'comment.' || new.entity_type, private.actor_name() || ' commented', left(new.body, 280), v_link, false, true);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- document versions
create or replace function public.add_document_version(p_document uuid, p_path text, p_name text, p_note text default '')
returns int language plpgsql security definer set search_path = '' as $$
declare d public.documents;
begin
  select * into d from public.documents where id = p_document for update;
  if not found or not (private.is_staff_of(d.customer_id) or (d.visibility = 'shared' and d.customer_id = private.my_customer())) then
    raise exception 'not allowed';
  end if;
  if p_path not like d.customer_id || '/' || d.id || '/%' then raise exception 'not allowed'; end if;
  if d.storage_path is not null then
    insert into public.document_versions (document_id, customer_id, version, name, storage_path, note, uploaded_by, created_at)
    values (d.id, d.customer_id, d.version, d.name, d.storage_path, d.note, d.uploaded_by, d.created_at);
  end if;
  update public.documents set storage_path = p_path, name = left(p_name, 160), version = d.version + 1, note = coalesce(p_note, ''),
    uploaded_by = (select auth.uid()), created_at = now()
  where id = d.id;
  perform private.log(d.customer_id, d.project_id, private.actor_name() || ' uploaded v' || (d.version + 1) || ' of ' || d.name, 'document', d.id, d.visibility);
  return d.version + 1;
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.create_task_from_meeting_action, public.add_document_version from public, anon;
grant execute on function public.create_task_from_meeting_action, public.add_document_version to authenticated;
grant execute on all functions in schema private to authenticated;
