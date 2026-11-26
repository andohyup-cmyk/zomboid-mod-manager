# Test DB 자동 적용 SQL 폴더 (`smofdbjgcgdmscamknpw` 전용)

- 이 폴더에 추가/수정되어 `develop` 브랜치로 병합되는 `*.sql` 파일은 `.github/workflows/apply-test-db-sql.yml`에 의해 **시험 DB(`smofdbjgcgdmscamknpw`)**에만 원자적(`--single-transaction`, `ON_ERROR_STOP=1`)으로 적용됩니다.
- 보안 가드:
  1. `develop` 브랜치에서만 실행 (`main` 절대 미실행).
  2. GitHub Secret `SUPABASE_TEST_DB_URL`에 `smofdbjgcgdmscamknpw`가 포함되지 않으면 즉시 차단.
  3. 운영 DB 연결 정보는 절대 등록하지 않습니다.
- 모든 SQL 파일은 재실행해도 안전하도록 멱등(`if not exists`, `create or replace`, `where workshop_id=...`)하게 작성합니다.
