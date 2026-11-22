-- ISOLATED TEST DB ONLY: smofdbjgcgdmscamknpw
-- Execute ONLY after the branch-specific Preview write flag is false.
-- Fail closed if test rows have unexpected references or were renamed.
-- This script NEVER touches research_queue, auth users, or any non-fixture mods.
BEGIN;
DO $cleanup$
DECLARE
 fixture_owner uuid;
 fixture_mod uuid;
 clothing uuid;
 ui_category uuid;
 deleted_count int;
BEGIN
 IF (SELECT count(*) FROM public.authorized_users)<>1 THEN
   RAISE EXCEPTION 'Authorized account count changed, abort';
 END IF;
 SELECT user_id INTO STRICT fixture_owner FROM public.authorized_users;
 SELECT id INTO STRICT fixture_mod FROM public.mods
 WHERE owner_id=fixture_owner AND workshop_id='9000099943'
 AND title='FICTIONAL_E2E_CATEGORY_MOD_20261122'
 AND description='FICTIONAL TEST ONLY. Not real Steam content or a B42.22 compatibility claim.'
 AND source_url='https://example.test/fictional-category-e2e'
 AND verification_status='unverified' AND build_compatibility='unverified'
 AND multiplayer_compatibility='unverified' AND is_archived=false;
 SELECT id INTO STRICT clothing FROM public.categories
 WHERE owner_id=fixture_owner AND name='FICTIONAL_E2E_의상_20261122' AND sort_order=10;
 SELECT id INTO STRICT ui_category FROM public.categories
 WHERE owner_id=fixture_owner AND name='FICTIONAL_E2E_UI_20261122' AND sort_order=20;
 IF (SELECT count(*) FROM public.mods WHERE owner_id=fixture_owner AND workshop_id='9000099943')<>1
 OR (SELECT count(*) FROM public.categories WHERE owner_id=fixture_owner
     AND name IN ('FICTIONAL_E2E_의상_20261122','FICTIONAL_E2E_UI_20261122'))<>2
 THEN RAISE EXCEPTION 'Test fixture identity ambiguous'; END IF;
 IF EXISTS (SELECT 1 FROM public.mod_ids WHERE mod_id=fixture_mod)
 OR EXISTS (SELECT 1 FROM public.research_records WHERE mod_id=fixture_mod)
 OR EXISTS (SELECT 1 FROM public.profile_mods WHERE mod_id=fixture_mod)
 OR EXISTS (SELECT 1 FROM public.mod_categories WHERE category_id IN (clothing,ui_category)
   AND mod_id<>fixture_mod)
 OR EXISTS (SELECT 1 FROM public.mod_category_primary WHERE category_id IN (clothing,ui_category)
   AND mod_id<>fixture_mod)
 THEN RAISE EXCEPTION 'Fixture is referenced by unexpected records'; END IF;
 IF (SELECT count(*) FROM public.mod_categories WHERE mod_id=fixture_mod)>2
 OR EXISTS (SELECT 1 FROM public.mod_categories WHERE mod_id=fixture_mod
   AND (owner_id<>fixture_owner OR category_id NOT IN (clothing,ui_category)))
 OR (SELECT count(*) FROM public.mod_category_primary WHERE mod_id=fixture_mod)>1
 OR EXISTS (SELECT 1 FROM public.mod_category_primary WHERE mod_id=fixture_mod
   AND (owner_id<>fixture_owner OR category_id NOT IN (clothing,ui_category)))
 THEN RAISE EXCEPTION 'Unexpected extra or inconsistent category links'; END IF;
 DELETE FROM public.mod_category_primary
 WHERE owner_id=fixture_owner AND mod_id=fixture_mod
   AND category_id IN (clothing,ui_category);
 DELETE FROM public.mod_categories WHERE owner_id=fixture_owner
   AND mod_id=fixture_mod AND category_id IN (clothing,ui_category);
 DELETE FROM public.categories WHERE owner_id=fixture_owner
   AND id IN (clothing,ui_category);
 GET DIAGNOSTICS deleted_count=ROW_COUNT;
 IF deleted_count<>2 THEN RAISE EXCEPTION 'Category cleanup count mismatch'; END IF;
 DELETE FROM public.mods WHERE id=fixture_mod AND owner_id=fixture_owner
   AND workshop_id='9000099943' AND title='FICTIONAL_E2E_CATEGORY_MOD_20261122';
 GET DIAGNOSTICS deleted_count=ROW_COUNT;
 IF deleted_count<>1 THEN RAISE EXCEPTION 'Mod cleanup count mismatch'; END IF;
END $cleanup$;
COMMIT;
SELECT (SELECT count(*) FROM public.mods) mods,
 (SELECT count(*) FROM public.categories) categories,
 (SELECT count(*) FROM public.mod_categories) memberships,
 (SELECT count(*) FROM public.mod_category_primary) primaries,
 (SELECT count(*) FROM public.research_queue) preserved_queue,
 'FICTIONAL_CATEGORY_FIXTURE_CLEANED' result;
