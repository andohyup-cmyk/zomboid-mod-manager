# 로컬 mod.info 조사 자료와 서버 프로필 비교 — 2026-11-21

## 목적과 범위

PC에서 추출한 `zomboid-workshop-audit-*.json`을 모바일/PC의 서버 프로필 **임시 편집 화면**에서 참고 검사한다. 브라우저에서 파일을 읽고 비교하며 파일을 서버로 전송하거나 Supabase에 저장하지 않는다. 기존 카탈로그 검증, 사용자 승인, 설정 출력 규칙은 수정하지 않는다.

- 화면: `/profiles/editor` → 선택한 모드 → 서버 설정 출력 → **로컬 mod.info 참고 검사**
- 원본: `lib/local-workshop-inventory.ts`; UI: `components/ProfileServerOutput.tsx`
- 테스트: `tests/local-workshop-inventory.test.ts` (8개 사례)
- 파일 크기 500KB, 기록 개수 3,000개 상한; Workshop ID/Mod ID/상대 경로/require 배열 형식 검증
- Windows PowerShell 5.1의 UTF-8 BOM 허용
- 깨진 `displayName`은 Mod ID로 대체하거나 등록하지 않음

## 안전한 비교 규칙

1. Workshop ID와 Mod ID를 **쌍으로** 비교한다. 한 Workshop의 여러 Mod ID는 별개이며, 실제 활성 항목만 검사한다.
2. `42.22/mod.info`가 있으면 해당 버전을 우선 사용한다. 그렇지 않으면 42 계열 후보들을 참고하되, 버전별 `require=`가 다르면 **후보 전체에서 공통으로 선언된 관계만** 비교한다. `common`과 기본 파일만 있으면 B42용 메타데이터가 미확인이라고 표시한다.
3. `require=`에 있는 선행 역슬래시와 공백을 정규화한다. 활성 목록에 없는 요구 Mod ID와 요구 모드가 뒤에 배치된 경우를 **참고 경고**로 표시한다.
4. 해당 파일이 실제 B42.22에서 로딩되는지, 멀티플레이 호환 여부, 중간 추가 가능 여부는 이 검사로 확인할 수 없다.
5. `Map=` 폴더 이름은 Mod ID가 아니며 이 검사에서 누락 대상으로 취급하지 않는다.
6. VSGirlBody 체형과 ETO 성능 선택 옵션 등 **선택 그룹 후보**는 자동 상호 배타 규칙으로 활성화하거나 자동 수정하지 않는다.
7. 참고 결과는 기존 `Mods=`/`WorkshopItems=` 생성과 복사 차단·경고 확인 흐름을 변경하지 않는다. 실제 서버 설정 파일도 변경하지 않는다.

## 2026-11-21 실제 자료 검사

- 자료: 게임에서 추출한 `mod.info` 209개, 서버 활성 Mod ID 64개
- Workshop/Mod ID 정확한 쌍 64/64개 일치
- 로컬 메타데이터 기반 필수 의존성 누락 및 역순 경고 0개
- B42용 전용 하위 경로를 확정할 수 없는 5개: `tsarslib`, `AutoReload`, `AutoTailoring`, `UBPropFix`, `SurvivorBriefing`
- **위 5개는 설치 누락이나 비호환 확정이 아니다.** `common` 또는 기본 `mod.info`만 발견됐다는 참고 정보다.

## 검증 상태

- 독립된 로컬 비교 함수 8개 단위 사례를 Node.js 22의 TypeScript strip 실행으로 모두 통과.
- 실제 PC JSON과 `jjinmac-1` 보고서의 64개 활성 ID를 입력하여 64/64 매칭·5개 참고를 재현.
- Vercel 시험 Preview에서 `npm run build`가 내부적으로 `npm run verify`를 실행: **단위 테스트 163/163 통과, TypeScript·ESLint·Next.js 빌드 성공**. 검사한 앱 코드 커밋: `1857a29`. 시험 Preview URL: https://zomboid-mod-manager-paodzogqz-andohyup-cmyk.vercel.app
- 모바일 화면 크기 390×844의 Chromium + 로컬 Supabase 모의 서버에서 신규 `mod.info` 업로드/경고/설정 문자열 보존 검증 **1건 통과**. 승인 모의 환경에서는 의도적으로 1건 skip. Actions 기록: https://github.com/andohyup-cmyk/zomboid-mod-manager/actions/runs/44866198126
- 기존 전체 브라우저 테스트를 별도 실행했을 때 4개 중 2개 통과, 2개 실패. 실패 2개는 **조사함과 입력 필터의 예전 기대 조건**, **텍스트 입력란/제목 중복 선택자** 관련. 본 브랜치에서 수정 완료로 간주하지 않는다.
- 신규 Preview의 실제 Google OAuth 인증 세션 및 갤럭시 실기기 조작은 **아직 확인되지 않음**. 해당 검증 전까지 구현 완료와 운영 사용 가능을 동일시하지 않는다.
- 시험/운영 DB, Vercel Production, 실제 서버 원본 파일, 기존 모드 카탈로그는 변경하지 않았다.
