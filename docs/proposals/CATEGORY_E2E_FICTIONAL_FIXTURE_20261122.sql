-- ISOLATED TEST DB ONLY: smofdbjgcgdmscamknpw
-- This file creates exactly one fictional mod and two fictional categories.
-- NEVER run against production, and never rerun after success.
-- Current approved scope: user explicitly proceeded after being told about
-- test fixture creation, temporary Preview write, and exact fixture cleanup.
BEGIN;
DO $preflight$
BEGIN
 IF (SELECT count(*) FROM public.authorized_users)<>1 OR
    (SELECT count(*) FROM auth.users u JOIN public.authorized_users a ON a.user_id=u.id)<>1 THEN
   RAISE EXCEPTION 'Exactly one valid test account required';
 END IF;
 IF (SELECT count(*) FROM public.mods)<>0
 OR (SELECT count(*) FROM public.categories)<>0
 OR (SELECT count(*) FROM public.mod_categories)<>0
 OR (SELECT count(*) FROM public.mod_category_primary)<>0 THEN
   RAISE EXCEPTION 'Existing catalog/category data detected; abort without changes';
 END IF;
END $preflight$;
SELECT set_config('request.jwt.claim.sub',
  (SELECT user_id::text FROM public.authorized_users LIMIT 1), true);
SET LOCAL ROLE authenticated;
DO $insert$
DECLARE
 owner uuid := auth.uid();
 fictional_mod uuid;
 cat_clothing uuid;
 cat_ui uuid;
BEGIN
 IF owner IS NULL OR NOT public.is_authorized_user() THEN
   RAISE EXCEPTION 'Authenticated test owner required';
 END IF;
 INSERT INTO public.mods(owner_id,workshop_id,title,description,source_url)
 VALUES(owner,'9000099943','FICTIONAL_E2E_CATEGORY_MOD_20261122',
   'FICTIONAL TEST ONLY. Not real Steam content or a B42.22 compatibility claim.',
   'https://example.test/fictional-category-e2e')
 RETURNING id INTO fictional_mod;
 INSERT INTO public.categories(owner_id,name,sort_order)
 VALUES(owner,'FICTIONAL_E2E_의상_20261122',10)
 RETURNING id INTO cat_clothing;
 INSERT INTO public.categories(owner_id,name,sort_order)
 VALUES(owner,'FICTIONAL_E2E_UI_20261122',20)
 RETURNING id INTO cat_ui;
 IF NOT EXISTS(SELECT 1 FROM public.mods WHERE id=fictional_mod AND owner_id=owner)
 OR NOT EXISTS(SELECT 1 FROM public.categories WHERE id=cat_clothing AND owner_id=owner)
 OR NOT EXISTS(SELECT 1 FROM public.categories WHERE id=cat_ui AND owner_id=owner)
 THEN RAISE EXCEPTION 'Test rows not readable under authenticated RLS'; END IF;
 -- Deliberately leave the mod unclassified; the mobile UI must save it.
 IF EXISTS (SELECT 1 FROM public.mod_categories WHERE mod_id=fictional_mod)
 OR EXISTS (SELECT 1 FROM public.mod_category_primary WHERE mod_id=fictional_mod)
 THEN RAISE EXCEPTION 'Unexpected category assignment'; END IF;
END $insert$;
COMMIT;
SELECT (SELECT count(*) FROM public.mods) mods,
 (SELECT count(*) FROM public.categories) categories,
 (SELECT count(*) FROM public.mod_categories) memberships,
 (SELECT count(*) FROM public.mod_category_primary) primaries,
 (SELECT count(*) FROM public.research_queue) preserved_queue,
 'FICTIONAL_CATEGORY_FIXTURE_CREATED' result;
