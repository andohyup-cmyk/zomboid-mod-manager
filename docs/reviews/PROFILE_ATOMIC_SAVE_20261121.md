# 시험 DB 원자적 프로필 저장 RPC + API 검증

2026-11-21, 사용자 별도 승인. 대상은 시험 Supabase `smofdbjgcgdmscamknpw`뿐이며 운영 환경은 변경하지 않음.

## 구현

- `public.save_profile_snapshot(p_profile_id uuid,p_expected_revision integer,p_choices jsonb,p_downloads jsonb)` → 새 revision 번호 반환.
- SQL: `supabase/migrations/20261121105254_test_profile_atomic_snapshot_invoker.sql`. 시험 DB 실제 이력과 버전 일치. 사전 검토 원본은 `supabase/plans/test_profile_atomic_save_invoker.sql`.
- `SECURITY INVOKER`, `search_path=''`. `EXECUTE`는 authenticated에만 허용, anon/PUBLIC은 거부. `auth.uid()` + 기존 `public.is_authorized_user()` 검사 및 소유자 RLS 그대로 적용.
- 서버가 소유 프로필을 확인한 뒤 `pg_advisory_xact_lock`으로 동일 프로필의 승인된 저장 함수 호출을 직렬화하고, 마지막 revision과 요청의 `expectedRevision`을 비교한다. 일치할 때만 revision을 하나 추가한다. 동시에 같은 회차를 저장하면 뒤 요청은 충돌로 거부. DB 고유키도 중복 회차의 2차 안전장치.
- `p_choices`는 `[{ "mod_id_entry_id":"UUID", "enabled":true/false }]`만 허용, 최대 500개. 각 개별 `mod_ids.id`와 `mods.owner_id`를 조회해 본인 Mod ID임을 확인. 중복·기타 필드·허위 순서값은 거부. 항목 배열의 순서로 `load_order=0,1,...` 기록. 비활성 항목도 기록.
- `p_downloads`는 명시적 Workshop 문자열 배열만 허용, 최대 500개. 중복, 잘못된 형식, 64-bit 범위를 벗어난 ID 거부.
- 유효성 검사를 마친 뒤 `profile_revision`, `profile_mod_choices`, `profile_downloads`에 단일 RPC/트랜잭션으로 추가 기록. 에러 발생 시 호출 전체가 롤백되며 기존 회차/레거시 데이터는 수정/삭제하지 않음.
- `app/api/profile-snapshots/route.ts`에 테스트 전용 `POST` 구현. 사용자 세션 + 본인 계정 확인, same-origin, 180k 입력 크기, 편집 대상 프로필 소유자·마지막 회차 확인, Workshop/실제 Mod ID 쌍을 본인 카탈로그 UUID에 대응, `planProfileSave`로 전체 입력 검증. 그 후 정제된 RPC 데이터만 호출.
- `lib/profile-snapshot-write.ts`: **Preview 전용·고정 프로젝트 ID·고정 브랜치·고정 시험 Supabase 주소·별도 환경변수 opt-in**이 모두 충족되어야 HTTP 쓰기를 허용. 기본은 **차단**. 다른 Preview, 개발 환경 및 Production에서는 403. 별도의 유료 서비스 없음.
- `tests/profile-snapshot-write.test.ts`: 쓰기 게이트, URL/브랜치/프로젝트 차단, RPC 전송 필드 제한, 오류 코드 검증.
- `GET /api/profile-snapshots?profileId=UUID`: 본인 소유 프로필의 **마지막 수정 회차만** 조회. 회차 ID가 확정되면 해당 회차의 Mod ID 선택·비활성 상태·순서·다운로드 전용 Workshop을 RLS 아래 읽고, `mod_ids`→`mods`를 통해 원래 Workshop ID와 실제 게임 Mod ID를 검증한 뒤 반환. 저장 중 새로운 회차가 생겨도 서로 다른 회차의 데이터를 섞지 않음.
- `lib/profile-snapshot-read.ts` / `tests/profile-snapshot-read.test.ts`: 선택·다운로드 순번 누락, 중복 ID, 다른 소유자 또는 누락된 Mod ID는 복원 결과를 만들지 않고 오류 처리. 데이터·UI 쓰기 없음.

## 실제 DB 검증 완료

- 적용 마이그레이션 `20261121105254_test_profile_atomic_snapshot_invoker` 확인.
- `pg_proc.prosecdef=false` 확인, anon EXECUTE=false, authenticated EXECUTE=true, 함수 search_path empty 확인.
- `BEGIN ... ROLLBACK` 내에서 실제 승인 사용자 `SET LOCAL ROLE authenticated` + JWT sub 모의:
  - 프로필·Workshop 모드·서로 다른 두 게임 Mod ID 생성, 비활성 1/활성 1·순서 0/1·다운로드 전용 2건 저장 → revision 1 반환 및 DB 행 검증.
  - 같은 expectedRevision 재사용 → `PZ001` 충돌 거부.
  - 없는 게임 Mod ID → `PZ003` 거부.
  - 임의 `load_order`, 게임 Mod ID 중복, 다운로드 중복, 501개 입력, 64-bit 초과 Workshop ID → `PZ002` 거부.
  - 오류 요청들 뒤 1/2/2건 유지 확인 → **부분 저장 없음**.
  - 두 번째 정상 저장으로 빈 초안 revision 2 추가; 기존 회차의 선택/다운로드 기록 유지 확인.
- 승인되지 않은 UUID의 직접 RPC 호출은 거부, anon은 EXECUTE 권한 없음.
- 시험 데이터 모두 ROLLBACK. 마지막 조회 시 `profiles=0`, `profile_mods=0`, `mods=0`, `mod_ids=0`, `profile_revision=0`, `profile_mod_choices=0`, `profile_downloads=0`. 기존 등록 대기함 pending 1건 유지.
- Security Advisor 신규 함수 SECURITY DEFINER 경고 없음. 이전부터 존재하는 `rls_auto_enable()` 및 leaked password 설정 경고는 범위 외라 미변경.

## 중요한 한계 및 후속 검증

1. 별도 실제 사용자 2명 또는 **서로 다른 DB 세션에서 완전히 같은 시점에 경쟁 저장하는 E2E**는 미실행. 순차 CAS 충돌·DB PK·트랜잭션 잠금은 검증했지만 실제 네트워크 동시성을 검증했다고 주장하지 않음.
2. 기존 새 테이블의 authenticated에 이미 부여된 **열 단위 직접 INSERT 권한은 SECURITY INVOKER 함수의 동작에 필요하여 그대로 유지**. API/RPC는 원자적이지만, 허용된 사용자가 **DB Data API에서 테이블을 직접 INSERT하는 경로 자체를 막은 것은 아니다**. 직접 요청으로 비정상 회차/부분 행을 만드는 가능성이 존재하므로, 최종 운영 전 저장 정책을 별도 검토해야 한다. 다른 사람의 데이터는 RLS로 보호됨.
3. 현재 앱 화면에는 프로필 생성·영구 저장 버튼을 연결하지 않았다. `PROFILE_SNAPSHOT_TEST_WRITE_ENABLED` 환경변수는 별도로 켜지 않으면 HTTP POST가 403이다. API 구현/빌드 테스트와 실제 앱 사용 가능 여부는 구분한다.
4. HTTP Preview에서 **로그인 사용자로 실제 POST와 GET을 연속 호출하는 E2E**는 테스트 계정 세션과 opt-in 게이트가 설정되기 전까지 미검증이다. GET 코드는 독립적으로 읽기 전용이지만, 실제 등록된 프로필 행이 없어 브라우저의 정상 스냅샷을 검증하지 못했다.
5. 운영 DB, Vercel Production, `main` 브랜치, 기존 테이블 행/권한, Google OAuth, 서버의 실제 설정 파일에는 변경 없음.
