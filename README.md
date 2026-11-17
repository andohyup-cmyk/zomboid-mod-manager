# Zomboid Mod Manager

Project Zomboid **Build 42.22**용 개인 모드 관리 웹앱의 초기 코드입니다. 모바일과 PC에서 같은 데이터베이스를 사용하도록 설계합니다.

**현재 상태: GitHub에 코드 작성 완료, 실제 계정 연결·실행·배포 검증 전.** 아직 접속 가능한 서비스는 아닙니다.

## 기술 구성

Next.js 16 App Router, TypeScript, Tailwind CSS 4, Supabase Google Auth + PostgreSQL(RLS), GitHub. Vercel에 배포할 계획이며 아직 배포하지 않았습니다.

## 작성한 기능

- Google 로그인/콜백/로그아웃과 허용된 사용자만 접근하는 보호 화면
- 모바일 하단 메뉴, PC 사이드 메뉴, 대시보드
- 모드 카탈로그 조회/이름 검색
- Workshop 링크 여러 개 입력·ID 추출
- 구조화된 AI 조사 JSON 미리보기·모드별 승인 저장(B 예비 방식)
- Workshop ID와 게임 Mod ID 구분, RLS와 일괄 DB 저장 함수
- 검증 유틸리티 단위 테스트 소스

**아직 미구현:** ChatGPT에서 앱으로 직접 전송하는 A 방식, 앱 안 AI 자동 조사(C 방식), 서버 프로필 생성/편집, Mods= 및 WorkshopItems= 출력, 그룹/카테고리, 친구 공유, 데이터 백업. 프로필 화면은 초기 틀만 있습니다.

## Supabase 연결 시 필요한 설정

이 단계는 사용자가 서비스 연결을 승인하고 프로젝트를 생성한 다음 실행합니다. 아래 절차는 아직 실행하지 않았습니다.

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

패키지를 실제 설치해 테스트한 상태는 아닙니다. 잠금 파일은 아직 생성되지 않았습니다.

## 모드 조사 결과 입력 형식

모드 등록 화면에서는 Workshop 링크와 아래 형태의 JSON 목록을 받습니다. 링크만 붙여넣는다고 자동으로 조사되거나 등록되지 않습니다. 사용자 개별 승인 후 저장합니다.

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
