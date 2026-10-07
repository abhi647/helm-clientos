-- System health: what went wrong on the server, and when each background job last ran. Written by the server with the
-- secret key only; read by admins and the CEO on Admin → System health. Kept for 90 days.

create table public.system_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  level text not null default 'error' check (level in ('error', 'warn', 'info')),
  source text not null,                 -- 'request', 'email', 'zoho', 'cron', ...
  message text not null,
  detail jsonb not null default '{}'
);
create index on public.system_log (at desc);

create table public.job_runs (
  job text primary key,                 -- 'emails', 'zoho-sync'
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  last_result jsonb not null default '{}'
);

alter table public.system_log enable row level security;
alter table public.job_runs enable row level security;
revoke all on public.system_log, public.job_runs from anon, authenticated;
grant select on public.system_log, public.job_runs to authenticated;

create policy system_log_read on public.system_log for select to authenticated
  using (private.is_staff() and private.staff_role() in ('admin', 'ceo'));
create policy job_runs_read on public.job_runs for select to authenticated
  using (private.is_staff() and private.staff_role() in ('admin', 'ceo'));

-- outbox numbers for the health page, without exposing the emails themselves
create or replace function public.outbox_health() returns table (queued int, failed_7d int, sent_24h int, oldest_queued timestamptz)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::int from public.email_outbox where status = 'queued'),
    (select count(*)::int from public.email_outbox where status = 'failed' and created_at > now() - interval '7 days'),
    (select count(*)::int from public.email_outbox where status = 'sent' and sent_at > now() - interval '24 hours'),
    (select min(created_at) from public.email_outbox where status = 'queued')
  where private.is_staff() and private.staff_role() in ('admin', 'ceo')
$$;
revoke execute on function public.outbox_health from public, anon;
grant execute on function public.outbox_health to authenticated;
