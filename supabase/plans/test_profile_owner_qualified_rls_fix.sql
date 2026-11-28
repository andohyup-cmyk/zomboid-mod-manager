-- Follow-up corrective migration: explicit outer-row qualifications in RLS ownership checks.
-- Target: TEST project smofdbjgcgdmscamknpw only. No data changes.
-- In a correlated subquery, bare owner_id bound to p.owner_id/m.owner_id and
-- reduced ownership comparisons to tautologies. Qualify outer table columns.

alter policy "authorized owner can read profile revisions" on public.profile_revision
  using (
    profile_revision.owner_id = (select auth.uid())
    and (select public.is_authorized_user())
    and exists (
      select 1 from public.profiles p
      where p.id = profile_revision.profile_id
        and p.owner_id = profile_revision.owner_id
    )
  );

alter policy "authorized owner can create profile revisions" on public.profile_revision
  with check (
    profile_revision.owner_id = (select auth.uid())
    and (select public.is_authorized_user())
    and exists (
      select 1 from public.profiles p
      where p.id = profile_revision.profile_id
        and p.owner_id = profile_revision.owner_id
    )
  );

alter policy "authorized owner can read game mod choices" on public.profile_mod_choices
  using (
    profile_mod_choices.owner_id = (select auth.uid())
    and (select public.is_authorized_user())
    and exists (
      select 1 from public.mod_ids mi
      join public.mods m on m.id = mi.mod_id
      where mi.id = profile_mod_choices.mod_id_entry_id
        and m.owner_id = profile_mod_choices.owner_id
    )
  );

alter policy "authorized owner can insert game mod choices" on public.profile_mod_choices
  with check (
    profile_mod_choices.owner_id = (select auth.uid())
    and (select public.is_authorized_user())
    and exists (
      select 1 from public.mod_ids mi
      join public.mods m on m.id = mi.mod_id
      where mi.id = profile_mod_choices.mod_id_entry_id
        and m.owner_id = profile_mod_choices.owner_id
    )
  );
