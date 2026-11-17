# 작업 현황

[x]는 **코드 작성 및 GitHub 저장**을 의미하며 실행 테스트 완료가 아님.

## 초기 코드

- [x] Next.js/TypeScript/Tailwind 프로젝트 파일
- [x] 모바일 및 데스크톱 기본 화면·탐색
- [x] Google 로그인/콜백/로그아웃 구현 코드
- [x] 접근 허용 UUID + RLS SQL
- [x] 모드 카탈로그 목록/이름 검색
- [x] Workshop 링크 여러 개 분석
- [x] AI 조사 JSON 검증/미리보기/개별 승인 저장 코드
- [x] Workshop ID / Mod ID 분리
- [x] 데이터 유효성 검사 단위 테스트 소스
- [x] 최초 SQL 마이그레이션과 개발 문서

## 검증 및 연동 대기

- [ ] npm install, typecheck, lint, unit test, build 실제 실행
- [x] Supabase 프로젝트 생성 및 초기 SQL 실행 성공(사용자 제공 Supabase 화면에서 `Success. No rows returned` 확인, 앱 연동·RLS 동작 검증은 별도)
- [ ] Google OAuth 실로그인 확인
- [ ] 본인 UUID 허용 및 타 계정 차단 확인
- [ ] 모바일/PC 화면 확인
- [ ] DB 등록·중복·RLS·트랜잭션 롤백 테스트
- [ ] Vercel 연결 및 승인된 배포

## 후속 기능

- [ ] ChatGPT 조사 결과 앱 직접 전달(A) 방식 구현
- [ ] 모드 상세·수정·보관, 카테고리·태그
- [ ] 선택 그룹 규칙 확정 및 구현
- [ ] 서버 프로필 생성/편집·활성 모드와 로드 순서
- [ ] Mods= / WorkshopItems= 출력·검증
- [ ] 데이터 백업/내보내기/복원
- [ ] 친구 공유(후속)
- [ ] 앱 내부 AI 조사(C, 후속)

## 원칙

사용자의 승인 없이 외부 계정 변경·결제·공개 배포 또는 실제 서버 설정 변경을 하지 않는다. 테스트하지 않은 부분은 미검증으로 보고한다.

## Google OAuth/Supabase 연동 준비 보완

- [x] Supabase 공식 Next.js 16 SSR 가이드와 인증 코드 비교
- [x] Supabase SSR 의존성 버전 갱신, Proxy의 세션 갱신 캐시 헤더 전달 처리
- [x] OAuth 콜백/로그아웃의 no-store 응답 설정
- [x] 모바일용 설정 순서 문서 작성
- [ ] Google OAuth 클라이언트 생성, Supabase Provider 등록, 앱 Redirect URLs 및 실로그인 검증
- [ ] Vercel 연결 및 실제 DB 인증·저장 동작 검증(서비스 연결 필요)
- [ ] npm 의존성 설치·실빌드 테스트(현재 실행 환경 npm 외부 연결 불가)

## 2026-11-18 실제 진행 현황

- 사용자 화면으로 확인: Supabase 조직 및 `Zomboid Mod Manager` 프로젝트 생성(Healthy), SQL Editor에서 재실행용 `202611180002_resume_initial_setup.sql` 성공 응답 확인.
- **미검증:** 개별 테이블/권한 실제 상태, RLS 접근 제어, 앱 API 정상 작동. SQL Editor 실행 성공만 확인했으므로 후속 검증 필요.
- 현재 이 대화의 이용 가능한 연결 도구 목록에서 Supabase 쿼리 실행 기능은 제공되지 않음. 계정 연동이 곧바로 도구 접근을 보장하지는 않음.
- 다음 사용자 작업: Google Cloud 프로젝트 및 Google OAuth Web client 생성. OAuth 클라이언트 비밀값은 Supabase 설정 화면에만 입력.
