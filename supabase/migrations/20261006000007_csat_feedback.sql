-- 7B Client OS: customer satisfaction (CSAT) and feedback.
-- CSAT is asked at three moments: when a request is delivered, once a month as a relationship pulse, and at
-- project closure (the closure form's satisfaction question). Scores are 1-5; "satisfied" means 4 or 5.
-- Feedback is an inbox anyone at the customer can write to; a low CSAT score opens a feedback item so
-- the team always closes the loop.

-- ---------------------------------------------------------------- surveys (one row per ask, answered in place)
create type public.csat_kind as enum ('request', 'pulse', 'closure');

create table public.csat_surveys (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  request_id uuid references public.requests (id) on delete cascade,
  kind public.csat_kind not null,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  period date,                              -- first day of the month, for pulses
  score smallint check (score between 1 and 5),
  comment text not null default '' check (length(comment) <= 2000),
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '21 days',
  answered_at timestamptz,
  constraint answered_shape check ((score is null) = (answered_at is null))
);
create unique index csat_one_per_request on public.csat_surveys (request_id, recipient_id) where kind = 'request';
create unique index csat_one_pulse_a_month on public.csat_surveys (customer_id, recipient_id, period) where kind = 'pulse';
create index on public.csat_surveys (customer_id, answered_at);

-- ---------------------------------------------------------------- feedback inbox
create type public.feedback_kind as enum ('praise', 'suggestion', 'issue', 'other');
create type public.feedback_status as enum ('new', 'acknowledged', 'actioned', 'closed');
create sequence public.feedback_number_seq start 101;

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('FB-' || nextval('public.feedback_number_seq')),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  kind public.feedback_kind not null default 'other',
  body text not null check (length(body) between 2 and 5000),
  source text not null default 'portal' check (source in ('portal', 'csat')),
  csat_id uuid references public.csat_surveys (id) on delete set null,
  submitted_by uuid references public.profiles (id) on delete set null,
  status public.feedback_status not null default 'new',
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger feedback_touch before update on public.feedback for each row execute function public.touch_updated_at();

-- comments can now be attached to feedback
alter table public.comments drop constraint comments_entity_type_check;
alter table public.comments add constraint comments_entity_type_check
  check (entity_type in ('task', 'request', 'approval', 'document', 'meeting', 'update', 'feedback'));

-- three more playbook switches
alter table public.automation_rules drop constraint automation_rules_key_check;
alter table public.automation_rules add constraint automation_rules_key_check check (key in (
  'kickoff_data_access', 'uat_start_action', 'uat_done_approval', 'at_risk_alert', 'critical_request_alert', 'closure_form',
  'csat_request', 'csat_pulse', 'csat_low_followup'));

-- ---------------------------------------------------------------- RLS
alter table public.csat_surveys enable row level security;
alter table public.csat_surveys force row level security;
alter table public.feedback enable row level security;
alter table public.feedback force row level security;
revoke all on public.csat_surveys, public.feedback from anon;
-- surveys are created by the database and answered through answer_csat(), never written directly
revoke insert, update, delete on public.csat_surveys from authenticated;

-- a customer sees only the surveys sent to them; staff see all of their customers'
create policy csat_read on public.csat_surveys for select to authenticated
  using (private.is_staff_of(customer_id) or recipient_id = (select auth.uid()));

create policy feedback_read on public.feedback for select to authenticated using (private.can_read(customer_id, 'shared'));
create policy feedback_customer_insert on public.feedback for insert to authenticated with check (
  customer_id = private.my_customer() and submitted_by = (select auth.uid()) and source = 'portal' and status = 'new' and owner_id is null
);
create policy feedback_staff_insert on public.feedback for insert to authenticated with check (private.is_staff_of(customer_id));
create policy feedback_staff_update on public.feedback for update to authenticated
  using (private.is_staff_of(customer_id)) with check (private.is_staff_of(customer_id));

-- ---------------------------------------------------------------- helpers
create or replace function private.followup_owner(p_customer uuid, p_project uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce((select account_owner_id from public.customers where id = p_customer),
                  (select pm_id from public.projects where id = p_project))
$$;

-- ---------------------------------------------------------------- ask: request delivered
create or replace function private.on_request_delivered() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind public.user_kind; v_id uuid;
begin
  if new.status <> 'delivered' or old.status = 'delivered' or new.requested_by is null then return null; end if;
  if not private.rule_on(new.customer_id, 'csat_request') then return null; end if;
  select kind into v_kind from public.profiles where id = new.requested_by;
  if v_kind is distinct from 'customer' then return null; end if;
  insert into public.csat_surveys (customer_id, project_id, request_id, kind, recipient_id)
  values (new.customer_id, new.project_id, new.id, 'request', new.requested_by)
  on conflict do nothing returning id into v_id;
  if v_id is not null then
    perform private.notify(new.requested_by, 'csat.request', 'How did we do on ' || new.number || '?',
      'One click: rate the delivery of "' || new.title || '".', '/requests/' || new.id, true, true);
  end if;
  return null;
end $$;
create trigger requests_csat after update of status on public.requests for each row execute function private.on_request_delivered();

-- ---------------------------------------------------------------- ask: monthly relationship pulse
-- Sent to every customer user of a customer with an active project, once per calendar month. Idempotent, so the
-- daily cron can call it every day. Returns how many pulses were sent.
create or replace function public.send_csat_pulses() returns int language plpgsql security definer set search_path = '' as $$
declare r record; v_id uuid; n int := 0; v_period date := date_trunc('month', now())::date;
begin
  for r in
    select p.id as user_id, p.customer_id from public.profiles p
    where p.kind = 'customer'
      and exists (select 1 from public.projects pr where pr.customer_id = p.customer_id and pr.status = 'active')
      and private.rule_on(p.customer_id, 'csat_pulse')
  loop
    insert into public.csat_surveys (customer_id, kind, recipient_id, period, expires_at)
    values (r.customer_id, 'pulse', r.user_id, v_period, (v_period + interval '1 month'))
    on conflict do nothing returning id into v_id;
    if v_id is not null then
      n := n + 1;
      perform private.notify(r.user_id, 'csat.pulse', 'A 10-second check-in', 'How satisfied are you with Seven Billion this month?', '/', true, true);
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.send_csat_pulses from public, anon, authenticated;
grant execute on function public.send_csat_pulses to service_role;

-- ---------------------------------------------------------------- answer
create or replace function public.answer_csat(p_survey uuid, p_score int, p_comment text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare s public.csat_surveys;
begin
  select * into s from public.csat_surveys where id = p_survey for update;
  if not found or s.recipient_id <> (select auth.uid()) then raise exception 'survey not found'; end if;
  if s.answered_at is not null then raise exception 'you already answered this survey'; end if;
  if s.expires_at < now() then raise exception 'this survey has closed'; end if;
  if p_score not between 1 and 5 then raise exception 'choose a score from 1 to 5'; end if;
  update public.csat_surveys set score = p_score, comment = left(coalesce(trim(p_comment), ''), 2000), answered_at = now() where id = s.id;
end $$;
revoke execute on function public.answer_csat from public, anon;
grant execute on function public.answer_csat to authenticated;

-- ---------------------------------------------------------------- close the loop on a low score
create or replace function private.on_csat_answered() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_pm uuid; v_label text; v_fb uuid;
begin
  if new.answered_at is null or old.answered_at is not null then return null; end if;
  v_label := case new.kind when 'request' then (select number from public.requests where id = new.request_id)
                           when 'pulse' then 'monthly check-in' else 'project closure' end;
  perform private.log(new.customer_id, new.project_id, private.actor_name() || ' rated ' || v_label || ' ' || new.score || '/5', 'csat', new.id, 'internal');
  if new.score <= 2 and private.rule_on(new.customer_id, 'csat_low_followup') then
    v_owner := private.followup_owner(new.customer_id, new.project_id);
    select pm_id into v_pm from public.projects where id = new.project_id;
    insert into public.feedback (customer_id, project_id, kind, body, source, csat_id, submitted_by, owner_id)
    values (new.customer_id, new.project_id, 'issue',
            'Rated ' || v_label || ' ' || new.score || '/5' || case when new.comment <> '' then ': ' || new.comment else '' end,
            'csat', new.id, new.recipient_id, v_owner)
    returning id into v_fb;
    foreach v_pm in array array_remove(array[v_owner, v_pm], null) loop
      perform private.notify(v_pm, 'csat.low', 'Low CSAT: ' || private.actor_name() || ' rated ' || v_label || ' ' || new.score || '/5',
        coalesce(nullif(new.comment, ''), 'No comment. Please follow up today.'), '/feedback/' || v_fb, true, true);
    end loop;
    perform private.log_automation(new.customer_id, new.project_id, 'Low CSAT (' || new.score || '/5): opened a follow-up', 'feedback', v_fb);
  end if;
  return null;
end $$;
create trigger csat_after_answer after update of answered_at on public.csat_surveys for each row execute function private.on_csat_answered();

-- the closure form's satisfaction question is a CSAT answer too
create or replace function private.on_closure_csat() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.form_key = 'closure' and (new.answers ->> 'satisfaction') ~ '^[1-5]$' then
    insert into public.csat_surveys (customer_id, project_id, kind, recipient_id)
    values (new.customer_id, new.project_id, 'closure', new.submitted_by);
    update public.csat_surveys set score = (new.answers ->> 'satisfaction')::smallint, comment = left(coalesce(new.answers ->> 'improve', ''), 2000), answered_at = now()
    where customer_id = new.customer_id and recipient_id = new.submitted_by and kind = 'closure' and answered_at is null;
  end if;
  return null;
end $$;
create trigger forms_closure_csat after insert on public.form_submissions for each row execute function private.on_closure_csat();

-- ---------------------------------------------------------------- feedback notifications
create or replace function private.on_feedback_insert() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := coalesce(new.owner_id, private.followup_owner(new.customer_id, new.project_id)); v_pm uuid; r uuid;
begin
  if new.source <> 'portal' then return null; end if;   -- CSAT follow-ups notify on their own
  if new.owner_id is null and v_owner is not null then update public.feedback set owner_id = v_owner where id = new.id; end if;
  select pm_id into v_pm from public.projects where id = new.project_id;
  perform private.log(new.customer_id, new.project_id, private.actor_name() || ' sent feedback ' || new.number, 'feedback', new.id, 'shared');
  foreach r in array array_remove(array[v_owner, v_pm], null) loop
    perform private.notify(r, 'feedback.new', 'Feedback ' || new.number || ' (' || new.kind || ') from ' || private.actor_name(), left(new.body, 280), '/feedback/' || new.id, new.kind = 'issue', true);
  end loop;
  return null;
end $$;
create trigger feedback_after_insert after insert on public.feedback for each row execute function private.on_feedback_insert();

create or replace function private.on_feedback_status() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status in ('acknowledged', 'actioned', 'closed') then
    perform private.log(new.customer_id, new.project_id, new.number || ' marked ' || new.status, 'feedback', new.id, 'shared');
    perform private.notify(new.submitted_by, 'feedback.status', 'Your feedback ' || new.number || ' was ' || new.status,
      left(new.body, 200), '/feedback/' || new.id, false, true);
  end if;
  return null;
end $$;
create trigger feedback_after_update after update of status on public.feedback for each row execute function private.on_feedback_status();

-- comments on feedback: notify the other side
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
    when 'feedback' then select f.customer_id, 'shared'::public.visibility, f.project_id into customer_id, vis, project_id from public.feedback f where f.id = p_id;
  end case;
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
  elsif new.entity_type = 'feedback' then
    select case when v_staff then f.submitted_by else f.owner_id end into v_to from public.feedback f where f.id = new.entity_id;
    v_link := '/feedback/' || new.entity_id;
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

grant execute on all functions in schema private to authenticated;
