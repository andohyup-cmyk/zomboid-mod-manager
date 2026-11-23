-- V4 backup category integration (nonpersistent, test DB ONLY).
-- Project: smofdbjgcgdmscamknpw. Run as ONE SQL call, including ROLLBACK.
-- Do not use Production, remove ROLLBACK, or leave fixture rows committed.
BEGIN;
DO $preflight$
BEGIN
  IF (SELECT count(*) FROM public.authorized_users) <> 1
    OR (SELECT count(*) FROM auth.users u JOIN public.authorized_users a ON a.user_id=u.id) <> 1
    OR (SELECT count(*) FROM public.mods) <> 0
    OR (SELECT count(*) FROM public.categories) <> 0
    OR (SELECT count(*) FROM public.mod_categories) <> 0
    OR (SELECT count(*) FROM public.mod_category_primary) <> 0 THEN
    RAISE EXCEPTION 'Isolated owner/empty category fixture preflight failed';
  END IF;
END $preflight$;
SELECT set_config('request.jwt.claim.sub',
  (SELECT user_id::text FROM public.authorized_users LIMIT 1), true);
SET LOCAL ROLE authenticated;
DO $verify$
DECLARE
  fixture_owner uuid := auth.uid();
  fixture_mod uuid;
  cat_ui uuid;
  cat_clothing uuid;
  ids uuid[];
  saved_links integer;
  original_queue integer;
  snapshot jsonb;
  payload jsonb;
  mod_rows jsonb;
  category_rows jsonb;
  member_rows jsonb;
  primary_rows jsonb;
  queue_rows jsonb;
  object_key_count integer;
BEGIN
  IF fixture_owner IS NULL OR NOT public.is_authorized_user() THEN
    RAISE EXCEPTION 'Authorized test session unavailable';
  END IF;
  SELECT count(*) INTO original_queue FROM public.research_queue WHERE owner_id=fixture_owner;
  IF original_queue <> 2 THEN
    RAISE EXCEPTION 'Unexpected existing research queue count';
  END IF;

  INSERT INTO public.mods (owner_id,workshop_id,title,description,source_url)
  VALUES (fixture_owner,'9000099957','FICTIONAL_V4_BACKUP_ROLLBACK',
    'FICTIONAL TEST ONLY. No Steam or B42.22 compatibility claim.',
    'https://example.test/fictional-backup-v4')
  RETURNING id INTO fixture_mod;
  INSERT INTO public.categories (owner_id,name,sort_order)
  VALUES (fixture_owner,'FICTIONAL_V4_UI',10) RETURNING id INTO cat_ui;
  INSERT INTO public.categories (owner_id,name,sort_order)
  VALUES (fixture_owner,'FICTIONAL_V4_CLOTHING',20) RETURNING id INTO cat_clothing;

  -- A pre-existing unclassified mod is a legitimate v4 export state.
  IF EXISTS (SELECT 1 FROM public.mod_categories WHERE mod_id=fixture_mod)
    OR EXISTS (SELECT 1 FROM public.mod_category_primary WHERE mod_id=fixture_mod) THEN
    RAISE EXCEPTION 'Unclassified mod was unexpectedly assigned';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.sort_order,c.id),'[]'::jsonb)
    INTO category_rows FROM public.categories c WHERE c.owner_id=fixture_owner;
  IF jsonb_array_length(category_rows)<>2 THEN
    RAISE EXCEPTION 'RLS category definitions read failed';
  END IF;

  -- The same owner-scoped RPC used by the browser's POST endpoint.
  PERFORM public.save_mod_categories(fixture_mod,ARRAY[cat_ui,cat_clothing],cat_clothing);
  SELECT count(*) INTO saved_links FROM public.mod_categories
    WHERE mod_id=fixture_mod AND owner_id=fixture_owner;
  IF saved_links<>2 OR
    (SELECT count(*) FROM public.mod_category_primary
     WHERE mod_id=fixture_mod AND owner_id=fixture_owner
       AND category_id=cat_clothing)<>1 THEN
    RAISE EXCEPTION 'Two memberships and single member primary were not saved';
  END IF;

  -- Reject malformed assignments without changing the last valid state.
  BEGIN
    PERFORM public.save_mod_categories(fixture_mod,ARRAY[cat_ui,cat_ui],cat_ui);
    RAISE EXCEPTION 'Duplicate member was incorrectly accepted';
  EXCEPTION WHEN SQLSTATE 'PZ002' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_mod_categories(fixture_mod,ARRAY[cat_ui],cat_clothing);
    RAISE EXCEPTION 'Nonmember primary was incorrectly accepted';
  EXCEPTION WHEN SQLSTATE 'PZ002' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_mod_categories(fixture_mod,ARRAY[]::uuid[],cat_ui);
    RAISE EXCEPTION 'Unapproved zero-category clearing was accepted';
  EXCEPTION WHEN SQLSTATE 'PZ002' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_mod_categories(fixture_mod,
      ARRAY['00000000-0000-4000-8000-000000000098'::uuid], 
      '00000000-0000-4000-8000-000000000098'::uuid);
    RAISE EXCEPTION 'Foreign or missing category was accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  -- Mirror v4's three actual, authenticated, owner-scoped table reads.
  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]'::jsonb)
    INTO mod_rows FROM public.mods m WHERE m.owner_id=fixture_owner;
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.sort_order,c.id),'[]'::jsonb)
    INTO category_rows FROM public.categories c WHERE c.owner_id=fixture_owner;
  SELECT coalesce(jsonb_agg(to_jsonb(mc) ORDER BY mc.mod_id,mc.category_id),'[]'::jsonb)
    INTO member_rows FROM public.mod_categories mc WHERE mc.owner_id=fixture_owner;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.mod_id),'[]'::jsonb)
    INTO primary_rows FROM public.mod_category_primary p WHERE p.owner_id=fixture_owner;
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id),'[]'::jsonb)
    INTO queue_rows FROM public.research_queue q WHERE q.owner_id=fixture_owner;

  -- Test DB starts with no profiles, relations, Mod IDs or research records.
  -- Those ten areas are empty, except for the preserved research queue.
  payload := jsonb_build_object(
    'mods',mod_rows,
    'modIds','[]'::jsonb,
    'researchRecords','[]'::jsonb,
    'profiles','[]'::jsonb,
    'profileMods','[]'::jsonb,
    'researchQueue',queue_rows,
    'profileRevisions','[]'::jsonb,
    'profileModChoices','[]'::jsonb,
    'profileDownloads','[]'::jsonb,
    'modRelations','[]'::jsonb,
    'categories',category_rows,
    'modCategories',member_rows,
    'modCategoryPrimary',primary_rows
  );
  snapshot := jsonb_build_object(
    'schemaVersion',4,
    'exportedAt',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'scope','authorized-user-catalog-and-profiles',
    'complete',true,
    'warnings','[]'::jsonb,
    'data',payload
  );
  SELECT count(*) INTO object_key_count FROM jsonb_object_keys(payload);
  IF object_key_count<>13
    OR (snapshot->>'schemaVersion')::integer<>4
    OR snapshot->>'scope'<>'authorized-user-catalog-and-profiles'
    OR jsonb_array_length(payload->'mods')<>1
    OR jsonb_array_length(payload->'categories')<>2
    OR jsonb_array_length(payload->'modCategories')<>2
    OR jsonb_array_length(payload->'modCategoryPrimary')<>1
    OR jsonb_array_length(payload->'researchQueue')<>original_queue
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(payload->'modCategories') mc
      WHERE mc->>'owner_id'<>fixture_owner::text
        OR mc->>'mod_id'<>fixture_mod::text
        OR mc->>'category_id' NOT IN (cat_ui::text,cat_clothing::text)
    )
    OR (payload->'modCategoryPrimary'->0->>'category_id')<>cat_clothing::text
  THEN
    RAISE EXCEPTION 'V4 JSON categories / reference / completeness check failed';
  END IF;

  -- A different, nonapproved JWT cannot see the same committed-in-transaction rows.
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000099',true);
  IF public.is_authorized_user()
    OR EXISTS(SELECT 1 FROM public.mods WHERE id=fixture_mod)
    OR EXISTS(SELECT 1 FROM public.categories WHERE id IN (cat_ui,cat_clothing))
    OR EXISTS(SELECT 1 FROM public.mod_categories WHERE mod_id=fixture_mod)
    OR EXISTS(SELECT 1 FROM public.mod_category_primary WHERE mod_id=fixture_mod)
  THEN
    RAISE EXCEPTION 'Foreign user can read v4 category snapshot source';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',fixture_owner::text,true);
  IF (SELECT count(*) FROM public.research_queue WHERE owner_id=fixture_owner)<>original_queue THEN
    RAISE EXCEPTION 'Original queue was unexpectedly modified';
  END IF;
END $verify$;
ROLLBACK;
SELECT 
  (SELECT count(*) FROM public.mods) AS mods,
  (SELECT count(*) FROM public.categories) AS categories,
  (SELECT count(*) FROM public.mod_categories) AS mod_categories,
  (SELECT count(*) FROM public.mod_category_primary) AS mod_category_primary,
  (SELECT count(*) FROM public.research_queue) AS preserved_queue,
  'V4_CATEGORY_DB_RLS_ROLLBACK_PASS' AS result;
