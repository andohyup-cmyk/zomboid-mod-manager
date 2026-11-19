# Zomboid Mod Manager

Project Zomboid **Build 42.22**를 대상으로 하는 개인 모드 관리 웹앱입니다. 모바일과 PC에서 소유자 카탈로그를 조회하고 프로필의 설정 문자열을 검토할 수 있습니다.

현재 브랜치에는 등록, OAuth, 프로필 편집과 출력의 로컬 통합본이 있습니다. 실제 Preview 로그인, 관리형 DB 권한 및 게임 서버 호환성은 검증 대기입니다. [작업 현황](docs/TASKS.md)

## 기술 구성

Next.js 16 App Router, TypeScript, Tailwind CSS 4, Supabase Google Auth와 PostgreSQL(RLS), Vercel 배포 구성, GitHub 소스 관리.

## 작성한 기능

- Google 로그인/콜백/로그아웃과 허용된 사용자만 접근하는 보호 화면
- 모바일 하단 메뉴, PC 사이드 메뉴, 대시보드
- 모드 카탈로그 조회/이름 검색
- Workshop URL·숫자 ID 단독·복수·혼합 입력과 잘못된 항목 위치 표시
- 소유자용 읽기 전용 조사함과 수동 JSON 미리보기. 출처별 내용 확인 후 한 항목씩 승인
- 등록 UI와 API의 공통 배포 쓰기 정책
- 모바일 프로필 임시 편집과 추천 순서 미리보기, 활성 Mod ID를 반영한 서버 설정 출력
- Workshop ID와 게임 Mod ID 구분, RLS와 일괄 DB 저장 함수
- 검증 유틸리티 단위 테스트 소스

후속 기능에는 사용자별 영구 등록 대기함, 여러 대기 항목 최종 승인, 서버 프로필 생성·영구 저장, 카테고리·선택 그룹 관리, 친구 공유, 데이터 백업이 있습니다. 조사함은 저장소에 포함된 조사 결과를 조회합니다. 앱 내부 자동 AI 조사와 추가 유료 API는 도입 범위 밖입니다.

## Supabase 연결 시 필요한 설정

아래 절차는 새 Supabase 프로젝트의 최초 설정용입니다. 로컬 통합 검증에는 모의 데이터와 테스트를 사용합니다.

1. Supabase 프로젝트를 만들고, Google Auth 공급자 활성화 준비
2. Supabase SQL Editor에서 `supabase/migrations/202611180001_init.sql` 실행
3. Google Cloud OAuth 클라이언트 등록. 승인된 리디렉션 URI에 Supabase가 안내하는 `https://<PROJECT_REF>.supabase.co/auth/v1/callback` 등록. 클라이언트 ID와 비밀값은 Supabase에만 보관
4. Supabase Auth의 Site URL과 Redirect URLs에 실제 앱 주소, `https://<APP_DOMAIN>/auth/callback` 등록. 로컬 개발 시 `http://localhost:3000/auth/callback`도 등록
5. `.env.example`의 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 앱의 환경 변수에 설정. **service_role 키, Google OAuth 비밀값을 앱 소스나 ChatGPT 대화에 입력하지 말 것**
6. Google 로그인 후 '접근 제한' 화면에 표시되는 본인의 UUID를 확인하고 Supabase SQL Editor에서 다음 쿼리 실행

```sql
insert into public.authorized_users (user_id)
values ('YOUR_GOOGLE_LOGIN_USER_UUID')
on conflict do nothing;
```

초기 허용 목록은 일반 사용자가 직접 수정할 수 없으며, UUID를 등록하기 전에는 데이터 접근이 차단됩니다.

## 개발 명령어

Node.js 20.9 이상:

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

검증 대상과 결과는 [작업 현황](docs/TASKS.md)에 기록합니다.

## 모드 조사 결과 입력 형식

모드 등록 화면은 Workshop URL·숫자 ID와 아래 형태의 JSON 목록을 받습니다. Workshop 입력은 ID를 인식하고, JSON 입력은 승인 후보를 만듭니다. 카탈로그 저장은 쓰기가 허용된 환경에서 한 항목의 최종 승인을 선택할 때 실행됩니다.

```json
[
  {
    "workshopId": "1234567890",
    "title": "예시용 제목",
    "modIds": ["ExampleModA", "ExampleModB"],
    "description": "실제 조사한 설명으로 교체",
    "checkedAt": null,
    "verificationStatus": "unverified",
    "buildCompatibility": "unverified",
    "multiplayerCompatibility": "unverified",
    "sources": []
  }
]
```

위 예시는 형식 설명용이며 실제 모드 정보가 아닙니다. B42.22와 멀티 호환성은 각각 확인 여부를 기록합니다.

## 문서

- `좀보이드_모드관리앱_프로젝트_설계.md`: 사용자 확정 사항
- `좀보이드_모드관리앱_프로젝트_지침.md`: 개발·보안 원칙
- `docs/ARCHITECTURE.md`: 앱 구조와 보안 경계
- `docs/DATA_MODEL.md`: 초기 스키마와 미결정 사항
- `docs/TASKS.md`: 작업 현황

## 실제 로그인 연결 안내

[Supabase + Google OAuth 단계별 설정](docs/SETUP_GOOGLE_SUPABASE.md)을 참고합니다. 이 통합본의 실제 Preview 로그인 결과는 미확인입니다.
