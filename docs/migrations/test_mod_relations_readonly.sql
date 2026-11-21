-- TEST SUPABASE ONLY: smofdbjgcgdmscamknpw
-- New table only. Existing mods/mod_ids/research_records remain untouched.
-- No client write permissions: a reviewed write API/RPC is NOT approved yet.
create table public.mod_relations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  kind text not null check (kind in ('requires','incompatibleMods','loadBefore','loadAfter')),
  subject_mod_id_entry_id uuid not null references public.mod_ids(id),
  target_mod_id_entry_id uuid not null references public.mod_ids(id),
  research_record_id uuid not null references public.research_records(id),
  evidence_url text not null check (char_length(evidence_url) between 8 and 2000),
  checked_at date not null,
  approved boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mod_relations_distinct_endpoints check (subject_mod_id_entry_id <> target_mod_id_entry_id),
  constraint mod_relations_approval_timestamp check ((not approved and approved_at is null) or (approved and approved_at is not null)),
  constraint mod_relations_unique_pair unique (owner_id, kind, subject_mod_id_entry_id, target_mod_id_entry_id)
);
create index mod_relations_owner_subject_idx on public.mod_relations (owner_id, subject_mod_id_entry_id);
create index mod_relations_owner_target_idx on public.mod_relations (owner_id, target_mod_id_entry_id);
create index mod_relations_research_idx on public.mod_relations (research_record_id);
alter table public.mod_relations enable row level security;
revoke all on table public.mod_relations from public, anon, authenticated;
grant select on table public.mod_relations to authenticated;
create policy "authorized owner can read reviewed mod relations"
on public.mod_relations for select to authenticated
using (
  owner_id = (select auth.uid())
  and (select public.is_authorized_user())
  and exists (
    select 1 from public.mod_ids s
    join public.mods sm on sm.id = s.mod_id
    where s.id = subject_mod_id_entry_id and sm.owner_id = (select auth.uid())
  )
  and exists (
    select 1 from public.mod_ids t
    join public.mods tm on tm.id = t.mod_id
    where t.id = target_mod_id_entry_id and tm.owner_id = (select auth.uid())
  )
  and exists (
    select 1 from public.research_records rr
    join public.mods rm on rm.id = rr.mod_id
    join public.mod_ids s2 on s2.mod_id = rm.id
    where rr.id = research_record_id
      and s2.id = subject_mod_id_entry_id
      and rm.owner_id = (select auth.uid())
  )
);
