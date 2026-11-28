# 6단계 — 서버 프로필 영구 저장 안전 계획 (DB 미적용)

**상태: 저장 데이터 검증·변환 로직과 테스트만 준비, 실제 저장 API/RLS/마이그레이션 미구현.**  
기준: Project Zomboid Build 42.22, 2026-11-21.

## 현재 시험 DB 사실 (읽기 전용 조회)

프로젝트 `smofdbjgcgdmscamknpw`에는 `profiles`, `profile_mods`, `mods`, `mod_ids`가 있다.

- `profiles` / `profile_mods`의 등록 데이터는 조회 시 각각 **0건**. 기존 데이터가 0건이라는 것이 실제 사용 기록의 이행·삭제 승인이라는 뜻은 아니다.
- `authenticated`의 `profiles` SELECT 권한은 있지만 INSERT 권한은 없고, `profile_mods` INSERT 권한도 없다. `profiles`의 INSERT/UPDATE/DELETE RLS는 **0건**이다.
- `profile_mod_choices`, `profile_downloads`, `profile_revision` 신규 테이블은 **존재하지 않는다**.
- 기존 `profile_mods.mod_id`는 **카탈로그 `mods.id`**, 즉 Workshop 단위 레코드를 가리킨다. 게임의 개별 Mod ID는 `mod_ids.id`를 참조해야 한다.
- 운영 Supabase·프로덕션에는 어떤 것도 적용하지 않는다.

## 검증용 모델

`lib/profile-persistence-plan.ts`의 `planProfileSave(input, context)`는 **DB 쓰기 없는 순수 함수**다.

- **input**: `profileId`, `expectedRevision`, `selections`, `downloadOnlyWorkshopIds`. 개별 선택은 정확한 `workshopId`, 실제 게임 `modId`, `enabled`, 필요 시 `modIdUuid`로 지정한다.
- **context (서버 신뢰 자료)**: 로그인 사용자 UUID, 프로필 소유자·ID·현재 revision, 서버에서 인증·RLS 아래 조회한 Workshop+게임 Mod ID 후보 목록.
- 선택한 Workshop·게임 Mod ID 쌍을 검증된 `mod_ids.id` 후보 UUID로 연결한다. 동일한 게임 Mod ID가 여러 Workshop에 있어도 **서로 다른 후보**로 유지한다.
- 편집 순서대로 `load_order`를 0부터 부여한다. `enabled=false`인 행은 제외하지 않고 **원래 위치를 유지**한다. 화면의 1부터 시작하는 번호와 내부 0부터 시작하는 인덱스는 별개다.
- 다운로드 전용 Workshop은 **명시적으로 선택한 것만** 별도 목록에 남긴다. 게임 Mod ID가 없어도 다운로드 전용 ID는 저장 계획에서 허용한다.
- 0개의 모드 선택도 **미완성 프로필 초안**으로 허용한다. `Mods=` 및 `WorkshopItems=` 출력 가능 여부는 기존 서버 설정 검증 단계에서 따로 판단한다.
- 정확히 같은 Workshop/Mod ID 쌍이 중복되거나, 사용자 제출 UUID가 현재 카탈로그와 다르거나, 단일 쌍이 서로 다른 후보 UUID로 매핑되면 **전체 계획을 거부**한다.
- 요청에 없는 소유권/카탈로그 후보를 임의로 추가하지 않는다. 다른 소유자의 레코드 또는 다른 프로필 접근은 거부한다.
- `expectedRevision`이 서버의 현재 revision과 다른 경우 **낡은 편집(stale)** 으로 거부한다. 단 이 검사는 구현 전 예행 검증이며, 실제 서버는 **원자적인 CAS 트랜잭션**을 반드시 사용해야 한다.
- 입력에 `ownerId`, `profile_mods`, 임의 `load_order` 같은 추가 필드를 붙여 덮어쓰는 mass assignment는 거부한다.
- 현재 저장 계획은 `primaryCategoryId`나 `tags`를 클라이언트 입력에서 신뢰하지 않는다. 카테고리/태그는 별도 소유자 검증된 관계 테이블에서 가져와야 한다.
- 이미 보관된 모드에 대한 기존 프로필 선택·활성 상태·순서는 삭제하거나 자동 변경하지 않는다.

## DB 적용 설계 — 추후 승인 필수

1. 기존 `profiles` / `profile_mods`를 백업하고 **그대로 보존**한다. 기존 행을 게임 Mod ID로 자동 확장하지 않는다.
2. 프로필별 개별 선택 `profile_mod_choices(profile_id, mod_id_entry_id, enabled, load_order)`, 다운로드 전용 `profile_downloads(profile_id, workshop_id, load_order)`, 프로필 revision을 원본과 별개로 준비한다.
3. 후보 ID의 Workshop과 `mods.owner_id`가 `profiles.owner_id`와 동일한지 DB 정책/트랜잭션에서 다시 검증한다.
4. 인증 사용자의 RLS를 `auth.uid()`와 `is_authorized_user()`로 제한한다. 클라이언트 서비스 키, `SECURITY DEFINER` 우회는 금지한다.
5. 단일 원자 트랜잭션에서 `expectedRevision`을 비교하고, 전체 선택·다운로드 상태를 교체하고, revision을 증가시킨다. 중간 실패 시 **전부 롤백**하며 다른 사용자/프로필은 변경할 수 없다.
6. 허가된 시험 사용자·다른 로그인 계정·익명 사용자, 동시에 저장하는 두 탭, 중복 후보, 보관 항목, 500건 경계, 0건 초안을 실검증한다.
7. **별도 사용자 승인 후에만** 시험 DB에 마이그레이션·RLS·GRANT/코드 저장 경로를 적용한다. 운영 배포와 `main` 병합은 또 다른 별도 승인 대상이다.

## 아직 사용자가 정하지 않은 부분

- 특정 프로필 이름/기본 프로필/친구 공유 UX와 프로필 간 복제 UX는 확정하지 않았다.
- 홈·모드·서버 UI 디자인은 사용자가 나중에 정하기로 했으므로 변경하지 않는다.
- 기존 `profile_mods`의 실제 이행은 사용자에게 원본과 선택할 Mod ID를 보여주고 명시적으로 승인받기 전에는 수행하지 않는다.

## 검증 상태

- 저장 계획 관련 회귀 테스트: `tests/profile-persistence-plan.test.ts`.
- 이는 실제 DB 저장/복원을 테스트한 것이 아니다. 기존 임시 JSON 내보내기/불러오기는 유지한다.
