# 아키텍처

모바일과 PC는 같은 Next.js App Router를 사용한다. 허용 사용자 검사는 서버의 `getOwnerAccess()`가 Supabase `auth.getUser()`와 `is_authorized_user()`로 수행한다.

| 경로 | 역할 |
|---|---|
| `/login`, `/auth/callback`, `/logout` | Google OAuth 시작, PKCE 세션 교환, 로그아웃 |
| `/dashboard`, `/mods` | 소유자 카탈로그 현황·목록·검색 |
| `/register` | 혼합 Workshop 입력, 읽기 전용 조사함과 수동 JSON 미리보기, 출처별 개별 승인 |
| `/profiles`, `/profiles/editor` | 저장된 프로필 이름 목록, 카탈로그 후보를 선택하는 메모리 편집기와 서버 출력 |
| `/dev/server-profile-preview` | 개발 환경에서 활성화하는 가상 카탈로그 기반 출력 예시 |

## 등록과 카탈로그 쓰기

`parseWorkshopInput`은 URL과 숫자 ID의 순서를 보존하며 중복을 제거한다. 수동 JSON은 기존 검사 함수로 검증한다. `GET /api/ai-research-inbox`는 인증 및 허용 목록 확인 후 저장소의 조사 자료를 읽고, 소유자가 이미 등록한 Workshop을 제외한다. 한 ID의 조사함·JSON 후보를 화면에서 출처별로 확인할 수 있다. 사용자별 영구 대기 레코드와 복수 후보의 일괄 승인은 후속 범위다.

`isCatalogWriteAllowed`는 Vercel 환경과 대상 환경이 모두 `production`인지, 프로젝트 ID가 허용된 운영 프로젝트와 일치하는지, Supabase 주소가 허용된 HTTPS origin과 일치하는지 검사한다. 승인된 프로젝트와 주소는 서버 전용 `CATALOG_WRITE_PRODUCTION_VERCEL_PROJECT_ID`와 `CATALOG_WRITE_PRODUCTION_SUPABASE_ORIGIN`에 둔다. 환경 정보가 없거나 불일치하면 등록 버튼·클라이언트 승인 함수·`POST /api/mods`에서 쓰기를 막는다. 서버는 허용된 요청에 대해 사용자와 자료를 검증한 뒤 `approve_research_record`를 호출한다. 이 함수는 `mods`, `mod_ids`, `research_records`를 한 트랜잭션에서 저장한다.

초기 SQL에는 `authenticated`의 카탈로그 테이블 직접 쓰기 및 RPC 실행 권한이 있다. DB의 소유자 RLS와 앱 배포 정책은 각각 검증해야 한다. 관리형 프로젝트의 실효 권한과 환경별 데이터 격리는 별도 점검 대상이다.

## 세션과 프로필

`proxy.ts`는 일반 페이지에서 요청별 세션을 갱신한다. OAuth 콜백에서는 사전 갱신을 생략하고, 서버 클라이언트가 이전 세션을 읽지 않고 현재 프로젝트의 verifier로 교환을 시도한다. 콜백 실패 시 Preview 진단에는 오류 코드·상태·이름과 verifier 쿠키 존재 여부만 남긴다. 실제 Preview의 PKCE 401 원인은 미확인이다.

프로필 편집기는 `GET /api/profile-catalog`로 소유자의 후보를 읽는다. 선택 상태에는 공급 Workshop ID, 게임 Mod ID, 활성 여부와 순서가 있다. 비활성화해도 행의 위치는 보존한다. 추천 미리보기 적용과 경고를 확인한 설정 문자열 복사는 사용자 동작으로 수행한다. 출력기는 활성 행과 명시적 다운로드 전용 Workshop을 읽는다. 실제 카테고리 우선순위·관계 근거가 없으면 검증 범위를 제한하며, 실제 게임 호환성은 후속 검사로 남긴다.

편집 세션을 다시 열면 선택을 복원할 프로필 저장 경로는 아직 없다. 기존 `profile_mods.mod_id`는 카탈로그 행 `mods.id`를 가리킨다. 개별 후보 `mod_ids.id`에 연결하는 저장 구조와 레거시 전환은 별도 설계 대상이다.
