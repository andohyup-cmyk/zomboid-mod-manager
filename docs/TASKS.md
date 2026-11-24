# 작업 현황

## 2026-11-23 PC 연동 및 시험 Supabase 마이그레이션·OAuth 실검증 완료

- **PC 로컬 워크숍 `mod.info` 스캔:**
  - `C:\Program Files (x86)\Steam\steamapps\workshop\content\108600` 대상 읽기 전용 스캔 실행.
  - 81개 워크숍, 209개 `mod.info`, 130개 고유 Mod ID 스캔 완료 (`zomboid-workshop-audit-20261123-2334.json`). 앱 파서 `parseLocalWorkshopInventory` 정상 통과(130.1 KB).
- **시험 Supabase (`smofdbjgcgdmscamknpw`) SQL 4건 적용 및 롤백 검증 성공:**
  - 마이그레이션 1 (`20261123000100_test_mod_categories_allow_unclassified.sql`): `save_mod_categories`에 카테고리 0개(미분류, primary=null) 해제 허용 반영 성공.
  - 롤백 검증 1 (`tests/sql/mod_category_unclassified_rollback.sql`): 단일 트랜잭션 내 2개 카테고리 지정→0개 해제→대표 불일치 거부→재지정 후 `ROLLBACK` 성공.
  - 마이그레이션 2 (`20261123000200_test_categories_delete_rpc.sql`): 카테고리 삭제 RLS 및 `delete_category(uuid)` 원자적 RPC(소유자 확인, 어드바이저리 락, 대표 자동 승계, 미분류 전환) 등록 성공.
  - 롤백 검증 2 (`tests/sql/category_delete_rollback.sql`): 단일 트랜잭션 내 카테고리 삭제 후 대표 자동 승계 및 1개 카테고리 모드의 미분류 전환 후 `ROLLBACK` 성공.
- **Vercel Preview 환경변수 및 쓰기 가드 연동:**
  - Vercel 시험 프로젝트(`prj_XYLhTcgMEscWoUCB5UHZoDebfwPQ`) Preview 환경에 `MOD_CATEGORY_TEST_WRITE_ENABLED=true` 설정 완료.
  - PR `#55`에서 `develop` 브랜치 허용 및 만료 시각 2026-11-26 00:00 KST로 연장 반영 완료.
- **Google OAuth 콜백 및 실로그인 검증 성공:**
  - 시험 Supabase Authentication Redirect URLs에 활성 Preview 도메인 콜백(`https://zomboid-mod-manager-7mweavsm4-andohyup-cmyk.vercel.app/auth/callback`) 등록 완료.
  - 실제 브라우저 Google 로그인 및 대시보드 진입 성공, 허용된 소유자 RLS 정상 연결 확인.

## 2026-11-23 개발 통합 브랜치(`develop`) 구성 및 Antigravity 기준 지침 정비

- 사용자 승인에 따라 `#33`(백업 v4)에서 3갈래로 분기돼 있던 검증 완료 PR들을 단일 개발 통합 브랜치 **`develop`**으로 무충돌 통합: `#34`(문서) + `#36`→`#38`→`#39`(카테고리 읽기 가드·모바일 상세 패널·origin 가드; `#37`은 `#38`에 포함) + `#40`→`#41`(백업 v4 DB 롤백 SQL·실제 GET 라우트 모의 응답 테스트).
- `#39`의 시험 브랜치 고정 `prebuild` 훅은 `develop` 및 후속 Preview 빌드가 불필요하게 차단되지 않도록 `package.json`에서 `preflight:category-preview` 스크립트로 분리. `isTestCategoryWriteAllowed`의 시험 쓰기 잠금(브랜치·프로젝트·origin·플래그·만료 시각)은 fail-closed 그대로 유지.
- `좀보이드_모드관리앱_프로젝트_지침.md`, `AGENTS.md`, `docs/AI_HANDOFF.md`를 **Antigravity 단독 주 개발·`develop`/`main` 2단계 브랜치·3단계 승인 경계** 및 확정 도메인 규칙(다중 카테고리+대표 1개+0개 해제 허용, 선택 그룹 자유 선택 기본값) 기준으로 갱신.
- **미변경 범위:** `main`, 운영 배포, 운영/시험 DB 스키마·RLS·권한, Vercel 환경변수, 기존 사용자 데이터, 구형 PR 닫기/삭제 없음.
- **다음 작업:** Issue `#35` 카테고리 0개(미분류) 해제 구현(코드·단위 테스트 + 시험 DB `save_mod_categories` 마이그레이션 초안 작성 후 별도 DB 적용 승인 요청).

## 2026-11-22 승인된 시험 DB 다중 카테고리 저장 (Draft PR 준비)

- 사용자가 **격리된 시험 Supabase 한정** 카테고리·모드 연결 스키마, RLS/권한 추가 및 테스트를 승인. 운영 DB·기존 데이터·운영 배포·main 병합·UI 디자인 변경 제외.
- 시험 DB `smofdbjgcgdmscamknpw`에 `test_mod_categories_owner_rls` 마이그레이션 **적용 성공**: `categories`, `mod_categories`, `mod_category_primary` 3개 테이블, 본인 전용 RLS·최소 권한, 지연 FK/무결성 검사, `SECURITY INVOKER` 원자적 저장 RPC `save_mod_categories`.
- 기존 미분류 모드는 분류 0개 상태 허용. 분류된 모드는 **여러 소속 중 대표 정확히 하나**, 중복·다른 소유자 차단. 자동 활성화/서버 로드 순서 변경 없음.
- API `/api/categories` 및 `/api/mod-categories` GET/POST 구현. POST는 시험 Preview 특정 브랜치와 `MOD_CATEGORY_TEST_WRITE_ENABLED=true` 별도 opt-in 조건으로 제한, **현재 쓰기 플래그 설정하지 않음**. 기존 UI 변경 없음.
- 가상 시험 자료를 사용한 실제 DB 트랜잭션 검증에서 2개 카테고리 연결·대표 지정·중복/대표 미포함 거부·대표 변경을 확인하고 **ROLLBACK**. 확인 시 새 3개 테이블 및 `mods` 모두 0건.
- 입력 검증 신규 테스트 4개, **336/336 통과**. Preview 빌드 결과는 PR 기록 참고.
- **백업 유의:** JSON v3에는 신규 카테고리 3개 테이블이 아직 포함되지 않음. 실사용 전 백업 포맷 확장 및 검증 필요.
- 상세: `docs/reviews/TEST_MOD_CATEGORY_PERSISTENCE_20261122.md`.

## 2026-11-22 JSON v3 백업 참조 무결성 강화 (Draft PR #31)

- 이전 실기기 모바일 관계 초안→승인→프로필 필수 의존성 차단→백업 v3 1건 내보내기 성공 및 사용자 승인 fixture 정리 완료를 바탕으로, 구조/건수만 확인하던 v3 JSON 내보내기·파일 검사에서 **모드, 게임 Mod ID, 프로필, 조사 기록, 관계·승인 상태의 내부 참조 무결성**을 검증하도록 개선.
- `lib/backup-reference-integrity.ts` 신규: 단일 owner, 중복 Workshop/게임 Mod ID, 고아 조사 기록·기존 프로필 모드 연결, `profile_revision` 복합 소유자/회차, `profile_mod_choices` 활성·비활성·연속 순번, `profile_downloads` 연결/순번, `mod_relations` 주체/대상/근거 출처/승인 시각 검증. 원본 JSON 불변, **DB 쓰기 없음**.
- `lib/backup-preview.ts`는 v3에서만 엄격한 참조 검사 후 완전 상태 표시. v1/v2는 이전과 같이 열람 가능하지만 부분 백업으로 표시, 대기함 조회 불가(null)는 기존 부분 백업으로 처리.
- `app/api/data-export/route.ts`는 응답 전 동일한 검증 수행, 내부 참조 오류 시 **HTTP 503**, 불완전한 자료를 완전 백업으로 내려주지 않도록 수정. `components/BackupInspector.tsx` 문구만 보완, 기존 UI 디자인 유지.
- **새 회귀 테스트 13개**, 전체 **332/332 통과**. TypeScript·ESLint·Next 빌드 성공. 기능 코드 커밋 `587803164b267fb5d9ecb287a9275c390b10ab7b` Preview `dpl_AEAYCCsmFSQqaEgW6XYEWjY8Ax8w` **READY**. 문구/문서 포함 최종 커밋 `f5714e13172be1a4c70e3919efecf2d2de053b5e` Preview `dpl_EzADTJVxq8WusxKobcaTGnCWjfJB` **READY**, 다시 전체 자동 테스트·타입·ESLint·Next 빌드 통과.
- **한계**: JSON 내부 참조 검증은 분할 조회를 하나의 시점으로 고정하지 않으므로 PostgreSQL 트랜잭션 일관성이나 실제 복구 가능 여부를 보장하지 않는다. 이미 종료된 fixture를 다시 만들거나 실데이터를 수정하지 않음. 운영 배포/main 병합/DB 스키마·RLS·권한 변경 없음.
- 자세한 문서: `docs/reviews/BACKUP_V3_REFERENCE_INTEGRITY_20261122.md`, Draft PR **#31**.

## 2026-11-22 모바일 관계 E2E 통과 및 승인 범위 내 정리

- 실제 모바일 브라우저 캡처에서 **관계 승인 HTTP 200**, **JSON v3 관계 1건 HTTP 200**, 승인 후 **저장 프로필 필수 모드 누락 감지 HTTP 200**, **복사 잠금 유지** 확인. 이전 본인 관계 GET HTTP 200, 초안 생성 성공도 확인. 새로고침 후 기존 초안 복원 버그 수정 후 승인 성공.
- 시험 Supabase의 관계 `kind=requires, approved=true, approved_at IS NOT NULL`을 SQL로 직접 확인. 화면의 승인·출력·백업 결과와 일치.
- 기존 사용자 승인 범위에 따라 기능 브랜치 한정 `MOD_RELATION_TEST_WRITE_ENABLED`을 **true → false**로 수정. 반영 새 Preview 배포 `dpl_CrFE2w2SgHsmw6QgLKkecHQeo8D5` 요청(READY 확인 별도 필요). 운영/타 브랜치 설정 불변.
- `docs/proposals/MOBILE_E2E_FIXTURE_CLEANUP_AFTER_TEST.sql`의 정확한 대상·소유자·연관 관계 검사 후 **시험 DB에서 COMMIT 정리 성공**. 후속 검증: `mods,mod_ids,research_records,profiles,profile_revision,profile_mod_choices,mod_relations` **모두 0건**, 기존 `research_queue` pending **1건 유지**.
- 운영 배포, main 병합, RLS/GRANT 변경, 기존 사용자 데이터 변경 없음. Draft PR #30 보존.

## 2026-11-22 사용자 승인 후 모바일 관계 E2E 시험 준비 완료

- 사용자가 시험 DB 가상 fixture 영구 생성, 이 **브랜치 Preview에 한정된** 관계 API 쓰기 허용, 시험 후 **새 fixture 및 해당 관계만** 정리할 범위를 명시적으로 승인.
- 시험 Supabase `smofdbjgcgdmscamknpw`: 인증·허용 사용자 각 1개, 기존 데이터 0건·모드/프로필 ID 충돌 없음 확인 후 승인된 `MOBILE_E2E_FICTIONAL_FIXTURE_NOT_APPLIED.sql`을 실행. 처음에는 `authenticated`가 `authorized_users` 직접 SELECT 권한이 없어 롤백, **권한 변경 없이** 스크립트 보완 후 ROLLBACK 성공 → COMMIT 성공.
- 생성된 가상 시험 자료 **`mods=2`, `mod_ids=2`, `research_records=1`, `profiles=1`, `profile_revision=1`, `profile_mod_choices=1`**. 호환성 상태 전부 `unverified`, 데이터 이름 `FICTIONAL` 명시. 관계는 **0건**(모바일 버튼에서 직접 초안 등록·승인). 기존 `research_queue` pending 1건 유지.
- 실제 로그인 사용자 `authenticated` / RLS로 동일 자료 조회 검증. 가상 fixture의 관계 INSERT(미승인)→UPDATE(명시 승인)→조회도 트랜잭션 내 `ROLLBACK` 검증 `EXISTING_FIXTURE_RLS_DRAFT_APPROVE_ROLLBACK_PASS`; 관계 영구 저장 없음.
- Vercel `MOD_RELATION_TEST_WRITE_ENABLED=true`를 오직 `feature/mobile-relation-e2e-harness-20261122` 대상 Preview 브랜치로 설정·확인. Production/다른 Preview/DB RLS·GRANT 불변. 새 Preview `dpl_9VxmsXy393MSV3MK1ArmAAuj7Jyh` **READY** (코드 검증 `9ff7f68026a785085ec563f67028d1fcb201868c`), 이전 **319/319 전체 테스트 통과**. 이번에 변경된 SQL은 문서·fixture만.
- 모바일 전용 화면: `https://zomboid-mod-manager-d14qx2l2w-andohyup-cmyk.vercel.app/diagnostics/relations`. **사용자 브라우저가 직접** ① 목록 GET → ② 초안 POST → ③ 확인창 명시 승인 POST → ④ 저장 프로필 GET → ⑤ JSON v3 백업 GET을 실행해야 HTTP E2E 완료. **현재 실제 HTTP POST E2E는 미완료**.
- 종료 시 특정 신규 자료에 한해서만 안전하게 정리하도록 `docs/proposals/MOBILE_E2E_FIXTURE_CLEANUP_AFTER_TEST.sql` 작성·**ROLLBACK 드라이런 성공**, 실제 DELETE 미실행. 후속 사용자 브라우저 검증 결과 확인 후 브랜치 쓰기 플래그와 fixture를 정리 예정. 기존 데이터, 운영 배포, main 병합, 홈·모드·서버 UI 변경 없음.
- 자세한 기록 `docs/reviews/MOBILE_RELATION_E2E_HARNESS_READY_20261122.md`, Draft PR #30.

## 2026-11-22 활성·승인 관계 조회 경량화 + 모바일 E2E 준비

- Draft PR **#29** `feature/active-approved-relation-scope-20261122`: 저장 프로필에서 **활성 주체**의 관계만 RLS 조회하고, **승인된 관계의 미선택 대상**만 추가 카탈로그 조회. 미승인 관계는 `not-approved`로 표시하지만 존재하지 않는 대상 조회로 503을 일으키지 않게 수정. 비활성 주체는 무관한 대상 조회를 생략, 비활성 대상은 원래 자리에 유지하며 승인된 필수 의존성 누락 차단 규칙 보존. 새 단위 테스트 **5개**, 총 **318/318 통과**, TypeScript/ESLint/Next Preview `dpl_5KnbXrnnUroZnj1da9q9P3C3Lhy8` READY. DB/운영/기존 UI 변경 없음.
- Draft PR **#30** `feature/mobile-relation-e2e-harness-20261122`: 모바일에서 인증된 소유자가 직접 관계 GET→**별도 클릭**으로 초안 POST→**확인창을 거친 승인 POST**→프로필 출력 GET→백업 v3 GET을 검증할 전용 경로 `/diagnostics/relations` 신설. **기존 홈/모드/서버 화면 및 내비게이션 변경 없음**, 오직 시험 Preview 브랜치·프로젝트·시험 Supabase 일치+허용된 OAuth 계정에서만 표시, 운영 404.
- 초기 **쓰기 차단 유지**: `MOD_RELATION_TEST_WRITE_ENABLED`은 이번 기능 브랜치에 **설정하지 않았음**. 가상 Workshop 2개 + 조사 기록 1개 + 프로필 1개를 생성하는 SQL을 `docs/proposals/MOBILE_E2E_FICTIONAL_FIXTURE_NOT_APPLIED.sql`에 **미적용 상태로만** 저장. 가상 모드가 실제 Steam/B42.22 근거인 것처럼 표시되지 않도록 FICTIONAL/모든 호환성 unverified 지정. 사용자 승인 전 영구 fixture 추가·임의 데이터 삭제/정리·브랜치 전용 쓰기 허용 금지.
- Preview `dpl_LgeK6im6H1aPUPL2UTFhwg1YyHCR` **READY**, 검증 커밋 `5325870c4c706dee031e7229069b498430913940`. **319/319 자동 테스트 통과**, TypeScript, ESLint, Next 빌드 성공. 이후 문서 커밋만 추가. 시험 DB `mods,mod_ids,research_records,mod_relations,profiles,profile_revision,profile_mod_choices` **모두 0건**, 기존 연구 대기함 pending 1건 유지.
- 세부 검토 `docs/reviews/MOBILE_RELATION_E2E_HARNESS_READY_20261122.md`. **다음 필수 승인**: 시험 DB에 명시한 가상 fixture 자료를 **영구 추가**하고 해당 Preview 브랜치의 쓰기 플래그만 임시로 활성화, 시험 종료 후 **해당 신규 fixture에 한정된 정리/삭제 범위** 승인. 운영 배포, main 병합, 기존 데이터 수정·삭제, DB RLS/GRANT 변경은 여전히 범위 밖. 실제 사용자 브라우저의 POST 승인 E2E는 이 승인 전까지 미완료.

## 2026-11-22 모바일 로그인 검증 후 모드 관계 전체 흐름 재현 테스트

- 실제 모바일 Preview에서 사용자가 `GET /api/mod-relations` 응답 `{"relations":[]}` 스크린샷을 제공: 사용자 브라우저의 로그인/허용 사용자 검사/관계 GET 성공. **관계 POST 전체 E2E가 성공했다는 뜻은 아님**.
- `feature/relation-lifecycle-rollback-test-20261122`, Draft PR **#28**: 테스트 전용 가상 Workshop/Mod ID/조사 근거로 `tests/relation-lifecycle.integration.test.ts` 신규 **6개** 자동 테스트 추가. 미승인 관계→명시적 승인→미선택 필수 의존성 차단→명시적 대상 선택 후 차단 해제→오래된 근거 보류→v3 백업 승인 상태/원본 보존까지 하나의 논리 흐름으로 검증.
- `tests/sql/mod_relation_lifecycle_rollback.sql`에 실제 `authenticated` RLS와 가상 프로필/모드/연구 기록/관계 초안→승인→조회→미선택 대상 신원→백업 조회→타인 접근 차단을 점검하는 **단일 트랜잭션 테스트** 저장. 시험 Supabase `smofdbjgcgdmscamknpw`에 GitHub 소스 그대로 실행해서 `RLS_DRAFT_APPROVAL_PROFILE_EXPORT_ROLLBACK_OK` 응답 확인. **`ROLLBACK`**, 영구 테스트 데이터/실데이터 변경 없음.
- 실행 전/후 `mods`, `mod_ids`, `research_records`, `mod_relations`, `profiles`, `profile_revision`, `profile_mod_choices` 각 **0건**, 기존 `research_queue` pending **1건** 유지. 신규 기능 브랜치에 쓰기 플래그 없음, DB 테이블/RLS/GRANT·기존 UI·운영 배포·main 변경 없음.
- 최초 Vercel Preview `dpl_GqCheHDTVgktGbDhvgBM3VZUBCtu`: **313/313 테스트는 통과했으나 테스트 파일의 `never[]` 타입 오류로 typecheck 실패**, 코드를 수정함.
- 최종 검증 커밋 `58021f2898f5fd9c561a51302350cf7e286ddc95`의 Preview **`dpl_7ETXFT54NX6zrWVMA3rFTQ1FMsZE` READY**. **313/313 자동 테스트 통과**, TypeScript·ESLint·Next.js 빌드 성공. 이후 문서 커밋만 추가.
- 보고 `docs/reviews/RELATION_LIFECYCLE_ROLLBACK_20261122.md`. **미완료**: 실사용 모바일 로그인 상태에서 관계 POST 등록→승인 POST→프로필 출력 GET→백업 GET까지 실제 HTTP E2E; 실사용 카탈로그 0건이고 테스트 데이터는 항상 롤백되므로 해당 동작을 검증했다고 주장하지 않는다.

## 2026-11-21 저장된 프로필의 미선택 필수 의존성 누락 방지

- 이전 `GET /api/profile-snapshots`는 프로필에 **선택된 게임 Mod ID의 출처만** 근거 검증기에 전달하므로, 승인된 `requires`의 대상 모드가 **미선택**인 경우 `missing-catalog-identity`로 보류되어 필수 모드 누락 차단 검사를 우회할 수 있는 경로를 발견.
- `feature/profile-relation-target-coverage-20261121`, Draft PR **#27**: `lib/saved-relation-target-coverage.ts`로 **선택된 관계 주체만** 검사하고, 미선택 관계 대상 Mod ID를 인증/RLS 카탈로그에서 조회하여 **규칙 검증에만** 사용. 원래 저장한 활성/비활성 선택, 출력 `Mods=`, `WorkshopItems=`, Workshop 다운로드 항목은 그대로 보존. 모드를 자동 추가/활성화/정렬하지 않음.
- `tests/saved-relation-target-coverage.test.ts` 10개 추가. 미선택/비활성 필수 의존성 차단, 미승인 규칙 보류, 다른 Workshop의 동일 게임 Mod ID, 무관한 관계 제외 및 중복 ID 방지 회귀 검사.
- 시험 Supabase에서 임시 모드·조사 원문·프로필 및 승인 관계를 **실제 authenticated/RLS 역할**로 한 트랜잭션 안에 생성해, 선택된 주체의 관계와 **프로필에 미선택인 관계 대상**을 읽을 수 있고 해당 대상이 프로필 선택에 자동 추가되지 않음을 확인한 뒤 `ROLLBACK`. 수정 재실행 결과 성공, 기존 시험 DB 카탈로그·프로필·관계 0건 유지, 연구 대기함 pending 1건 유지.
- Preview `dpl_9DiXnAm3WcruqZLEENzDai4RSL6F` **READY**, 코드 검증 커밋 `b813214252c3348ed1bb32989fcd0fc9cd85453b`, 전체 **307/307 테스트 통과**, TypeScript·ESLint·Next.js 빌드 성공. 새 브랜치에 시험 관계 쓰기 플래그 없음.
- 상세 `docs/reviews/SAVED_PROFILE_RELATION_TARGET_COVERAGE_20261121.md`. 아직 **실사용 Google OAuth 브라우저 로그인→등록·승인→조회·출력·v3 백업 E2E는 미완료**. 원격 도구에서 사용자의 인증 브라우저 세션을 사용할 수 없으며, 직접 Preview URL로 접속하는 컨테이너 네트워크 DNS도 실패. DB/RLS·운영·`main`·기존 UI 수정 없음.

## 2026-11-21 관계 초안·명시적 승인 API 및 관계 포함 백업 v3

- 사용자 후속 `진행해` 지시에 따라 **시험 Supabase** `smofdbjgcgdmscamknpw`에서만 관계 등록·승인 정책 추가. 마이그레이션 `20261121143453_test_mod_relation_draft_approval_rls` 적용, SQL은 `supabase/migrations/20261121143453_test_mod_relation_draft_approval_rls.sql`에 그대로 보존.
- `mod_relations`: 로그인 허용 사용자에게 **초안 필드만 INSERT**, **approved/approved_at만 UPDATE** 허용. RLS는 소유자·양쪽 Mod ID·주체 Workshop의 승인 조사 기록/URL/날짜/상태 검증, `approved=false→true`만 허용. anon·DELETE·기존 관계 정보 변경 불가. 반대 방향 중복 충돌 인덱스 추가.
- 실제 시험 DB **`BEGIN ... SET LOCAL ROLE authenticated ... ROLLBACK`** 테스트: 초안→승인 성공; 다른 사용자 조회·등록·승인, 허위 URL, 승인 직접 삽입/취소, 불변 필드 수정, 양방향 중복 충돌 차단. 모든 테스트 자료 롤백. 원본 카탈로그·프로필·연구 기록·관계 **0건**, 기존 대기함 전체 **2건** 중 pending **1건** 유지.
- `lib/mod-relation-review-input.ts`, `lib/mod-relation-review-server.ts`, `app/api/mod-relations/route.ts`, `app/api/mod-relations/approve/route.ts`: 시험 브랜치/프로젝트/DB/환경 플래그 고정, 인증·동일 출처 확인, 출처 재검증, 사용자 `confirm:true` 명시 요청. `GET /api/mod-relations` 본인 데이터 조회. 홈·모드·서버 UI는 변경하지 않았고 승인 확인 UI도 **미연결**.
- Vercel Preview의 **`feature/test-mod-relation-review-flow-20261121` 브랜치에만** `MOD_RELATION_TEST_WRITE_ENABLED=true` 설정. 운영/다른 브랜치에는 미설정. 시험 Preview Supabase 주소가 승인된 시험 프로젝트와 일치하는지 재확인.
- **백업 v3**: 새 관계/승인 행 `modRelations` 추가, 필수 10개 영역. v1·v2 파일 열람 가능하나 부분 백업으로 표시, 관계 누락 v3는 거부. 실 DB 복원·전체 DB/PITR 백업 구현 아니며 순차 조회는 단일 시점의 스냅샷을 보장하지 않음.
- Preview `dpl_5HWipD5Q3G1bxT6Pf2FUuAcHzfZc` **READY**, 코드 검증 커밋 `d49294a679c3a485bc04a67b75bf7b69e9bc5b5a`, **297/297 자동 테스트 통과**, TypeScript·ESLint·Next.js 빌드 성공. 이후 문서 이력 커밋만 추가.
- 상세 보고 `docs/reviews/MOD_RELATION_REVIEW_FLOW_20261121.md`; Draft PR **#26**. 실제 OAuth 브라우저 POST→승인→GET E2E와 실제 카탈로그 관계 등록은 미검증·미실행. 직접 Data API를 사용하는 **본인 계정은 RLS/열 권한 범위 안에서 승인 필드를 변경할 수 있음**을 명시. 운영 배포, `main` 병합, 데이터 삭제, 기존 화면 디자인 변경 없음.

## 2026-11-21 시험 DB 관계 테이블 및 읽기 경로 (승인 범위)

- 사용자 `진행해` 승인에 따라 **시험 Supabase `smofdbjgcgdmscamknpw`만** `test_mod_relations_readonly_owner_rls` 마이그레이션 적용 성공.
- 신규 `public.mod_relations` 생성: `owner_id`, 관계 종류, 두 개별 `mod_ids.id` UUID, 승인 조사 레코드, 출처 URL, 확인 날짜, 승인 상태/시각. 기존 `mods`, `mod_ids`, `research_records` 테이블은 변경하지 않음.
- 새 테이블 RLS 활성. `anon` SELECT 없음, `authenticated` **SELECT만** (INSERT/UPDATE/DELETE 없음). 사용자 허용 목록, 양쪽 모드 소유자, 연구 기록과 주체 Workshop의 일치 조건 검사. 실제 조회 결과: **RLS=true, 0행, SELECT 정책 1개, 익명 읽기=false, 로그인 읽기=true, 로그인 쓰기 모두=false**.
- 인증된 `GET /api/profile-snapshots?profileId=...&outputPrefix=...`에서 소유자 한정 관계를 읽어 앞 단계 `projectReviewedRelations`로 근거 검증 후 출력 미리보기에 반영. 관계 저장/승인 API는 없음. **`readyForCopy=false` 유지**.
- GitHub `docs/migrations/test_mod_relations_readonly.sql`, `docs/TEST_MOD_RELATIONS_SCHEMA.md`에 SQL/사전 데이터 0건·복구 한계 기록. 연결된 Supabase에 전체 DB 백업 생성 도구는 없으므로 **전체 백업 완료로 주장하지 않음**.
- Security Advisor에서 새 관계 테이블 자체에 대한 경고는 없었으나 기존 `authorized_users` 정책 없음(INFO), `rls_auto_enable()`·`is_authorized_user()` 함수의 노출 경고 및 유출 비밀번호 보호 비활성 경고 확인. 기존 설정을 무단 수정하지 않음.
- **남음**: 시험 OAuth 실로그인/실카탈로그 관계 E2E, 안전한 승인 쓰기 RPC와 관계 입력 UX는 별도 개발·승인 검토. 운영 배포·main 병합·실데이터 삭제 없음.
- 첫 Preview `dpl_GEXB6EgadK3Q5vAuj9iXyvNuDazG`은 백슬래시 출력 접두사 리터럴을 2개로 잘못 입력해 TypeScript 오류로 실패. 즉시 수정한 검증 커밋 `7d69e5baf1a294fdbd8619b45b56654624392640`의 Preview `dpl_Fg1ZSZfKfb4hdu4GDH5wmpEKxMpv`는 **READY**, **286/286 테스트 통과**, typecheck·lint·Next.js 빌드 성공.

## 2026-11-21 구조화된 모드 관계 검증기 준비 (DB 미적용)

- `feature/verified-relations-plan-20261121`: 의존성·충돌·로드 순서를 현재 출력 엔진에 안전하게 연결하기 위한 **사용자 승인 출처 기반 검증기**를 순수 함수로 준비. 이전 B42.22 호환성·멀티 주장과 별도 다룬다.
- `lib/reviewed-mod-relations.ts`: 관계 주체/대상을 서로 다른 Workshop 제공자까지 정확히 지정하는 개별 게임 Mod ID UUID로 연결, 소유자·승인 여부·조사 레코드 ID·출처 URL·확인일 일치를 확인한 규칙만 `ProfileOrderRule`로 변환. 미승인·미확인·오래된 근거는 복사 차단 근거로 사용하지 않고 보류.
- `tests/reviewed-mod-relations.test.ts`: 허위 근거·외부 소유자·동일 Mod ID를 제공하는 복수 Workshop·누락 대상·중복·검증된 의존성 차단·충돌 확인·로드 순서 권고를 검증. DB나 Steam 실데이터를 수정하지 않는 순수 단위 테스트.
- `docs/proposals/REVIEWED_RELATIONS_MODEL.md`: 장래 `mod_relations` 관계/소유자/RLS/승인 출처 설계와 **별도 DB 변경 승인 필요** 경계 기록.
- **미구현 유지**: DB `mod_relations` 테이블/RLS/GRANT, API의 실제 관계 조회, 홈·모드·서버 UI 수정, 운영 배포, main 병합, 실데이터 변경. 사용자의 현재 PC 사용 가능 상태는 기존 프로젝트 지침에 반영됨.
- **Vercel Preview** `dpl_CGX4n23RgYuD126m2Qv3oEDcD43z` **READY**, 검증 커밋 `29e1e7d5b25ddca867967ccbae70339644458eab`(이후 문서 커밋만 추가), **286/286 자동 테스트 통과**, TypeScript·ESLint·Next.js 빌드 완료. 새 관계 관련 회귀 테스트 **13개** 추가. 시험 DB 조회 결과 신규 `mod_relations` 테이블은 아직 없고 기존 카탈로그·프로필 데이터는 0건, 대기함 pending 1건 유지. 이번 기능 브랜치의 시험 프로필 저장 허용 플래그 없음.

## 2026-11-21 승인된 카탈로그 조사 근거를 서버 설정 출력 검사에 연결

- 사용자 후속 요청: **카탈로그 실제 검증 자료의 출력 반영** 및 **현재 PC 사용 가능** 환경 갱신. 프로젝트 지침 `좀보이드_모드관리앱_프로젝트_지침.md`에 PC 가능 상태 반영(모바일 우선 및 직접 연동 작업 원칙 유지).
- 시험 DB 스키마를 읽기 전용 확인: `mods`에는 Build/멀티 상태, 보관·확인일이 별도 저장되고 `research_records.raw_payload`에 출처·확인일·승인된 모드 후보가 저장됨. `mod_relations`/선택 그룹 저장 구조와 B42.22 **특정 빌드 범위의 검증 필드**는 아직 없음. 실제 시험 카탈로그와 프로필은 모두 0건.
- `lib/catalog-evidence-output.ts`에 본인 소유 Workshop, 승인된 조사 원문, URL/상태/확인 날짜, 선택한 실제 Mod ID 목록이 모두 일치하는지 확인하는 **순수 검증기** 추가. 누락·불일치·중복 조사 기록은 미확인 처리, 권한 외/알 수 없는 출처는 거부.
- 조회 API `GET /api/profile-snapshots`에서 본인 소유 `mods`·`research_records` 근거를 읽고 기존 설정 출력기에 전달. 보관된 Workshop 경고 및 멀티플레이 기록 상태를 별도로 표기. **B42.22 호환은 기존 generic `confirmed`만으로 확정하지 않음**, 구조화된 의존성·그룹 관계는 추측·자동 삽입하지 않음. `catalogEvidence`에 출처/확인일/원래 기록 상태 포함, `readyForCopy:false` 유지.
- 회귀 테스트 `tests/catalog-evidence-output.test.ts` 및 `docs/CATALOG_EVIDENCE_OUTPUT_VALIDATION.md` 작성. **DB/권한/RLS·운영 배포/main 병합·UI 디자인 변경 없음**.
- Vercel Preview `dpl_BrfLTVuzfb7oEgdXyQVQCwwviKXk` **READY** (검증 커밋 `e782ed9b5985d08177b3142968ccef179de49e21`), **273/273 자동 테스트 통과**, TypeScript·ESLint·Next.js 빌드 성공. 새 브랜치에 시험 프로필 저장 쓰기 플래그 없음. 시험 DB 재조회 결과 `mods=0`, `mod_ids=0`, `research_records=0`, `profiles=0`, `profile_revision=0`, 기존 연구 대기함 pending **1건 그대로**. 로그인 브라우저와 실카탈로그 E2E는 미완료. Draft PR #23.

## 2026-11-21 7단계: 저장된 서버 프로필의 설정 출력 검증 연결

- `feature/saved-profile-output-20261121` (원자적 프로필 저장 브랜치 기반): `lib/saved-profile-output.ts`로 최신 저장 스냅샷의 Workshop/게임 Mod ID/UUID 대응 관계와 원래 순서를 확인한 뒤 기존 `buildProfileServerConfig` 출력 엔진을 재사용.
- 검증 대상: 비활성 항목 원위치 보존 및 출력 제외, 활성 Mod ID만 선택 순서로 출력, 다운로드 전용 Workshop 명시 포함, 중복·출처 불일치·빈 초안 차단, 기존 확인된 관계·배타 그룹 규칙·경고 확인 유지.
- `GET /api/profile-snapshots`에 선택형 `outputPrefix=none|backslash` 기초 미리보기 추가. **접두사를 임의로 결정하지 않고**, 응답에 `scope: selected-mod-id-membership-only`/`readyForCopy:false`를 포함해 실제 확인 근거와 최종 복사 가능 여부를 혼동하지 않음.
- `tests/saved-profile-output.test.ts` 신규 회귀 테스트 **11개**와 `docs/SAVED_PROFILE_OUTPUT_VALIDATION.md` 작성. 이 작업은 **DB/RLS/권한/운영/main/기존 화면**을 변경하지 않음. **Vercel Preview** `dpl_7QAjcCJKFbkrAvDNBZFsYgatvi6x` **READY**, 기준 커밋 `7bf142521649aec312f2619476c98c4e5e906857`, **260/260 테스트 통과**, TypeScript·ESLint·Next.js 빌드 통과. 새 브랜치에는 시험 DB 쓰기 플래그가 없으며 고정 브랜치 검사에서도 차단됨. 로그인 브라우저 실데이터 E2E는 미완료.

## 2026-11-21 승인된 시험 DB 원자적 프로필 저장 RPC·API

- **사용자 별도 승인**: 격리 시험 Supabase(`smofdbjgcgdmscamknpw`)에 `SECURITY INVOKER` 원자 저장 함수 추가, 이를 호출하는 서버 API 개발 및 검증. 운영 배포/main 병합/기존 데이터 삭제/홈·모드·서버 UI 변경 제외.
- 실제 시험 DB 마이그레이션 `20261121105254_test_profile_atomic_snapshot_invoker` 적용. 소유자/허용 사용자/RLS 검증, `pg_advisory_xact_lock` + revision CAS, 게임 `mod_ids.id` 소유자 확인, 배열 순서와 비활성 선택 보존, 다운로드 전용 목록 별도 저장. `revoke PUBLIC/anon EXECUTE`, authenticated EXECUTE만 허용. 함수는 invoker, search_path 빈 값.
- 실제 `BEGIN ... ROLLBACK` 통합 DB 검증 완료: 두 게임 Mod ID(활성·비활성)와 다운로드 전용 2건 저장, stale CAS/없는 Mod ID/임의 순서/중복/501건/ID 범위 오류 차단, 잘못된 입력 후 부분 기록 0건, 빈 초안 두 번째 회차 기록과 기존 이력 보존. 미허용 UUID와 익명 RPC 접근 차단, 원본 테이블 최종 0건, 기존 연구 대기함 유지.
- `lib/profile-snapshot-write.ts`, `app/api/profile-snapshots/route.ts`, `tests/profile-snapshot-write.test.ts` 구현. POST는 owner 인증·same-origin·카탈로그 실 Mod ID 검증 후 RPC만 호출. **시험 Vercel Preview 특정 브랜치/프로젝트/DB 주소 및 명시적 env 플래그**가 없으면 HTTP 쓰기는 차단. 사용자가 설계하기 전 UI 버튼 미연결.
- SQL 원문 `supabase/migrations/20261121105254_test_profile_atomic_snapshot_invoker.sql`, 상세 검증 `docs/reviews/PROFILE_ATOMIC_SAVE_20261121.md`.
- **남은 한계**: 실제 서로 다른 계정/동시 네트워크 세션 E2E 미실행. SECURITY INVOKER를 위해 기존 테이블의 열 단위 INSERT는 유지되어 직접 Data API INSERT로 비원자 기록할 수 있으므로 운영 전 데이터 접근 구조 재검토 필요. 기존 `rls_auto_enable()` Advisor 경고 변경하지 않음.
- Vercel Preview의 **이 기능 브랜치에만** `PROFILE_SNAPSHOT_TEST_WRITE_ENABLED=true`를 설정했고, Preview Supabase URL이 승인된 시험 프로젝트와 정확히 일치하는 것을 확인. 운영/다른 Preview 브랜치 영향 없음. `GET /api/profile-snapshots` 읽기 전용 복원 API 및 단위 테스트 8개 추가. **최신 Preview `dpl_Exn2imsYbE5DhHmmTsi8sccZBS5z` READY** (커밋 `20d864a5e8cf8e4f540d3d24e510a8bd60d255e4`, 이후 문서만 추가). 전체 **249/249 테스트 통과**, TypeScript, ESLint, Next.js 빌드 성공. 로그인 브라우저 POST→GET E2E는 미검증.

## 2026-11-21 프로필 신규 스키마 반영 후 JSON 백업 v2 누락 방지

- `feature/backup-v2-profile-snapshots-20261121` (이전 시험 DB 스키마 브랜치 기준): 기존 JSON 내보내기가 신규 프로필 회차·게임 Mod ID 개별 선택·다운로드 전용 테이블을 누락한 채 complete:true가 될 수 있는 문제 확인.
- `app/api/data-export/route.ts`에 `profile_revision`, `profile_mod_choices`, `profile_downloads`의 사용자 소유 데이터 조회·내보내기 추가, `schemaVersion:2`로 구분. 신규 테이블 조회 실패 시 전체 내보내기 중단(503); 테이블별 10k건·8MB 제한 및 인증/RLS 유지.
- `lib/backup-preview.ts`, `components/BackupInspector.tsx`, `tests/backup-preview.test.ts`, `app/(private)/backup/page.tsx`를 새 백업 형식에 맞게 수정. **v1은 검사 가능하지만 신규 데이터가 없어 부분 백업으로 표시**. 새 v2에서는 누락된 신규 테이블에 완전성 판정을 부여하지 않음.
- `docs/BACKUP_V2_PROFILE_REVISIONS.md`에 내보내기 범위와 비트랜잭션 스냅샷/복원 미지원 제약 기록. 홈·모드·서버·등록 화면과 DB 권한·데이터는 변경하지 않음.
- **실제 Vercel Preview 빌드 완료**: 배포 `dpl_fvjQa8hnV63HkqhujVDASmVj9TBY` **READY**, 커밋 `0b80b0d0594f80ee5b2b4aa5dae75abfac66af20`, 전체 테스트 **236/236 통과**, `npm run typecheck`, `npm run lint`, Next.js 빌드 통과. Draft PR #20. 로그인한 브라우저로 실제 JSON 다운로드 테스트는 아직 미수행.

## 2026-11-21 승인된 시험 Supabase 프로필 스키마 적용 완료

- **사용자 승인**: 독립 시험 Supabase `smofdbjgcgdmscamknpw`의 관련 데이터 논리 백업·안전 검토 후 프로필 영구 저장용 신규 테이블 및 최소 쓰기/RLS 권한 적용. 운영 프로젝트와 main 병합 금지.
- 관련 `profiles`, `profile_mods`, `mods`, `mod_ids` 데이터가 모두 0건임을 확인해 `backups/test-profile-pre-schema-20261121.json`에 스냅샷 보존. **전체 DB/PITR 백업은 아님**.
- 테스트 DB 마이그레이션 세 개 적용·버전 이력 확인: `20261121103835_test_profile_revision_owner_snapshots`, `20261121103919_test_profile_owner_qualified_rls_fix`, `20261121104128_test_profile_snapshot_fk_indexes`. GitHub `supabase/migrations/`에 실제 적용 SQL을 보존.
- `profile_revision`·`profile_mod_choices`·`profile_downloads` 신규 테이블, RLS 모두 활성화, anon 접근 차단, authenticated 소유자 SELECT와 필요한 열 단위 INSERT만 허용. 기존 `profiles`에는 **본인 소유 INSERT(owner_id,name)만** 추가, 기존 `profile_mods` 권한·데이터 변경 없음.
- **사후 보안 점검에서 RLS 상관 서브쿼리 비한정 owner_id의 잘못된 해석 발견, 즉시 추가 마이그레이션으로 보정 후 실 정책 재확인**. 신규 FK 인덱스 누락 3건도 신규 테이블 내에서 해결.
- 실제 인증 계정으로 프로필/복수 게임 Mod ID(활성·비활성)/다운로드 전용 저장, 중복 revision/Mod ID/순번 및 잘못된 소유자/UPDATE 차단 테스트 통과. 미허용 UUID·anon 접근 차단 테스트 통과. 모든 테스트를 `ROLLBACK`해 관련 7개 테이블이 0건임과 기존 대기함 pending 1건 보존 확인.
- 남은 검증: **실제 타인 인증 계정 2인 교차**, 원자 CAS 저장 RPC, 전체 프로필 저장 API, 앱 브라우저 E2E. 기존 Supabase Advisor 보안 경고(`rls_auto_enable()`)는 범위 밖이라 변경하지 않음.
- 보고서: `docs/reviews/TEST_PROFILE_SCHEMA_RESULTS_20261121.md`; Draft PR #19. **운영 DB/운영 배포/main 병합/홈·모드·서버 UI 변경 없음.**

## 2026-11-21 6단계 서버 프로필 영구화 전 안전 검증

- **시험 DB 실제 확인**: `profiles`와 `profile_mods` 데이터 각 0건, `profiles` authenticated INSERT 불가 및 쓰기 RLS 없음. 기존 `profile_mods.mod_id`는 `mods.id` 참조. `profile_mod_choices`, `profile_downloads`, `profile_revision`은 미존재.
- 독립 브랜치 `feature/profile-persistence-plan-20261121`에서 `lib/profile-persistence-plan.ts` 구현(실제 DB에 쓰지 않음): 소유자·프로필 UUID·현재 revision 대조, 선택 Workshop/실제 게임 Mod ID 쌍을 서버 검증 후보 UUID로 확인, 비활성 행/원래 순서/다운로드 전용 Workshop 유지, 중복·모호함·오래된 버전·소유자 변경 차단.
- `tests/profile-persistence-plan.test.ts`에 회귀 테스트 추가. `docs/proposals/PROFILE_PERSISTENCE_PLAN.md`에 기존 자료 보존, 신규 테이블/권한/RLS/원자 저장과 테스트를 위한 승인 체크리스트 작성.
- **의도적으로 미구현**: 실제 프로필 DB 저장 API, DB 마이그레이션/GRANT/RLS, 기존 프로필 자동 이행, 홈·모드·서버 UI 수정, 운영 배포·main 병합. 새 Preview 검증 결과 확인 후 별도 기록.

## 2026-11-21 5단계 선택 그룹 A안 확정

- 사용자 확정: 선택 그룹의 기본 규칙은 **자유 선택**. 그룹별 필수·배타 제약은 사용자가 해당 그룹에 명시적으로 설정한 경우에만 적용.
- 설계서 4.3 확정사항 갱신, `docs/proposals/GROUP_FREE_SELECTION_DEFAULT.md` 작성.
- `lib/group-selection-rule.ts`와 `tests/group-selection-rule.test.ts`에 순수 검증 로직과 테스트 추가.
- DB 테이블/권한, 프로필 저장/자동 선택, 홈·모드·서버 UI, 운영 배포 및 main 병합은 변경하지 않음.
- Preview 빌드·테스트 결과는 별도 기록.

## 2026-11-21 5단계 카테고리 B안 확정 및 검증 준비

- **사용자 확정**: 모드 하나에 여러 카테고리를 지정하고, 그중 대표 카테고리 정확히 하나를 선택. 태그 다중 지정, 선택 그룹 독립 유지.
- 설계서 4.3 미결정 항목에서 카테고리 제한을 확정 사항으로 전환. **선택 그룹 기본 규칙/기본값은 여전히 미결정**.
- `lib/mod-category-assignment.ts`와 `tests/mod-category-assignment.test.ts`에 다중 카테고리·대표 포함·중복/빈 값 차단·불변성 검증 추가.
- `docs/proposals/MULTI_CATEGORY_PRIMARY.md`에 DB 관계 설계 초안 및 RLS/마이그레이션·승인 경계 작성.
- 아직 카테고리 관련 DB 테이블·API·화면 연결 없음. UI 디자인 변경, 데이터 변경, DB 권한 변경, 운영 배포, main 병합 없음.

## 2026-11-21 4단계 일괄 등록 선택·중복 검증 강화

- 별도 브랜치 `feature/batch-approval-logic-tests-20261121`, 이전 3단계 브랜치에서 분기.
- 기존 `ImportWorkbench`의 일괄 선택/전체 선택 필터만 `lib/batch-approval-selection.ts`로 추출. 화면 JSX, 입력 창, 확인창, 저장 API의 동작 및 Preview 차단 설정은 유지.
- `tests/batch-approval-selection.test.ts` 12건 추가: 오래된 후보 제외, 같은 Workshop 다른 출처의 자동 선택 금지, 저장 상태·중복 제외, 실패 후 재시도, 최대 20개 제한, 사용자 명시 선택·원본 불변 검사.
- `docs/BATCH_APPROVAL_VALIDATION.md`에 구조/남은 실검증 기록.
- 데이터 등록·삭제, DB 권한 변경, 운영 배포, main 병합 없음. 실행 결과는 CI/Vercel 확인 후 추가 기록.

## 2026-11-21 3단계 모드 수정·보관·복원 안전 로직 준비

- 사용자 요청: 다음 수동 작업/별도 승인이 필요하기 전까지 단계별로 개발·검증을 계속한다. 홈·모드·서버 UI는 추후 사용자가 조건을 정할 때 변경한다.
- 실제 시험 DB 조사: `mods`에는 제목·설명·보관 플래그·수정 시각 필드가 있지만, authenticated UPDATE/DELETE 권한 및 UPDATE RLS 정책은 **없다**. `updated_at` 자동 갱신 트리거도 없다.
- 별도 브랜치 `feature/catalog-mutation-validation-20261121`에 **호출되지 않는 순수 검증 로직** `lib/catalog-mutation-preview.ts` 및 테스트 `tests/catalog-mutation-preview.test.ts` 추가. 제목/설명 수정과 보관/복원만 계획하며 immutable Workshop/Mod IDs, 원본 조사, 프로필 선택 및 호환성 확인 상태를 변경하지 않는다.
- 이전 `updated_at`과 스냅샷 불일치, 잘못된/과도한 값, 임의 변경 필드는 거부한다. 실제 API/DB 쓰기 경로는 생성하지 않는다.
- `docs/proposals/CATALOG_MUTATION_PLAN.md`에 향후 DB UPDATE/RLS/GRANT·동시성·백업·사용자 승인 경계 명시. **DB 권한·실데이터, 운영 배포, main 병합 미변경**.
- 테스트/Preview 결과: 자동 검증 후 별도 기록.

## 2026-11-21 모드 카탈로그 조회 회귀 테스트와 100건 초과 검토

- 사용자 요청: 홈/모드/서버 메뉴 UI는 변경하지 않고 **목록·상세 조회 내부 검증을 먼저 보강**한다.
- `lib/catalog-read.ts`: 검색·필터·정렬 파라미터 정규화, PostgREST 필터 적용, 상세 UUID 판정 및 조사 기록 정리 로직 추출. 기존 SQL 소유자 범위 제한과 화면 마크업 변경 없음.
- `tests/catalog-read.test.ts`: 기본 필터, 잘못된 조건 무시, Workshop ID 정확 일치, LIKE 특수문자 처리, 보관 상태·정렬, 길이 제한, 상세 UUID, 잘못된 조사 원본 제외, 복수 Mod ID, 기존 100건 제한 회귀 테스트 추가. 테스트 **실행 결과는 CI 검증 이후 별도 기재**.
- `docs/CATALOG_PAGINATION_REVIEW.md`: 현재 `limit(100)`은 101건 이후 조회 수단이 없음을 명시. 이후 UI 확정 시 안정적인 2차 정렬과 다음 페이지 판정 및 RLS 유지 방식으로 페이지네이션 구현 권장.
- 브랜치: `feature/catalog-read-tests-20261121`, 기준: `feature/register-ui-compact-20261121`. **모드 UI 개편, DB 변경, 운영 배포, main 병합은 하지 않음.**

## 2026-11-21 등록 화면 UI 간소화 (사용자 확정 요청)

- 사용자 제공 모바일 화면을 기준으로 Workshop 입력 카드의 `1. Workshop 항목 입력` 제목·설명 문구를 제거하고 `Workshop URL 또는 ID` 레이블만 유지한다.
- 입력칸 높이를 4행 → 2행으로 줄이고, `입력 비우기`를 `지우기`로 바꾸어 레이블 줄 **오른쪽 끝**에 배치한다.
- **GitHub에 저장되지 않은 Workshop 링크도 Steam 공개 정보 API로 조회 가능**함을 명확히 안내한다. GitHub에 미리 저장된 조사 결과 조회는 선택형 접이식 영역으로 분리하며, 조회 버튼이 새 AI 분석을 시작한다고 설명하지 않는다.
- 사용자가 원치 않는 **수동 JSON 직접 입력·저장 UI는 기본 등록 화면에서 제거**한다. 다만 기존 `parseResearchPayload` 및 API 검증 코드는 후속 연동/복구용으로 유지하며 삭제·스키마 변경은 하지 않는다. Steam 조회 → 사용자별 영구 대기함 → 최종 등록 승인 경로는 변경하지 않는다.
- 변경 브랜치: `feature/register-ui-compact-20261121` (기준: `feature/local-modinfo-audit-20261121`). 수정: `components/ImportWorkbench.tsx`, `app/(private)/register/page.tsx`, `tests/preview-queue-ui.test.ts`. 테스트 소스를 추가했으며 **실행/실기기 검증 전**이다. 운영 배포, `main` 병합, DB·RLS 변경 없음.

## 2026-11-20 시험 Preview 로그인·대기함 실제 검증 및 UI 개선

- 시험 Supabase `smofdbjgcgdmscamknpw`의 Redirect URLs에 Preview OAuth 콜백 주소를 사용자가 추가한 뒤 Google 로그인이 성공했다. 운영 Supabase 및 운영 배포는 변경하지 않았다.
- 시험 Preview `dpl_52txdGf7JPW1fYqCPFumVcQ3mmrY`: Steam Workshop `3552615247` 공개 정보 조회에 성공했고, 시험 DB `research_queue`에서 `source=steam, status=pending` 1건을 직접 확인했다. 정식 `mods`는 0건. 사용자가 등록 화면의 `영구 대기함 1개` 표시를 확인하여 실제 앱 조회까지 성공.
- 화면 하단의 `이 환경에서는 저장할 수 없음`은 영구 대기함이 아닌 정식 카탈로그 등록을 막는 버튼이었다. 안내 문구의 혼동을 수정하여 대기함과 정식 등록을 분리했다.
- 시험 Preview에서 `queueWritable=true`, `readOnly=true`일 때 대기함 숨기기 버튼은 보이지만 확인창이 `!readOnly` 조건으로 표시되지 않는 오류를 수정했다. 새 코드에서는 `queueWritable` 조건을 사용한다. 데이터 상태 변경 없이 코드만 수정했다.
- `components/ImportWorkbench.tsx`에 대기함 제목/Workshop ID 목록과 구분 설명을 추가하고, `tests/preview-queue-ui.test.ts`에 SSR 렌더링 검사를 추가했다. 정식 카탈로그 등록과 운영 환경 쓰기 차단은 유지된다.
- **남은 검증:** 새 Preview의 숨기기 확인창 표시/취소 및 실제 숨기기 동작은 브라우저에서 아직 실행하지 않았다. 사용자가 승인하기 전 실제 대기 항목은 숨기지 않는다. 새 배포의 OAuth Redirect URLs 등록 여부는 별도 확인이 필요하다.


## 2026-11-20 안전 범위 일괄 개발 (현재 작업 브랜치)

- 작업 브랜치: `feature/remaining-mvp-safe-batch` (Draft PR [#7](https://github.com/andohyup-cmyk/zomboid-mod-manager/pull/7)), 이전 Draft PR [#6](https://github.com/andohyup-cmyk/zomboid-mod-manager/pull/6)을 기준으로 누적 개발. **main 병합 없음.**
- **구현·테스트:** Steam GetPublishedFileDetails 응답을 ID/게임별 검사하고 1MB 스트리밍 제한 적용; 미확인 Mod ID/호환성 추정 금지. B42.22·싱글·멀티·서버 중간 추가 각각 조사 상태 구분.
- **카탈로그:** 소유자 목록의 이름/Workshop ID 검색, 상태·보관·정렬 필터, 모드 상세·Mod ID·원본 출처 보기(조회 전용).
- **조사함·승인:** 영구 대기함 페이지별 조회 및 중복 안전 재시도, 출처별 후보 구분, 중복 없는 항목 전체 선택, 최종 확인 후 일괄 승인, 성공·기존 등록·실패 건수 구분. 실제 DB 적용 전이므로 저장은 검증하지 않음.
- **서버 설정:** 명시적인 선택 그룹 min/max 검증 엔진을 추가. 근거 URL이 있는 검증된 규칙만 복사 차단에 반영. 그룹 기본 규칙은 사용자가 확정하지 않았으므로 설정하지 않음.
- **프로필:** 임시 선택·활성/비활성·순서·다운로드 전용 Workshop JSON 파일 내려받기와 불러오기(교체 확인). DB 저장과 게임 파일 수정 기능이 아님.
- **백업:** 로그인 소유자 데이터의 JSON 내보내기(이전 브랜치) 및 브라우저 내부 파일 형식 검사. 미포함 테이블/미완전 데이터 표시, 복원·DB 쓰기 없음.
- **보안:** 인증 POST/PATCH에서 외부 브라우저 Origin 차단 보완, 기존 로그인 소유권·RLS·시험 읽기 전용 보호 유지.
- **PC 복귀 준비:** `scripts/pc-audit-workshop.ps1`, `scripts/pc-verify.ps1`, `docs/PC_VERIFICATION.md`. 아직 PC/게임에서 실행하지 않음.
- **DB 설계 준비:** `docs/proposals/DB_SECURITY_AND_PERSISTENCE.md` — 신규 RLS/카탈로그 관계/프로필 영구화 방안. 실제 SQL 적용 없음.
- **최신 실제 CI 시험:** Vercel Preview `dpl_Gh2bKoLHh7fQ5LywsSynE2xiAarM`, 코드 `6932499` — 단위 테스트 **150/150 통과**, TypeScript·ESLint·Next.js 빌드 통과, 배포 READY. 브라우저 회귀 시험 소스는 추가했으나 실제 PC 브라우저에서는 미실행. Preview 비로그인 대기함 및 백업 API 403 확인.
- **승인/연동 필요:** 시험 DB `research_queue`/RLS/권한 적용, 프로필·메타데이터 저장 스키마 결정/적용, 운영 배포·main 병합, 시험 OAuth 실제 로그인과 DB RLS 쓰기 검증. Supabase Advisor의 권한 함수 경고는 원인·수정 승인 전 변경 금지.
- **추후 PC 검증:** 실제 B42.22 모드 `mod.info`, `Mods=`/`WorkshopItems=`, 서버 로드·멀티 동기화, PC/모바일 브라우저 실측. 기존 데이터·서버 설정은 수정하지 않음.

## 과거 단계별 기록 (역사적 스냅샷)


## 2026-11-19 로컬 통합

작업 브랜치는 `integration/local-stages-1-3`이다. 기준 `25568c2`에서 시작해 Codex `6a21a88`, 모바일 `62b4421`, PR #2 `a6daff7` 및 이 커밋을 기준으로 한 Windows OAuth 백업의 기능을 결합한다. DB·RLS 설계 `83a35bb`는 후속 영구 저장 검토 자료다.

- **등록 입력과 보호.** Codex의 URL·숫자 ID 단독·복수·혼합 처리, 수동 JSON 검증과 강화된 카탈로그 쓰기 판정을 사용한다. 입력 파서는 선행 0을 정리하되 기존 JSON의 Workshop ID 문자열은 보존한다. Preview에서는 조회·검토만 가능하다.
- **조사함과 승인.** 소유자용 `GET /api/ai-research-inbox`가 정적 조사 자료에서 이미 등록된 항목을 제외한다. 화면은 출처별 후보를 보여주고 사용자가 확인한 항목을 기존 승인 API에 보낸다. 조회, 텍스트 입력, 미리보기, 취소는 카탈로그 저장을 발생시키지 않는다.
- **OAuth.** 콜백에서 기존 세션 갱신을 건너뛰고 verifier를 보존한다. PR #2 진단은 Preview에서 해당 프로젝트의 verifier 쿠키 존재 여부와 오류 상태만 남긴다. 배포에서 관찰된 PKCE 교환 401의 원인은 미확인이다.
- **프로필 편집과 출력.** `/profiles/editor`에서 개별 게임 Mod ID, 활성 상태와 순서를 메모리에서 편집한다. 추천 순서를 명시적으로 적용하고 활성 행을 `Mods=`와 `WorkshopItems=`에 반영한다. 치명적 오류는 복사를 막고 일반 경고는 확인을 받는다.
- **로컬 검증.** 등록 입력·보호 `c80115f`, 조사함·OAuth `05e2c93`, 프로필 편집·출력 `0277190`. 단위 테스트 105개(15개 파일), TypeScript, ESLint 및 Next.js 16.4.6 프로덕션 빌드가 통과했다.
- **브라우저 검증.** 로컬 Chromium과 모의 Supabase에서 3건 통과. Preview에서는 등록 UI·API 차단과 승인 RPC 0건을, 쓰기 허용 모의 환경에서는 확인창 취소 시 0건·최종 승인 시 선택한 자료 1건을 확인했다. 모바일 프로필은 비활성화 후 출력 제외와 재활성화 시 원래 위치 복원을 검증했다. 동일 프로필 시험은 쓰기 허용 모드에서 중복 실행을 생략했다.
- **출력 형식.** 게임 Mod ID의 역슬래시 접두사 유무를 선택할 수 있다. 기본값은 기존 개발 샘플의 역슬래시다. 실제 B42.22 형식 검증은 남아 있다.
- **남은 구현.** 사용자별 영구 대기 목록과 복수 항목 최종 승인, 프로필 저장·레거시 이행, 실제 분류·관계 데이터 공급이 필요하다. 보관 행·중복 후보·비활성 순서를 보존하는 저장 구조는 별도 결정 대상이다.
- **남은 환경 검증.** 실제 Google 로그인, 시험 DB의 RLS·직접 쓰기·RPC 및 운영과의 격리, 실제 B42.22 서버 로딩은 검증 대기다.

### 원본에서 확인한 자료

| 출처 | 기존 검증·진행 기록 |
|---|---|
| 모바일 `62b4421` | 격리 복원본의 단위 테스트 64개 통과. 개별 선택·상태·정렬·카탈로그 조회 대상. |
| Codex `6a21a88` | 격리 복원본의 단위·정적 테스트 58개 통과. 개발라인 기록에 Playwright 6개, Python 안전장치 6개, 합성 PostgreSQL 17.11 검사 결과가 있다. |
| DB 설계 `83a35bb` | 소유자·개별 후보·활성·순서·리비전을 다룬 SQL 초안의 문법 검사 기록. 통합 브랜치에는 초기 마이그레이션 2개가 있다. |
| PR #2 및 Windows 백업 | 이전 시험에서 정적 조사함 조회와 모바일 대기 1건 표시가 확인됐다. 독립 시험 프로젝트 설정 이후 Preview 콜백이 로그인 화면으로 돌아갔고 PKCE 토큰 교환에서 401이 기록됐다. Windows에서는 이전 세션 갱신 실패가 PKCE 호출 전에 verifier를 지우는 별도 사례를 재현하고 모의 서버로 수정 동작을 검사했다. |

[PR #2 당시 작업·시험 기록](https://github.com/andohyup-cmyk/zomboid-mod-manager/blob/a6daff7/docs/TASKS.md) · [통합 설계](../좀보이드_모드관리앱_프로젝트_설계.md)

## 초기 코드

- [x] Next.js/TypeScript/Tailwind 프로젝트 파일
- [x] 모바일 및 데스크톱 기본 화면·탐색
- [x] Google 로그인/콜백/로그아웃 구현 코드
- [x] 접근 허용 UUID + RLS SQL
- [x] 모드 카탈로그 목록/이름 검색
- [x] Workshop 링크 여러 개 분석
- [x] AI 조사 JSON 검증/미리보기/개별 승인 저장 코드
- [x] Workshop ID / Mod ID 분리
- [x] 데이터 유효성 검사 단위 테스트 소스
- [x] 최초 SQL 마이그레이션과 개발 문서

## 초기 작성 당시 검증 및 연동 대기

- [ ] npm install, typecheck, lint, unit test, build 실제 실행
- [x] Supabase 프로젝트 생성 및 초기 SQL 실행 성공(사용자 제공 Supabase 화면에서 `Success. No rows returned` 확인, 앱 연동·RLS 동작 검증은 별도)
- [ ] Google OAuth 실로그인 확인
- [ ] 본인 UUID 허용 및 타 계정 차단 확인
- [ ] 모바일/PC 화면 확인
- [ ] DB 등록·중복·RLS·트랜잭션 롤백 테스트
- [ ] Vercel 연결 및 승인된 배포

## 초기 작성 당시 후속 기능

- [ ] ChatGPT 조사 결과 앱 직접 전달(A) 방식 구현
- [ ] 모드 상세·수정·보관, 카테고리·태그
- [ ] 선택 그룹 규칙 확정 및 구현
- [ ] 서버 프로필 생성/편집·활성 모드와 로드 순서
- [ ] Mods= / WorkshopItems= 출력·검증
- [ ] 데이터 백업/내보내기/복원
- [ ] 친구 공유(후속)
- [ ] 앱 내부 AI 조사(C, 후속)

## 원칙

사용자의 승인 없이 외부 계정 변경·결제·공개 배포 또는 실제 서버 설정 변경을 하지 않는다. 테스트하지 않은 부분은 미검증으로 보고한다.

## Google OAuth/Supabase 연동 준비 보완

- [x] Supabase 공식 Next.js 16 SSR 가이드와 인증 코드 비교
- [x] Supabase SSR 의존성 버전 갱신, Proxy의 세션 갱신 캐시 헤더 전달 처리
- [x] OAuth 콜백/로그아웃의 no-store 응답 설정
- [x] 모바일용 설정 순서 문서 작성
- [ ] Google OAuth 클라이언트 생성, Supabase Provider 등록, 앱 Redirect URLs 및 실로그인 검증
- [ ] Vercel 연결 및 실제 DB 인증·저장 동작 검증(서비스 연결 필요)
- [ ] npm 의존성 설치·실빌드 테스트(현재 실행 환경 npm 외부 연결 불가)

## 2026-11-18 실제 진행 현황

- 사용자 화면으로 확인: Supabase 조직 및 `Zomboid Mod Manager` 프로젝트 생성(Healthy), SQL Editor에서 재실행용 `202611180002_resume_initial_setup.sql` 성공 응답 확인.
- **미검증:** 개별 테이블/권한 실제 상태, RLS 접근 제어, 앱 API 정상 작동. SQL Editor 실행 성공만 확인했으므로 후속 검증 필요.
- 현재 이 대화의 이용 가능한 연결 도구 목록에서 Supabase 쿼리 실행 기능은 제공되지 않음. 계정 연동이 곧바로 도구 접근을 보장하지는 않음.
- 다음 사용자 작업: Google Cloud 프로젝트 및 Google OAuth Web client 생성. OAuth 클라이언트 비밀값은 Supabase 설정 화면에만 입력.

## 2026-11-18 모바일 실기기 모드 등록 검증

- [x] 배포된 모바일 앱에서 Google 로그인 후 등록 화면 접근(사용자 확인).
- [x] Workshop 링크 `2142622992` 입력 시 ID 추출.
- [x] `Repair Any Clothes` JSON 입력 및 미리보기: Workshop ID, Mod ID `RepairAnyClothes`, 출처, 미검증 상태 표시.
- [x] 사용자 승인 후 `등록 완료` 및 `카탈로그에 저장했습니다.` 메시지 표시.
- [x] 모드 카탈로그에서 동일 Workshop ID/Mod ID 조회.
- [x] 동일 JSON 재등록 시 `이미 등록된 Workshop ID입니다.` 메시지 확인.
- [ ] DB 중복 제약/동시 요청/RLS/롤백은 별도 검증 필요.
- [ ] 모바일 메뉴 전환 지연은 Issue #1에서 추후 조사.

검증 근거: 사용자가 제공한 모바일 앱 스크린샷. 실제 게임 내 B42.22 및 멀티 호환성은 검증하지 않음. 위 테스트는 앱 기능의 정상 동작 확인이며 DB 내부 제약을 직접 조회한 것은 아님.

## 앱 내 AI 조사 자동화 — 개발 착수 계획 (미구현)

- 사용자 선택: Steam Workshop 링크 입력 후 AI 조사 → 출처/확인 시점/미확인 상태 포함 미리보기 → 사용자 개별 승인 → 기존 `/api/mods` 저장 흐름 유지.
- 기존 JSON 수동 입력(B)과 로그인/RLS/중복 등록 방지 동작을 유지한다.
- [ ] 실제 등록 화면·API 코드 경로 및 검증 유틸리티 확인.
- [ ] Steam 원문 수집 경로의 접근 가능성, 실패·차단·비공개 항목 처리 설계.
- [ ] AI 호출 제공자 및 비용·예산·사용량 제한 정책을 사용자와 확정(별도 API 과금 가능, Plus 구독과 별개).
- [ ] 인증된 서버 전용 조사 API 구현. 비밀 키를 브라우저/저장소에 노출하지 않음.
- [ ] 결과 구조 검증, 출처 검증, ID 불확실성 및 오류 표시, 승인 전 DB 미저장 테스트.
- [ ] 모바일 실기기 검증 후 배포. 기존 Issue #1 메뉴 지연은 별도 유지.

이 항목은 계획 기록이며 AI 자동 조사 기능이 구현 또는 배포됐다는 뜻이 아니다.

## 2026-11-18 비용 정책 확정 — AI 조사 자동화

- **[사용자 확정]** 별도 유료 AI API 사용 및 추가 과금 없이 진행한다. ChatGPT Plus를 외부 앱 호출용 API로 간주하지 않는다.
- 우선 무료로 접근 가능한 Steam Workshop 공개 정보 수집과 기존 Workshop ID 추출, JSON 검증/미리보기/승인 흐름을 활용한다.
- AI 분석은 ChatGPT 대화에서 수행하고, 앱으로 조사 결과를 전달하는 과정의 수작업을 줄이는 방향을 검토한다. 자동 전달 방식은 구현 가능성과 인증/보안 검증 전까지 미확정이다.
- Steam 원문 수집은 접근 차단, 변경, 비공개, 누락 가능성을 고려하고 Mod ID/호환성 정보를 추측해 채우지 않는다.
- [ ] 등록 화면과 API 코드 경로를 확인하고 무료 메타데이터 수집 방식의 구현 범위 확정.
- [ ] 인증/서버측 입력 검증/오류 안내를 포함한 작은 단위 구현과 테스트.
- [ ] 기존 수동 JSON 등록을 유지하고 모바일 실기기 검증.
- 유료 API 방식은 사용자 재승인 없이는 도입하지 않는다.


## 2026-11-21 로컬 mod.info 참고 검증 (별도 작업 브랜치)

- [x] PC 조사 JSON을 브라우저 메모리에서만 읽는 파서 및 서버 출력 화면의 선택적 참고 검사 구현.
- [x] Workshop/Mod ID 쌍, 복수 Mod ID, B42 경로/버전별 require 차이, 선언 의존성 누락·순서 경고를 별도 검사.
- [x] 독립 로컬 테스트 8개 통과; 실제 jjinmac-1 활성 64개가 조사 파일의 ID 쌍과 일치, B42 경로 미확인 5개는 정보로 표시.
- [x] 시험 Vercel Preview에서 `npm run verify`: 단위 테스트 163개 통과, TypeScript·ESLint 통과, Next.js 빌드 READY (커밋 `1857a29`, 배포 `dpl_GCd7M2b437c8eMSTtxCBv1Cd5tPp`).
- [x] 신규 `mod.info` 검사 모바일 Chromium 자동 테스트 1개 통과 (GitHub Actions `44866198126`, 별도 승인 모의 환경은 1개 skip).
- [ ] 기존 전체 브라우저 통합 테스트에서 별도 2건 실패: 조사함 입력 필터의 오래된 기대치, 동일 텍스트 선택자 strict 충돌. 현재 미해결.
- [ ] 최신 시험 Preview의 Google OAuth 실로그인과 실제 갤럭시 화면 및 파일 선택 UI 확인은 사용자 실기기 검증이 필요함.
- [ ] 정식 카탈로그/서버 프로필 저장과 실제 파일 반영은 별도 작업이며 이번 검사에서 수행하지 않음.
- 이 변경은 선택 규칙을 확정하거나 실제 B42.22/멀티 호환성을 인증하지 않음. 상세: [LOCAL_MODINFO_VALIDATION.md](LOCAL_MODINFO_VALIDATION.md).


## 2026-11-21 시험 Preview Google OAuth 실패 조사 (읽기 전용)

- [x] 실제 오류가 난 주소는 신규 로컬 검사 Preview가 아닌 구형 진단 Preview `zomboid-mod-manager-ov0v5h2e7-andohyup-cmyk.vercel.app`임을 Vercel 런타임 로그에서 확인.
- [x] 구형 Preview `/auth/callback`에서 2026-11-21 05:29:32 UTC `exchange_code_for_session_failed`, HTTP 401, `api_key_or_jwt` 분류. PKCE verifier 쿠키는 존재. 코드·토큰·쿠키 값은 기록하지 않음.
- [x] **현재 Vercel 전체 Preview 환경 변수**의 Supabase URL은 시험 프로젝트(`smofdbjgcgdmscamknpw`)를 가리키며, Preview의 `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 해당 프로젝트의 현재 활성 legacy anon 키와 정확히 일치. 앞선 키 불일치 주장은 검증 결과 잘못된 것이므로 채택하지 않음.
- [x] 구형 Preview 배포(2026-11-20 04:51 KST) **이후** Vercel Preview 키가 2026-11-20 05:37 KST 갱신됨. 오래된 배포가 예전 키 스냅샷을 사용할 가능성은 있으나, 실제 배포 당시 키 내용은 직접 확인하지 못함.
- [x] Supabase Auth 로그에 새 배포 `zomboid-mod-manager-paodzogqz-andohyup-cmyk.vercel.app/auth/callback`을 요구한 `/authorize` 요청과, 구형 Preview 주소로 인증을 다시 시도한 요청이 구분되어 있음. **새 도메인의 Redirect URLs 허용 여부는 미확인**.
- [ ] 시험 Supabase **Authentication → URL Configuration → Redirect URLs**에서 고정 시험 브랜치 alias의 정확한 콜백 주소 1개가 허용되었는지 확인. 없으면 별도 승인·최소 변경 후 저장: `https://zomboid-mod-manager-git-feature-local-modi-f060b2-andohyup-cmyk.vercel.app/auth/callback`. 와일드카드·운영 DB·Google Cloud 설정은 수정하지 않음.
- [ ] 지정한 고정 시험 alias로 Google 로그인 실기기 검증 및 같은 시각 Auth/Vercel 로그 대조. 실제 성공 전 문제 해결 완료로 보고하지 않음.
- 본 연결에서 Supabase Auth URL Configuration 읽기/수정 도구는 제공되지 않음. 사용자가 시험 프로젝트에서 필요한 최소 조치를 수행해야 함. 그 외 코드는 수정·재배포 불필요.

## 2026-11-24 선택 그룹·mod.info 후속
- PR #58: 프로필 편집기 선택 목록에 모드별 mod.info 참고 배지(출력·복사 로직 불변).
- PR #59: 복수 Mod ID Workshop에 "자유 선택 · 0~N개" 안내, 자동 활성화 없음.
- 선택 그룹 시험 DB 스키마(min/max NULL = 자유 선택 기본, 소유자 RLS, `save_selection_group` RPC) 작성. 로컬 Postgres(Supabase 스텁)에서 마이그레이션·롤백 검증·타 소유자 차단 확인. 시험 DB 적용은 미실행.
- 사용자: 선택 그룹 마이그레이션 및 롤백 검증 SQL을 시험 DB에 실행 성공(2026-11-24).
- 선택 그룹 API(`app/api/selection-groups/route.ts`) + `components/SelectionGroupPanel.tsx`(기본 자유 선택, 최대1/최소1/정확히1 선택 규칙, 근거 미확인 규칙은 권고만, 자동 활성화 없음). 명시 규칙 그룹만 서버 설정 출력 검증에 전달. verify 385 pass/build 통과. Preview·실기기 미확인.

- 2026-11-24: 모바일 내비 '서버' 탭 밀림(긴 Mod ID 카드 overflow)·등록 후 `/mods` 미갱신(클라이언트 라우터 캐시) 수정(#66, force-dynamic, staleTimes 0). 시험 Preview 모바일 확인 완료. 배포는 `.github/workflows/vercel-diagnose.yml`(Vercel API, secret `VERCEL_TOKEN`)이 develop push마다 수행(Deploy Hook은 배포를 만들지 않아 사용 안 함).
