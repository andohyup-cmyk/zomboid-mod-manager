# AI 작업 인수인계 — 현재 상태 요약

> 갱신일: 2026-11-23. 이 문서는 **실시간 상태가 아니다**. 작업 전 최신 `develop`/`main` HEAD·PR·이슈를 다시 확인한다. 상세 이력은 `docs/TASKS.md`와 각 PR을 참조한다.

## 저장소 및 기준
- 저장소: `andohyup-cmyk/zomboid-mod-manager` (비공개).
- 주 개발 담당: **Antigravity** 단독 주 개발.
- 개발 통합 브랜치: **`develop`** (`3475495` 이후 최신) — 구형 PR(`#2`~`#41`) 정리 완료, `#44`~`#53` 통합 완료:
  - `#45`: 카테고리 0개(미분류) 해제 검증·모바일 패널·시험 DB 마이그레이션 SQL 초안(`20261123000100_test_mod_categories_allow_unclassified.sql`).
  - `#46`·`#47`: 모바일 모드 목록(검색 상단·접이식 필터·카테고리 필터·대표 카테고리 배지) 및 상세(공용 상태 배지·접이식 조사 기록) 개편.
  - `#48`: 모바일 등록 화면 하단 고정 일괄 등록 바.
  - `#49`·`#50`: 모바일 서버 프로필 목록 개편 및 홈 대시보드(B42.22 미확인·미분류 추정 통계 카드 링크화) 개편.
  - `#51`: 모바일 하단 내비게이션 터치 영역·활성 바·`useLinkStatus` 즉시 피드백 + `(private)/loading.tsx` 스켈레톤 + `getOwnerAccess` 인증 RPC 병렬화(`Promise.all`).
  - `#52`·`#53`: 카테고리 추가·수정·삭제 API(`PATCH`/`DELETE`), 모바일 접이식 카테고리 관리 UI(`CategoryManager`), 목록 일괄 카테고리 지정·해제 UI(`ModCatalogList`), 시험 DB 삭제 RPC 초안(`20261123000200_test_categories_delete_rpc.sql`).
- 운영 브랜치: **`main`** (`c39642c`) — 당분간 운영 배포 제외, `develop` 시험 환경 완성도에 집중.

## 진행 방침 (사용자 확정, 2026-11-23)
1. 구형 누적 Draft PR(`#2`~`#41`) 전부 Close 완료(브랜치 유지).
2. 기존 화면 디자인에 얽매이지 않고 모바일 사용성 중심으로 화면 구조·UI를 적극 개편.
3. 당분간 `main` 운영 배포는 제외하고 `develop` 시험 환경 완성도에 집중.
4. 코드·테스트·PR은 승인 요청 없이 자율 진행하고 요약만 짧게 보고(작업 완료 시 텔레그램 알림 발송). 추천 모델이 같으면 재확인하지 않고 연속 진행. Supabase SQL 실행이나 모바일 실기기 확인이 필요할 때만 모아서 요청.

## 사용자 일괄 확인 대기 항목 (5번·10번)
1. **시험 Supabase(`smofdbjgcgdmscamknpw`) SQL 실행 (총 4건, 순서대로):**
   - 마이그레이션 1: `supabase/migrations/20261123000100_test_mod_categories_allow_unclassified.sql` (카테고리 0개 미분류 해제 허용)
   - 롤백 검증 1: `tests/sql/mod_category_unclassified_rollback.sql` (`ROLLBACK` 포함 단일 실행)
   - 마이그레이션 2: `supabase/migrations/20261123000200_test_categories_delete_rpc.sql` (카테고리 삭제 RLS 및 `delete_category` RPC)
   - 롤백 검증 2: `tests/sql/category_delete_rollback.sql` (`ROLLBACK` 포함 단일 실행)
2. **시험 Preview 카테고리 쓰기 가드 승인 여부:**
   - 현재 `lib/category-persistence-input.ts`의 `isTestCategoryWriteAllowed`는 `TEST_BRANCH = "test/category-preview-origin-guard-20261122"` 및 만료 시각(`2026-11-24T00:00:00+09:00`)으로 잠겨 있음(fail-closed).
   - `develop` Preview에서 실제 카테고리 생성/수정/삭제/일괄분류 저장 E2E를 테스트하려면 `TEST_BRANCH`를 `"develop"`으로 전환하고 `MOD_CATEGORY_TEST_WRITE_ENABLED=true`를 임시 활성화하는 1회 승인이 필요함.
3. **모바일 실기기 확인 체크리스트:**
   - 하단 메뉴(홈·모드·등록·서버) 탭 전환 시 즉시 스켈레톤·점멸 피드백 동작 및 체감 속도(`#51`)
   - 홈(`/dashboard`) 4개 통계 카드 링크 이동(`#50`)
   - 모드 목록(`/mods`) 검색·접이식 필터·카테고리 관리 패널·일괄 분류 체크박스 UI(`#46`, `#52`, `#53`)
   - 모드 상세(`/mods/[id]`) 상태 배지·접이식 조사 기록·카테고리 0개 해제 확인 문구(`#45`, `#47`)
   - 모드 등록(`/register`) 모바일 하단 고정 일괄 등록 바(`#48`)

## 유지할 확정 원칙
- Project Zomboid Build 42(현재 기준 B42.22), 모바일 우선 PWA, Next.js/TypeScript/Tailwind, Supabase Google OAuth + RLS, GitHub/Vercel.
- 다중 카테고리 + 대표 1개 + **0개(미분류) 해제 허용**, 선택 그룹 기본값 = **자유 선택**.
- 승인 전 카탈로그 저장 금지, Workshop ID ≠ Mod ID, 호환성 미확인은 미확인 유지, 유료 AI API 도입 금지.
