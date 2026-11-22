# 2026-11-22 관계 초안→승인→프로필 출력→v3 백업 회귀 검증

## 배경
- 2026-11-22 사용자가 모바일 브라우저에서 **`GET /api/mod-relations` 응답 `{"relations":[]}`** 스크린샷을 제공함. 해당 Preview의 앱 로그인 쿠키/승인 사용자 검사/관계 조회는 실제 사용자 경로에서 통과. 그러나 실제 데이터가 0건이므로 POST 등록→승인→조회→출력 HTTP E2E를 뜻하지 않는다.
- 사용자 후속 `진행해`에 따라 실사용 카탈로그에 허위/시험 연구 결과를 **영구 등록하거나 사용자 승인 상태로 오인하게 만들지 않는 방식**으로 관계 흐름을 테스트함.

## 구현한 재현 가능 테스트
1. `tests/relation-lifecycle.integration.test.ts`: Steam에는 없는 **가상 Workshop 9000099811/9000099812** 및 DemoMain/DemoPatch, `example.test` 출처를 메모리 안에서만 구성. 요청 입력 검증 → 미승인 관계 보류 → 명시적 `confirm:true` 승인 → 미선택 필수 의존성 차단 → 사용자가 대상 Mod ID를 활성 선택한 뒤 차단 해제 → 연구 확인일이 달라지면 관계 증빙 보류 → JSON v3에 승인 여부 2건을 포함해 구조 검사 → 원본 불변 확인. 기존 실제 모드 카탈로그를 수정하지 않음.
2. `tests/sql/mod_relation_lifecycle_rollback.sql`: **시험 DB `smofdbjgcgdmscamknpw` 전용**. 실제 `authenticated` 역할 및 계정 RLS로 가상 Workshop·Mod ID·승인 조사 원문·프로필/리비전·선택 항목·모드 관계를 **하나의 트랜잭션**에서 임시 생성. 미승인 초안 → 승인 → 선택된 관계 주체 조회 → 선택하지 않은 대상 카탈로그 조회 → 대상 자동 선택 없음 → v3 내보내기용 승인 관계 조회 → 다른 계정에서 RLS 조회 0건을 확인함. SQL 파일 마지막은 반드시 `ROLLBACK`; 운영 DB에 실행 금지.
3. SQL은 GitHub 파일에서 **실제 내용을 다시 읽고** SQL MCP로 실행해 `RLS_DRAFT_APPROVAL_PROFILE_EXPORT_ROLLBACK_OK` 결과를 확인. 실행 전후 DB 행 수를 대조해 `mods/mod_ids/research_records/mod_relations/profiles/profile_revision/profile_mod_choices=0`, 기존 연구 대기함 pending=1 유지함.

## 보안·비용·제약
- 시험 데이터는 모두 **가상 정보**이며 B42.22 호환 또는 실제 Workshop 관계가 검증됐다고 주장하지 않음.
- DB 테이블, RLS/GRANT, 승인 정책, 로그인 설정, 비밀값, Vercel 운영 프로젝트, GitHub `main`은 변경하지 않음. 사용자의 저장된 실제 데이터 삭제도 없음.
- 해당 신규 기능 브랜치에는 별도의 관계/프로필 **쓰기 환경변수가 없음**. 실행한 SQL은 테스트 권한+트랜잭션으로 제한했고 영구 등록을 하지 않음.
- 현재 실제 Google OAuth 로그인 후 **개별 관계 POST→명시적 승인 POST→GET→설정 출력 GET→백업 JSON GET**까지 한 번에 수행한 HTTP E2E는 미완료. 사용자의 인증 쿠키/토큰을 요청하거나 수집하지 않음.
- 자동 테스트 통과/Preview 빌드 성공과 실제 브라우저 E2E는 다른 검증 단계로 기록.
