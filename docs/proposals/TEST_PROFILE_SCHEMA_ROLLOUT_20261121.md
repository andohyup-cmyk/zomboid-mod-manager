# 시험 DB 프로필 영구 저장 스키마 적용 사전 검토

작성: 2026-11-21 UTC. 적용 대상: **Zomboid Mod Manager Test** (`smofdbjgcgdmscamknpw`)만.

## 승인된 변경 범위
사용자는 2026-11-21에 "시험 Supabase 한정·백업과 변경안 검토 후 신규 테이블 및 최소 접근 권한 적용"을 명시 승인함.

**기존 `profile_mods`의 Workshop 단위 참조를 바꾸거나 기존 데이터를 변환하지 않는다.**

## 적용 전 백업 및 실제 현황
- 정확한 **영향 대상 4개 테이블의 논리 데이터 스냅샷**은 `backups/test-profile-pre-schema-20261121.json`에 보존. `profiles`, `profile_mods`, `mods`, `mod_ids` 행이 모두 0건임을 SQL로 확인해 각각 `[]` 기록.
- 기존 스키마 원본은 `supabase/migrations/202611180002_resume_initial_setup.sql`에 보존돼 있다.
- 이 백업은 **전체 Supabase DB/PITR 백업이 아니다.** 인증, research_queue 등 무관한 DB 테이블의 전체 스냅샷은 만들지 않았다. 사용 중인 다른 기존 데이터는 수정하지 않는다.
- 기존 `profiles`는 authenticated SELECT만 있고 INSERT/UPDATE/DELETE는 없었음.
- 별도 Security Advisor에서 오래된 `public.rls_auto_enable()` 함수의 익명 실행 가능 경고를 확인했지만 **승인 범위 밖이라 변경하지 않는다**.

## 마이그레이션 변경안
SQL 초안: `supabase/plans/test_profile_revision_owner_snapshots.sql`

1. `profiles` **INSERT(owner_id,name)만** authenticated에 허용하고, `auth.uid()` 및 `is_authorized_user()`와 일치하는 본인 소유 항목만 생성. 기존 프로필 조회 정책 유지, UPDATE/DELETE는 여전히 불허.
2. `profile_revision(profile_id,revision,owner_id,notes,created_at)`: 프로필별 새 수정 회차는 **추가 전용**으로 보존. `(profile_id,revision)` PK로 같은 회차 동시 중복을 차단.
3. `profile_mod_choices`: **개별 `mod_ids.id`** FK, `enabled`, `load_order` 및 프로필 수정 회차 보존. 동일 회차에서 동일 Mod ID UUID와 동일 순번 중복 불가.
4. `profile_downloads`: 별도 명시한 다운로드 전용 Workshop만 회차별 기록; 실제 Mod ID를 자동 활성화하지 않음.
5. 새 테이블 전부 RLS, authenticated에 **SELECT와 INSERT 권한만**, anon/PUBLIC 권한 없음. 선택 행은 모드 UUID 소유자까지 검사하고, 회차의 소유자를 참조하는 복합 FK 적용. UPDATE/DELETE는 누구에게도 새롭게 부여하지 않음.

## 알려진 제약
- 신규 스키마 자체가 실제 앱의 영구 저장 기능을 의미하지 않는다. **서버 RPC/API와 브라우저 저장 UI는 이번 범위에서 추가하지 않는다.**
- PostgreSQL PK는 같은 revision 중복을 차단하지만, 사용자 입력이 다음 revision 번호인지까지 강제하는 **완전한 CAS 저장 트랜잭션은 향후 별도 구현·검증**이 필요. 임의 버전 건너뛰기와 부분 저장을 방지하는 저장 API가 생기기 전까지 앱에서 쓰기 기능은 열지 않는다.
- 회차마다 선택 전체를 별도로 보존하는 append-only 방식이므로, 저장 이력이 많아지면 데이터 사용량이 증가한다. 삭제·정리 정책은 사용자 승인 없이 추가하지 않는다.
- 새 테이블에 INSERT가 허용되면 자체 Supabase 인증 API로 직접 쓰기가 가능하므로, DB 권한과 RLS 검증을 반드시 하고 UI 연결 전까지는 **앱 화면의 저장 기능을 비활성으로 유지**한다.
- 운영 환경, Google OAuth, 기존 `profile_mods`의 권한/데이터, Github main 병합, 운영 배포는 제외한다.

## 검증 체크리스트
- [x] 정확한 시험 프로젝트 ID 확인
- [x] 영향을 받는 4개 테이블 행이 0건인 논리 스냅샷 저장
- [x] 신규 SQL과 소유자·참조 관계·변경 권한 정적 검토
- [x] 시험 프로젝트 마이그레이션 1회 적용
- [x] 실제 DB 테이블/PK/FK/RLS/Grant/Policy 재조회
- [x] 인증 계정·타인/익명 RLS 확인
- [x] 임시 데이터는 트랜잭션 내 사용, 최종 ROLLBACK
- [x] 이전 테이블 데이터·기존 정책 불변 확인
- [x] Security Advisor 재조회, Draft PR 및 TASKS 기록

## 검증 완료 기록 (2026-11-21)

- 최종 적용은 **한 번이 아닌 세 개의 추가형 마이그레이션**: 생성(20261121103835), RLS 소유권 비교 버그 보정(20261121103919), 신규 FK 보조 인덱스(20261121104128). 적용 원문과 이력은 `supabase/migrations/`에 각각 보존.
- **중요:** 첫 DDL의 상관 서브쿼리에서 비한정 소유자 식별자에 대한 명시적 비교가 필요했다. 실제 RLS 재조회로 보정 후 두 소유자 비교 모두 `외부 테이블.owner_id` 조건을 갖는 것을 확인했다. 최초 정책 그대로 배포하지 말 것.
- 통합 시험에서 authorized 사용자 저장 및 중복 거부, 미허용 계정/anon 차단, 모두 ROLLBACK 후 0건을 확인했다.
- 자세한 검증 근거·남은 위험: `docs/reviews/TEST_PROFILE_SCHEMA_RESULTS_20261121.md`.
- **실계정 2인 교차 테스트와 원자 CAS 프로필 전체 저장, 브라우저 DB 저장 테스트는 미완료**. 앱에는 아직 영구 저장 쓰기 경로를 연결하지 않음.
