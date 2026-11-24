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

## 2026-11-23 사용자 확인 및 검증 완료 항목
1. **PC 로컬 워크숍 mod.info 스캔 완료:**
   - 81개 워크숍 / 209개 mod.info / 고유 130개 Mod ID 스캔 및 앱 파서 통과 (`zomboid-workshop-audit-20261123-2334.json`).
2. **시험 Supabase(`smofdbjgcgdmscamknpw`) SQL 4건 적용 완료:**
   - 마이그레이션 1 (`20261123000100_test_mod_categories_allow_unclassified.sql`): 성공.
   - 롤백 검증 1 (`mod_category_unclassified_rollback.sql`): 소유자 UUID 세션으로 단일 트랜잭션 성공.
   - 마이그레이션 2 (`20261123000200_test_categories_delete_rpc.sql`): 성공.
   - 롤백 검증 2 (`category_delete_rollback.sql`): 단일 트랜잭션 성공.
3. **Vercel Preview 환경변수 및 쓰기 가드 연동:**
   - `MOD_CATEGORY_TEST_WRITE_ENABLED=true` (Preview 환경) 설정 완료.
   - PR #55에서 `develop` 브랜치 허용 및 만료 시각 2026-11-26 00:00 KST로 연장 반영 완료.
4. **Google OAuth 콜백 및 실로그인 확인:**
   - 시험 Supabase Redirect URLs에 Preview 콜백 주소 등록 완료.
   - 실제 브라우저 Google 로그인 및 대시보드 진입 성공 (소유자 RLS 정상 연결 확인).

## 다음 우선 작업
1. **모바일 실기기 UI 확인 및 E2E 실사용:**
   - 하단 메뉴(홈·모드·등록·서버) 탭 전환 반응 체감 (Issue #1, PR #51).
   - 모드 목록(`/mods`)에서 카테고리 추가·이름 수정·삭제 및 일괄 분류 저장 실제 동작 확인.
   - 모드 상세(`/mods/[id]`)에서 카테고리 0개(미분류) 해제 확인.
2. **후속 기능 준비:**
   - 서버 프로필 편집기에서 로컬 `mod.info` JSON 참고 검사 UI 연동.
   - 선택 그룹 자유 선택 기본값 UI 적용.

## 유지할 확정 원칙
- Project Zomboid Build 42(현재 기준 B42.22), 모바일 우선 PWA, Next.js/TypeScript/Tailwind, Supabase Google OAuth + RLS, GitHub/Vercel.
- 다중 카테고리 + 대표 1개 + **0개(미분류) 해제 허용**, 선택 그룹 기본값 = **자유 선택**.
- 승인 전 카탈로그 저장 금지, Workshop ID ≠ Mod ID, 호환성 미확인은 미확인 유지, 유료 AI API 도입 금지.
