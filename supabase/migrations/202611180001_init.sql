-- Project Zomboid Mod Manager, first private-owner MVP schema.
-- Run once in Supabase SQL Editor before signing in and approving mods.
-- This migration does not insert an owner: owner UUID is added separately after first Google sign-in.

create extension if not exists pgcrypto;

create table if not exists public.authorized_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.authorized_users enable row level security;
revoke all on public.authorized_users from anon, authenticated;

create or replace function public.is_authorized_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.authorized_users as a
    where a.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_authorized_user() from public;
grant execute on function public.is_authorized_user() to authenticated;

create table if not exists public.mods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workshop_id text not null check (workshop_id ~ '^[0-9]{5,20}$'),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  source_url text not null,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','confirmed','reported_issue')),
  build_compatibility text not null default 'unverified'
    check (build_compatibility in ('unverified','confirmed','reported_issue')),
  multiplayer_compatibility text not null default 'unverified'
    check (multiplayer_compatibility in ('unverified','confirmed','reported_issue')),
  researched_at date,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, workshop_id)
);
create index if not exists mods_owner_created_idx on public.mods (owner_id, created_at desc);
alter table public.mods enable row level security;

create policy "authorized owner can read mods" on public.mods
  for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_authorized_user()));

create policy "authorized owner can insert mods" on public.mods
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_authorized_user()));

create table if not exists public.mod_ids (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods(id) on delete cascade,
  value text not null check (char_length(value) between 1 and 200),
  unique (mod_id, value)
);
create index if not exists mod_ids_mod_idx on public.mod_ids (mod_id);
alter table public.mod_ids enable row level security;

create policy "authorized owner can read mod ids" on public.mod_ids
  for select to authenticated
  using (
    (select public.is_authorized_user())
    and exists (select 1 from public.mods m where m.id = mod_id and m.owner_id = (select auth.uid()))
  );

create policy "authorized owner can insert mod ids" on public.mod_ids
  for insert to authenticated
  with check (
    (select public.is_authorized_user())
    and exists (select 1 from public.mods m where m.id = mod_id and m.owner_id = (select auth.uid()))
  );

create table if not exists public.research_records (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods(id) on delete cascade,
  raw_payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.research_records enable row level security;

create policy "authorized owner can read research records" on public.research_records
  for select to authenticated
  using (
    (select public.is_authorized_user())
    and exists (select 1 from public.mods m where m.id = mod_id and m.owner_id = (select auth.uid()))
  );

create policy "authorized owner can insert research records" on public.research_records
  for insert to authenticated
  with check (
    (select public.is_authorized_user())
    and exists (select 1 from public.mods m where m.id = mod_id and m.owner_id = (select auth.uid()))
  );

-- Profiles are intentionally read-only in this first code iteration.
-- Do not generate server config strings until explicit Mod ID option and load-order behavior is decided.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "authorized owner can read profiles" on public.profiles
  for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_authorized_user()));

create table if not exists public.profile_mods (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  mod_id uuid not null references public.mods(id) on delete cascade,
  enabled boolean not null default true,
  load_order integer not null check (load_order >= 0),
  primary key (profile_id, mod_id)
);
alter table public.profile_mods enable row level security;
create policy "authorized owner can read profile mods" on public.profile_mods
  for select to authenticated
  using (
    (select public.is_authorized_user())
    and exists (
      select 1 from public.profiles p
      join public.mods m on m.id = mod_id
      where p.id = profile_id
        and p.owner_id = (select auth.uid()) and m.owner_id = p.owner_id
    )
  );

-- One atomic approval. No operation occurs before explicit user action.
create or replace function public.approve_research_record(p_payload jsonb)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_mod_id uuid;
  v_workshop_id text;
  v_title text;
  v_game_mod_id text;
begin
  if (select auth.uid()) is null or not (select public.is_authorized_user()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Expected research object';
  end if;
  v_workshop_id := p_payload->>'workshopId';
  v_title := btrim(p_payload->>'title');
  if v_workshop_id is null or v_workshop_id !~ '^[0-9]{5,20}$' then
    raise exception 'Invalid workshop ID';
  end if;
  if v_title is null or char_length(v_title) not between 1 and 200 then
    raise exception 'Invalid title';
  end if;

  insert into public.mods (
    owner_id, workshop_id, title, description, source_url,
    verification_status, build_compatibility, multiplayer_compatibility, researched_at
  ) values (
    (select auth.uid()), v_workshop_id, v_title,
    coalesce(p_payload->>'description', ''),
    'https://steamcommunity.com/sharedfiles/filedetails/?id=' || v_workshop_id,
    coalesce(p_payload->>'verificationStatus', 'unverified'),
    coalesce(p_payload->>'buildCompatibility', 'unverified'),
    coalesce(p_payload->>'multiplayerCompatibility', 'unverified'),
    nullif(p_payload->>'checkedAt', '')::date
  ) returning id into v_mod_id;

  if p_payload ? 'modIds' and jsonb_typeof(p_payload->'modIds') = 'array' then
    for v_game_mod_id in
      select distinct value from jsonb_array_elements_text(p_payload->'modIds') as x(value)
    loop
      insert into public.mod_ids (mod_id, value) values (v_mod_id, v_game_mod_id);
    end loop;
  end if;
  insert into public.research_records (mod_id, raw_payload) values (v_mod_id, p_payload);
  return v_mod_id;
end;
$$;
revoke all on function public.approve_research_record(jsonb) from public;
grant execute on function public.approve_research_record(jsonb) to authenticated;

-- Explicit API privileges for projects with "Automatically expose new tables" disabled.
-- RLS still restricts each operation to the authorized owner.
revoke all on table public.mods, public.mod_ids, public.research_records,
  public.profiles, public.profile_mods from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert on table public.mods, public.mod_ids, public.research_records
  to authenticated;
grant select on table public.profiles, public.profile_mods to authenticated;

-- RPC is the only supported mod approval write flow in this MVP.
-- PostgreSQL table privileges do not bypass the RLS policies above.
-- The allowlist itself remains inaccessible to client roles.
revoke all on table public.authorized_users from anon, authenticated;

-- AFTER the authorized user signs in with Google and sees their UUID on the access-restricted screen:
-- INSERT INTO public.authorized_users (user_id) VALUES ('YOUR_AUTH_USER_UUID');
-- Never enable direct public insert access to authorized_users.
