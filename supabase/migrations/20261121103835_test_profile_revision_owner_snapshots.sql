-- TEST PROJECT ONLY: smofdbjgcgdmscamknpw
-- User approved on 2026-11-21. Existing profile_mods data and rights remain unchanged.
-- This is an additive, append-only snapshot schema; no profiles or mod_ids are migrated.
-- Pre-change affected-table logical snapshot: backups/test-profile-pre-schema-20261121.json

-- Existing profiles remain read-only except minimally permitted creation for the owner.
grant insert (owner_id, name) on public.profiles to authenticated;
create policy "authorized owner can create profiles" on public.profiles
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.is_authorized_user())
  );

-- Each save is a new immutable revision, avoiding DELETE/UPDATE privileges on snapshots.
-- The (profile_id, revision) primary key detects concurrent attempts at the same next revision.
create table public.profile_revision (
  profile_id uuid not null references public.profiles(id) on delete restrict,
  revision integer not null check (revision > 0),
  owner_id uuid not null,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  primary key (profile_id, revision),
  unique (profile_id, revision, owner_id)
);
create index profile_revision_owner_latest_idx
  on public.profile_revision (owner_id, profile_id, revision desc);
alter table public.profile_revision enable row level security;
revoke all on public.profile_revision from public, anon, authenticated;
grant select on public.profile_revision to authenticated;
grant insert (profile_id, revision, owner_id, notes) on public.profile_revision to authenticated;

create policy "authorized owner can read profile revisions" on public.profile_revision
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and (select public.is_authorized_user())
    and exists (
      select 1 from public.profiles p
      where p.id = profile_id and p.owner_id = owner_id
    )
  );
create policy "authorized owner can create profile revisions" on public.profile_revision
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.is_authorized_user())
    and exists (
      select 1 from public.profiles p
      where p.id = profile_id and p.owner_id = owner_id
    )
  );

-- A single game Mod ID is a mod_ids.id, NOT an entire mods.id Workshop item.
-- Disabled choices keep their slot and order. Old revision rows are never auto-migrated.
create table public.profile_mod_choices (
  profile_id uuid not null,
  revision integer not null,
  owner_id uuid not null,
  mod_id_entry_id uuid not null references public.mod_ids(id) on delete restrict,
  enabled boolean not null,
  load_order integer not null check (load_order >= 0),
  primary key (profile_id, revision, mod_id_entry_id),
  unique (profile_id, revision, load_order),
  foreign key (profile_id, revision, owner_id)
    references public.profile_revision (profile_id, revision, owner_id)
    on delete restrict
);
create index profile_mod_choices_owner_idx
  on public.profile_mod_choices (owner_id, profile_id, revision);
alter table public.profile_mod_choices enable row level security;
revoke all on public.profile_mod_choices from public, anon, authenticated;
grant select on public.profile_mod_choices to authenticated;
grant insert (profile_id, revision, owner_id, mod_id_entry_id, enabled, load_order)
  on public.profile_mod_choices to authenticated;

create policy "authorized owner can read game mod choices" on public.profile_mod_choices
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and (select public.is_authorized_user())
    and exists (
      select 1 from public.mod_ids mi
      join public.mods m on m.id = mi.mod_id
      where mi.id = mod_id_entry_id and m.owner_id = owner_id
    )
  );
create policy "authorized owner can insert game mod choices" on public.profile_mod_choices
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.is_authorized_user())
    and exists (
      select 1 from public.mod_ids mi
      join public.mods m on m.id = mi.mod_id
      where mi.id = mod_id_entry_id and m.owner_id = owner_id
    )
  );

-- Download-only Workshop IDs are distinct from activated game Mod IDs.
-- No catalog Mod ID is inferred or activated by adding a download-only record.
create table public.profile_downloads (
  profile_id uuid not null,
  revision integer not null,
  owner_id uuid not null,
  workshop_id text not null
    check (
      workshop_id ~ '^[1-9][0-9]{4,19}$'
      and (length(workshop_id) < 20 or workshop_id <= '18446744073709551615')
    ),
  load_order integer not null check (load_order >= 0),
  primary key (profile_id, revision, workshop_id),
  unique (profile_id, revision, load_order),
  foreign key (profile_id, revision, owner_id)
    references public.profile_revision (profile_id, revision, owner_id)
    on delete restrict
);
create index profile_downloads_owner_idx
  on public.profile_downloads (owner_id, profile_id, revision);
alter table public.profile_downloads enable row level security;
revoke all on public.profile_downloads from public, anon, authenticated;
grant select on public.profile_downloads to authenticated;
grant insert (profile_id, revision, owner_id, workshop_id, load_order)
  on public.profile_downloads to authenticated;

create policy "authorized owner can read profile downloads" on public.profile_downloads
  for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_authorized_user()));
create policy "authorized owner can insert profile downloads" on public.profile_downloads
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_authorized_user()));

-- Intentionally no UPDATE/DELETE grants or RLS policies for snapshots or legacy profile_mods.
-- NO automatic data backfill, account role changes, production deployments, or main merges.
