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
