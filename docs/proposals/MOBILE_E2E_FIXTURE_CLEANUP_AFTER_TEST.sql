-- NOT EXECUTED: user-approved cleanup AFTER MOBILE E2E is complete.
-- Test Supabase ONLY: smofdbjgcgdmscamknpw.
-- Every test record must match the original FICTIONAL fixture exactly.
-- No broad deletion, wildcard ID, user account deletion or production access.
-- Run only after disabling the isolated Preview write flag.
BEGIN;
DO $cleanup$
DECLARE
  fixture_owner uuid;
  subject_parent uuid;
  target_parent uuid;
  subject_game uuid;
  target_game uuid;
  research_row uuid;
  fixture_profile uuid;
  n integer;
BEGIN
  SELECT id, owner_id INTO STRICT subject_parent, fixture_owner
  FROM public.mods
  WHERE workshop_id='9000099811'
    AND title='FICTIONAL_E2E_SOURCE'
    AND source_url='https://steamcommunity.com/sharedfiles/filedetails/?id=9000099811'
    AND verification_status='unverified'
    AND build_compatibility='unverified'
    AND multiplayer_compatibility='unverified';

  SELECT id INTO STRICT target_parent
  FROM public.mods
  WHERE workshop_id='9000099812'
    AND owner_id=fixture_owner
    AND title='FICTIONAL_E2E_TARGET'
    AND source_url='https://steamcommunity.com/sharedfiles/filedetails/?id=9000099812'
    AND verification_status='unverified'
    AND build_compatibility='unverified'
    AND multiplayer_compatibility='unverified';

  IF (SELECT count(*) FROM public.mods WHERE owner_id=fixture_owner
    AND workshop_id IN ('9000099811','9000099812'))<>2 THEN
    RAISE EXCEPTION 'Unexpected fixture Workshop count: abort';
  END IF;

  IF (SELECT count(*) FROM public.mod_ids WHERE mod_id IN
      (subject_parent,target_parent))<>2 THEN
    RAISE EXCEPTION 'Unexpected fixture game Mod ID count: abort';
  END IF;
  SELECT id INTO STRICT subject_game FROM public.mod_ids
    WHERE mod_id=subject_parent AND value='DemoMain';
  SELECT id INTO STRICT target_game FROM public.mod_ids
    WHERE mod_id=target_parent AND value='DemoPatch';

  IF (SELECT count(*) FROM public.research_records WHERE mod_id IN
      (subject_parent,target_parent))<>1 THEN
    RAISE EXCEPTION 'Unexpected fixture research records: abort';
  END IF;
  SELECT id INTO STRICT research_row FROM public.research_records
    WHERE mod_id=subject_parent
      AND raw_payload->>'workshopId'='9000099811'
      AND raw_payload->>'checkedAt'='2026-11-22'
      AND raw_payload->>'verificationStatus'='unverified'
      AND raw_payload->>'buildCompatibility'='unverified'
      AND raw_payload->>'multiplayerCompatibility'='unverified'
      AND raw_payload->'sources' @> '["https://example.test/fictional-test-proof"]'::jsonb
      AND raw_payload->'modIds' @> '["DemoMain"]'::jsonb;

  SELECT id INTO STRICT fixture_profile FROM public.profiles
  WHERE owner_id=fixture_owner AND name='E2E_TEST_ONLY_RELATIONS';

  IF (SELECT count(*) FROM public.profile_revision
      WHERE profile_id=fixture_profile)<>1
      OR NOT EXISTS (SELECT 1 FROM public.profile_revision
        WHERE profile_id=fixture_profile AND revision=1 AND owner_id=fixture_owner)
      OR EXISTS (SELECT 1 FROM public.profile_downloads
        WHERE profile_id=fixture_profile)
      OR EXISTS (SELECT 1 FROM public.profile_mods
        WHERE profile_id=fixture_profile)
      OR EXISTS (SELECT 1 FROM public.profile_mods
        WHERE mod_id IN (subject_parent,target_parent))
  THEN RAISE EXCEPTION 'Fixture profile changed unexpectedly: abort'; END IF;

  IF (SELECT count(*) FROM public.profile_mod_choices
      WHERE profile_id=fixture_profile
      OR mod_id_entry_id IN (subject_game,target_game))<>1
      OR NOT EXISTS (SELECT 1 FROM public.profile_mod_choices
        WHERE profile_id=fixture_profile AND revision=1
        AND owner_id=fixture_owner
        AND mod_id_entry_id=subject_game AND enabled=true AND load_order=0)
  THEN RAISE EXCEPTION 'Unexpected profile choice data: abort'; END IF;

  -- The browser may have created exactly one draft/approved requires row.
  -- A different relationship, additional source, or a second relation aborts.
  SELECT count(*) INTO n FROM public.mod_relations
    WHERE subject_mod_id_entry_id IN (subject_game,target_game)
       OR target_mod_id_entry_id IN (subject_game,target_game)
       OR research_record_id=research_row;
  IF n>1 OR EXISTS (
    SELECT 1 FROM public.mod_relations
    WHERE (subject_mod_id_entry_id IN (subject_game,target_game)
       OR target_mod_id_entry_id IN (subject_game,target_game)
       OR research_record_id=research_row)
      AND NOT (
        owner_id=fixture_owner AND kind='requires'
        AND subject_mod_id_entry_id=subject_game
        AND target_mod_id_entry_id=target_game
        AND research_record_id=research_row
        AND evidence_url='https://example.test/fictional-test-proof'
        AND checked_at=DATE '2026-11-22'
      )
  ) THEN RAISE EXCEPTION 'Unexpected relationship references: abort'; END IF;

  DELETE FROM public.mod_relations
  WHERE owner_id=fixture_owner AND kind='requires'
    AND subject_mod_id_entry_id=subject_game
    AND target_mod_id_entry_id=target_game
    AND research_record_id=research_row
    AND evidence_url='https://example.test/fictional-test-proof'
    AND checked_at=DATE '2026-11-22';

  DELETE FROM public.profile_mod_choices
  WHERE profile_id=fixture_profile AND revision=1
    AND owner_id=fixture_owner AND mod_id_entry_id=subject_game
    AND enabled=true AND load_order=0;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Could not delete sole fixture choice'; END IF;

  DELETE FROM public.profile_revision
  WHERE profile_id=fixture_profile AND revision=1 AND owner_id=fixture_owner;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Could not delete fixture revision'; END IF;

  DELETE FROM public.profiles
  WHERE id=fixture_profile AND owner_id=fixture_owner
    AND name='E2E_TEST_ONLY_RELATIONS';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Could not delete fixture profile'; END IF;

  DELETE FROM public.research_records
  WHERE id=research_row AND mod_id=subject_parent;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Could not delete fixture evidence'; END IF;

  DELETE FROM public.mod_ids
  WHERE id IN (subject_game,target_game)
    AND mod_id IN (subject_parent,target_parent);
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>2 THEN RAISE EXCEPTION 'Could not delete both fixture Mod IDs'; END IF;

  DELETE FROM public.mods
  WHERE owner_id=fixture_owner
    AND id IN (subject_parent,target_parent)
    AND workshop_id IN ('9000099811','9000099812')
    AND title IN ('FICTIONAL_E2E_SOURCE','FICTIONAL_E2E_TARGET');
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>2 THEN RAISE EXCEPTION 'Could not delete both fixture Workshops'; END IF;
END $cleanup$;
COMMIT;
