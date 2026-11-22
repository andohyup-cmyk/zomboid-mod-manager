# 모바일 관계 E2E 전용 화면 준비 상태 — 2026-11-22

## 목표
사용자가 실제 모바일 Google OAuth 세션에서 `조회 → 초안 등록 → 별도 명시적 승인 → 필수 관계 출력 검사 → JSON v3 백업 검사`를 안전하게 실행하는 **시험 전용 비공개 화면**. 기존 앱 홈·모드·서버 화면 및 네비게이션은 변경하지 않음.

## 이미 구현·검증됨
- 구현: `app/(private)/diagnostics/relations/page.tsx`, `components/RelationE2EClient.tsx`.
- 접근 조건: **시험 Vercel Preview**, 정확한 브랜치 `feature/mobile-relation-e2e-harness-20261122`, 정확한 Vercel 프로젝트와 Supabase 시험 URL, 로그인 완료 및 `is_authorized_user()`. 다른 환경에서는 404. 서비스 키·토큰 출력 없음.
- 화면 주소(시험 Preview 전용): `https://zomboid-mod-manager-7tgr0qx0z-andohyup-cmyk.vercel.app/diagnostics/relations`.
- **읽기 전용 화면**: 관계 조회 GET과 JSON v3 검사 GET은 데이터가 없어도 시도 가능. 등록/승인 버튼은 기본 비활성.
- 명시적 쓰기: `MOD_RELATION_TEST_WRITE_ENABLED=true`가 기능 브랜치 **Preview에 별도 설정**된 경우에만 유효. 현재 **설정하지 않았으며 false로 동작**.
- 가상 자료 신원 점검: 같은 소유자의 Workspace가 아닌 가상 Workshop `9000099811` (`DemoMain`) / `9000099812` (`DemoPatch`), 이름 `FICTIONAL_E2E_SOURCE`/`FICTIONAL_E2E_TARGET`, 조사 기록 1건/출처/날짜, `E2E_TEST_ONLY_RELATIONS` 프로필과 **활성화된 주체 한 항목**을 모두 확인하기 전까지 관계 쓰기 버튼 비활성.
- 관계 생성은 `POST /api/mod-relations`로 **초안만** 수행. 승인은 다시 한 번 명시적으로 사용자 확인창을 거친 후 `POST /api/mod-relations/approve`; 화면 진입이나 조회가 승인 요청을 보내지 않음.
- 출력·백업은 읽기 전용 HTTP GET이며 검사 결과의 숫자/상태만 표시하고 사용자의 원본 백업을 화면에 노출하지 않음. **`readyForCopy=false` 유지**.
- 이전 Draft PR #29 수정: 비활성 관계 주체와 승인 전 관계의 미선택 대상은 추가 조회하지 않음. 활성 주체의 승인된 의존성 대상만 소유자 RLS 아래 확인.

## 승인 전까지 금지한 작업
**미적용 SQL**: `docs/proposals/MOBILE_E2E_FICTIONAL_FIXTURE_NOT_APPLIED.sql`

승인 후 생성할 시험 DB 전용 가상 자료의 정확한 범위:
- 본인 계정 소유 `mods` **2건** (Workshop ID `9000099811`, `9000099812`; 실제 Steam 모드라고 주장하지 않는 FICTIONAL 명칭).
- `mod_ids` **2건** (`DemoMain`, `DemoPatch`), `research_records` **1건** (`example.test` 가상 근거, **모든 호환성 상태 `unverified`**).
- `profiles` **1건**, `profile_revision` **1건**, `profile_mod_choices` **1건** (DemoMain만 활성 선택).
- `mod_relations`는 **미리 만들지 않음**: 모바일에서 POST 버튼을 누를 때 미승인 1건, 확인 버튼을 누르면 해당 1건만 승인.
- DB 실행은 시험 프로젝트 `smofdbjgcgdmscamknpw`에 한정, 소유자 인증 역할, 기존 데이터와 이름/ID 충돌 발견 시 전체 중단. `COMMIT`하는 영구 샘플이므로 **사용자 별도 승인 전까지 절대 적용 금지**.
- 브랜치 전용 `MOD_RELATION_TEST_WRITE_ENABLED=true` 환경변수 추가도 **별도 승인 전까지 절대 설정 금지**.
- 시험 종료 뒤 **신규 fixture로 생성한 특정 행들만** 삭제하는 정리 작업 역시 데이터 삭제에 해당하며 사용자 승인이 필요함. 기존 데이터는 삭제 대상 아님.

## 검증 결과
- PR #29: 전체 **318/318** 자동 테스트, TypeScript·ESLint·Next.js Preview 빌드 성공.
- PR #30: 전체 **319/319** 자동 테스트, TypeScript·ESLint·Next.js 빌드 성공. Preview `dpl_LgeK6im6H1aPUPL2UTFhwg1YyHCR` READY, 검증 커밋 `5325870c4c706dee031e7229069b498430913940`. 이후 문서 커밋만 추가.
- 시험 DB 실조회: `mods,mod_ids,research_records,profiles,profile_revision,profile_mod_choices,mod_relations` **각 0건**, 기존 연구 대기함 pending **1건**.
- 해당 Preview 브랜치에 Git-branch-scoped 환경변수 **없음**, 쓰기 차단 상태. 운영 배포/main/실게임 파일/기존 화면 디자인 변경 없음.
- **실사용 브라우저 HTTP POST→승인→설정 GET→JSON v3 내보내기 연속 E2E는 아직 수행하지 못함**. 테스트용 영구 데이터 등록과 분기된 쓰기 허용에 대한 사용자 승인이 필요함.


## [사용자 승인 이후 적용 완료: 2026-11-22]

- 사용자가 앞서 요청한 가상 시험 자료 생성, **이 기능 브랜치의 Preview 한정** 관계 등록/승인 쓰기 허용, 시험 종료 후 생성한 fixture 관계만 정리하는 범위를 **명시적으로 승인**함.
- 사전 확인: 시험 Supabase `smofdbjgcgdmscamknpw` 허용 계정 1개, Auth 사용자 1개, 기존 모드/Mod ID/조사 기록/프로필/관계 0건, 예약된 시험 Workshop ID/프로필 이름 충돌 없음, 기존 연구 대기함 pending 1건. `mod_relations` 익명 SELECT 불가, `authenticated`는 승인 필드를 직접 INSERT할 수 없음.
- 첫 번째 승인 SQL 롤백 점검에서는 `authenticated`가 `public.authorized_users` 원본 테이블에 직접 SELECT 권한이 없어 거부됨. **DB 권한은 변경하지 않고** 스크립트에서 해당 직접 조회를 제거했으며, 사전 관리자 권한의 1인 확인+SQL의 `is_authorized_user()` 승인 확인으로 대체. 수정 후 **ROLLBACK 시험 성공**.
- 수정한 정확한 SQL(역사적 파일명 `MOBILE_E2E_FICTIONAL_FIXTURE_NOT_APPLIED.sql`)을 **BEGIN...COMMIT**으로 시험 DB에만 실행, 성공. 생성 결과: `mods=2` (FICTIONAL 2개), `mod_ids=2`, `research_records=1` (example.test 근거, 모든 호환성 unverified), `profiles=1`, `profile_revision=1`, `profile_mod_choices=1`. **`mod_relations=0`**: 실제 모바일 POST 버튼에서 생성하도록 비워둠. 기존 `research_queue` pending 1건 유지.
- 로그인 사용자 `authenticated` + RLS 하에서 실제 fixture 모드 2개/Mod ID 2개/조사 원문/프로필 선택 1개를 볼 수 있음 확인. 동일 fixture를 사용하는 **미승인 관계 INSERT → 승인 UPDATE → 조회** SQL을 트랜잭션 내 재검증했고 `EXISTING_FIXTURE_RLS_DRAFT_APPROVE_ROLLBACK_PASS` 통과; 관계 테스트 행은 ROLLBACK되어 여전히 0건.
- Vercel `MOD_RELATION_TEST_WRITE_ENABLED=true`는 **`feature/mobile-relation-e2e-harness-20261122` 브랜치 Preview에만** 생성했음을 환경변수 목록에서 확인. 기존 다른 Preview의 독립 쓰기 플래그/Production 환경은 변경하지 않음. 공유 Preview Supabase URL이 정확한 시험 프로젝트임을 검사.
- 플래그 반영 새 Vercel Preview `dpl_9VxmsXy393MSV3MK1ArmAAuj7Jyh` **READY**, URL `https://zomboid-mod-manager-d14qx2l2w-andohyup-cmyk.vercel.app/diagnostics/relations`, 코드 `9ff7f68026a785085ec563f67028d1fcb201868c`. 빌드 성공, 이전 전체 **319/319 테스트** 통과 후 이번 코드에서는 SQL 주석 수정만 발생.
- 안전한 종료를 위해 `docs/proposals/MOBILE_E2E_FIXTURE_CLEANUP_AFTER_TEST.sql`에 대상 식별자·소유자·연관 참조·건수까지 확인한 **fixture 전용 정리 SQL** 작성. 현재 자료 상태에서 COMMIT 대신 ROLLBACK으로 드라이런 통과, 뒤이어 DB 건수 재확인해 자료 유지됨. **아직 실제 정리/삭제하지 않음**.
- 사용자 브라우저에서 `GET` 로그인/관계 목록은 기존 Preview에서 이미 확인됐지만, **이번 새로운 Preview의 모바일 POST 초안·명시 승인·출력·백업 HTTP E2E는 사용자 조작 전까지 미확인**. 로그인 쿠키는 새 Preview URL과 공유되지 않을 수 있으므로 해당 URL에서 다시 OAuth 로그인이 필요할 수 있음.
- 앱의 홈·모드·서버 화면은 변경하지 않음. 운영 배포, main 병합, RLS/GRANT 변경, 기존 데이터 수정·삭제/결제 없음.
