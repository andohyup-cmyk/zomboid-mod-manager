-- Add covering indexes for new profile snapshot tables only.
-- Test project smofdbjgcgdmscamknpw; this migration does not touch legacy tables.
create index profile_mod_choices_revision_owner_fk_idx
  on public.profile_mod_choices (profile_id, revision, owner_id);
create index profile_mod_choices_entry_fk_idx
  on public.profile_mod_choices (mod_id_entry_id);
create index profile_downloads_revision_owner_fk_idx
  on public.profile_downloads (profile_id, revision, owner_id);
