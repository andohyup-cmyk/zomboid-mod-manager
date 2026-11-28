# DB 권한·프로필 영구 저장 전환 준비서 — 아직 미승인

**상태:** 설계/검증 체크리스트만 준비. 아래 내용은 어느 Supabase 프로젝트에도 적용하지 않았다.

## 1. 확인한 실제 시험 DB 상태 (2026-11-20 읽기 전용)

- 시험 프로젝트 `smofdbjgcgdmscamknpw`에 `authorized_users`, `mods`, `mod_ids`, `research_records`, `profiles`, `profile_mods` 6개 테이블이 존재하고 RLS가 활성화되어 있다.
- `research_queue`는 미존재. Preview의 `isCatalogWriteAllowed`는 시험 환경 쓰기를 차단한다.
- `profiles`와 `profile_mods`의 `authenticated` 권한은 읽기 전용이므로 프로필 수정·영구 저장은 현재 불가능하다.
- Security Advisor는 `rls_auto_enable()` SECURITY DEFINER 함수의 호출 가능성을 경고한다. DB 함수·트리거의 실제 역할 및 권한을 검토하고 별도 승인 전에는 변경하지 않는다.
- 운영/시험 Supabase URL·OAuth 환경을 서로 바꿔 쓰지 않는다.

## 2. 사용자 승인 후 첫 대상: 사용자별 영구 대기함

- SQL 초안: `supabase/migrations/202611200001_research_queue.sql` (현재 GitHub에만 저장).
- 허용 정책: owner UUID = `auth.uid()` **그리고** `is_authorized_user()`. anonymous는 접근 불가. 승인 없는 정식 카탈로그 저장 금지.
- `status='dismissed'` 방식으로 화면에서만 숨기며 데이터 삭제 API는 제공하지 않는다.
- 등록용 POST와 상태 PATCH는 Preview에서 차단된 상태. **테스트 DB 적용 자체도 별도 승인이 필요**하다.
- 승인 후 검증 순서: 읽기 전용 테이블/권한 검사 → 시험 DB 백업 → 스키마 반영 → RLS 허용 계정 / 다른 계정 / 익명 테스트 → 저장·중복·부분 실패·확인창 취소 검증 → 읽기 전용 가드 해제 여부 추가 승인.
- production main, 운영 Supabase, 운영 OAuth는 범위에서 제외한다.

## 3. 카탈로그 추가 스키마 설계 (미확정 사항 보존)

| 기능 | 권장 데이터 모델 | 아직 필요한 결정 |
|---|---|---|
| 즐겨찾기·개인 메모 | `mod_annotations(owner_id, mod_id, favorite, note)` | 보관 UX와 기록 보존 |
| 카테고리 | `categories` + `mod_categories` 연결 테이블 | 카테고리 단일/복수 허용, 기본값 |
| 태그 | `tags` + `mod_tags` 연결 테이블 | 초깃값과 이름 충돌 규칙 |
| 의존성·충돌·패치 | `mod_relations(owner_id, source_mod_id, target_mod_id, kind, verified, source_url, checked_at)` | Workshop 단위와 Mod ID 단위의 정확한 관계 |
| 선택 그룹 | `selection_groups` + `selection_group_members` | 그룹 최소·최대·필수 기본 규칙 및 배타성 |
| 변경 이력 | `change_log` 또는 append-only 이벤트 | 기록 범위, 복원 정책 |

카테고리 1개 제한은 **미확정**이므로 데이터 모델은 다중 연결 가능성을 배제하지 않아야 한다. 사용자 승인 없이 임의 기본값을 확정하지 않는다.

## 4. 서버 프로필 영구화 설계

기존 `profile_mods.mod_id`는 게임 Mod ID 개별 행이 아닌 `mods.id`를 참조한다. 기존 레코드에 임의 변환을 적용하면 멀티 ID 모드를 전부 활성화하는 위험이 있다.

권장 신규 구조:
- `profile_mod_choices(profile_id, mod_id_entry_id, enabled, load_order)`: 게임 `mod_ids.id` 행에 **명시적으로** 연결, 원래 순서 유지. 조합의 소유자 검사.
- `profile_downloads(profile_id, workshop_id, load_order)`: 다운로드 전용 Workshop과 실제 Mod ID 활성화 분리.
- `profile_revision(profile_id, revision, updated_at, notes)`: 같은 프로필 동시 편집 시 낡은 변경 덮어쓰기 방지.
- 기존 `profiles` 이름·소유자 모델은 유지. 레거시 `profile_mods`는 검증 전 일괄 삭제/변경하지 않는다.
- 프로필 저장 API는 승인된 DB 정책과 검증이 갖춰지기 전까지 개발용 JSON 파일 내보내기/불러오기로 대체한다.

## 5. 권한 검증의 핵심

- 각 소유자 데이터의 RLS는 `auth.uid()`와 `is_authorized_user()`를 모두 검사한다.
- `UPDATE`에는 `SELECT`, `USING`, `WITH CHECK`가 필요하다. `SECURITY DEFINER`로 RLS를 우회하지 않는다.
- 교차 테이블 관계는 모드·프로필·카테고리의 **동일 owner_id**를 검증한다.
- 익명 접근과 다른 로그인 계정의 ID 열람·추가·수정·상태 변경을 거부하는 실통합 테스트를 적용 전후로 수행한다.
- 브라우저 공개 환경변수는 URL·공개키 외 비밀을 포함하지 않는다.
- DB 원본 백업과 코드 Git 이력은 별도로 관리한다.

## 6. 막힌 작업과 독립 가능한 작업

**승인 없이는 진행 불가:** 새 DB 테이블/RLS/GRANT, Preview 쓰기 해제, 운영 배포·병합, Google OAuth 설정 변경, 실제 게임 서버 파일 수정.

**승인 없이 진행 가능:** UI·입력/출력 검증, 순수 규칙 엔진 및 테스트, 외부 호출 없는 브라우저 JSON 파일 검사, 읽기 전용 DB 점검, PC 실행 스크립트·문서 준비.

실제 적용은 별도 승인 후 변경 전·후 체크리스트를 단계별로 완료해야 한다.
