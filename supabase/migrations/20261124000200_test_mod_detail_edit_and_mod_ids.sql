-- Test DB migration: allow authorized owner to edit mod compatibility/memo fields
-- and delete unused Mod IDs. Column-scoped UPDATE prevents changing id/owner_id/workshop_id.
-- Target: isolated test Supabase only (smofdbjgcgdmscamknpw).

grant update (
  verification_status,
  build_compatibility,
  multiplayer_compatibility,
  researched_at,
  description,
  updated_at
) on table public.mods to authenticated;

drop policy if exists "authorized owner can update mods" on public.mods;
create policy "authorized owner can update mods" on public.mods
  for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_authorized_user()))
  with check (owner_id = (select auth.uid()) and (select public.is_authorized_user()));

grant delete on table public.mod_ids to authenticated;

drop policy if exists "authorized owner can delete mod ids" on public.mod_ids;
create policy "authorized owner can delete mod ids" on public.mod_ids
  for delete to authenticated
  using (
    (select public.is_authorized_user())
    and exists (
      select 1 from public.mods m
      where m.id = mod_id and m.owner_id = (select auth.uid())
    )
  );
