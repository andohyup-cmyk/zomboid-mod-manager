-- Prepared only. Do NOT apply without separate user approval of database/RLS changes.
-- Per-user durable research inbox; unrelated to the approved catalog.
-- Existing mods, mod_ids, research_records, profiles and their policies are untouched.

create table if not exists public.research_queue (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workshop_id text not null check (workshop_id ~ '^[0-9]{5,20}$'),
  source text not null check (source in ('steam', 'inbox', 'manual')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, workshop_id, source),
  constraint research_queue_payload_matches_id
    check (payload->>'workshopId' = workshop_id)
);

create index if not exists research_queue_owner_status_updated_idx
  on public.research_queue (owner_id, status, updated_at desc);

alter table public.research_queue enable row level security;

-- Never grant anonymous access. Every row requires owner identity plus owner allowlist.
revoke all on table public.research_queue from anon, authenticated;
grant select, insert, update on table public.research_queue to authenticated;

create policy "authorized owner can read research queue"
  on public.research_queue for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_authorized_user()));

create policy "authorized owner can insert research queue"
  on public.research_queue for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_authorized_user()));

create policy "authorized owner can update research queue"
  on public.research_queue for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_authorized_user()))
  with check (owner_id = (select auth.uid()) and (select public.is_authorized_user()));

-- No DELETE privilege or delete policy: dismissal is a reversible status.
-- User confirmation is required in the UI before modifying status.
-- Approved catalog writes remain exclusively in approve_research_record(jsonb).
