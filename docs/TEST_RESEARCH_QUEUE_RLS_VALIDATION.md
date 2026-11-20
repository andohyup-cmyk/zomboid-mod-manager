# 시험 DB 영구 등록 대기함 적용 및 RLS 검증 기록

**대상:** 시험 Supabase 프로젝트 `smofdbjgcgdmscamknpw`만. 운영 프로젝트 미변경.

## 승인 및 적용
- 사용자가 백업 없는 **시험 DB 한정** 신규 `research_queue` 테이블 및 필요한 RLS 적용을 명시 승인.
- 기존 SQL 초안 `supabase/migrations/202611200001_research_queue.sql`을 그대로 적용.
- Supabase 기록된 실제 마이그레이션: `20261120092624_research_queue_owner_rls`.
- 기존 테이블 6개 유지, `research_queue` 신규 생성. RLS 활성화.
- `authenticated`: SELECT/INSERT/UPDATE 가능하나 정책으로 본인 + allowlist 사용자만 허용. DELETE 불허.
- `anon`: SELECT/INSERT/UPDATE/DELETE 모두 테이블 권한 없음.

## 실제 SQL 권한 검증
- 테스트 트랜잭션 `BEGIN` / `ROLLBACK` 안에서만 임시 Workshop `123456789` 항목 생성.
- `SET LOCAL ROLE authenticated` + 승인 사용자 JWT sub 모사: INSERT 성공, 본인 SELECT 1건.
- JWT sub를 미승인 UUID로 전환: `is_authorized_user() = false`, 타 사용자 SELECT 0건, UPDATE 0건.
- 미승인 UUID로 INSERT 시 RLS 거부 확인(예외를 포착하고 실패를 단언).
- 검증 종료 후 `research_queue` 행 수 0건, `authorized_users` 1건, `mods`/ `profiles` 0건.
- 익명 권한은 DB의 `has_table_privilege`로 모두 거부 확인.

## 한계 및 다음 검증
- SQL에서 role/JWT sub를 재현한 검증이지, 실제 Google OAuth 로그인 또는 Supabase REST API 세션 검증은 아님.
- 기존 Preview `isCatalogWriteAllowed`는 Vercel production 프로젝트와 승인된 운영 Supabase origin만 허용하므로 **Preview에서 POST/PATCH는 계속 403**. 이번 DB 승인으로 이 보호를 해제하지 않았음.
- 사용자 확인 후에만 별도 격리된 시험 Preview 쓰기 경로와 실제 로그인 E2E를 진행. 카탈로그 승인 API와 운영 DB 쓰기는 계속 별도 보호 필요.
- 무료 플랜 백업 없음. 사용자가 백업 없이 진행을 승인했으므로 실제 백업/복구 검증은 하지 않음.
- 기존 `public.rls_auto_enable()` Security Advisor 경고는 이번 승인 범위가 아니므로 변경하지 않음.

**검증 상태:** 시험 DB 스키마/권한/트랜잭션 내 소유자 RLS 통과. 실제 브라우저 OAuth 및 앱 저장은 미검증.
