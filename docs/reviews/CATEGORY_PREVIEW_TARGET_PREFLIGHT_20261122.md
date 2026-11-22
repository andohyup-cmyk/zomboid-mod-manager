# 시험 Preview 연결 대상 검증 게이트

**안전 분기:** `test/category-preview-origin-guard-20261122` (Draft PR #38 위). 이 브랜치는 실제 DB 카테고리 쓰기를 허용하지 않습니다.

이 branch의 `npm run build` (Vercel)을 실행하기 전에 `scripts/category-preview-target-guard.mjs`가 시험 프로젝트·Preview·정확한 브랜치·시험 Supabase URL·키의 존재를 검증합니다. 키나 URL 값은 로그로 출력하지 않고 일치/불일치만 표시합니다. Vercel 환경변수 조회 API가 암호화 상태를 반환해 직접 일치 검증을 할 수 없어서, **Preview 빌드 실행 환경에서의 검사**로 보완합니다.

- 실패 시 빌드를 즉시 중단하여 해당 브랜치의 Preview 생성과 추후 쓰기 실험을 보류합니다.
- 성공하더라도 OAuth 로그인·사용자 세션, 실제 HTTP 쓰기, 키의 프로젝트 귀속까지 검증된 것은 아닙니다.
- 사전 RLS/RPC 시험은 실 DB에서 `BEGIN; SET LOCAL ROLE authenticated; ... ROLLBACK`으로 실시; 카테고리/모드 등 0건 유지. 기존 research_queue 자료 삭제/변경 금지.
- **후속 별도 확인:** 실제 인증 브라우저에서만 GET/POST E2E, 임시 쓰기 플래그 생성 전 OAuth·RLS/RPC·시험 DB 격리 확인, 기능 완료 후 플래그 즉시 비활성 및 새 fixture만 엄격하게 정리.
- 운영 DB·OAuth 설정·RLS/GRANT·기존 데이터·기존 기능 PR·main 수정 없음.

## 시험 쓰기 활성화 준비 (추가 커밋)

- 시험 전용 브랜치에서만 `isTestCategoryWriteAllowed`가 true 가능. **현재 Vercel 플래그는 미설정이므로 계속 false**.
- 추후 허용 시에도 Preview, 프로젝트 ID, 시험 DB URL, 정확한 브랜치, 별도 `MOD_CATEGORY_TEST_WRITE_ENABLED=true`를 모두 요구.
- 자동 만료: **2026-11-24 00:00(KST)** 이후 함수가 항상 false(추가 배포나 설정을 하지 않아도 POST 차단).
- 만료 후에도 환경 플래그는 별도 false로 되돌려야 하며, 영구 생성한 시험 자료의 삭제는 정확한 식별자 확인 뒤 별도로 처리.
- 이 작업은 **시험 브랜치 코드만** 변경; 실제 DB·OAuth·운영 권한·RLS·UI 디자인 등은 변경하지 않음.
