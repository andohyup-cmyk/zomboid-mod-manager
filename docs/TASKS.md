# 작업 현황

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
