# 승인된 모드 관계 증빙 모델 — 저장 전 검증 단계

작성: 2026-11-21. **이 문서는 제안서이며 DB 마이그레이션을 적용하지 않았다.**

## 목적과 확정된 원칙

- Project Zomboid B42.22가 목표지만 Build 42 확인 자료를 무조건 B42.22 검증으로 승격하지 않는다.
- 일반 모드 카테고리·태그·선택 그룹과 **모드 관계(필수 의존·충돌·로드 순서)** 는 독립적으로 관리한다.
- 모드 관계는 Workshop ID와 게임 Mod ID를 혼동하지 않는다. **서로 다른 Workshop이 같은 게임 Mod ID를 제공할 수 있으므로**, 규칙의 양쪽 끝을 각각 `mod_ids.id` UUID로 지정한다.
- 사용자가 승인하지 않은 AI 추정, 자유 텍스트 설명, 빈 출처를 **검증된 규칙**으로 간주하지 않는다.
- 누락된 의존성은 검증 완료 후 복사 차단, 확인된 충돌·로드 순서 위반은 경고 확인을 요구한다. 자동 설치·활성화·순서 변경은 하지 않는다.
- 현재 `mods`, `mod_ids`, `research_records`에는 정규화된 관계 테이블이 없으므로 앱 API에 연결하거나 DB 테이블을 추가하지 않는다.

## 이번에 구현한 순수 검증기

`lib/reviewed-mod-relations.ts`의 `projectReviewedRelations(ownerId, identities, evidence, rows)`.

`rows`는 **장래 사용자 승인된 DB 관계 레코드의 제안 모델**이다. 이번 작업에서 실제 관계 레코드나 테이블을 생성하지 않았다. 단순한 클라이언트 JSON을 신뢰하기 위한 함수가 아니다.

필수 속성: `id`, `ownerId`, `kind`, `subjectModIdUuid`, `targetModIdUuid`, `evidenceRecordId`, `sourceUrl`, `checkedAt`, `approved`.

허용된 `kind`: `requires`, `incompatibleMods`, `loadBefore`, `loadAfter`. 대상은 모드의 게임 내 ID 문자열이 아닌 **소유자 검증된 Mod ID UUID**다.

검증 흐름:
1. 다른 owner의 기록, 중복/자기 참조/알 수 없는 종류의 관계, 중복 UUID 카탈로그, 중복 조사 근거, 과도한 크기는 입력 전체를 거부.
2. `approved=false` 관계는 **반영 보류(`not-approved`)**. 사용자 승인 없이 DB 기록을 스스로 인증하지 않음.
3. 양쪽 Mod ID UUID를 인증된 소유자 DB 카탈로그의 정확한 Workshop/게임 ID 쌍에 연결할 수 없는 경우 **반영 보류(`missing-catalog-identity`)**. 잘못된 대상 자동 등록 금지.
4. 주체 Workshop의 앞서 검증한 `catalogEvidence`가 `matched-approved-record`이고, 레코드 ID·확인일이 일치하며 근거 URL이 해당 조사 기록의 출처 목록에 실제 포함될 때만 **검증된 관계**로 변환. 근거가 없거나 오래된 경우 `missing-approved-evidence`로 보류.
5. 결과를 이미 존재하는 **Workshop까지 지정된** `ProfileOrderRule`(verified + source + checkedAt)로 변환. `buildSavedProfileOutput`과 기존 검증 엔진에서 관계 적용 시 대상 선택 누락·충돌·순서 위반이 올바른 경고/복사 차단이 되는지 테스트.
6. 입력 배열과 프로필 원래 순서는 변경하지 않는다. 단순한 증빙 없는 주장으로 실행 흐름을 변경하지 않는다.

## 장래 DB 적용 제안 — 별도 사용자 승인 필요

가칭 `mod_relations`:
- 기본: `id uuid PK`, `owner_id uuid`, `kind` (허용 4종), `subject_mod_id_entry_id uuid FK → mod_ids.id`, `target_mod_id_entry_id uuid FK → mod_ids.id`
- 근거: `research_record_id uuid FK → research_records.id`, `evidence_url text`, `checked_at date`, `approved boolean NOT NULL DEFAULT false`, `approved_at timestamptz`, `created_at timestamptz`.
- 소유자 검증: 관계 주체·대상이 모두 `owner_id` 계정 소유 `mods` 아래의 `mod_ids.id`인지 조회/저장 시 정책과 DB 제약에서 강제. 승인 시 선택한 `research_records.mod_id`가 주체 `mods.id`에 대응하는지도 검증.
- 새 테이블 기본 RLS 활성, 익명 SELECT/INSERT/UPDATE/DELETE 금지, 사용자 승인 작업을 API/RPC로 별도 검토. 자유 공개 권한이나 `SECURITY DEFINER`로 우회하지 않음.
- 모든 관계는 실제 `source_url`, 확인 날짜, 승인 여부를 유지. 더 최신 조사에서 출처가 갱신됐거나 레코드가 모호하면 **사용자 재검토 전까지 관계 사용 보류**.
- SQL 스키마, 승인 RPC, GRANT, RLS 변경 및 시험 DB 이행은 **현재 허용 범위 아님**. 적용 전 기존 데이터 백업, 실제 사용자·타인·익명 실검증 필요.

## 제한·미결정

- **아직 DB에서 읽는 API 경로에 이 신규 규칙을 연결하지 않았다.** 구조화된 `mod_relations` 테이블이 없기 때문이다. 따라서 최신 API의 `readyForCopy=false` 상태를 바꾸지 않는다.
- `requires-workshop`처럼 대상의 게임 Mod ID가 전혀 알려지지 않은 관계와 외부 Workshop 요구는 별도 구조가 필요하다. 현재 검증기는 양쪽 Mod ID UUID를 요구하며 미등록 대상은 차단 규칙으로 변환하지 않고 보류한다.
- 동일 모드 설명에 적힌 모든 텍스트가 실제 의존성인 것은 아니다. 이를 자동 추론해 승인하지 않는다.
- B42.22 *정확한 빌드 범위*를 증명하는 호환성 근거는 위 관계 모델과 별개이며, 단순히 `build_compatibility=confirmed`로 해결할 수 없다.
- 실제 친구 계정 공유 권한, 관계 승인 UX, 홈·모드·서버 화면은 사용자 확정 전 변경하지 않는다.

## 검증

`tests/reviewed-mod-relations.test.ts`에서는 승인된 관계/승인 없는 관계, 근거 레코드·일자·URL 불일치, 두 Workshop의 같은 게임 ID, 외부 소유자/중복/모호성, 실제 설정 엔진의 필수 의존 누락 차단·충돌 확인·로드 순서 경고를 테스트한다.

모든 테스트는 **가상 소유자·가상 Workshop/Mod ID·가상 출처**를 사용한다. 실제 Steam Workshop이나 멀티플레이 서버에서 검증했다고 주장하지 않는다.


## [후속 구현 상태 갱신: 2026-11-21]

이 문서가 처음 작성될 당시에는 관계 DB 테이블이 미적용이었습니다. 그 뒤 **시험 Supabase에만** `mod_relations` 테이블/RLS SELECT를 `20261121133840_test_mod_relations_readonly_owner_rls`로 적용했으며, 사용자 후속 지시로 **미승인 초안 INSERT + 별도 승인 UPDATE 최소 권한**을 `20261121143453_test_mod_relation_draft_approval_rls`에서 추가했습니다.

현재 시험 API에는 `/api/mod-relations`(목록·초안), `/api/mod-relations/approve`(명시적 승인 요청) 경로가 있지만, 승인 버튼 UI·브라우저 OAuth E2E·운영 DB는 아직 적용/검증되지 않았습니다. 출처 검증과 관계 평가의 `readyForCopy=false` 잠금은 유지합니다. 전체 검증은 `docs/reviews/MOD_RELATION_REVIEW_FLOW_20261121.md`를 참고하세요.
