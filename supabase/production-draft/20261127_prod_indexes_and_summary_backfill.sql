-- PRODUCTION DRAFT — DO NOT APPLY WITHOUT PER-CASE USER APPROVAL.
-- Not in supabase/migrations/ and not in supabase/test-apply/ on purpose (no auto-apply workflow touches it).
-- Run AFTER every supabase/migrations/2026112* file listed in README.md has been applied to production.

-- 1) Performance indexes (same as test-apply/20261127000300_perf_indexes.sql). Idempotent.
create index if not exists mods_owner_archived_created_idx on public.mods (owner_id, is_archived, created_at desc);
create index if not exists mods_owner_archived_workshop_idx on public.mods (owner_id, is_archived, workshop_id);
create index if not exists categories_owner_sort_name_idx on public.categories (owner_id, sort_order, name);
create index if not exists mod_categories_owner_mod_idx on public.mod_categories (owner_id, mod_id);
create index if not exists mod_category_primary_owner_mod_idx on public.mod_category_primary (owner_id, mod_id);
create index if not exists profiles_owner_created_idx on public.profiles (owner_id, created_at desc);

-- 2) /mods list no longer loads full description: fill empty short_description from description.
update public.mods
set short_description = left(btrim(regexp_replace(description, '\s+', ' ', 'g')), 200)
where short_description = '' and coalesce(btrim(description), '') <> '';
