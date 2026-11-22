-- REPEATABLE, TEST-ONLY integration fixture.
-- Target: Supabase smofdbjgcgdmscamknpw. Run the ENTIRE file as ONE
-- execute_sql call. All synthetic rows are scoped to this transaction.
-- DO NOT remove ROLLBACK. This is not a migration/production seed.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
                  (SELECT user_id::text FROM public.authorized_users LIMIT 1), true);
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  current_owner uuid := auth.uid();
  subject_parent uuid;
  target_parent uuid;
  subject_game_id uuid;
  target_game_id uuid;
  approved_research uuid;
  profile_uuid uuid;
  relation_uuid uuid;
  selected_count integer;
  visible_count integer;
  approved_count integer;
  original_date date := DATE '2026-11-20';
  evidence_url text := 'https://example.test/fictional-test-proof';
BEGIN
  IF current_owner IS NULL OR NOT public.is_authorized_user() THEN
    RAISE EXCEPTION 'Test-only authorized account missing; no fixture saved';
  END IF;

  INSERT INTO public.mods(owner_id,workshop_id,title,source_url,researched_at)
  VALUES (current_owner, '9000099811', 'FICTIONAL_ROLLBACK_SOURCE',
          'https://steamcommunity.com/sharedfiles/filedetails/?id=9000099811',
          original_date)
  RETURNING id INTO subject_parent;
  INSERT INTO public.mods(owner_id,workshop_id,title,source_url,researched_at)
  VALUES (current_owner, '9000099812', 'FICTIONAL_ROLLBACK_TARGET',
          'https://steamcommunity.com/sharedfiles/filedetails/?id=9000099812',
          original_date)
  RETURNING id INTO target_parent;

  INSERT INTO public.mod_ids(mod_id,value)
  VALUES (subject_parent,'DemoMain')
  RETURNING id INTO subject_game_id;
  INSERT INTO public.mod_ids(mod_id,value)
  VALUES (target_parent,'DemoPatch')
  RETURNING id INTO target_game_id;

  INSERT INTO public.research_records(mod_id,raw_payload)
  VALUES (subject_parent, jsonb_build_object(
    'workshopId','9000099811',
    'title','FICTIONAL_ROLLBACK_SOURCE',
    'sourceUrl','https://steamcommunity.com/sharedfiles/filedetails/?id=9000099811',
    'sources',jsonb_build_array(evidence_url),
    'modIds',jsonb_build_array('DemoMain'),
    'checkedAt','2026-11-20',
    'verificationStatus','unverified',
    'buildCompatibility','unverified',
    'multiplayerCompatibility','unverified'
  ))
  RETURNING id INTO approved_research;

  INSERT INTO public.profiles(owner_id,name)
  VALUES (current_owner,'FICTIONAL_ROLLBACK_PROFILE')
  RETURNING id INTO profile_uuid;

  INSERT INTO public.profile_revision(profile_id,revision,owner_id)
  VALUES (profile_uuid,1,current_owner);

  -- Only DemoMain is selected. DemoPatch is a required but unselected
  -- relationship TARGET, and must NEVER be added automatically.
  INSERT INTO public.profile_mod_choices(
    profile_id,revision,owner_id,mod_id_entry_id,enabled,load_order
  ) VALUES (profile_uuid,1,current_owner,subject_game_id,true,0);

  INSERT INTO public.mod_relations(
    owner_id,kind,subject_mod_id_entry_id,target_mod_id_entry_id,
    research_record_id,evidence_url,checked_at
  ) VALUES (
    current_owner,'requires',subject_game_id,target_game_id,
    approved_research,evidence_url,original_date
  )
  RETURNING id INTO relation_uuid;

  -- Draft must not be pre-approved (default false).
  SELECT count(*) INTO approved_count FROM public.mod_relations
    WHERE id=relation_uuid AND approved;
  IF approved_count <> 0 THEN
    RAISE EXCEPTION 'Draft was unexpectedly approved';
  END IF;

  -- Explicit owner approval updates ONLY the designated columns.
  UPDATE public.mod_relations
  SET approved=true, approved_at=now()
  WHERE id=relation_uuid AND owner_id=current_owner AND approved=false;
  GET DIAGNOSTICS approved_count = ROW_COUNT;
  IF approved_count <> 1 THEN RAISE EXCEPTION 'Approved update failed'; END IF;

  -- Selected-subject, owner-scoped relation is discoverable.
  SELECT count(*) INTO visible_count
  FROM public.mod_relations r
  WHERE r.owner_id=current_owner AND r.approved
    AND r.subject_mod_id_entry_id IN (
      SELECT c.mod_id_entry_id FROM public.profile_mod_choices c
      WHERE c.owner_id=current_owner AND c.profile_id=profile_uuid AND c.revision=1
    );
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'Approved relation not visible under RLS';
  END IF;

  SELECT count(*) INTO selected_count FROM public.profile_mod_choices c
  WHERE c.profile_id=profile_uuid AND c.owner_id=current_owner
    AND c.mod_id_entry_id=target_game_id;
  IF selected_count <> 0 THEN
    RAISE EXCEPTION 'Unselected required target was auto-added';
  END IF;

  SELECT count(*) INTO visible_count FROM public.mod_ids mi
  JOIN public.mods m ON m.id=mi.mod_id
  WHERE mi.id=target_game_id AND m.owner_id=current_owner;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'Required unselected catalog target cannot be resolved';
  END IF;

  -- Exact same owner-approved relation row is available for the v3
  -- JSON-export query. The v3 JSON itself is separately unit-tested.
  SELECT count(*) INTO visible_count FROM public.mod_relations r
  WHERE r.owner_id=current_owner AND r.id=relation_uuid
    AND r.approved AND r.approved_at IS NOT NULL;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'Approved relation cannot be read for export';
  END IF;

  -- The same owner-only record must be invisible after changing JWT
  -- to an unrelated authenticated user. No mutation is committed.
  PERFORM set_config('request.jwt.claim.sub',
                     '88888888-8888-4888-8888-888888888888', true);
  SELECT count(*) INTO visible_count FROM public.mod_relations;
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'Cross-owner relation leakage';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',current_owner::text,true);
END $test$;

SELECT 'RLS_DRAFT_APPROVAL_PROFILE_EXPORT_ROLLBACK_OK' AS result;
ROLLBACK;
