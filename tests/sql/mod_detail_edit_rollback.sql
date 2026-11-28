-- Single-transaction rollback verification for 20261124000200_test_mod_detail_edit_and_mod_ids.sql.
-- Run in Supabase SQL Editor on test DB only. Always rolls back at the end.

begin;

do $$
declare
  v_owner uuid;
  v_mod_id uuid;
  v_entry_id uuid;
  v_build text;
  v_blocked boolean := false;
begin
  select user_id into v_owner from public.authorized_users limit 1;
  if v_owner is null then
    raise exception 'No authorized_users row found';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  insert into public.mods (owner_id, workshop_id, title, source_url)
  values (v_owner, '9999999998', 'Rollback Test Mod', 'https://steamcommunity.com/sharedfiles/filedetails/?id=9999999998')
  returning id into v_mod_id;

  insert into public.mod_ids (mod_id, value)
  values (v_mod_id, 'RollbackTestModId')
  returning id into v_entry_id;

  update public.mods
  set build_compatibility = 'confirmed',
      multiplayer_compatibility = 'reported_issue',
      verification_status = 'confirmed',
      researched_at = '2026-11-24',
      description = 'rollback test memo',
      updated_at = now()
  where id = v_mod_id;

  select build_compatibility into v_build from public.mods where id = v_mod_id;
  if v_build <> 'confirmed' then
    raise exception 'Expected build_compatibility = confirmed, got %', v_build;
  end if;

  begin
    update public.mods set workshop_id = '9999999997' where id = v_mod_id;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Expected workshop_id update to be blocked by column grant';
  end if;

  delete from public.mod_ids where id = v_entry_id and mod_id = v_mod_id;
  if exists (select 1 from public.mod_ids where id = v_entry_id) then
    raise exception 'Expected mod_ids row to be deleted';
  end if;

  raise notice 'MOD_DETAIL_EDIT_ROLLBACK_OK';
end;
$$;

rollback;
