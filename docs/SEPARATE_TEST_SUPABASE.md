# Supabase 운영/시험 프로젝트 분리 — 모바일 작업 지침

> 상태: 2026-11-18, 무료 생성 가능 여부는 공식 요금제에서 확인했으나 **사용자 계정의 실제 무료 프로젝트 잔여 수는 미확인**. 아직 새 프로젝트를 생성하거나 기존 운영 환경 변수를 수정하지 않았다. 이 문서는 사용자 합의된 모바일 우선·추가 과금 없음·기존 운영 데이터 보호 원칙을 따른다.

## 0. 확정된 현재 상태

- 운영 Supabase 프로젝트 `Zomboid Mod Manager`는 이미 생성되어 실제 로그인·모드 승인 저장 시험에 사용됨.
- Vercel의 `NEXT_PUBLIC_SUPABASE_URL` 및 `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 사용자 화면 기준 **Production + Preview 동시 적용** 상태. 따라서 분리 전에는 두 배포가 운영 Supabase에 연결될 위험이 있다.
- 시험 브랜치 `feature/chatgpt-research-inbox-poc`의 Preview 등록 페이지/POST API는 `VERCEL_ENV !== "production"`이면 등록 쓰기 차단. 이는 브라우저/앱 API 수준의 보호이지 DB 격리 자체가 아니다.
- PR #2는 draft이며 main에 병합하지 않았다.
- 무료 프로젝트 최대 2개 활성 (계정/조직 소유·관리자 제한). 실제 잔여 수는 대시보드에서 확인해야 한다.

## 1. 시험 Supabase 프로젝트 신규 생성 (모바일)

1. https://supabase.com/dashboard 로 이동해 **기존 운영 프로젝트가 아닌 조직/프로젝트 목록**으로 돌아간다.
2. 현재 조직의 플랜이 Free인지 확인하고 `New project`(새 프로젝트)를 선택한다. 다른 무료 프로젝트가 이미 활성화되어 한도를 초과하면 **유료 플랜으로 바꾸지 않는다**.
3. 이름 권장: `Zomboid Mod Manager Test`. 운영 프로젝트와 명확히 구분. 조직/리전은 기존과 같은 지역이 선택 가능하면 유지하되, 실제 표시되는 리전은 사용자가 확인한다.
4. 별도 DB 비밀번호를 생성하고 안전한 개인 비밀 저장소에 보관한다. **채팅·스크린샷·GitHub에 비밀번호를 보내거나 저장하지 않는다.**
5. Free/$0임을 최종 확인한 뒤 생성. 유료 플랜 결제 화면이 나오면 진행하지 않는다.
6. 프로젝트가 Healthy가 되면 Project URL 및 공개키(publishable/anon)를 새 프로젝트 대시보드에서 확인한다. **service_role/secret 키는 복사하거나 공유하지 않는다.**

## 2. 시험 DB 초기화 — 새 프로젝트에만

- 새 프로젝트의 SQL Editor에서 검토된 `supabase/migrations/202611180002_resume_initial_setup.sql`을 적용. 이 SQL은 초기 생성용이며 **기존 운영 DB에서는 다시 실행하지 않는다**.
- 운영 DB 레코드를 시험 DB로 자동 복사하지 않는다. 우선 빈 데이터로 시작하고 테스트 전용 자료만 사용한다.
- `authorized_users`는 프로젝트별 Supabase Auth UUID를 사용하므로 **기존 운영 UUID를 복사하지 않는다**. 시험 프로젝트로 Google 로그인 후 나오는 새 UUID를 해당 프로젝트의 SQL Editor에서 명시적으로 허용한다.
- SQL 성공 메시지는 RLS 동작 검증과 다르다. 익명/비허용/허용 계정 테스트는 데이터가 격리된 후 진행.

## 3. 시험 Google OAuth — 기존 운영 클라이언트 보호

- 시험 Supabase 프로젝트의 `Authentication → Sign in / Providers → Google`에서 시험 프로젝트에 맞게 Provider를 설정.
- 권장: 기존 운영용 Google OAuth 웹 클라이언트를 바꾸지 않고 **별도 시험용 Web application OAuth Client**를 생성. 이때 Google Cloud에 입력하는 Authorized redirect URI는 **시험 Supabase 프로젝트가 표시하는 `https://<NEW_PROJECT_REF>.supabase.co/auth/v1/callback`**.
- 시험 Supabase의 `Authentication → URL Configuration`: Site URL은 시험 Preview 앱 주소, Redirect URLs에 시험 Preview 앱의 `/auth/callback` 주소만 정확하게 허용.
- 시험 Preview 고정 호스트: `https://zomboid-mod-manager-git-feature-chatgpt-re-8935cb-andohyup-cmyk.vercel.app`.
- 별도 Google OAuth Client 생성 시 시험 Client ID/Secret은 **시험 Supabase 설정 화면에만** 입력. 기존 운영 OAuth Client/Secret은 손대지 않는다.
- Google OAuth 화면이 Testing이면 시험 계정의 Test users 등록 여부를 확인한다.

## 4. Vercel 환경 변수 안전하게 분리 (시험 프로젝트 준비 뒤 시행)

현재 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 **Production + Preview** 공통 범위다. 운영 설정을 보호하려면 다음 최종 상태가 필요하다.

| 환경 | NEXT_PUBLIC_SUPABASE_URL | NEXT_PUBLIC_SUPABASE_ANON_KEY |
|---|---|---|
| Production | 기존 운영 Supabase URL | 기존 운영 프로젝트 공개키 |
| Preview | 신규 시험 Supabase URL | 신규 시험 프로젝트 공개키 |

- 기존 값을 지우거나 Test 값으로 덮어쓰지 않는다. 기존 운영 URL/키를 Vercel에서 읽을 수 없는 경우, 운영 Supabase Dashboard에서 원래 공개 설정값을 직접 확인한다.
- Vercel Project → Settings → Environment Variables에서 **각 키를 Production 전용과 Preview 전용으로 분리**한다. 중복된 적용 범위/충돌이 없는지 UI로 확인하고, 기존 Production 값이 그대로인지 점검한다.
- 최신 Vercel UI의 Secret/Config 유형이 달라도 실제 테스트 프로젝트 URL과 publishable/anon 공개키를 올바른 환경에만 연결한다.
- 환경 변수 변경은 **기존 배포에 소급 적용되지 않는다**. 별도의 새로운 Preview 배포를 만들고(재배포) 새 Preview가 신규 시험 DB를 보는지 확인한다.
- 변경 과정 중 구 Preview는 운영 DB를 바라볼 수 있으므로, 검증 전까지 시험 모드 승인 저장은 하지 않는다.
- 시험 Preview 쓰기 차단 코드는 DB 격리가 입증된 뒤에만 **사용자 승인 하에** 제거 또는 별도 시험용 플래그로 조정한다. `VERCEL_ENV` 자체가 production인지 비교해 실수로 운영 저장을 허용하지 않도록 주의한다.

## 5. 안전 검증 체크리스트

- [ ] 운영 앱 Google 로그인·기존 모드 목록 그대로 유지
- [ ] 시험 앱 Google 로그인 후 Preview URL 유지
- [ ] 운영/시험 Supabase Project URL 서로 다름
- [ ] 시험 앱은 시험 프로젝트의 빈 카탈로그를 조회(운영 모드가 노출되지 않음)
- [ ] 시험 앱 저장은 아직 차단 상태 확인
- [ ] 운영/시험 양쪽 auth UUID를 독립적으로 승인, 서로의 DB에 접근할 수 없도록 RLS 확인
- [ ] 실제 DB 분리 검증 후 시험 프로젝트의 승인/중복/삭제 테스트 진행
- [ ] 기존 운영 DB의 데이터를 삭제·수정하지 않음

## 비용 및 주의

- Supabase Free: 활성 무료 프로젝트 최대 2개. 남은 슬롯은 계정에 따라 달라질 수 있으며 조직의 Admin/Owner 구성에 따라 제한될 수 있음.
- Free 프로젝트는 활동 부족 시 자동 일시중지될 수 있고, 자동 DB 백업이 없음.
- Vercel 무료 Preview 기능과 Supabase 프로젝트 무료 요금제는 별개. 유료 플랜 업그레이드나 추가 과금을 승인 없이 진행하지 않음.
- 현재 문서화는 수행했으나 계정 설정·시험 DB 생성·Google OAuth 설정·Vercel 변수 변경은 **아직 하지 않았다**.

## 공식 근거

- https://supabase.com/docs/guides/platform/billing-faq
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/auth/redirect-urls
- https://vercel.com/docs/environment-variables/managing-environment-variables
