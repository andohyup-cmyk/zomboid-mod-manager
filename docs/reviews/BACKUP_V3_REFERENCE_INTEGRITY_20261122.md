# JSON v3 백업 내부 참조 무결성 검증 — 2026-11-22

## 근거와 목표

모바일 관계 E2E는 초안 등록→명시적 승인→필수 의존성 누락 차단→`/api/data-export` JSON v3 관계 1건 포함까지 실기기에서 확인했고, 사용자 승인 범위 내 시험 자료를 모두 정리했다. 그러나 이전 `inspectBackupSnapshot`은 백업 테이블 10개가 배열인지·건수/경고·버전 형식만 검사했다. 프로필이 누락된 게임 Mod ID를 가리키거나 다른 소유자의 관계가 섞인 파일도 'complete'로 표시할 수 있었다.

## 이번 변경: DB와 기존 UI 디자인을 변경하지 않는 방어 보완

- `lib/backup-reference-integrity.ts`: **v3 파일에만** 비파괴 순수 함수 `checkBackupV3References` 추가.
  - `mods`·`modIds`·`researchRecords`의 부모/자식 연결, Workshop별 Mod ID 중복 검사.
  - 단일 owner 범위 및 `profiles`·기존 `profileMods` 소유자/카탈로그 연결 검사.
  - `profileRevisions` 복합 참조, `profileModChoices`의 활성/비활성·게임 UUID·소유자·저장 회차·순번 0부터 연속 조건, `profileDownloads`의 참조·순번·정규화된 Workshop ID 검사.
  - `modRelations` 주체·대상 실제 게임 Mod ID·소유자·주체 모드의 조사 기록 연결·명시적 승인 상태/일시 검사.
  - `researchQueue` 식별자·소유자 일관성 검사. 대기함 조회 실패(`null`)는 **기존과 같이 부분 백업**으로 허용.
- `lib/backup-preview.ts`: v3 구조 검사를 통과한 다음 위 검증을 수행하며 잘못된 참조가 있으면 오류 반환. **v1·v2 역사적 백업을 계속 열람 가능하되 부분 백업으로 표시**.
- `app/api/data-export/route.ts`: 계정 소유자 RLS로 10개 영역을 읽은 다음 **JSON 응답 전 자체 검사**도 수행. 파일 내부 연결이 어긋나면 HTTP 503으로 **잘못된 '완전한' 백업 파일 제공 중단**. 큐만 일시 누락된 경우 기존 `complete:false`/경고와 함께 부분 파일을 계속 내보낼 수 있음.
- `components/BackupInspector.tsx`: 기존 UI 디자인은 유지하면서 정상 검사 문구에 **내부 참조 검사 통과와 DB 복구 보장 아님**을 명시.
- `tests/backup-reference-integrity.test.ts`: 고아 게임 Mod ID/조사 기록/프로필, 잘못된 revision 및 순번, 비활성 위치 보존, 다른 소유자, 중복·승인 불일치, 부분 큐·v2 호환, 원본 불변 등 **13개** 추가 테스트.
- `tests/backup-preview.test.ts`·`tests/relation-lifecycle.integration.test.ts`: 옛 가짜 고아 레코드를 **실제 DB 필드명을 가진 내부 연결이 완전한 시험 fixture**로 교체하여 새 검사가 실질적 제약을 검증하게 개선.

## 보안·비용·제약

- 읽기·검증만 구현. 운영 배포, `main` 브랜치 병합, DB 스키마/RLS/GRANT, 데이터 쓰기·삭제·복구, 유료 AI API 사용 **없음**. 대상 게임 Build 42.22 호환성 주장을 추가하지 않음.
- 이 검증은 **JSON 안에 담긴 레코드끼리의 내부 참조**만 확인한다. 분할된 Supabase 조회를 하나의 시점으로 고정하지 않고, 실제 Postgres 트랜잭션 스냅샷, 자동 DB 복원, Steam 출처 검증, 전체 DB 백업 또는 특정 게임 빌드 호환성을 보장하지 않는다.
- 실제 시험 DB는 전 단계의 가상 fixture 정리 후 모드/프로필/관계가 0건이고 기존 조사 대기함 1건을 유지하므로, **실제 대용량·비어 있지 않은 소유자 전체 백업의 브라우저 E2E는 별도 검증**이 필요하다. 시험 DB에 영구 fixture를 추가할 때는 별도 승인받는다.

## 테스트/Preview

- 검증 소스 브랜치 `feature/backup-v3-reference-integrity-20261122`, Draft PR은 별도.
- Preview 배포와 전체 테스트 결과는 후속 기록.
