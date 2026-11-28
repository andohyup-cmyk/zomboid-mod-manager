-- Test DB migration draft: allow owner-scoped category deletion via atomic SECURITY INVOKER RPC.
-- Re-elects the next primary category for affected multi-category mods, or leaves them unclassified (0 categories).
create policy "owner category delete" on public.categories for delete to authenticated
  using (owner_id=(select auth.uid()) and (select public.is_authorized_user()));
grant delete on public.categories to authenticated;

create or replace function public.delete_category(p_category_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
  v_owner uuid := (select auth.uid());
  v_mod uuid;
  v_next_primary uuid;
begin
  if v_owner is null or not (select public.is_authorized_user()) then
    raise exception 'PZ_DENIED' using errcode='42501';
  end if;
  if p_category_id is null then
    raise exception 'PZ_INVALID_CATEGORY' using errcode='PZ002';
  end if;
  perform 1 from public.categories where id=p_category_id and owner_id=v_owner;
  if not found then
    raise exception 'PZ_UNKNOWN_CATEGORY' using errcode='P0002';
  end if;

  -- Lock each affected mod in deterministic order before mutating memberships/primaries.
  for v_mod in
    select mc.mod_id
    from public.mod_categories mc
    where mc.owner_id=v_owner and mc.category_id=p_category_id
    order by mc.mod_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_mod::text, 8291));
  end loop;

  delete from public.mod_category_primary
  where owner_id=v_owner and category_id=p_category_id;

  delete from public.mod_categories
  where owner_id=v_owner and category_id=p_category_id;

  -- Promote the first remaining category as primary for any mod that lost its primary.
  for v_mod in
    select distinct mc.mod_id
    from public.mod_categories mc
    where mc.owner_id=v_owner
      and not exists (
        select 1 from public.mod_category_primary p
        where p.owner_id=v_owner and p.mod_id=mc.mod_id
      )
    order by mc.mod_id
  loop
    select mc.category_id into v_next_primary
    from public.mod_categories mc
    join public.categories c on c.id=mc.category_id and c.owner_id=v_owner
    where mc.owner_id=v_owner and mc.mod_id=v_mod
    order by c.sort_order asc, c.name asc, c.id asc
    limit 1;
    if v_next_primary is not null then
      insert into public.mod_category_primary(owner_id, mod_id, category_id)
      values (v_owner, v_mod, v_next_primary);
    end if;
  end loop;

  delete from public.categories where id=p_category_id and owner_id=v_owner;
end $$;
revoke all on function public.delete_category(uuid) from public, anon, authenticated;
grant execute on function public.delete_category(uuid) to authenticated;
