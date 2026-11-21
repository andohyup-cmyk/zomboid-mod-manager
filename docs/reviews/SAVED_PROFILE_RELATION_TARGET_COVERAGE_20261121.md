# 저장된 프로필의 미선택 관계 대상 누락 검증 (2026-11-21)

## 발견된 실제 경로 오류

기존 `GET /api/profile-snapshots?profileId=...&outputPrefix=...`는 **저장 프로필에서 선택된 개별 `mod_ids.id`만** 신뢰 가능한 대상 ID로 묶어 `projectReviewedRelations`에 전달했다.

관계의 주체가 프로필에서 활성화되어 있어도, 필수 `requires` 관계의 *대상*은 프로필에서 전혀 선택되지 않았을 수 있다. 이때 현재 코드에서는 근거가 유효하고 해당 관계가 이미 승인되었어도 대상의 신원을 찾지 못하여 `missing-catalog-identity`로 보류했다. 그 결과 기존 `ProfileOrderRule`의 **필수 모드 누락 차단** 검사가 실행되지 않았다.

이는 확정된 요구사항인 **"확인된 필수 의존성 누락은 설정 복사를 차단"**에 반하는 경로이므로 신규 스키마·화면 변경 없이 수정했다.

## 이번 수정

- `lib/saved-relation-target-coverage.ts`: 저장된 선택 ID에 **주체가 포함된 관계만** 대상으로 한정하고, 관계 대상이 프로필 선택 목록에 없는 경우 해당 UUID를 중복 없이 나열하는 순수 함수.
- `GET /api/profile-snapshots`: 기존 사용자 인증·owner RLS 아래 `mod_relations`의 **선택된 주체**만 조회. 이전에는 동일 소유자의 관계 전체를 조회했으므로 무관한 관계까지 평가할 여지가 있었다.
- 아직 선택하지 않은 관계 대상은 `mod_ids`와 소유자 제한 `mods`에서 조회하여 **관계 검증용 임시 목록**에만 추가한다. 그 목록을 `projectReviewedRelations`에 전달한다.
- 서버 설정 출력기 `buildSavedProfileOutput`에는 **원래 선택 항목(`sourceBindings`)과 원래 `restored` 프로필만** 전달한다. 미선택 관계 대상을 자동 등록·활성화·다운로드하거나 `Mods=` / `WorkshopItems=`에 자동 삽입하지 않는다.
- 대상 게임 Mod ID 조회 또는 소유자 연결을 확인할 수 없으면 503으로 검증을 실패 처리한다. 해당 관계를 임의의 다른 Workshop이나 Mod ID에 연결하지 않는다.
- **B42.22의 실제 호환성·확인되지 않은 의존성은 자동 확정하지 않음**. 시험 Preview의 `readyForCopy:false`는 유지.

## 검사 결과

- 테스트 `tests/saved-relation-target-coverage.test.ts` 10개 추가: 미선택·명시적 비활성 필수 대상 차단, 관계 주체가 선택되지 않은 경우 무시, 미승인 관계 보류, Workshop 제공자 구분, 대상 조회 중복 제거·입력 불변성·한도.
- 전체 단위 테스트 **307/307 통과**. TypeScript, ESLint, Next.js 빌드 통과.
- 검증 Preview `dpl_9DiXnAm3WcruqZLEENzDai4RSL6F` **READY**, 코드 커밋 `b813214252c3348ed1bb32989fcd0fc9cd85453b`. 그 뒤 문서 기록만 추가.
- 시험 Supabase `smofdbjgcgdmscamknpw`에서 **`BEGIN` → 테스트 권한 있는 사용자 `authenticated` 역할/JWT 설정 → 모드 2개·게임 Mod ID 2개·조사 원문 1개·프로필 1개 및 선택 1개·승인된 의존성 관계 1개 임시 생성 → RLS 하에서 관계 주체 및 미선택 대상 조회 확인 → `ROLLBACK`**. 실제 SQL에서 확인됐으며, 오류 1건(테스트 내부 변수/컬럼 이름 충돌)을 수정하고 재실행 성공. 오류가 난 시험 트랜잭션도 데이터가 반영되지 않았다.
- 롤백 이후 `mods`, `mod_ids`, `research_records`, `mod_relations`, `profiles`, `profile_revision`, `profile_mod_choices` 모두 **0건** 재확인. 기존 `research_queue` pending 1건 유지.
- 시험 브랜치 `feature/profile-relation-target-coverage-20261121`에는 별도 DB 쓰기 허용 플래그가 없음. 이전 관계 쓰기 Preview와 구분.

## 남은 범위와 검증 한계

- **실제 Google OAuth 브라우저 세션**에서 등록→승인→조회→출력→백업을 일괄 수행하는 사용 시나리오의 HTTP/UI E2E는 아직 수행하지 못했다. 현재 앱 테스트 DB에는 영구 등록된 카탈로그/프로필이 없고, 현재 도구에서는 사용자의 인증 브라우저 세션을 사용할 수 없다.
- 서버 권한과 타입 검증, SQL 트랜잭션 통합 테스트에 성공했다는 것은 실제 사람의 브라우저 로그인·동일 사이트 쿠키, Vercel Deployment Protection/Preview URL, Google OAuth 콜백이 정상임을 보장하지 않는다.
- Preview 오류 로그/빌드 성공과 실제 사용자 경로 E2E를 분리해 기록한다.
- 기존 홈/모드/서버 화면 변경, DB 마이그레이션·권한 변경, 운영 배포, `main` 병합, 영구 시험 자료 등록·삭제 없음.
