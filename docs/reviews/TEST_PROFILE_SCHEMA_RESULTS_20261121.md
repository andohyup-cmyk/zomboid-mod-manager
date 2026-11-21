# 2026-11-21 시험 Supabase 프로필 스냅샷 스키마 적용·검증 결과

## 실제 수행

대상: `smofdbjgcgdmscamknpw` — `Zomboid Mod Manager Test` (PostgreSQL 17.12).

- 사용자 승인 범위: 변경 대상 데이터 논리 백업 후, 시험 DB에 신규 프로필 저장 테이블·최소 RLS/쓰기 권한을 적용. 운영 DB/운영 배포/병합은 제외.
- 변경 전 `profiles`, `profile_mods`, `mods`, `mod_ids`는 각각 **0건**. `backups/test-profile-pre-schema-20261121.json`에 **정확히 빈 행 배열**로 기록. 기존 스키마 원본은 `supabase/migrations/202611180002_resume_initial_setup.sql` 참고. 전체 DB나 Auth 등의 PITR 백업은 **아님**.
- 마이그레이션 적용:
  1. `20261121103835_test_profile_revision_owner_snapshots` — profile_revision, profile_mod_choices, profile_downloads 3개 신규 테이블 및 RLS와 INSERT/SELECT 최소 권한. `profiles`에 본인 계정 INSERT(owner_id,name)만 허용.
  2. `20261121103919_test_profile_owner_qualified_rls_fix` — 적용 후 RLS 검토에서 **상관 서브쿼리의 비한정 `owner_id`가 내부 `p.owner_id`/`m.owner_id`와 결합되어 tautology가 되는 문제 발견**. 수정해 `p.owner_id = profile_revision.owner_id` 및 `m.owner_id = profile_mod_choices.owner_id`를 명시. 보정 후 정책 원문을 읽어 조건 확인. 기존 데이터는 없고 UI/API 쓰기 연결도 없다.
  3. `20261121104128_test_profile_snapshot_fk_indexes` — 신규 테이블 3곳의 인덱스 누락 권고를 해결하기 위한 FK 보조 인덱스 3개만 추가. 기존 테이블의 인덱스 문제는 범위 밖.
- 모든 SQL은 `supabase/migrations/` 아래 실제 DB 이력에 맞춘 정확한 버전 파일과 `supabase/plans/`의 SQL 원문으로 보존.

## 실제 DB 확인

- 세 신규 테이블 존재, RLS 모두 `true`; 익명(PUBLIC/anon) SELECT/INSERT 없음.
- authenticated: SELECT 허용; INSERT는 허용한 **열 단위**로만 GRANT. 전체 테이블 `has_table_privilege(...,'INSERT')`는 false를 보고할 수 있으므로 **`has_column_privilege(...,'INSERT')`로 검증**했다. 예: profile_revision의 `owner_id`, `profile_id`, `revision` INSERT 가능; `created_at` INSERT 불가.
- 프로필/신규 테이블에 authenticated UPDATE/DELETE 권한 없음; 기존 레거시 `profile_mods`의 권한·RLS·행을 변경하지 않음.
- FK: 개별 `profile_mod_choices.mod_id_entry_id`가 `mod_ids.id`에 연결, 동일 회차 순번 중복 불가, 회차/소유자 복합 FK, 다운로드 전용 Workshop 형식 검사 유지.

## 트랜잭션 통합 테스트

실제 시험 DB에 `BEGIN ... ROLLBACK`으로 임시 생성 후 사라지는 데이터를 사용:

1. 허용된 실제 사용자 역할/세션 모의: `auth.uid()`와 `is_authorized_user()` 확인 성공.
2. authenticated 소유 프로필 생성 → 모드 1개에 포함된 서로 다른 **게임 Mod ID 2개**(활성 1, 비활성 1) 추가 → revision 1, 순번 0/1 보존 → 다운로드 전용 Workshop 1개 삽입 → SELECT로 1/2/1건 확인 성공.
3. 같은 revision 재삽입 거부(유일성), 같은 회차 중복 게임 Mod ID 거부(PK), 같은 순번 재삽입 거부(UNIQUE).
4. 다른 `owner_id`로 revision 추가 거부(RLS), UPDATE 시도 거부(최소 권한).
5. 권한 미등록 UUID를 authenticated로 모의: 사유 데이터 SELECT 0건, 프로필 INSERT 거부.
6. anon 역할: 신규 3개 테이블 SELECT 시도 거부.
7. 테스트 종료 후 `profiles=0`, `profile_mods=0`, `mods=0`, `mod_ids=0`, `profile_revision=0`, `profile_mod_choices=0`, `profile_downloads=0`; 기존 영구 대기함 `pending=1` 유지. 테스트 데이터 **영구 저장/삭제 없음**.

## 보안 점검

- Security Advisor의 신규 테이블 RLS 누락 경고 **없음**.
- 기존 경고 `public.rls_auto_enable()`의 anon/authenticated SECURITY DEFINER 실행 가능, `public.is_authorized_user()` 함수와 leaked-password 설정은 **이번 적용 전부터 존재**, 이번 범위에서 변경하지 않음.
  - 참고: <https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable>
  - 참고: <https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable>
- 새 인덱스는 데이터가 없어 성능 사용 통계 `unused_index`로 표시될 수 있음. 기존 테이블의 FK 인덱스 권고 3건 등은 그대로 보존.

## 미완료/후속 승인 경계

- **저장 RPC/API/버튼 미구현**, 앱에서 영구 프로필 저장은 아직 불가능. `profiles`에 생성만 허용.
- DB PK는 동일 회차의 중복을 막지만 **연속 번호 보장·전체 선택과 다운로드의 단일 원자적 CAS 저장**까지 제공하지 않는다. 후속 API 설계 시 동시 저장·부분 실패 검증 필요.
- 시험 Supabase 사용자 계정이 하나이므로 **실제 두 번째 인증 계정으로 교차 사용자 테스트는 아직 미수행**. 미허용 가상 UUID·anon 테스트는 통과.
- User가 요구한 홈·모드·서버 UI 개편과 운영 배포·main 병합은 하지 않음. 승인 없이 운영 환경으로 SQL을 복사하거나 배포하지 않는다.
