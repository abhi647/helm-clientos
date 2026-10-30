-- Documents ("pages"): rich-text scope, requirements, meeting notes and free pages, written in Helm and shared with
-- the customer for comments, suggestions and sign-off.
--
-- Editing model (live co-editing can be added later without changing how content is stored):
--   * one person edits at a time: claim_page() takes a short lock that the editor renews while it is open
--   * every save is a new version (page_versions), checked against the version the editor started from
--   * content is Plate JSON; inline comments and suggestions live in it, and the threads in pages.discussions
--   * the Seven Billion team edits; the customer can save only while the page is shared and not signed off
--     (their editor is in Suggesting mode); every save records who made it, and any version can be restored
--   * sign-off is a normal Helm approval with page_id set; approving it signs off that exact version

create type public.page_kind as enum ('scope', 'requirements', 'meeting_notes', 'blank');
create type public.page_status as enum ('draft', 'in_review', 'signed_off');

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete set null,
  kind public.page_kind not null default 'blank',
  title text not null check (length(trim(title)) between 1 and 200),
  content jsonb not null default '[]'::jsonb,
  discussions jsonb not null default '[]'::jsonb,
  visibility public.visibility not null default 'internal',
  status public.page_status not null default 'draft',
  version int not null default 1,
  signed_version int,
  signed_at timestamptz,
  signed_by uuid references public.profiles (id),
  editing_by uuid references public.profiles (id),
  editing_until timestamptz,
  created_by uuid references public.profiles (id) default auth.uid(),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.pages (project_id, updated_at desc);
create index on public.pages (customer_id);

create table public.page_versions (
  id bigint generated always as identity primary key,
  page_id uuid not null references public.pages (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  version int not null,
  title text not null,
  content jsonb not null,
  discussions jsonb not null default '[]'::jsonb,
  saved_by uuid references public.profiles (id),
  saved_at timestamptz not null default now(),
  note text,
  unique (page_id, version)
);

alter table public.approvals add column page_id uuid references public.pages (id) on delete cascade;
create index on public.approvals (page_id) where page_id is not null;

alter table public.pages enable row level security;
alter table public.page_versions enable row level security;

-- reading follows visibility like everything else; writing content goes through save_page()
create policy pages_read on public.pages for select to authenticated using (private.can_read(customer_id, visibility));
create policy pages_staff_insert on public.pages for insert to authenticated
  with check (private.is_staff_of(customer_id) and created_by = (select auth.uid()) and status = 'draft' and version = 1);
create policy pages_manage_delete on public.pages for delete to authenticated using (private.can_manage(customer_id));
create policy page_versions_read on public.page_versions for select to authenticated
  using (exists (select 1 from public.pages p where p.id = page_id and private.can_read(p.customer_id, p.visibility)));

-- the project must belong to the page's customer
create or replace function private.guard_page() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.customer_id = new.customer_id) then
    raise exception 'that project belongs to another customer';
  end if;
  if new.meeting_id is not null and not exists (select 1 from public.meetings m where m.id = new.meeting_id and m.project_id = new.project_id) then
    raise exception 'that meeting is on another project';
  end if;
  return new;
end $$;
create trigger guard_page before insert or update of project_id, customer_id, meeting_id on public.pages
  for each row execute function private.guard_page();

create or replace function private.on_page_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.page_versions (page_id, customer_id, version, title, content, discussions, saved_by, note)
  values (new.id, new.customer_id, new.version, new.title, new.content, new.discussions, new.created_by, 'Created');
  perform private.log(new.customer_id, new.project_id, private.actor_name() || ' created the document ' || new.title, 'page', new.id, new.visibility);
  return null;
end $$;
create trigger on_page_insert after insert on public.pages for each row execute function private.on_page_insert();

-- may the signed-in person change this page's content? staff always; the customer while it is shared and open
create or replace function private.can_write_page(p public.pages) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_staff_of(p.customer_id)
    or (p.visibility = 'shared' and p.status <> 'signed_off' and private.my_customer() = p.customer_id)
$$;

-- take (or renew) the editing lock; returns the name of whoever else holds it, or null when it is yours
create or replace function public.claim_page(p_page uuid, p_release boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare p public.pages; holder text;
begin
  select * into p from public.pages where id = p_page for update;
  if not found or not private.can_write_page(p) then raise exception 'not allowed'; end if;
  if p_release then
    update public.pages set editing_by = null, editing_until = null where id = p_page and editing_by = (select auth.uid());
    return null;
  end if;
  if p.editing_by is not null and p.editing_by <> (select auth.uid()) and p.editing_until > now() then
    select full_name into holder from public.profiles where id = p.editing_by;
    return coalesce(holder, 'Someone');
  end if;
  update public.pages set editing_by = (select auth.uid()), editing_until = now() + interval '60 seconds' where id = p_page;
  return null;
end $$;

-- save a new version. p_base is the version the editor loaded: if someone saved since, nothing is lost, the caller
-- is told to reload. Customers cannot rename a page.
create or replace function public.save_page(p_page uuid, p_base int, p_content jsonb, p_discussions jsonb, p_title text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare p public.pages; staff boolean; next_title text;
begin
  select * into p from public.pages where id = p_page for update;
  if not found or not private.can_write_page(p) then raise exception 'not allowed'; end if;
  if p.editing_by is not null and p.editing_by <> (select auth.uid()) and p.editing_until > now() then
    raise exception 'someone else is editing this document';
  end if;
  if p.version <> p_base then raise exception 'this document was saved by someone else; reload to see their changes'; end if;
  if jsonb_typeof(p_content) <> 'array' or jsonb_typeof(p_discussions) <> 'array' then raise exception 'not a document'; end if;
  if octet_length(p_content::text) + octet_length(p_discussions::text) > 2000000 then raise exception 'this document is too large to save'; end if;
  staff := private.is_staff_of(p.customer_id);
  next_title := case when staff and nullif(trim(p_title), '') is not null then left(trim(p_title), 200) else p.title end;
  update public.pages set content = p_content, discussions = p_discussions, title = next_title, version = p.version + 1,
    updated_by = (select auth.uid()), updated_at = now(),
    -- a change after sign-off starts a new draft; the signed version stays on record
    status = case when p.status = 'signed_off' then 'draft' else p.status end,
    editing_by = (select auth.uid()), editing_until = now() + interval '60 seconds'
  where id = p_page;
  insert into public.page_versions (page_id, customer_id, version, title, content, discussions, saved_by)
  values (p_page, p.customer_id, p.version + 1, next_title, p_content, p_discussions, (select auth.uid()));
  return p.version + 1;
end $$;

-- put an earlier version back (as a new version, so nothing is lost)
create or replace function public.restore_page_version(p_page uuid, p_version int) returns int
language plpgsql security definer set search_path = '' as $$
declare p public.pages; v public.page_versions;
begin
  select * into p from public.pages where id = p_page for update;
  if not found or not private.is_staff_of(p.customer_id) then raise exception 'not allowed'; end if;
  select * into v from public.page_versions where page_id = p_page and version = p_version;
  if not found then raise exception 'that version does not exist'; end if;
  update public.pages set content = v.content, discussions = v.discussions, title = v.title, version = p.version + 1,
    updated_by = (select auth.uid()), updated_at = now(), status = case when p.status = 'signed_off' then 'draft' else p.status end
  where id = p_page;
  insert into public.page_versions (page_id, customer_id, version, title, content, discussions, saved_by, note)
  values (p_page, p.customer_id, p.version + 1, v.title, v.content, v.discussions, (select auth.uid()), 'Restored version ' || p_version);
  return p.version + 1;
end $$;

-- share with the customer (or take back to internal); the team on the customer side is told once
create or replace function public.set_page_sharing(p_page uuid, p_shared boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.pages; r record;
begin
  select * into p from public.pages where id = p_page for update;
  if not found or not private.is_staff_of(p.customer_id) then raise exception 'not allowed'; end if;
  if not p_shared and exists (select 1 from public.approvals a where a.page_id = p_page and a.status = 'pending') then
    raise exception 'withdraw the sign-off request first';
  end if;
  update public.pages set visibility = case when p_shared then 'shared' else 'internal' end::public.visibility where id = p_page;
  if p_shared and p.visibility = 'internal' then
    perform private.log(p.customer_id, p.project_id, private.actor_name() || ' shared the document ' || p.title, 'page', p.id, 'shared');
    for r in select id from public.profiles where customer_id = p.customer_id and kind = 'customer' and access_revoked_at is null loop
      perform private.notify(r.id, 'page.shared', 'Document shared: ' || p.title, 'Read it and add comments or suggestions in Helm.',
        '/portal/documents/pages/' || p.id, false, false);
    end loop;
  end if;
end $$;

-- ask a named person at the customer to sign off the current version; any earlier open request is withdrawn
create or replace function public.request_page_signoff(p_page uuid, p_approver uuid, p_due date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.pages; a_id uuid;
begin
  select * into p from public.pages where id = p_page for update;
  if not found or not private.can_manage(p.customer_id) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.profiles where id = p_approver and customer_id = p.customer_id and kind = 'customer' and access_revoked_at is null) then
    raise exception 'the approver must be someone at the customer';
  end if;
  update public.approvals set status = 'cancelled' where page_id = p_page and status = 'pending';
  update public.action_items set status = 'cancelled' where approval_id in (select id from public.approvals where page_id = p_page) and status = 'open';
  update public.pages set visibility = 'shared', status = 'in_review', editing_by = null, editing_until = null where id = p_page;
  insert into public.approvals (customer_id, project_id, page_id, kind, title, summary, due_date, approver_id, requested_by, version)
  values (p.customer_id, p.project_id, p_page, 'document', 'Sign off: ' || p.title,
    coalesce(nullif(trim(p_note), ''), 'Please read the document and approve version ' || p.version || ', or request changes.'),
    p_due, p_approver, (select auth.uid()), p.version)
  returning id into a_id;
  return a_id;
end $$;

-- a decision on a document's approval signs off (or reopens) the page
create or replace function private.on_page_approval() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.page_id is null or new.status = old.status then return null; end if;
  if new.status = 'approved' then
    update public.pages set status = 'signed_off', signed_version = new.version, signed_at = now(), signed_by = new.approver_id,
      editing_by = null, editing_until = null
    where id = new.page_id;
  elsif new.status = 'changes_requested' then
    update public.pages set status = 'draft' where id = new.page_id and status = 'in_review';
  end if;
  return null;
end $$;
create trigger on_page_approval after update of status on public.approvals for each row execute function private.on_page_approval();

-- pages can carry comments and appear in activity like other records
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
    when 'page' then select g.customer_id, g.visibility, g.project_id into customer_id, vis, project_id from public.pages g where g.id = p_id;
  end case;
end $$;

grant execute on function public.claim_page(uuid, boolean), public.save_page(uuid, int, jsonb, jsonb, text),
  public.restore_page_version(uuid, int), public.set_page_sharing(uuid, boolean),
  public.request_page_signoff(uuid, uuid, date, text) to authenticated;
