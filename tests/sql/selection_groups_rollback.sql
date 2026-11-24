-- Selection group verification (nonpersistent, test DB ONLY).
-- Project: smofdbjgcgdmscamknpw. Run as ONE SQL call, including ROLLBACK.
-- Apply 20261124000100_test_selection_groups.sql before running.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
  (SELECT user_id::text FROM public.authorized_users LIMIT 1), true);
SET LOCAL ROLE authenticated;

DO $verify$
DECLARE
  fixture_owner uuid := auth.uid();
  mod_a uuid;
  id_a1 uuid;
  id_a2 uuid;
  id_a3 uuid;
  grp uuid;
BEGIN
  IF fixture_owner IS NULL OR NOT public.is_authorized_user() THEN
    RAISE EXCEPTION 'Authorized test session unavailable';
  END IF;

  INSERT INTO public.mods (owner_id, workshop_id, title, description, source_url)
  VALUES (fixture_owner, '9000099971', 'FICTIONAL_GROUP_MOD', 'TEST ONLY', 'https://example.test/group')
  RETURNING id INTO mod_a;
  INSERT INTO public.mod_ids (mod_id, value) VALUES (mod_a, 'FICTIONAL_G1') RETURNING id INTO id_a1;
  INSERT INTO public.mod_ids (mod_id, value) VALUES (mod_a, 'FICTIONAL_G2') RETURNING id INTO id_a2;
  INSERT INTO public.mod_ids (mod_id, value) VALUES (mod_a, 'FICTIONAL_G3') RETURNING id INTO id_a3;

  -- Default free selection: min/max NULL.
  grp := public.save_selection_group(NULL, 'FICTIONAL_FREE_GROUP', NULL, NULL, ARRAY[id_a1, id_a2]);
  IF (SELECT min_selected IS NOT NULL OR max_selected IS NOT NULL OR verified
      FROM public.selection_groups WHERE id = grp) THEN
    RAISE EXCEPTION 'Default group is not free selection / unverified';
  END IF;
  IF (SELECT count(*) FROM public.selection_group_members WHERE group_id = grp) <> 2 THEN
    RAISE EXCEPTION 'Members not stored';
  END IF;

  -- Update replaces members atomically and allows an explicit exclusive rule (max 1).
  PERFORM public.save_selection_group(grp, 'FICTIONAL_FREE_GROUP', NULL, 1, ARRAY[id_a2, id_a3]);
  IF (SELECT array_agg(mod_id_ref ORDER BY mod_id_ref) FROM public.selection_group_members WHERE group_id = grp)
     <> (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[id_a2, id_a3]) x) THEN
    RAISE EXCEPTION 'Members not replaced';
  END IF;

  -- max > member count rejected.
  BEGIN
    PERFORM public.save_selection_group(NULL, 'FICTIONAL_BAD_MAX', NULL, 3, ARRAY[id_a1, id_a2]);
    RAISE EXCEPTION 'Invalid max accepted';
  EXCEPTION WHEN SQLSTATE 'PZ002' THEN NULL;
  END;
  -- Duplicate member rejected.
  BEGIN
    PERFORM public.save_selection_group(NULL, 'FICTIONAL_DUP', NULL, NULL, ARRAY[id_a1, id_a1]);
    RAISE EXCEPTION 'Duplicate member accepted';
  EXCEPTION WHEN SQLSTATE 'PZ002' THEN NULL;
  END;
  -- Unknown Mod ID row rejected.
  BEGIN
    PERFORM public.save_selection_group(NULL, 'FICTIONAL_UNKNOWN', NULL, NULL,
      ARRAY['00000000-0000-4000-8000-000000000099'::uuid]);
    RAISE EXCEPTION 'Unknown Mod ID accepted';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
  -- min > max rejected by table check.
  BEGIN
    PERFORM public.save_selection_group(NULL, 'FICTIONAL_MINMAX', 2, 1, ARRAY[id_a1, id_a2]);
    RAISE EXCEPTION 'min > max accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Delete cascades members.
  DELETE FROM public.selection_groups WHERE id = grp;
  IF EXISTS (SELECT 1 FROM public.selection_group_members WHERE group_id = grp) THEN
    RAISE EXCEPTION 'Members not cascaded on delete';
  END IF;
END $verify$;

ROLLBACK;
