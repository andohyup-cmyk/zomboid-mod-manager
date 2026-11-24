# AI 작업 인수인계 — 현재 상태 요약

> 갱신일: 2026-11-24. 이 문서는 **실시간 상태가 아니다**. 작업 전 최신 `develop`/`main` HEAD·PR·이슈를 다시 확인한다. 상세 이력은 `docs/TASKS.md`와 각 PR을 참조한다.

## 저장소 및 배포 기준
- 저장소: `andohyup-cmyk/zomboid-mod-manager` (**공개/Public**). 주 개발 담당: **Antigravity**.
- 개발 통합 브랜치: **`develop`** (최신 작업 기준). 운영 브랜치: **`main`** (`c39642c`, 당분간 운영 배포 제외).
- 시험 Preview 자동 배포: `develop`에 push 시 `.github/workflows/vercel-diagnose.yml`이 GitHub Secret `VERCEL_TOKEN` + Vercel REST API로 직접 배포(`READY` 확인까지 수행). Preview 기본 URL: `https://zomboid-mod-manager-git-develop-andohyup-cmyk.vercel.app`.
- 시험 Supabase: `Zomboid Mod Manager Test` (`smofdbjgcgdmscamknpw`). 시험 쓰기 가드(`isTestCategoryWriteAllowed`) 만료 시각: **2027-01-01 00:00 KST**.

## 진행 방침 (사용자 확정)
1. 코드·테스트·PR·`develop` 병합은 승인 요청 없이 자율 진행하고 핵심 요약만 짧게 보고(매 턴 텔레그램 알림 발송).
2. Supabase SQL 실행, Vercel/GitHub 대시보드 조작, 모바일 실기기 확인만 사용자에게 단계별로 안내.
3. 당분간 `main` 운영 배포는 제외하고 `develop` 시험 환경 완성도에 집중.

## 구현·병합 완료 요약 (`develop`)
- **모드 등록 · PC 스캔 연동 (#67, #68, #69, #70):**
  - `tests/fixtures/zomboid-workshop-audit-20261123-2334.json` (81개 워크숍 · 209개 `mod.info` · 고유 130개 Mod ID) 저장소 연동.
  - `/mods`의 `PcModIdBackfillPanel`에서 1탭으로 저장소 스캔(또는 파일 선택)을 불러와 기존 모드 빈 `Mod ID` 채우기 + 미등록 새 모드 Steam 제목 조회 후 승인 등록 지원.
  - `/register` Steam 조회 시 저장소 PC 스캔 일치 워크숍의 실제 `Mod ID` 자동 첨부(호환성 미확인 유지).
- **모드 상세 편집 (#67) & 시험 DB 마이그레이션 적용 완료:**
  - `/mods/[id]`에서 `Mod ID` 추가·삭제(`POST`/`DELETE /api/mod-ids`), 조사·B42.22·멀티 호환성·확인일·메모 수정(`PATCH /api/mods/[id]`).
  - `20261124000200_test_mod_detail_edit_and_mod_ids.sql` 시험 DB 적용 완료.
- **카테고리 · 선택 그룹 · 목록 편의 (#45~#66, #71~):**
  - 다중 카테고리 + 대표 1개 + 0개(미분류) 해제, 일괄 분류, 카테고리 CRUD.
  - 선택 그룹 DB 저장/삭제(`/api/selection-groups`, 기본값 = 자유 선택).
  - `/mods` 빠른 필터 칩(`전체`·`미분류만`·`Mod ID 미확인`·`B42.22 미확인`) 및 목록 상한 300건 확장.
- **서버 프로필 DB 저장·불러오기 (#71):**
  - `/profiles`에서 새 서버 프로필 생성(`POST /api/profiles`) 및 카드 클릭으로 `/profiles/editor?profileId=...` 열기.
  - `/profiles/editor`에서 프로필 선택/생성·불러오기·원자적 DB 저장(`POST /api/profile-snapshots`).
  - "서버 설정 출력" 패널(`ProfileServerOutput`, 로컬 `mod.info` 검사 포함)은 `SHOW_SERVER_OUTPUT = false`로 비가시 유지(삭제 안 함).
- **백업 & 테스트:**
  - JSON 내보내기(`/api/data-export`)에 `selectionGroups`·`selectionGroupMembers` 선택 포함 및 `BackupInspector` 표시.
  - 브라우저 통합 테스트(`tests/browser/integration.spec.ts`) 현행 UI 기준 정비 완료.

## 미검증 / 다음 작업
1. **모바일 실기기 확인:**
   - `/mods`에서 PC 스캔 새 모드 등록·빠른 필터(`미분류만`·`Mod ID 미확인`) 동작 확인.
   - `/profiles` → 새 서버 프로필 생성 → `/profiles/editor`에서 Mod ID 조합 DB 저장 후 새로고침/재진입 복원 확인.
2. **선택 정리:**
   - 시험 DB 더미 모드 3개(`9900000001~3`)·테스트 카테고리 2개 정리 여부 결정.
   - 필요 시 추후 서버 설정 출력(`SHOW_SERVER_OUTPUT`) 재활성화 및 운영(`main`) 배포 준비.

## 유지할 확정 원칙
- Project Zomboid Build 42(현재 기준 B42.22), 모바일 우선 PWA, Next.js/TypeScript/Tailwind, Supabase Google OAuth + RLS, GitHub/Vercel.
- 다중 카테고리 + 대표 1개 + **0개(미분류) 해제 허용**, 선택 그룹 기본값 = **자유 선택**.
- 승인 전 카탈로그 저장 금지, 복수 Mod ID 자동 활성화 금지, Workshop ID ≠ Mod ID, 호환성 미확인은 미확인 유지, 유료 AI API 도입 금지.
