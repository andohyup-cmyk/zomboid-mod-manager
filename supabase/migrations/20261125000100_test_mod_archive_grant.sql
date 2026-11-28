-- Test DB migration: allow authorized owner to toggle is_archived (archive/restore) on public.mods.
-- Existing RLS policy "authorized owner can update mods" already enforces owner_id and allowlist.

grant update (is_archived) on table public.mods to authenticated;
