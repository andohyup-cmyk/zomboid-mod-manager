# 프로필 스냅샷용 JSON 내보내기 v2

2026-11-21, 시험 DB 프로필 스냅샷 추가 후 **기존 백업 누락 방지**를 위한 변경.

## 배경

기존 `GET /api/data-export`의 v1 JSON은 `mods`, `modIds`, `researchRecords`, `profiles`, `profileMods`, `researchQueue` 여섯 영역만 내보냈다. 시험 DB에 `profile_revision`, `profile_mod_choices`, `profile_downloads`가 생겼으므로 **이들을 누락하면서 `complete:true`를 표시하면 안 된다**.

## 이번 코드 변경

- `app/api/data-export/route.ts`: 본인 `owner_id`와 RLS를 통해 `profile_revision`, `profile_mod_choices`, `profile_downloads`를 모두 읽어 각각 `profileRevisions`, `profileModChoices`, `profileDownloads`로 내보낸다.
- 테이블 조회 실패 시 기존 안전 정책에 따라 전체 내보내기를 503으로 중단한다. 즉 **새 테이블을 읽을 수 없는데도 완전한 백업을 생성하지 않는다**.
- 데이터 테이블당 최대 10,000건, 전체 JSON 8MB 제한, `Cache-Control: private, no-store`, 인증·소유자 필터 유지.
- `schemaVersion:2`로 새 형식을 구분한다.
- `lib/backup-preview.ts`: v2에 9개 필수 영역이 없으면 오류. v1은 6개 옛 영역을 검사할 수 있지만 새 3개 영역은 `null`로 표시하고, **v1이 `complete:true`라도 검사 화면에서는 complete:false** 처리하며 누락 경고를 붙인다.
- 백업 확인 화면에 기존 연결과 개별 Mod ID 저장 회차를 서로 다른 항목으로 표시한다. 홈/모드/서버/등록 화면 디자인 변경 없음.
- `tests/backup-preview.test.ts`: v2 완결성, v1 부분 처리, 3개 신규 테이블의 누락/부적절한 값, 원본 카운트 유지 테스트.

## 주의/남은 작업

- JSON 내보내기는 PostgreSQL 전체 백업/PITR 백업이 아니며, 각 테이블을 순차/병렬 조회하므로 **동시 저장 중 단일 시점의 트랜잭션 스냅샷이라는 보장은 없다**. 영구 저장 RPC 연동 후 이 점을 재검증해야 한다.
- 백업 미리보기는 파일 구조/개수를 검사할 뿐, 모든 FK·소유자 및 복원 가능성까지 보증하지 않는다.
- 실제 JSON **DB 복원은 미구현**. 데이터 삭제·교체/운영 배포·DB 권한 변경 없음.
- 이번 v2 코드가 운영 환경으로 병합되기 전에 대상 DB에 새 테이블 및 권한이 적용돼야 한다. 시험 DB에만 적용되어 있음.


## [후속 버전: 2026-11-21]

이 문서는 **v2 구현 당시의 이력**입니다. 관계 저장 테이블 `mod_relations`가 시험 DB에 추가되면서 **v3**에서는 `modRelations`를 열 번째 필수 영역으로 내보냅니다. 이전 v1·v2 파일은 열람 가능하지만 관계 기록이 없어 부분 내보내기로만 표시됩니다. v3에서도 JSON은 전체 DB 백업/복원이나 단일 시점 트랜잭션 스냅샷이 아닙니다. 세부 검증: `docs/reviews/MOD_RELATION_REVIEW_FLOW_20261121.md`.
