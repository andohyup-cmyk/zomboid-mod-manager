-- Composite performance indexes for hot owner-scoped queries (idempotent, test DB smofdbjgcgdmscamknpw).
create index if not exists mods_owner_archived_created_idx on public.mods (owner_id, is_archived, created_at desc);
create index if not exists mods_owner_archived_workshop_idx on public.mods (owner_id, is_archived, workshop_id);
create index if not exists categories_owner_sort_name_idx on public.categories (owner_id, sort_order, name);
create index if not exists mod_categories_owner_mod_idx on public.mod_categories (owner_id, mod_id);
create index if not exists mod_category_primary_owner_mod_idx on public.mod_category_primary (owner_id, mod_id);
create index if not exists profiles_owner_created_idx on public.profiles (owner_id, created_at desc);
