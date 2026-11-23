# JSON v4 카테고리 DB/RLS 롤백 통합 시험 (2026-11-23)

## 목적

PR #33의 JSON v4는 카테고리 정의, 소속, 대표를 포함하는 13개 영역의 읽기 전용 백업이다. 기존 Node 단위 테스트(백업 내부 참조·v1~v4 형식)와 별도로 **실제 격리 Supabase PostgreSQL의 authenticated·RLS·SECURITY INVOKER RPC로 카테고리를 저장한 후 v4 모양의 스냅샷을 조립·검증**한다.

## 실행

- 파일: `tests/sql/backup_v4_category_rollback.sql`; 대상은 **시험 Supabase `smofdbjgcgdmscamknpw`만**.
- GitHub에서 정확한 파일을 읽어 **BEGIN부터 ROLLBACK, 최종 SELECT까지 한 요청**으로 실행한다. 영구 INSERT·DELETE·운영 DB 접근을 하지 않는다.
- 사전 조건: auth 사용자와 허용된 소유자 1명, 모드/카테고리 3개 영역 0건, 연구 대기함 기존 2건.
- 가상 모드 1건(compatibility는 모두 미확인), 카테고리 2건 생성. 미분류를 검사한 뒤 실제 `save_mod_categories` RPC로 2개 소속/대표 1개 저장.
- SQL로 **v4 13개 키, 소유자별 모드·카테고리·연결·대표, 대표 소속, 원래 대기함 2건 보존** 검사. 중복·소속 밖 대표·0개 해제·미존재 카테고리 입력이 거부되고 미인가 JWT에 보이지 않는지 검증.
- ROLLBACK 후 4개 가상 자료 관련 테이블 0건, 대기함 2건인 것을 별도 재조회해 확정.

## 중요한 한계

이것은 **실제 DB + v4 스냅샷 구조·권한·RPC 통합 시험**이다. 브라우저 인증 쿠키를 쓰는 `GET /api/data-export`의 실제 HTTP 200 다운로드, Node `inspectBackupSnapshot`에 DB 행을 실제 전달하는 E2E, 백업의 트랜잭션 시점 일치 또는 실제 복구는 증명하지 않는다. SQL에서 카테고리 세 영역은 실제 테이블에서 읽지만 나머지 9개 빈 영역은 현재 깨끗한 시험 DB 상태에 근거한 가상 배열이며 연구 대기함은 RLS로 실제 조회한다.

**비범위:** `main` 병합, 운영 앱/DB, OAuth/RLS/GRANT 변경, 시험 쓰기 플래그, 기존 사용자 데이터 삭제, 게임 서버 파일 변경.
