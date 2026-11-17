# ChatGPT → GitHub → 앱 조사 결과 전달 시험

## 목적 및 범위

추가 유료 AI API 없이 ChatGPT 대화에서 조사한 **Steam Workshop 공개 정보**를 앱으로 전달할 수 있는지 검증한다. 사용자가 JSON을 복사·붙여넣지 않도록 하는 **전송 경로의 시험 버전**이다.

- ChatGPT 대화에서 Workshop 링크/ID 조사
- 연결된 GitHub 앱의 쓰기 기능으로 **비공개 저장소**의 `lib/ai-research-inbox.ts`에 검증 가능한 조사 레코드 추가
- GitHub 변경 사항을 포함한 Vercel 새 배포(저장소 연동 및 자동 배포가 활성화된 경우)
- 로그인된 앱의 `/register` 화면에서 **ChatGPT 조사 결과 새로고침** 버튼
- `GET /api/ai-research-inbox`에서 인증·허용 사용자 확인 후 데이터 정규화 및 카탈로그 중복 확인
- 미리보기 검토 → 사용자가 명시적으로 승인했을 때만 기존 `POST /api/mods`로 Supabase 저장

이 경로는 GitHub 저장소에 소스 파일을 커밋하는 방식이다. GitHub 쓰기가 항상 허용된다는 보장은 없고, 자동 배포가 꺼진 경우 앱에 새 레코드가 나타나지 않는다.

## 아직 지원하지 않는 것

- 앱의 **'입력한 모드 확인' 버튼이 ChatGPT 조사를 직접 시작**하는 기능. ChatGPT Plus를 외부 앱에서 자유롭게 호출하는 무료 API로 사용할 수 없다.
- 사용자별 영구 대기 목록 DB, 개별/일괄 선택·삭제, 자동 조사 재시도, 복수 Mod ID 선택 관계.
- 조사 레코드를 수신 즉시 DB에 자동 등록하는 기능(의도적으로 금지).
- Vercel 실제 배포 및 모바일 로그인 실측 검증 전에는 정상 작동했다고 단정하지 않는다.

## 시험 레코드

Workshop `3552615247`, `[B42] Quality of Life and Miscellaneous Tweaks`의 Steam 설명에 게시된 Mod ID 5개를 포함한다. 샌드박스 프리셋은 단순 Mod ID 활성화만으로 사용할 수 없음을 기록했다. Build 42.22와 멀티플레이 호환은 **미확인**이다.

출처: https://steamcommunity.com/sharedfiles/filedetails/?id=3552615247

## 보안

- 앱 API는 `getOwnerAccess`로 Google 로그인/허용 사용자 확인. 익명 조회 금지
- 카탈로그에 이미 저장된 Workshop ID는 조회 결과에서 제외
- 출처, Workshop ID, 문자열 길이/배열 크기를 기존 `normalizeResearchRecord`로 검사
- 응답 `Cache-Control: private, no-store`
- GitHub 파일에 토큰, 개인정보, 사용자 대화 또는 유료 API 키 보관 금지
- 저장은 기존 Supabase RLS·소유권 확인·사용자 승인 경계를 재사용

## 모바일에서 다음에 확인할 순서

1. 시험 브랜치의 코드 변경을 검토하고 연결된 Vercel **미리보기 배포**가 생성됐는지 확인
2. 시험 배포의 `/register`에서 기존 Google 로그인 사용
3. `ChatGPT 조사 결과 새로고침` → Workshop `3552615247` 조사 결과/5개 Mod ID/미확인 호환 표시 확인
4. 기존 카탈로그에 이미 같은 Workshop ID가 있으면 목록에 표시되지 않는지 확인
5. 승인 버튼을 누르기 전까지 카탈로그가 바뀌지 않는지 확인
6. 검증 후 프로덕션 반영 여부 결정

*코드 작성은 실행·배포·사용자 모바일 검증 완료와 다른 단계다.*
