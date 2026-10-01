-- Helm foundation. Review/apply to an isolated Supabase project first.
-- This is an initial schema, not the full PRD database or a deployed migration.
create table public.workspaces (id uuid primary key default gen_random_uuid(), name text not null);
create table public.memberships (workspace_id uuid references public.workspaces on delete cascade, user_id uuid references auth.users on delete cascade, role text not null check(role in ('admin','pm','developer','customer')), primary key(workspace_id,user_id));
create table public.projects (id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces, name text not null, project_key text not null, created_at timestamptz not null default now(), unique(workspace_id,project_key));
create table public.issues (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,title text not null,status text not null default 'To do',visibility text not null default 'Internal' check(visibility in ('Internal','Shared')),record_version integer not null default 1);
create table public.issue_private_details (issue_id uuid primary key references public.issues on delete cascade, technical_notes text, effort_hours numeric);
create table public.plan_drafts (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,source_document_id uuid, draft jsonb not null,version integer not null default 1, state text not null default 'Draft',created_at timestamptz not null default now());
create table public.ai_runs (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,user_id uuid not null references auth.users,status text not null default 'reserved',input_token_count integer not null default 0,output_token_count integer not null default 0,created_at timestamptz not null default now());
create function public.member_role(target uuid) returns text language sql stable security definer set search_path='' as $$ select role from public.memberships where workspace_id=target and user_id=auth.uid() $$;
create function public.can_plan_project(target uuid) returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select public.member_role(workspace_id) in ('admin','pm','developer') from public.projects where id=target),false) $$;
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.projects enable row level security;
alter table public.issues enable row level security;
alter table public.issue_private_details enable row level security;
alter table public.plan_drafts enable row level security;
alter table public.ai_runs enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using(public.member_role(id) is not null);
create policy own_memberships on public.memberships for select to authenticated using(user_id=auth.uid());
create policy project_read on public.projects for select to authenticated using(public.member_role(workspace_id) is not null);
create policy issue_read on public.issues for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id and (public.member_role(p.workspace_id) in ('admin','pm','developer') or (public.member_role(p.workspace_id)='customer' and visibility='Shared'))));
create policy issue_private_read on public.issue_private_details for select to authenticated using(exists(select 1 from public.issues i where i.id=issue_id and public.can_plan_project(i.project_id)));
create policy draft_read on public.plan_drafts for select to authenticated using(public.can_plan_project(project_id));
create policy own_ai_runs on public.ai_runs for select to authenticated using(user_id=auth.uid());
-- No direct client write policies: transactional domain RPCs are future migration work.
create function public.reserve_ai_run(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid;
begin
 if auth.uid() is null or not public.can_plan_project(target) then raise exception 'Forbidden'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if (select count(*) from public.ai_runs where user_id=auth.uid() and created_at>now()-interval '24 hours')>=5 then raise exception 'Daily allowance exceeded'; end if;
 -- Initial hard organization allowance: 50 bounded calls in a calendar month.
 perform pg_advisory_xact_lock(hashtextextended('helm-monthly-ai-budget',0));
 if (select count(*) from public.ai_runs where created_at>=date_trunc('month',now()))>=50 then raise exception 'Monthly allowance exceeded'; end if;
 insert into public.ai_runs(project_id,user_id) values(target,auth.uid()) returning id into new_id;
 return new_id;
end $$;
create function public.finish_ai_run(run uuid,succeeded boolean,input_tokens integer,output_tokens integer) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.ai_runs set status=case when succeeded then 'completed' else 'failed' end,input_token_count=greatest(0,input_tokens),output_token_count=greatest(0,output_tokens) where id=run and user_id=auth.uid() and status='reserved';
end $$;
revoke all on function public.member_role(uuid),public.can_plan_project(uuid),public.reserve_ai_run(uuid),public.finish_ai_run(uuid,boolean,integer,integer) from public,anon;
grant execute on function public.member_role(uuid),public.can_plan_project(uuid),public.reserve_ai_run(uuid),public.finish_ai_run(uuid,boolean,integer,integer) to authenticated;
