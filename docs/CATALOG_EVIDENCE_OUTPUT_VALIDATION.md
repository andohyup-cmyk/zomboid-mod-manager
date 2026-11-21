# 승인된 카탈로그 조사 근거 → 서버 설정 검증 연결

기준: Project Zomboid Build 42.22. 2026-11-21. **별도 DB 변경 없는 7단계 후속 작업.**

## 실제 시험 DB 및 코드 확인
- `mods`에 Workshop 단위 `verification_status`, `build_compatibility`, `multiplayer_compatibility`, `researched_at`, `source_url`, `is_archived`가 있음.
- `mod_ids`는 같은 Workshop 아래의 실제 **게임 Mod ID(복수 가능)** 로 별도 저장됨.
- `research_records`는 `mod_id`(부모 `mods.id`)와 승인된 `raw_payload`(JSON)를 저장한다. 수집 출처 URL, 확인일, 상태, 후보 게임 Mod ID 목록이 포함될 수 있음.
- 아직 별도 `mod_relations`, `selection_groups`, Build **42.22를 한정하여 증빙하는 별도 필드/테이블**은 없음. 따라서 `mods.build_compatibility='confirmed'`만으로 Build 42.22 호환을 확정하지 않음.
- 작업 시 조회한 시험 DB는 `mods=0`, `research_records=0`, `profile_revision=0`임. 아래 검증은 모의 레코드로 수행한 단위 테스트이며 실제 승인 카탈로그 실데이터 E2E가 아님.

## 이번 코드
- `lib/catalog-evidence-output.ts`의 `projectCatalogEvidence`: **인증 사용자에게 귀속된 DB 조회 결과만** 받아 부모 소유자·Workshop ID·원시 조사자료의 Workshop/URL/확인 날짜·승인된 상태·선택한 모든 게임 Mod ID와의 대응 여부를 검사.
- 같은 Workshop에 여러 조사 기록이 있거나 기록 누락·충돌·원문 누락이 있으면 그 Workshop의 호환 상태를 **미확인**으로 둔다. 일부 결과가 누락된 1,000건 이상 조회는 중단한다.
- 일치하는 단일 조사 기록에 출처 URL이 포함된 경우, *사용자가 승인해 DB에 기록한* **멀티플레이 확인 상태 또는 문제 보고 상태**를 원본 상태 그대로 기존 출력 검증기에 전달한다. 출처 URL과 `checkedAt`, 조사 레코드 ID를 API 응답에 함께 표시해 기록의 성격·시점을 구분한다. 이는 Steam 원문과 실제 게임 실행을 다시 검사했다는 뜻이 아니다.
- Build 상태는 `recordedBuildClaim`에 기록된 값을 따로 보여주되, 현재 데이터에는 정확히 Build **42.22**를 증명하는 구조가 없어 `evaluatedBuild42_22='unverified'`로 유지한다. `Mods=` 생성기가 B42.22 확인 완료라고 표시하지 않도록 함.
- 의존성·충돌·순서 관계는 조사 설명에서 자동 추측하지 않고 기존처럼 **미확인**으로 유지한다. 나중에 관계 테이블과 사용자 승인 자료가 생기면 별도 연결할 것.
- 보관(`is_archived`) Workshop은 원래 선택에서 제거하지 않고 기존 출력기의 **경고 확인** 로직에 넘긴다.
- `GET /api/profile-snapshots?profileId=...&outputPrefix=none|backslash`에서 소유자/RLS로 `mods`, `research_records`를 읽어 위 함수와 `buildSavedProfileOutput`을 연결. 응답의 `catalogEvidence`에 기록 출처와 기록 상태를 포함함.
- 응답 scope는 `owner-catalog-recorded-compatibility-claims`이며, **`readyForCopy:false` 유지**. 사용자 복사 UI·서버 파일 변경 없음.
- `tests/catalog-evidence-output.test.ts`: 기록 일치, 상태 분리, B42.22 과잉판정 방지, 누락·충돌·다른 사용자·보관 모드 경고, 기존 출력기 통합 등의 단위 테스트.

## 변하지 않은 보안·비용·UX
- DB 테이블/권한/RLS·기존 데이터 무변경.
- 시험 저장 API의 승인된 브랜치 제한 유지. 새로운 기능 브랜치에서는 승인된 쓰기 플래그도 적용되지 않아 POST는 차단됨.
- 운영 배포, `main` 병합, 외부 서버 파일 수정, 별도 유료 AI API, 홈·모드·서버 화면 변경 없음.
- 등록한 소스 원문을 자동으로 재검색하거나 사용자 승인 없이 새로운 카탈로그 자료를 등록하지 않음.
- 실제 확인된 근거가 없는 복사 활성화는 하지 않음.

## 미완료
- 정확한 B42.22 빌드 범위를 포함하는 구조화된 검증 근거·별도 모드 관계 및 선택 그룹 저장 모델과 RLS은 **별도 승인 대상**.
- 실데이터 브라우저 로그인→저장→조회→출력 E2E 및 실제 게임 서버 호환성 검사도 미완료.
- 현재 기록은 사용자가 승인한 조사 결과의 출처 추적이며, 외부 Steam 최신 정보·멀티 플레이 실동작의 사실성을 보증하지 않는다.
