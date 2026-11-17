# 초기 아키텍처

상태: **코드 작성 / 실동작 검증 대기**.

1. 웹: Next.js App Router + Tailwind CSS, 모바일 하단 메뉴 / PC 사이드 메뉴
2. 인증: Supabase Google OAuth → /auth/callback에서 PKCE 세션 교환
3. 세션: @supabase/ssr 서버/브라우저 클라이언트와 Next.js proxy.ts에서 토큰 갱신
4. 접근 제어: 보호 페이지 및 쓰기 API에서 auth.getUser() + is_authorized_user() 확인
5. DB: Supabase Postgres RLS는 승인된 auth.uid()의 데이터만 허용
6. 데이터 승인: 사용자가 '추가하기' 누름 → /api/mods → 서버 입력 검증 → SQL 함수 approve_research_record → 단일 트랜잭션에서 mods/mod_ids/research_records 저장

클라이언트 UI의 버튼은 보안 경계가 아니다. 실제 인증과 권한 검사는 서버 및 RLS에서 수행한다.

## 페이지

- /login : Google 로그인
- /dashboard : 등록 현황
- /mods : 카탈로그 조회/검색
- /register : Workshop 링크, 조사 JSON 검토 및 개별 승인
- /profiles : 후속 서버 관리용 초기 읽기 화면

## 연동 상태

- A (ChatGPT 조사 결과 앱 직접 전달): 연결 방법 검증 전, 미구현. 공개 무인증 쓰기 API는 만들지 않음.
- B (구조화된 JSON 붙여넣기): 코드 작성, 실제 Supabase 연동 테스트 대기.
- C (앱 내부 AI 조사): 후속 확장, 별도 API 비용 검토.
- 서버 구성 문자열: 복수 Mod ID 옵션 및 로드 순서 정책 확정 전 미구현.
- 데이터 내보내기/복구: 별도 후속 개발 항목.

현재 Supabase 프로젝트/Google OAuth/배포 주소 설정이 없어 실로그인 및 DB 저장은 검증되지 않았다.
