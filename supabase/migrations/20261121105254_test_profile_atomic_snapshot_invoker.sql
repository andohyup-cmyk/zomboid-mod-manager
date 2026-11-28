-- Only for Zomboid Mod Manager Test: smofdbjgcgdmscamknpw.
-- Approved 2026-11-21. Additive SECURITY INVOKER RPC, no table/data rewrite.
-- Each RPC is a single PostgreSQL transaction. Keep existing RLS in force.
-- The caller must have owner-scoped SELECT and column-level INSERT rights.
create function public.save_profile_snapshot(
  p_profile_id uuid,
  p_expected_revision integer,
  p_choices jsonb,
  p_downloads jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $rpc$
declare
  v_owner uuid := (select auth.uid());
  v_profile_owner uuid;
  v_current integer;
  v_next integer;
  v_item jsonb;
  v_id_text text;
  v_mod_id uuid;
  v_workshop_id text;
  v_enabled boolean;
  v_mod_ids uuid[] := array[]::uuid[];
  v_flags boolean[] := array[]::boolean[];
  v_workshops text[] := array[]::text[];
  v_index integer;
begin
  -- Reject unapproved accounts, even when called through PostgREST directly.
  if v_owner is null or not (select public.is_authorized_user()) then
    raise exception 'PZ_DENIED' using errcode = '42501';
  end if;
  if p_profile_id is null or p_expected_revision is null or p_expected_revision < 0
     or p_choices is null or pg_catalog.jsonb_typeof(p_choices) <> 'array'
     or p_downloads is null or pg_catalog.jsonb_typeof(p_downloads) <> 'array'
     or pg_catalog.jsonb_array_length(p_choices) > 500
     or pg_catalog.jsonb_array_length(p_downloads) > 500 then
    raise exception 'PZ_INVALID_INPUT' using errcode = 'PZ002';
  end if;

  -- This is an existing profile; creation stays on its separate owner-RLS path.
  select p.owner_id into v_profile_owner from public.profiles as p
    where p.id = p_profile_id and p.owner_id = v_owner;
  if v_profile_owner is null then
    raise exception 'PZ_DENIED' using errcode = '42501';
  end if;

  -- Serialize saves of the same profile, including 0->1. No profiles UPDATE
  -- privilege is needed and the advisory lock lives only for this transaction.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_profile_id::text, 4291));

  select coalesce(max(r.revision), 0) into v_current
    from public.profile_revision as r
    where r.profile_id = p_profile_id and r.owner_id = v_owner;
  if v_current <> p_expected_revision then
    raise exception 'PZ_STALE_PROFILE' using errcode = 'PZ001';
  end if;
  if v_current = 2147483647 then
    raise exception 'PZ_REVISION_LIMIT' using errcode = 'PZ002';
  end if;
  v_next := v_current + 1;

  -- Validate the whole incoming list before creating the new revision.
  -- The order is only the array position; client-supplied load_order is refused.
  for v_item in select value from pg_catalog.jsonb_array_elements(p_choices) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or (v_item - 'mod_id_entry_id' - 'enabled') <> '{}'::jsonb
       or pg_catalog.jsonb_typeof(v_item -> 'mod_id_entry_id') <> 'string'
       or pg_catalog.jsonb_typeof(v_item -> 'enabled') <> 'boolean' then
      raise exception 'PZ_INVALID_CHOICE' using errcode = 'PZ002';
    end if;
    v_id_text := v_item ->> 'mod_id_entry_id';
    if v_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'PZ_INVALID_MOD_UUID' using errcode = 'PZ002';
    end if;
    v_mod_id := v_id_text::uuid;
    if v_mod_id = any(v_mod_ids) then
      raise exception 'PZ_DUPLICATE_MOD' using errcode = 'PZ002';
    end if;
    -- RLS on mods and mod_ids is still active (SECURITY INVOKER).
    if not exists (
      select 1 from public.mod_ids as mi
      join public.mods as m on m.id = mi.mod_id
      where mi.id = v_mod_id and m.owner_id = v_owner
    ) then
      raise exception 'PZ_UNKNOWN_MOD' using errcode = 'PZ003';
    end if;
    v_enabled := (v_item ->> 'enabled')::boolean;
    v_mod_ids := pg_catalog.array_append(v_mod_ids, v_mod_id);
    v_flags := pg_catalog.array_append(v_flags, v_enabled);
  end loop;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_downloads) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'string' then
      raise exception 'PZ_INVALID_DOWNLOAD' using errcode = 'PZ002';
    end if;
    v_workshop_id := v_item #>> '{}';
    if v_workshop_id !~ '^[1-9][0-9]{4,19}$'
       or (pg_catalog.length(v_workshop_id) = 20
           and v_workshop_id > '18446744073709551615') then
      raise exception 'PZ_INVALID_WORKSHOP' using errcode = 'PZ002';
    end if;
    if v_workshop_id = any(v_workshops) then
      raise exception 'PZ_DUPLICATE_DOWNLOAD' using errcode = 'PZ002';
    end if;
    v_workshops := pg_catalog.array_append(v_workshops, v_workshop_id);
  end loop;

  -- All three tables append a complete snapshot in this one RPC transaction.
  -- No UPDATE or DELETE of old revisions, legacy profile_mods, mods, or mod_ids.
  insert into public.profile_revision(profile_id, revision, owner_id)
    values (p_profile_id, v_next, v_owner);

  for v_index in 1..pg_catalog.cardinality(v_mod_ids) loop
    insert into public.profile_mod_choices (
      profile_id, revision, owner_id, mod_id_entry_id, enabled, load_order
    ) values (p_profile_id, v_next, v_owner, v_mod_ids[v_index], v_flags[v_index], v_index - 1);
  end loop;

  for v_index in 1..pg_catalog.cardinality(v_workshops) loop
    insert into public.profile_downloads (
      profile_id, revision, owner_id, workshop_id, load_order
    ) values (p_profile_id, v_next, v_owner, v_workshops[v_index], v_index - 1);
  end loop;

  return v_next;
end;
$rpc$;

-- By default functions may be executable by PUBLIC or anon; deny both.
revoke all on function public.save_profile_snapshot(uuid, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_profile_snapshot(uuid, integer, jsonb, jsonb)
  to authenticated;
