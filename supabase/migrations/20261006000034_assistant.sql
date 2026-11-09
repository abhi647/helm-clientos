-- The in-app assistant: each team member's chats with Claude, and the changes it proposes. Nothing the assistant
-- proposes is saved until the person confirms it; the change then runs as that person, under the same rules as
-- the app. Chats and proposals are private to the person who had them.

create table public.ai_chats (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null default 'New chat' check (char_length(title) <= 120),
  -- the conversation exactly as sent to Claude (append-only, so the cache and thinking blocks stay valid)
  messages jsonb not null default '[]'::jsonb,
  -- confirmations and cancellations since the last message, told to Claude with the next one
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_chats_profile_idx on public.ai_chats (profile_id, updated_at desc);

create table public.ai_proposals (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.ai_chats (id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  tool text not null check (char_length(tool) <= 60),
  input jsonb not null,
  summary text not null default '' check (char_length(summary) <= 500),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index ai_proposals_chat_idx on public.ai_proposals (chat_id, created_at);

alter table public.ai_chats enable row level security;
alter table public.ai_proposals enable row level security;
revoke all on public.ai_chats, public.ai_proposals from anon;

-- the team only, for now; each person sees and changes only their own
create policy ai_chats_own on public.ai_chats for all to authenticated
  using (profile_id = auth.uid() and private.is_staff())
  with check (profile_id = auth.uid() and private.is_staff());
create policy ai_proposals_own on public.ai_proposals for all to authenticated
  using (profile_id = auth.uid() and private.is_staff())
  with check (profile_id = auth.uid() and private.is_staff()
              and exists (select 1 from public.ai_chats c where c.id = chat_id and c.profile_id = auth.uid()));

notify pgrst, 'reload schema';
