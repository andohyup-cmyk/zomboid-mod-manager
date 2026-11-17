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
- [ ] Supabase 프로젝트 생성 및 SQL 마이그레이션 실행
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
- [ ] Supabase/Vercel/Google OAuth 실계정 연결과 로그인·DB 동작 검증(서비스 연결 필요)
- [ ] npm 의존성 설치·실빌드 테스트(현재 실행 환경 npm 외부 연결 불가)
