# 모바일 서버 프로필 Mod ID 화면 연결

## 화면 상태

- 카탈로그는 `ProfileCatalogEntry[]`로 전달한다. 각 항목의 `workshopId`와 선택 가능한 개별 `modIds`로 Workshop별 선택 화면을 구성한다.
- 추가 대기 목록은 사용자가 고른 순서의 `ProfileModAddition[]`이다. 각 항목에 `workshopId`, `modId`와 그 조합의 카탈로그 메타데이터를 넣는다. 대표 카테고리와 태그는 해당 카탈로그 항목에서 가져오고, 개별 UUID가 있으면 같은 Mod ID의 카탈로그 레코드에서 가져온다.
- 프로필 편집 상태는 `ProfileModSelection[]`이다. 배열 순서대로 행을 표시하고 비활성 행도 목록에 유지한다. 화면 키와 상태 변경 대상은 앞뒤 공백을 제거한 Workshop ID와 Mod ID의 쌍이다. 대소문자는 보존한다.

## 함수와 반환값

| 화면 동작 | 함수 | 상태 반영 |
| --- | --- | --- |
| 선택한 항목 추가 | `addProfileModSelections(catalog, selections, candidates)` | 성공 시 `selections`를 교체하고 `warnings`를 표시한다. 실패 시 현재 목록을 유지하고 `errors`의 각 `index`로 원래 입력 항목을 찾는다. |
| 비활성화 또는 재활성화 | `updateProfileModState(selections, pair, "disable" 또는 "enable")` | 기존 위치와 카테고리를 유지한 채 `enabled`를 변경한다. |
| 이 프로필에서 제거 | `updateProfileModState(selections, pair, "remove")` | 해당 선택을 편집 목록에서 빼고 남은 행의 상대 순서를 유지한다. |
| 제거한 항목 다시 추가 | `addProfileModSelections(catalog, selections, candidates)` | 현재 카탈로그의 대표 카테고리를 사용해 새 위치를 계산한다. 카테고리 삽입의 기준에는 비활성 선택도 포함한다. |
| 활성 항목 조회 | `getEnabledProfileMods(selections)` | 현재 순서에서 활성 선택만 반환한다. |

`addProfileModSelections`는 전체 추가 목록을 검증한 뒤 원래의 Workshop ID와 Mod ID 조합을 카테고리 삽입 함수에 전달한다. 검증 결과의 `workshopIds`는 중복 제거되는 별도 목록이므로 UI의 선택 데이터는 원래 입력 쌍을 그대로 사용한다.

같은 Workshop과 Mod ID를 다시 선택하면 이미 있는 행의 위치·카테고리·활성 상태를 유지한다. 서로 다른 Workshop이 같은 Mod ID를 제공하면 두 행을 구분하고, 경고에 제공 Workshop을 표시한다. 경고만 있는 경우 추가가 가능하다.

## 저장과 출력의 연결 경계

편집 목록의 배열 순서가 표시 기준이다. 향후 저장 계층은 저장 시점의 배열 위치에서 순서 번호를 계산하고, 소유권이 확인된 카탈로그 행의 `mod_ids.id`에 각 입력 쌍을 연결한다. 로컬 검증 함수는 Workshop ID와 Mod ID의 조합을 검사한다. UUID와 카테고리의 출처 확인은 카탈로그 및 저장 계층의 책임이다.

## 편집 화면의 읽기 전용 카탈로그

- `/api/profile-catalog`는 기존 `getOwnerAccess()` 확인 후 요청자의 Supabase 세션과 RLS로 조회한다. `mods`의 소유자·보관 상태를 필터링하고 관련 `mod_ids`의 값과 UUID를 반환한다. 확인된 Mod ID가 없는 항목은 선택할 수 없다.
- 모드 이름, Workshop ID, Mod ID를 서버에서 검색한다. Workshop ID의 텍스트 순서를 기준으로 한 번에 최대 24개씩 요청한다. 가져온 범위 뒤에 결과가 있으면 더 불러올 수 있다. [PostgREST 임베딩 검색](https://docs.postgrest.org/en/v12/references/api/resource_embedding.html#or-filtering-across-embedded-resources)
- 조회한 항목과 추가 대기·편집 상태는 현재 탭의 메모리에 유지된다. 중복 Mod ID 경고의 범위는 이 탭에서 조회한 카탈로그다. 한 Workshop 안에서 앞뒤 공백을 제거한 값이 같은 여러 행은 한 선택으로 표시하며, 서로 다른 UUID가 있으면 선택에 UUID를 지정하지 않는다.
- 현재 스키마의 DB 연결은 대표 카테고리·태그·관계 규칙을 공급하지 않는다. 대표 카테고리는 미확인으로 표시하고 신규 선택은 목록 끝에 추가한다. 프로필 저장 및 서버 설정 문자열 생성은 후속 범위다.
