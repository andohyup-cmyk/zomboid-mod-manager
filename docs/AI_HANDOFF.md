# AI 작업 인수인계 — 현재 상태 요약

> 갱신일: 2026-11-25. 이 문서는 **실시간 상태가 아니다**. 작업 전 `git fetch origin '+refs/heads/develop:refs/remotes/origin/develop'`로 최신 `develop`/`main` HEAD·PR·이슈를 다시 확인한다. 상세 이력은 `docs/TASKS.md`와 각 PR을 참조한다.

## 저장소 및 배포 기준
- 저장소: `andohyup-cmyk/zomboid-mod-manager` (**공개/Public**). 주 개발 담당: **Antigravity**.
- 개발 통합 브랜치: **`develop`** (`59129db` 이후 최신). 운영 브랜치: **`main`** (`c39642c`, 당분간 운영 배포 제외).
- 시험 Preview 자동 배포: `develop`에 push 시 `.github/workflows/vercel-diagnose.yml`이 GitHub Secret `VERCEL_TOKEN` + Vercel REST API로 직접 배포(`READY`까지 확인). **수동 배포 불필요.** Preview 기본 URL: `https://zomboid-mod-manager-git-develop-andohyup-cmyk.vercel.app`.
- 시험 Supabase: `Zomboid Mod Manager Test` (`smofdbjgcgdmscamknpw`). 시험 쓰기 가드(`isTestCategoryWriteAllowed`) 만료 시각: **2027-01-01 00:00 KST**.

## 진행 방침 및 사용자 선호 (새 세션 필수 준수)
1. **자율 진행 범위:** 코드·테스트·PR·`develop` 병합은 승인 요청 없이 자율 진행. `main`·운영 DB·운영 배포·실데이터 삭제만 별도 승인.
2. **결과 보고 방식:**
   - `[상태]` / `[요약]`은 **매우 짧게** (확인된 원인 + 바뀐 동작 정도만, 과도한 세부 나열 금지).
   - 반대로 **사용자가 직접 해야 할 일**(Supabase SQL 실행, 모바일 확인 등)은 버튼명·링크 포함 **단계별로 자세히** 안내.
   - 복사할 SQL·프롬프트는 파일 링크 대신 **코드 블록**으로 제공.
   - **모바일 Supabase SQL 주의:** 여러 줄 괄호 SQL은 모바일 Monaco 에디터가 끝에 `)`를 중복 붙여 구문 에러를 유발하므로 **한 문장 = 한 줄** 형식으로 제공(크롬 번역 끄기 안내).
   - `[추천 모델]` 표기 시 성능 등급 괄호 표기 + Claude 추천 시 사용량 제한 대체 모델 병기 (예: `` `Claude Sonnet 5.5` (medium) / 제한 시 `Gemini 4 Neon` (medium) ``).
   - **매 턴 텔레그램 알림 발송** (`telegram-notify` 스킬 필수 실행).
3. **로컬/테스트 팁:** `npm install --no-package-lock` 사용(lockfile 없음), 커밋 전 `git checkout next-env.d.ts`, `npm run build` = `verify` + `next build` (현재 단위 테스트 398/398 통과, 브라우저 테스트 `npm run test:browser` 정비 완료).

## 구현·병합 완료 요약 (`develop`)
- **모드 등록 · PC 스캔 연동 (#67, #68, #69, #70):**
  - `tests/fixtures/zomboid-workshop-audit-20261123-2334.json` (81개 워크숍 · 209개 `mod.info` · 고유 130개 Mod ID) 저장소 연동.
  - `/mods`의 `PcModIdBackfillPanel`에서 1탭으로 저장소 스캔(또는 파일 선택)을 불러와 기존 모드 빈 `Mod ID` 채우기 + 미등록 새 모드 Steam 제목 조회 후 승인 등록 지원.
  - `/register` Steam 조회 시 저장소 PC 스캔 일치 워크숍의 실제 `Mod ID` 자동 첨부(호환성 미확인 유지).
- **모드 상세 편집 · 보관/복원 (#67, #74):**
  - `/mods/[id]`에서 `Mod ID` 추가·삭제(`POST`/`DELETE /api/mod-ids`), 조사·B42.22·멀티 호환성·확인일·메모 수정 및 **모드 보관/복원(`isArchived`)** (`PATCH /api/mods/[id]`).
  - `/mods/[id]` DB 조회 단일 `Promise.all` 병렬화 완료.
  - 시험 DB 마이그레이션 `20261124000200`·`20261125000100`(`is_archived` 권한)·더미 3개 정리 및 실기기 검증 완료.
- **카테고리 · 선택 그룹 · 목록 빠른 필터 (#45~#66, #72, #73):**
  - 다중 카테고리 + 대표 1개 + 0개(미분류) 해제, 일괄 분류, 카테고리 CRUD.
  - 선택 그룹 DB 저장/삭제(`/api/selection-groups`, 기본값 = 자유 선택).
  - `/mods` 빠른 필터 칩(`전체`·`미분류만`·`Mod ID 미확인`, 0ms 클라이언트 즉시 전환, `B42.22 미확인` 칩 제거 완료), 목록 상한 300건, DB 조회 단일 `Promise.all` 병렬화 완료(모바일 확인 완료).
- **서버 프로필 DB 저장·불러오기 (#71):**
  - `/profiles`에서 새 서버 프로필 생성(`POST /api/profiles`) 및 카드 클릭으로 `/profiles/editor?profileId=...` 열기.
  - `/profiles/editor`에서 프로필 선택/생성·불러오기·원자적 DB 저장(`POST /api/profile-snapshots`), 모바일 실기기 확인 완료.
  - "서버 설정 출력" 패널(`ProfileServerOutput`, 로컬 `mod.info` 검사 포함)은 `SHOW_SERVER_OUTPUT = false`로 비가시 유지(삭제 안 함).
- **화면 간 데이터 연동 정합성 & 재발 방지 가드:**
  - `lib/data-sync.ts` 단일 기준(`SYNC_DOMAIN_PATHS`, `PRIVATE_NO_STORE_HEADERS`, `revalidateDomain`, `buildPrimaryCategoryMap`, `countActiveUnclassifiedMods`) + `docs/DATA_SYNC_CONTRACT.md` 계약 수립.
  - `tests/data-sync-contract.test.ts` 자동 아키텍처 가드 추가(모든 private 페이지 `force-dynamic`, 모든 API `no-store`+`revalidateDomain`, 백업 테이블 누락 자동 차단).
  - `/profiles/editor` 대표 카테고리·저장 프로필 `modIdUuid`/제목/보관 알림 연동, `/dashboard` 보관 제외 정확 미분류 계산, `/mods` PC 스캔 보관 모드 인식, 백업 `selectionGroups` 참조 무결성 검증 보강.
- **Steam 태그 기반 9단계 자동 카테고리 · 프로필 추천 정렬 연동:**
  - `Mod Load Order Sorter [b42]` (`3423660713`) 공식 9단계 순서(`프레임워크·API·트윅` → `리소스·텍스처` → `맵·지역` → `차량` → `기능·코드` → `의상·방어구` → `UI·인터페이스` → `기타 모드` → `번역·한글화`)로 Steam 태그를 매핑(`lib/steam-category-rules.ts`).
  - `/register`·PC 스캔 신규 등록 시 추천 카테고리 표시 및 최종 승인 후 자동 생성·적용.
  - `/mods`에 `Steam 태그로 카테고리 자동 분류` 패널 추가(`GET`/`POST /api/mod-categories/auto-classify`, 미리보기 → 확인 후 기존 미분류/전체 모드 일괄 적용).
  - `/profiles/editor` 기존 `추천 정렬` 버튼에 사용자의 1~9번 로드 순서 카테고리 우선순위(`categoryPriority`) 연동 완료.
- **백업 & 저장소 정리:**
  - JSON 내보내기(`/api/data-export`)에 `selectionGroups`·`selectionGroupMembers` 선택 포함·무결성 검증 및 `BackupInspector` 표시.
  - 구형 원격 브랜치 52개 정리 및 `delete_branch_on_merge = true` 활성화 완료(`main`/`develop` 2개만 유지, 열린 이슈·PR 0건).

## 미검증 / 다음 작업
1. **모바일 실기기 실행·확인:**
   - `/mods` → **`Steam 태그로 카테고리 자동 분류 (인게임 정렬 9단계)`** 열기 → 미리보기 → **확인 후 적용**으로 현재 미분류 모드 일괄 분류 실행.
   - `/profiles/editor` → **`선택한 모드`** 탭 → **`추천 정렬`** 버튼으로 1~9번 순서 미리보기·적용 확인.
2. **후속 작업 후보:**
   - 추가 기능·화면 수정사항 완료 후 일괄 성능 최적화.
   - 시험 환경 실사용 안정화 후, 사용자 별도 승인 시 `main` 운영 반영 및 운영 DB 마이그레이션 준비.

## 유지할 확정 원칙
- Project Zomboid Build 42(현재 기준 B42.22), 모바일 우선 PWA, Next.js/TypeScript/Tailwind, Supabase Google OAuth + RLS, GitHub/Vercel.
- 다중 카테고리 + 대표 1개 + **0개(미분류) 해제 허용**, 선택 그룹 기본값 = **자유 선택**.
- 승인 전 카탈로그 저장 금지, 복수 Mod ID 자동 활성화 금지, Workshop ID ≠ Mod ID, 호환성 미확인은 미확인 유지, 유료 AI API 도입 금지.
