-- Category delete RPC verification (nonpersistent, test DB ONLY).
-- Project: smofdbjgcgdmscamknpw. Run as ONE SQL call, including ROLLBACK.
-- Apply 20261123000200_test_categories_delete_rpc.sql before running.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
  (SELECT user_id::text FROM public.authorized_users LIMIT 1), true);
SET LOCAL ROLE authenticated;

DO $verify$
DECLARE
  fixture_owner uuid := auth.uid();
  mod_multi uuid;
  mod_single uuid;
  cat_a uuid;
  cat_b uuid;
BEGIN
  IF fixture_owner IS NULL OR NOT public.is_authorized_user() THEN
    RAISE EXCEPTION 'Authorized test session unavailable';
  END IF;

  INSERT INTO public.mods (owner_id, workshop_id, title, description, source_url)
  VALUES (fixture_owner, '9000099961', 'FICTIONAL_DEL_MULTI', 'TEST ONLY', 'https://example.test/del-multi')
  RETURNING id INTO mod_multi;
  INSERT INTO public.mods (owner_id, workshop_id, title, description, source_url)
  VALUES (fixture_owner, '9000099962', 'FICTIONAL_DEL_SINGLE', 'TEST ONLY', 'https://example.test/del-single')
  RETURNING id INTO mod_single;

  INSERT INTO public.categories (owner_id, name, sort_order)
  VALUES (fixture_owner, 'FICTIONAL_DEL_A', 10) RETURNING id INTO cat_a;
  INSERT INTO public.categories (owner_id, name, sort_order)
  VALUES (fixture_owner, 'FICTIONAL_DEL_B', 20) RETURNING id INTO cat_b;

  PERFORM public.save_mod_categories(mod_multi, ARRAY[cat_a, cat_b], cat_a);
  PERFORM public.save_mod_categories(mod_single, ARRAY[cat_a], cat_a);

  -- Delete primary category A: mod_multi promotes B, mod_single becomes unclassified (0).
  PERFORM public.delete_category(cat_a);

  IF EXISTS (SELECT 1 FROM public.categories WHERE id = cat_a) THEN
    RAISE EXCEPTION 'Category A was not deleted';
  END IF;
  IF (SELECT category_id FROM public.mod_category_primary WHERE mod_id = mod_multi) <> cat_b THEN
    RAISE EXCEPTION 'Multi-category mod did not promote remaining category B';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mod_categories WHERE mod_id = mod_single)
    OR EXISTS (SELECT 1 FROM public.mod_category_primary WHERE mod_id = mod_single) THEN
    RAISE EXCEPTION 'Single-category mod was not cleared to unclassified';
  END IF;

  -- Unknown category raises P0002.
  BEGIN
    PERFORM public.delete_category('00000000-0000-4000-8000-000000000099'::uuid);
    RAISE EXCEPTION 'Unknown category deletion was incorrectly accepted';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
END $verify$;

ROLLBACK;
