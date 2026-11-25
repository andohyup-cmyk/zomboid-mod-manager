# 데이터 연동 및 정합성 계약 (Data Sync Contract)

> 이 문서는 앱 내부(등록·카탈로그·상세·카테고리·선택 그룹·서버 프로필·백업)의 정보가 서로 어긋나지 않게 유지하기 위한 **강제 규칙**입니다.
> 핵심 규칙은 `tests/data-sync-contract.test.ts`로 자동 검증되므로, 규칙을 위반하면 `npm run verify` 및 `npm run build`가 즉시 실패합니다.

## 1. 단일 기준 모듈 (`lib/data-sync.ts`)

- **도메인 변경 → 영향 화면 매핑:** `SYNC_DOMAIN_PATHS`
- **도메인 변경 → 백업 테이블 매핑:** `SYNC_DOMAIN_BACKUP_TABLES`
- **표준 비캐시 헤더:** `PRIVATE_NO_STORE_HEADERS` (`Cache-Control: private, no-store, max-age=0`)
- **공통 계산/해석 함수:**
  - `buildPrimaryCategoryMap`: 대표 카테고리 표시의 단일 해석기 (`/mods`, `/api/profile-catalog`, `/api/profile-snapshots` 공용)
  - `countActiveUnclassifiedMods`: 보관된 모드를 제외한 정확한 미분류 건수 계산 (`/dashboard`·`/mods` 일치 보장)

## 2. 도메인별 화면 연동 매트릭스

| 변경 도메인 (`SyncDomain`) | 쓰는 API | 자동 갱신 대상 화면 (`revalidateDomain`) | 백업 검증 대상 |
|---|---|---|---|
| `mod` (등록·상태·메모·보관/복원) | `POST /api/mods`, `PATCH /api/mods/[id]` | `/dashboard`, `/mods`, `/mods/[id]`, `/profiles`, `/profiles/editor`, `/backup` | `mods`, `researchRecords` |
| `modId` (추가·일괄 채우기·삭제) | `POST/DELETE /api/mod-ids` | `/dashboard`, `/mods`, `/mods/[id]`, `/profiles/editor`, `/backup` | `modIds` |
| `category` (추가·이름 변경·삭제) | `POST/PATCH/DELETE /api/categories` | `/dashboard`, `/mods`, `/mods/[id]`, `/profiles/editor`, `/backup` | `categories` |
| `modCategory` (모드 소속·대표·미분류 해제) | `POST /api/mod-categories` | `/dashboard`, `/mods`, `/mods/[id]`, `/profiles/editor`, `/backup` | `modCategories`, `modCategoryPrimary` |
| `profile` (프로필 생성) | `POST /api/profiles` | `/dashboard`, `/profiles`, `/profiles/editor`, `/backup` | `profiles` |
| `profileSnapshot` (프로필 Mod ID 조합 저장) | `POST /api/profile-snapshots` | `/profiles`, `/profiles/editor`, `/backup` | `profileRevisions`, `profileModChoices`, `profileDownloads` |
| `selectionGroup` (선택 그룹 생성·삭제) | `POST/DELETE /api/selection-groups` | `/profiles/editor`, `/backup` | `selectionGroups`, `selectionGroupMembers` |
| `researchQueue` (대기함 저장·숨기기) | `POST/PATCH /api/research-queue` | `/register`, `/backup` | `researchQueue` |
| `modRelation` (관계 초안·승인) | `POST /api/mod-relations`, `POST /api/mod-relations/approve` | `/profiles/editor`, `/backup`, `/diagnostics/relations` | `modRelations` |

## 3. DB 참조 무결성 정책

- `mod_ids` 삭제 시: `profile_mod_choices`·`mod_relations`에서 사용 중이면 DB `ON DELETE RESTRICT` (`23503`)로 안전 차단(409 안내), `selection_group_members`는 `ON DELETE CASCADE`로 자동 정리.
- `categories` 삭제 시: `delete_category` RPC가 대표 카테고리 자동 승계 또는 미분류 전환을 단일 트랜잭션으로 처리.
- 모드 보관(`is_archived = true`) 시:
  - 기존 서버 프로필 조합은 자동 삭제하지 않으며, `/profiles/editor`에서 보관된 모드 포함 안내를 표시.
  - `/dashboard`의 미분류 수 계산과 `/mods`의 기본 목록에서는 보관된 모드를 제외하되, PC 스캔 비교(`PcModIdBackfillPanel`)는 보관된 모드도 이미 등록된 것으로 인식.

## 4. 앞으로 연동 기능을 추가할 때 필수 체크리스트 (5단계)

새 테이블·화면·API를 추가하거나 기존 데이터를 다른 화면에 연결할 때 아래 5가지를 반드시 지킵니다.

1. **도메인 등록 (`lib/data-sync.ts`)**
   - 새 엔티티라면 `SYNC_DOMAIN_PATHS`와 `SYNC_DOMAIN_BACKUP_TABLES`에 영향받는 모든 경로와 백업 테이블을 등록한다.
2. **쓰기 API 규약 (`app/api/**/route.ts`)**
   - `export const dynamic = "force-dynamic"` 선언
   - 모든 응답에 `PRIVATE_NO_STORE_HEADERS` 적용
   - DB 쓰기 성공 직후 `revalidateDomain(...)` 호출
   - 모든 조회·수정 쿼리에 `.eq("owner_id", access.user.id)` 명시
3. **화면·클라이언트 동기화 (`app/(private)/**`, `components/**`)**
   - 모든 private 페이지에 `export const dynamic = "force-dynamic"` 선언 (`next.config.ts`의 `staleTimes.dynamic = 0` 유지)
   - 클라이언트에서 쓰기 API 성공 후 `router.refresh()` 호출
   - 서버 props를 `useState(initial...)`로 복사하는 클라이언트 컴포넌트는 `key` 부여 또는 `useEffect`로 refreshed props와 동기화하며, 삭제된 참조 ID는 렌더/제출 전에 걸러낸다.
4. **공용 해석기 재사용**
   - 대표 카테고리·미분류 수·호환성 상태 등 여러 화면이 함께 보는 파생 값은 화면마다 따로 계산하지 않고 `lib/data-sync.ts` 등 공용 순수 함수를 호출한다.
5. **백업 & 자동 가드 통과**
   - 새 영구 테이블은 `app/api/data-export/route.ts`, `lib/backup-preview.ts`, 참조 무결성 검사에 함께 추가한다.
   - `npm run verify`와 `npm run build`를 실행해 `tests/data-sync-contract.test.ts` 가드를 모두 통과시킨다.
