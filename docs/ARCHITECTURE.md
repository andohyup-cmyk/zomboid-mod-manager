# 아키텍처

모바일과 PC는 같은 Next.js App Router를 사용한다. 허용 사용자 검사는 서버의 `getOwnerAccess()`가 Supabase `auth.getUser()`와 `is_authorized_user()`로 수행한다.

| 경로 | 역할 |
|---|---|
| `/login`, `/auth/callback`, `/logout` | Google OAuth 시작, PKCE 세션 교환, 로그아웃 |
| `/dashboard`, `/mods`, `/mods/[id]` | 소유자 카탈로그 현황·검색·상태 필터·상세·출처 |
| `/register` | 혼합 Workshop 입력, 공개 Steam 메타데이터, 수동 JSON·영구 대기함 후보, 선택·일괄 승인 |
| `/profiles`, `/profiles/editor` | 저장된 프로필 이름 목록, 메모리 편집기/출력, 오프라인 프로필 JSON 불러오기·내보내기 |\n| `/backup`, `/api/data-export` | 소유자 데이터 JSON 내보내기, 브라우저 내부 검사·완결성 경고, 실제 복구 없음 |
| `/dev/server-profile-preview` | 개발 환경에서 활성화하는 가상 카탈로그 기반 출력 예시 |

## 등록과 카탈로그 쓰기

`parseWorkshopInput`은 URL과 숫자 ID의 순서를 보존하며 중복을 제거한다. 수동 JSON은 기존 검사 함수로 검증한다. `GET /api/ai-research-inbox`는 인증 및 허용 목록 확인 후 저장소의 조사 자료를 읽고, 소유자가 이미 등록한 Workshop을 제외한다. 한 ID의 조사함·JSON 후보를 화면에서 출처별로 확인할 수 있다. 사용자별 영구 대기함과 선택·일괄 승인 코드가 개발 브랜치에 구현되어 있다. 다만 새 테이블 `research_queue`는 DB에 아직 적용되지 않았으며 실제 영구 저장·RLS·타 계정 격리는 검증 전이다. Preview 쓰기는 계속 차단한다.

`isCatalogWriteAllowed`는 Vercel 환경과 대상 환경이 모두 `production`인지, 프로젝트 ID가 허용된 운영 프로젝트와 일치하는지, Supabase 주소가 허용된 HTTPS origin과 일치하는지 검사한다. 승인된 프로젝트와 주소는 서버 전용 `CATALOG_WRITE_PRODUCTION_VERCEL_PROJECT_ID`와 `CATALOG_WRITE_PRODUCTION_SUPABASE_ORIGIN`에 둔다. 환경 정보가 없거나 불일치하면 등록 버튼·클라이언트 승인 함수·`POST /api/mods`에서 쓰기를 막는다. 서버는 허용된 요청에 대해 사용자와 자료를 검증한 뒤 `approve_research_record`를 호출한다. 이 함수는 `mods`, `mod_ids`, `research_records`를 한 트랜잭션에서 저장한다.

초기 SQL에는 `authenticated`의 카탈로그 테이블 직접 쓰기 및 RPC 실행 권한이 있다. DB의 소유자 RLS와 앱 배포 정책은 각각 검증해야 한다. 관리형 프로젝트의 실효 권한과 환경별 데이터 격리는 별도 점검 대상이다.

## 세션과 프로필

`proxy.ts`는 일반 페이지에서 요청별 세션을 갱신한다. OAuth 콜백에서는 사전 갱신을 생략하고, 서버 클라이언트가 이전 세션을 읽지 않고 현재 프로젝트의 verifier로 교환을 시도한다. 콜백 실패 시 Preview 진단에는 오류 코드·상태·이름과 verifier 쿠키 존재 여부만 남긴다. 실제 Preview의 PKCE 401 원인은 미확인이다.

프로필 편집기는 `GET /api/profile-catalog`로 소유자의 후보를 읽는다. 선택 상태에는 공급 Workshop ID, 게임 Mod ID, 활성 여부와 순서가 있다. 비활성화해도 행의 위치는 보존한다. 추천 미리보기 적용과 경고를 확인한 설정 문자열 복사는 사용자 동작으로 수행한다. 출력기는 활성 행과 명시적 다운로드 전용 Workshop을 읽는다. 실제 카테고리 우선순위·관계 근거가 없으면 검증 범위를 제한하며, 실제 게임 호환성은 후속 검사로 남긴다.

편집 세션을 다시 열면 자동으로 복원되는 DB 프로필 저장 경로는 아직 없다. 대신 명시적으로 JSON 파일을 내려받고 다시 불러오는 임시 프로필 보관을 제공한다. 그룹 규칙은 개별 선택·상한·하한과 유효한 근거 URL이 입력된 경우에만 출력 검증에 포함할 수 있으며, 영구 그룹 관리 UI와 기본 규칙은 미확정이다. 기존 `profile_mods.mod_id`는 카탈로그 행 `mods.id`를 가리킨다. 개별 후보 `mod_ids.id`에 연결하는 저장 구조와 레거시 전환은 별도 설계 대상이다.

## 2026-11-20 안전 개발 추가 사항

- Steam 공개 정보 API는 작업 계정 인증 뒤 외부 조회하며, 요청 ID와 게임 ID를 확인한다. 스트리밍 UTF-8 응답에 1MB 제한을 적용한다. Steam 메타데이터는 **AI 분석이 아니다**.
- B42.22, 싱글, 멀티, 서버 중간 추가 호환성은 각각 `confirmed`/`reported_issue`/`unverified` 상태로 취급하며 근거 없는 추정 금지.
- 카탈로그/대기함의 쓰기 API는 서버 인증, owner RLS, Preview 보호 조건과 별도로 브라우저 Origin 검사도 수행한다.
- 대기함 조회는 페이지 단위로 수행해 항목 수에 따른 조용한 누락을 줄인다. 동일 출처·동일 Workshop 중복 입력은 원문 덮어쓰기를 막는다.
- 본문에 설명된 DB 프로필 영구화, 카테고리/태그/그룹 저장, 복원 기능은 **구현 완료가 아니다**. DB 보안·설계 전환 전 검토서는 `docs/proposals/DB_SECURITY_AND_PERSISTENCE.md`를 참조한다.
