# Google 로그인 + Supabase 실제 연동 순서

**상태 (2026-11-18):** Supabase 전용 프로젝트가 생성되었고 SQL Editor에서 재실행용 초기 SQL의 `Success. No rows returned` 결과가 확인되었다. Google OAuth / Vercel / 실제 앱 로그인은 미설정이며 DB 권한의 실접근 테스트는 남았다.

## 원칙

- 본인 Google 계정 로그인만 초기 앱 사용 대상으로 허용한다. Google 계정 인증만으로 앱 데이터에 접근할 수 없다.
- 앱의 공개 Supabase 키(anon/publishable)와 사용자 비밀 키를 구분한다. **service_role/secret, Google OAuth Client Secret은 채팅·GitHub 저장소·브라우저 코드에 게시하지 않는다.**
- 가입, 유료 요금제, 데이터 삭제, 권한 변경, 외부 배포는 별도 승인 없이 수행하지 않는다.

## 순서

1. Supabase 전용 프로젝트 준비: https://supabase.com/dashboard
2. **완료(화면 확인):** 신규 Supabase 프로젝트 SQL Editor에서 `supabase/migrations/202611180002_resume_initial_setup.sql` 실행 성공. 이전 001 SQL은 이미 존재하는 정책으로 중복 오류가 발생했기에 재실행용 002 SQL을 사용했다. DB 정책의 실제 접근 테스트는 별도 수행한다.
3. **다음 단계:** Google Cloud Console에서 별도 Google Cloud 프로젝트를 선택하거나 생성한 뒤, Google Auth Platform의 Branding / Audience 설정을 마친다. 개인용 Google 계정이면 External + Testing 및 본인 Test user 추가로 시작할 수 있다. 필요한 스코프는 `openid`, `userinfo.email`, `userinfo.profile` 범위로 한정한다. Web application OAuth Client ID를 생성한다. **Authorized redirect URIs**에 Supabase Dashboard가 표시하는 callback URL을 입력한다. 일반적인 형식은 `https://<PROJECT_REF>.supabase.co/auth/v1/callback`이며 반드시 실제 프로젝트 URL을 따른다.
4. Supabase Authentication → Sign In / Providers → Google에서 Google Client ID/Secret을 **Supabase 설정 화면에만** 입력해 활성화한다. Google 동의 화면이 Testing이면 본인 Google 계정을 Test users에 포함한다.
5. 배포 URL을 확보한 후 Supabase Authentication → URL Configuration의 Site URL과 Redirect URLs에 `https://<APP_DOMAIN>/auth/callback`을 등록한다. 로컬 개발은 `http://localhost:3000/auth/callback`을 허용한다. Google Cloud에 등록하는 **Supabase callback URL**과 이 **앱 callback URL**은 다르다.
6. Vercel에 GitHub 저장소를 연결할 때 환경 변수 `NEXT_PUBLIC_SUPABASE_URL` 및 `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 추가한다. Supabase 프로젝트 URL과 공개 키를 사용하고, 비밀 키는 절대로 입력하지 않는다.
7. Google 첫 로그인 직후 접근 제한 화면에 나타나는 사용자 UUID를 보고 Supabase SQL Editor에서 아래 명령을 본인 UUID로 바꿔 실행한다.

```sql
insert into public.authorized_users (user_id)
values ('YOUR_AUTH_USER_UUID')
on conflict do nothing;
```

8. 로그인·로그아웃, 본인 접근, 다른 계정 차단, 개별 승인 저장, 중복 처리, RLS 및 모바일 화면을 검증한다.

## 아직 실행하지 않은 항목

Google Cloud OAuth 등록, Supabase Provider 활성화, 본인 UUID 허용 목록 등록, Vercel 배포, 실제 브라우저 로그인 및 DB 통합 테스트는 모두 미완료다. SQL 실행 성공과 DB 보안 정책의 동작 검증은 구별한다.

## 공식 출처

- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/redirect-urls
- https://nextjs.org/docs/app/getting-started/proxy
