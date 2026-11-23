-- Zero-category (unclassified) clearing verification (nonpersistent, test DB ONLY).
-- Project: smofdbjgcgdmscamknpw. Run as ONE SQL call, including ROLLBACK.
-- Apply 20261123000100_test_mod_categories_allow_unclassified.sql before running.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
  (SELECT user_id::text FROM public.authorized_users LIMIT 1), true);
SET LOCAL ROLE authenticated;

DO $verify$
DECLARE
  fixture_owner uuid := auth.uid();
  fixture_mod uuid;
  cat_ui uuid;
  cat_clothing uuid;
BEGIN
  IF fixture_owner IS NULL OR NOT public.is_authorized_user() THEN
    RAISE EXCEPTION 'Authorized test session unavailable';
  END IF;

  INSERT INTO public.mods (owner_id, workshop_id, title, description, source_url)
  VALUES (fixture_owner, '9000099958', 'FICTIONAL_UNCLASSIFIED_CLEAR_TEST',
    'FICTIONAL TEST ONLY.', 'https://example.test/fictional-unclassified-clear')
  RETURNING id INTO fixture_mod;

  INSERT INTO public.categories (owner_id, name, sort_order)
  VALUES (fixture_owner, 'FICTIONAL_CLEAR_UI', 10) RETURNING id INTO cat_ui;
  INSERT INTO public.categories (owner_id, name, sort_order)
  VALUES (fixture_owner, 'FICTIONAL_CLEAR_CLOTHING', 20) RETURNING id INTO cat_clothing;

  -- 1) Assign 2 categories with 1 primary.
  PERFORM public.save_mod_categories(fixture_mod, ARRAY[cat_ui, cat_clothing], cat_clothing);
  IF (SELECT count(*) FROM public.mod_categories WHERE mod_id = fixture_mod) <> 2
    OR (SELECT category_id FROM public.mod_category_primary WHERE mod_id = fixture_mod) <> cat_clothing THEN
    RAISE EXCEPTION 'Initial category assignment failed';
  END IF;

  -- 2) Clear to 0 categories (unclassified, primary = null).
  PERFORM public.save_mod_categories(fixture_mod, ARRAY[]::uuid[], NULL);
  IF EXISTS (SELECT 1 FROM public.mod_categories WHERE mod_id = fixture_mod)
    OR EXISTS (SELECT 1 FROM public.mod_category_primary WHERE mod_id = fixture_mod) THEN
    RAISE EXCEPTION 'Zero-category clearing left stale rows';
  END IF;

  -- 3) Reject empty categories with non-null primary.
  BEGIN
    PERFORM public.save_mod_categories(fixture_mod, ARRAY[]::uuid[], cat_ui);
    RAISE EXCEPTION 'Empty categories with non-null primary was incorrectly accepted';
  EXCEPTION WHEN SQLSTATE 'PZ002' THEN NULL;
  END;

  -- 4) Reject non-empty categories with null primary.
  BEGIN
    PERFORM public.save_mod_categories(fixture_mod, ARRAY[cat_ui], NULL);
    RAISE EXCEPTION 'Non-empty categories with null primary was incorrectly accepted';
  EXCEPTION WHEN SQLSTATE 'PZ002' THEN NULL;
  END;

  -- 5) Re-assign after clearing works cleanly.
  PERFORM public.save_mod_categories(fixture_mod, ARRAY[cat_ui], cat_ui);
  IF (SELECT count(*) FROM public.mod_categories WHERE mod_id = fixture_mod) <> 1
    OR (SELECT category_id FROM public.mod_category_primary WHERE mod_id = fixture_mod) <> cat_ui THEN
    RAISE EXCEPTION 'Re-assignment after clearing failed';
  END IF;
END $verify$;

ROLLBACK;
