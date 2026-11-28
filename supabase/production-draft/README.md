# 운영 DB 반영 초안 (자동 적용 금지)

`main` 운영 전환 전에 **사용자 별도 승인 후** 운영 DB에 순서대로 적용해야 하는 목록이다.
이 폴더와 `supabase/migrations/`는 어떤 워크플로도 자동 실행하지 않는다. 헤더의 `TEST PROJECT ONLY` 문구를 확인하고 운영 적용 여부를 승인받은 뒤 사용한다.

1. `supabase/migrations/202611200001_research_queue.sql`
2. `20261121103835_test_profile_revision_owner_snapshots.sql`
3. `20261121103919_test_profile_owner_qualified_rls_fix.sql`
4. `20261121104128_test_profile_snapshot_fk_indexes.sql`
5. `20261121105254_test_profile_atomic_snapshot_invoker.sql`
6. `20261121143453_test_mod_relation_draft_approval_rls.sql`
7. `20261122183000_test_mod_categories_owner_rls.sql`
8. `20261123000100_test_mod_categories_allow_unclassified.sql`
9. `20261123000200_test_categories_delete_rpc.sql`
10. `20261124000100_test_selection_groups.sql`
11. `20261124000200_test_mod_detail_edit_and_mod_ids.sql`
12. `20261125000100_test_mod_archive_grant.sql`
13. `20261125000200_test_mod_summary_updated_and_delete.sql`
14. `supabase/production-draft/20261127_prod_indexes_and_summary_backfill.sql`

적용 전 확인: 운영 DB 백업, 비-`create or replace` 문(테이블·정책 create)이 이미 존재하지 않는지, `is_authorized_user()`·`approve_research_record` 존재 여부.
Vercel Production 환경변수: `CATALOG_WRITE_PRODUCTION_VERCEL_PROJECT_ID`, `CATALOG_WRITE_PRODUCTION_SUPABASE_ORIGIN`, 운영 `NEXT_PUBLIC_SUPABASE_URL`이 운영 DB를 가리켜야 한다. `vercel.json`의 `icn1` 리전은 운영 DB 리전과 맞는지 확인한다.
