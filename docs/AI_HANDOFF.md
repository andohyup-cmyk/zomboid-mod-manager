# AI 작업 인수인계 — 현재 상태 요약

> 갱신일: 2026-11-23. 이 문서는 **실시간 상태가 아니다**. 작업 전 최신 `develop`/`main` HEAD·PR·이슈를 다시 확인한다. 상세 이력은 `docs/TASKS.md`와 각 PR을 참조한다.

## 저장소 및 기준
- 저장소: `andohyup-cmyk/zomboid-mod-manager` (비공개).
- 주 개발 담당: **Antigravity** 단독 주 개발.
- 개발 통합 브랜치: **`develop`** — 기존 누적 체인(`#2`~`#33`) + `#34`(문서) + `#36`→`#38`→`#39`(카테고리 읽기 가드·모바일 상세 패널·origin 가드; `#37`은 `#38`에 포함) + `#40`→`#41`(백업 v4 DB 롤백·HTTP 응답 테스트) 통합본.
  - `#39`의 브랜치 고정 `prebuild` 훅은 `develop` Preview 빌드 차단을 피하기 위해 `package.json`에서 `preflight:category-preview` 스크립트로 분리(`isTestCategoryWriteAllowed` 쓰기 잠금은 fail-closed 유지).
- 운영 브랜치: **`main`** (`afb7973`, 코드 기준 `25568c28` 동일) — 사용자 별도 승인 없이 병합·배포 금지.

## 현재 검증 상태 및 미검증 항목
| 영역 | 현재 상태 | 미검증 / 미완료 |
| --- | --- | --- |
| **백업 JSON v4** (`#33`/`#40`/`#41`) | 13영역 내보내기·무결성 검사·시험 DB `ROLLBACK` SQL·실제 GET 라우트 모의 응답 테스트 통합 완료 | 실제 Google OAuth 브라우저 HTTP 다운로드 E2E, DB 복원(Restore) 기능, 단일 트랜잭션 스냅샷 |
| **다중 카테고리** (`#32`/`#36`/`#38`/`#39`) | 시험 DB 3테이블·RLS·RPC, 읽기 불일치 차단, 모바일 상세 패널, 모바일 저장 E2E 후 플래그 `false` 원복·fixture 정리 | **카테고리 0개(미분류) 해제 구현**(정책 확정 완료, RPC/API/UI 2단계 구현 대기), 목록/필터 UI 연결, 운영 DB 적용 |
| **기존 이슈** | `#1`(모바일 탭 전환 지연), `#8`(Preview OAuth/RLS), `#9`(시험 DB RLS/`SECURITY DEFINER`), `#35`(카테고리 UI/0개 해제) | 별도 검증 및 승인 필요 |

## 유지할 확정 원칙
- Project Zomboid Build 42(현재 기준 B42.22), 모바일 우선 PWA, Next.js/TypeScript/Tailwind, Supabase Google OAuth + RLS, GitHub/Vercel.
- 다중 카테고리 + 대표 1개 + **0개(미분류) 해제 허용**, 선택 그룹 기본값 = **자유 선택**.
- 승인 전 카탈로그 저장 금지, Workshop ID ≠ Mod ID, 호환성 미확인은 미확인 유지, 유료 AI API 도입 금지.
- `main` 병합·운영 DB·운영 배포·실데이터 삭제·게임 서버 설정 변경은 매 건 사용자 별도 승인.

## 다음 우선 작업
1. **Issue `#35` 카테고리 0개(미분류) 해제 구현 준비:** `develop`에서 독립 작업 브랜치 분기 → 입력 검증(`lib/category-persistence-input.ts`, `lib/mod-category-assignment.ts`), 모바일 패널(`lib/mod-category-editor.ts`, `components/ModCategoryPanel.tsx`), API, 단위 테스트, 시험 DB `save_mod_categories` 마이그레이션 SQL 초안 작성 후 시험 DB 적용 승인 요청.
2. 필요 시 구형 누적 Draft PR(`#2`~`#41`) 정리 여부 사용자 확인.

## 갱신 방법
- 이 문서는 현재 기준 브랜치, 미검증 사항, 다음 작업만 짧게 유지한다. 완료 이력은 `docs/TASKS.md`와 PR에 기록한다.
