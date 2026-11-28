-- Test DB migration draft: allow clearing a mod to 0 categories (unclassified, primary = null)
-- via save_mod_categories while preserving owner RLS, advisory locking, and consistency triggers.
create or replace function public.save_mod_categories(
  p_mod_id uuid,
  p_category_ids uuid[],
  p_primary_category_id uuid
)
returns void language plpgsql security invoker set search_path='' as $$
declare
  v_owner uuid := (select auth.uid());
  v_count integer;
  v_len integer;
begin
  if v_owner is null or not (select public.is_authorized_user()) then
    raise exception 'PZ_DENIED' using errcode='42501';
  end if;
  if p_mod_id is null or p_category_ids is null then
    raise exception 'PZ_INVALID_CATEGORIES' using errcode='PZ002';
  end if;
  v_len := coalesce(cardinality(p_category_ids), 0);
  if v_len > 64 or array_position(p_category_ids, null) is not null then
    raise exception 'PZ_INVALID_CATEGORIES' using errcode='PZ002';
  end if;
  if v_len = 0 then
    if p_primary_category_id is not null then
      raise exception 'PZ_INVALID_CATEGORIES' using errcode='PZ002';
    end if;
    perform 1 from public.mods where id=p_mod_id and owner_id=v_owner;
    if not found then raise exception 'PZ_UNKNOWN_MOD' using errcode='42501'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_mod_id::text, 8291));
    delete from public.mod_category_primary where mod_id=p_mod_id and owner_id=v_owner;
    delete from public.mod_categories where mod_id=p_mod_id and owner_id=v_owner;
    return;
  end if;
  if p_primary_category_id is null or not (p_primary_category_id = any(p_category_ids)) then
    raise exception 'PZ_INVALID_CATEGORIES' using errcode='PZ002';
  end if;
  select count(distinct x) into v_count from unnest(p_category_ids) as x;
  if v_count <> v_len then
    raise exception 'PZ_DUPLICATE_CATEGORY' using errcode='PZ002';
  end if;
  perform 1 from public.mods where id=p_mod_id and owner_id=v_owner;
  if not found then raise exception 'PZ_UNKNOWN_MOD' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_mod_id::text, 8291));
  select count(*) into v_count from public.categories where owner_id=v_owner and id=any(p_category_ids);
  if v_count <> v_len then
    raise exception 'PZ_UNKNOWN_CATEGORY' using errcode='42501';
  end if;
  delete from public.mod_category_primary where mod_id=p_mod_id and owner_id=v_owner;
  delete from public.mod_categories where mod_id=p_mod_id and owner_id=v_owner;
  insert into public.mod_categories(owner_id, mod_id, category_id)
  select v_owner, p_mod_id, x from unnest(p_category_ids) as x;
  insert into public.mod_category_primary(owner_id, mod_id, category_id)
  values(v_owner, p_mod_id, p_primary_category_id);
end $$;
revoke all on function public.save_mod_categories(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.save_mod_categories(uuid, uuid[], uuid) to authenticated;
