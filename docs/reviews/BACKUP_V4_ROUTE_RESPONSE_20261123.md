# JSON v4 실제 라우트(모의 인증·DB 전송) 응답 테스트 — 2026-11-23

## 대상과 경계
- `tests/backup-v4-route-http.test.ts`: **실제 `app/api/data-export/route.ts`의 TypeScript GET 본문을 읽어** import만 모의 `getOwnerAccess`/Supabase 데이터 전송으로 치환한 후 HTTP `Response`를 검증한다.
- 검사: 접근 불허 403, 소유자별 13개 영역/2개 카테고리와 UI 대표가 포함된 v4 응답, 헤더 no-store/첨부파일/nosniff, 클라이언트 `inspectBackupSnapshot` 재검사, 소유자 격리, 미분류 허용, 고아 대표·중복 소속·잘못된 소유자 차단, 큐 읽기 실패 시 불완전 백업 경고, 필수 테이블 오류 503, 251건 페이지네이션과 10,000건 한도, 8MB 초과 413, 부모 없는 경우 자식 조회 생략.
- 기존 API·DB·OAuth·RLS·타 AI의 화면/카테고리 저장 구현 파일은 수정하지 않는다.

## 검증 한계
- 이것은 **실제 라우트 로직의 독립 실행·HTTP Response 자동 테스트**이지, 사용자 Google OAuth 세션과 Vercel 실제 네트워크로 `GET /api/data-export`를 호출한 브라우저 E2E는 아니다.
- 카테고리 실제 DB/RLS 테스트는 부모 PR #40 SQL 롤백 테스트가 별도로 검증했다. 실제 백업 파일을 복원하거나 데이터베이스 스냅샷 시점을 일치시키는 시험은 수행하지 않는다.
- 실사용 백업 파일을 내려받아 검증하려면 인증된 브라우저 접근 또는 사용자의 선택적 파일 제공이 필요하다. **보호된 배포의 임시 공개 공유 링크 생성이나 운영/시험 DB 쓰기 허용은 이 범위에서 제외**한다.
