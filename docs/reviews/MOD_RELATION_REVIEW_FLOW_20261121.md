# 시험 DB 모드 관계 초안·승인 + 백업 v3 검증 (2026-11-21)

## 승인 범위 및 대상
사용자 후속 지시 `진행해`: 앞 단계의 **시험 DB 관계 등록·승인 기능** 구현. 대상 Supabase `smofdbjgcgdmscamknpw`와 기능 브랜치 `feature/test-mod-relation-review-flow-20261121`의 **Vercel Preview**. 운영 배포·`main` 병합·기존 데이터 삭제·서버 설정 파일 변경 없음.

기준 문서: `좀보이드_모드관리앱_프로젝트_지침.md`, `좀보이드_모드관리앱_프로젝트_설계.md`. B42.22의 호환성 사실이나 모드 관계를 자동 확정하지 않는다.

## 적용된 최소 권한
- 시험 DB 마이그레이션 `20261121143453_test_mod_relation_draft_approval_rls`. 정확한 SQL `supabase/migrations/20261121143453_test_mod_relation_draft_approval_rls.sql`, 사전 계획 `supabase/plans/test_mod_relation_draft_approval_rls.sql`.
- 기존 테이블 `public.mod_relations`에 정책 2개 추가(기존 읽기 정책 유지), 관계의 반대 방향 중복 충돌 인덱스 추가.
- `authenticated`는 **초안 입력에 필요한 7개 열만 INSERT 가능**. `approved`/ `approved_at` INSERT 불가, 신규 행은 기본적으로 `approved=false`.
- 관계 승인용 UPDATE는 **`approved`, `approved_at` 두 열만 가능**. RLS는 `false → true`만 허용하고 이미 승인된 행, 다른 모드 ID/관계 종류·출처의 임의 변경 및 DELETE를 거부한다.
- RLS INSERT/UPDATE는 owner, `is_authorized_user()`, 주체/대상 게임 `mod_ids.id`가 본인 `mods`에 속하는지, 주체 쪽 `research_records`의 Workshop/출처/확인 날짜/상태/선택 게임 Mod ID가 일치하는지 검사.
- 익명에게 신규 권한을 부여하지 않았다. `SECURITY DEFINER` 함수나 관리자 비밀 키 추가 없음.
- `authenticated` 본인은 승인 버튼 외에도 DB Data API에 직접 접근하여 **본인 데이터에 한해** 허용된 열을 변경할 수 있다. 이 한계를 별도 기록하며, 관리자·타인의 데이터로 확장되지 않는다. UI 수준의 확인창은 아직 구현하지 않았다.

## API 및 개인정보/입력 보호
- `POST /api/mod-relations`: 소유권·Workshop/게임 Mod ID UUID·조사 기록·날짜·출처를 서버에서 재검증한 뒤 **미승인 관계 초안으로만** 등록한다. `owner_id`, `approved` 등 보호 필드는 입력으로 받지 않는다.
- `POST /api/mod-relations/approve`: `{ "relationId": "...uuid...", "confirm": true }`를 별도의 명시적 요청으로 받아 저장된 자료의 **현재 출처를 다시 검증한 뒤** 해당 본인 소유 미승인 행의 두 승인 열만 변경. 중복 승인 시 409.
- `GET /api/mod-relations`: 인증된 본인 관계 목록, 최대 500건. 서버의 `getOwnerAccess()`와 DB RLS 사용.
- POST는 same-origin·입력 용량 제한·JSON 형태와 정확한 필드·UUID·유효 날짜·출처 URL 검사. API에서 유료 외부 서비스를 호출하거나 Steam에 쓰지 않는다.
- 쓰기 활성화는 **`MOD_RELATION_TEST_WRITE_ENABLED=true`**, `VERCEL_ENV=preview`, 고정 기능 브랜치·Vercel 프로젝트 ID·시험 Supabase URL이 모두 일치할 때만 허용. 기능 브랜치에 한정된 Vercel Preview 환경변수로 설정.
- 홈·모드·서버 화면 디자인·승인 확인 UI 변경 없음. 실제 관계는 유저 승인 전 `projectReviewedRelations()`에서 `not-approved`로 보류되며 서버 설정 출력에 반영되지 않는다. `readyForCopy=false` 유지.

## 실제 PostgreSQL 검증
**`BEGIN` · `SET LOCAL ROLE authenticated` · 인증 사용자 `request.jwt.claim.sub` · `ROLLBACK`**으로 실DB RLS를 검사했다.

- 주체/대상 샘플 Workshop 2개, 게임 Mod ID 2개, 승인된 조사 자료 2개를 같은 트랜잭션 내 생성.
- 관계 초안 INSERT → `approved=false` 확인; 소유자 명시 승인 UPDATE → `approved=true` 확인.
- 초안 INSERT에서 `approved=true` 직접 위조 시도, 허위 출처, 이미 승인된 행 되돌리기/보호 열 수정 차단.
- 다른 계정 JWT UUID로 사용자 변경 후 관계 조회는 0행, 미승인 등록/기존 관계 승인 차단.
- 반대 방향으로 동일 충돌 관계를 등록하는 시도는 유니크 인덱스로 차단.
- 모든 샘플은 ROLLBACK: 마지막 확인 `mods=0`, `mod_ids=0`, `research_records=0`, `mod_relations=0`, `profiles=0`, `profile_revision=0`, `research_queue=2`(기존 pending 1건 그대로).
- 최초 초안 SQL 테스트에서 반대 방향 관계에 **잘못된 연구 기록을 붙여 RLS에 먼저 차단된 경우**를 확인, 두 번째 테스트에서는 방향별 승인된 연구 원본을 각각 사용해 실제 대칭 중복 인덱스 차단을 검증. 첫 테스트도 전체 롤백.
- 데이터베이스 전체 백업 생성 기능은 연결 도구에 없어 **스키마/마이그레이션 기록을 전체 데이터 백업이라 부르지 않는다**.

## JSON 내보내기 v3
새 `mod_relations` 데이터가 백업에서 빠져도 `complete:true`가 표시되는 것을 막았다.

- `GET /api/data-export`: 본인 소유 `mod_relations` 전 행을 `modRelations`로 읽고, 기존 9개 영역과 합쳐 **10개 영역 JSON v3**로 출력. 새 테이블을 읽지 못하면 전체 내보내기를 **503 중단**.
- `inspectBackupSnapshot`: v3는 `modRelations` 필수. v1·v2는 열람·기본 구조 검사 가능하되 새 영역 누락 경고와 `complete=false`로 표시. 승인 여부는 행 내용 그대로 유지.
- 백업 검사 화면에는 새 영역만 표시하도록 추가(기존 홈/모드/서버 UI 미변경).
- JSON 내보내기는 여러 테이블을 개별 조회하는 **논리적 내보내기**이고 단일 트랜잭션 스냅샷·DB 전체 백업·복원 기능이 아니다.

## 제한과 후속
- 실제 Google OAuth 브라우저 세션에서 POST 초안→명시적 승인→GET→출력→JSON 내보내기 E2E는 **별도 검증 필요**.
- 실제 카탈로그가 여전히 0건이므로 영구 승인된 실사용 관계는 생성하지 않았다. 사용자 검토 없는 AI 자동 승인도 없다.
- B42.22 실게임 호환성 및 구조화된 그룹/대표 카테고리, 서버 파일 직접 적용은 범위 밖.
- Security Advisor의 기존 경고(보안 정의자 함수의 실행 가능성 등)는 이번 RLS 변경이 아닌 기존 항목으로 수정하지 않았다.
