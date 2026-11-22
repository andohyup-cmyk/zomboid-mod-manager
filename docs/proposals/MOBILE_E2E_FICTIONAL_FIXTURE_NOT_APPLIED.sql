-- NOT APPLIED. REQUIRES NEW EXPLICIT USER APPROVAL.
-- Project: smofdbjgcgdmscamknpw (isolated test database ONLY)
-- This file creates PERSISTENT fictional fixture records. Do not run until
-- owner authorizes the exact test dataset and cleanup scope.
-- No operation on production DB, existing user rows, or server files.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
  (SELECT user_id::text FROM public.authorized_users LIMIT 1), true);
SET LOCAL ROLE authenticated;

DO $fixture$
DECLARE
  current_owner uuid := auth.uid();
  subject_parent uuid; target_parent uuid;
  subject_game_id uuid; target_game_id uuid;
  profile_id uuid;
  fixture_date date := DATE '2026-11-22';
  fixture_evidence text := 'https://example.test/fictional-test-proof';
BEGIN
  IF current_owner IS NULL OR NOT public.is_authorized_user() THEN
    RAISE EXCEPTION 'Expected one authorized test account';
  END IF;
  IF (SELECT count(*) FROM public.authorized_users) <> 1 THEN
    RAISE EXCEPTION 'Test account population changed; fixture aborted';
  END IF;

  -- Deliberately reject collisions instead of editing, overwriting or
  -- deleting existing catalog/profile data.
  IF EXISTS (SELECT 1 FROM public.mods
    WHERE owner_id=current_owner AND workshop_id IN ('9000099811','9000099812'))
    OR EXISTS (SELECT 1 FROM public.profiles
    WHERE owner_id=current_owner AND name='E2E_TEST_ONLY_RELATIONS') THEN
    RAISE EXCEPTION 'Fixture identifiers already exist; no overwrite allowed';
  END IF;

  INSERT INTO public.mods(owner_id,workshop_id,title,source_url,researched_at)
  VALUES (current_owner, '9000099811', 'FICTIONAL_E2E_SOURCE',
    'https://steamcommunity.com/sharedfiles/filedetails/?id=9000099811',
    fixture_date)
  RETURNING id INTO subject_parent;

  INSERT INTO public.mods(owner_id,workshop_id,title,source_url,researched_at)
  VALUES (current_owner, '9000099812', 'FICTIONAL_E2E_TARGET',
    'https://steamcommunity.com/sharedfiles/filedetails/?id=9000099812',
    fixture_date)
  RETURNING id INTO target_parent;

  INSERT INTO public.mod_ids(mod_id,value)
  VALUES(subject_parent,'DemoMain') RETURNING id INTO subject_game_id;
  INSERT INTO public.mod_ids(mod_id,value)
  VALUES(target_parent,'DemoPatch') RETURNING id INTO target_game_id;

  -- FICTIONAL technical evidence. No claim of real Steam or B42.22 facts.
  INSERT INTO public.research_records(mod_id,raw_payload)
  VALUES(subject_parent,jsonb_build_object(
    'workshopId','9000099811',
    'title','FICTIONAL_E2E_SOURCE',
    'description','FICTIONAL TEST DATA ONLY; not an actual Steam mod',
    'sourceUrl','https://steamcommunity.com/sharedfiles/filedetails/?id=9000099811',
    'sources',jsonb_build_array(fixture_evidence),
    'modIds',jsonb_build_array('DemoMain'),
    'checkedAt','2026-11-22',
    'verificationStatus','unverified',
    'buildCompatibility','unverified',
    'multiplayerCompatibility','unverified',
    'singleplayerCompatibility','unverified',
    'midServerAdditionCompatibility','unverified'
  ));

  INSERT INTO public.profiles(owner_id,name)
  VALUES(current_owner,'E2E_TEST_ONLY_RELATIONS')
  RETURNING id INTO profile_id;
  INSERT INTO public.profile_revision(profile_id,revision,owner_id)
  VALUES(profile_id,1,current_owner);
  INSERT INTO public.profile_mod_choices(
    profile_id,revision,owner_id,mod_id_entry_id,enabled,load_order
  ) VALUES(profile_id,1,current_owner,subject_game_id,true,0);

  -- NO relation is created here: the mobile diagnostic page must exercise
  -- the normal POST draft and separate POST explicit approval APIs.
END $fixture$;
COMMIT;
