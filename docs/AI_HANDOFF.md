# AI 작업 인수인계 — 현재 상태 요약

> 확인 시점: 2026-11-22 (GitHub 조회 기준). 이 문서는 **실시간 상태가 아니다**. 작업 전 최신 브랜치·PR·배포·테스트 결과를 다시 확인한다. 상세 이력은 `docs/TASKS.md`와 각 PR을 참조한다.

## 저장소 및 기준
- 저장소: `andohyup-cmyk/zomboid-mod-manager` (비공개).
- `main`: `25568c28c84bcf6fe6d55b22b8cfa1e52f90becd` — 초기 기준이며 최신 기능 통합본이 아님.
- 조사 당시 최신 기능 체인 끝: `feature/backup-v4-categories-20261122`, `77b53240e937876a04a7019304c3460521a47bca` — **Draft PR #33**. 이 브랜치 및 선행 PR들이 `main`에 병합된 것은 아님.
- 문서 작업 브랜치: `docs/ai-collaboration-handoff-20261122` (위 #33의 head를 기준으로 분기). 여기의 문서 변경은 다른 기존 브랜치에 자동 적용되지 않음.

## 현재 핵심 작업
| 항목 | 상태 및 근거 |
| --- | --- |
| [PR #33](https://github.com/andohyup-cmyk/zomboid-mod-manager/pull/33) | 백업 JSON v4에 다중/대표 카테고리 및 검증 추가. **Draft**. 격리 TypeScript/단언 검사는 기록됐으나 기존 검사기 일부를 스텁 처리했음. 전체 `npm run verify`, 실제 저장소 통합 테스트, Next 빌드, Preview **미확인**. |
| [PR #32](https://github.com/andohyup-cmyk/zomboid-mod-manager/pull/32) | 시험 DB 다중 카테고리·대표 카테고리와 본인 RLS. 관련 시험 DB 검증 및 336개 자동 테스트 통과 기록. **Draft / 운영 미반영**. |
| [PR #31](https://github.com/andohyup-cmyk/zomboid-mod-manager/pull/31) | JSON v3 백업 내부 참조 무결성 검사. 332개 자동 테스트·빌드·Preview READY 기록. **Draft**. |
| [PR #30](https://github.com/andohyup-cmyk/zomboid-mod-manager/pull/30) | 모바일 관계 E2E 시험 도구. `docs/TASKS.md`에 실제 모바일 관계 승인·백업 확인, 승인받은 가상 fixture 정리 성공 기록. **Draft**. |

- 위 PR들은 서로 선행 기능 브랜치를 `base`로 삼는 **누적 작업 체인**이다. 단일 PR의 상태만으로 전체 준비 완료라고 판단하지 않는다.
- 작업 담당 AI별 현재 파일 점유/진행 여부는 저장소 기록만으로 확정할 수 없다. 동시에 변경하기 전 작업 범위를 대조한다.

## 유지할 결정 및 제약
- 앱: B42.22 중심, 모바일 우선 PWA, Next.js/TypeScript/Tailwind, Supabase Google OAuth + RLS, GitHub/Vercel.
- 모드 정보 승인 전 자동 카탈로그 등록 금지. Workshop ID와 게임 Mod ID 구분. 호환성 미확인은 미확인으로 유지.
- 사용자가 별도로 승인하지 않은 `main` 병합, 운영 DB/배포, 삭제, 실제 서버 설정 변경, 유료 AI API 사용 금지.
- `main`의 오래된 문서에 기재된 미완료 항목이 최신 기능 브랜치에서도 그대로 미완료라고 추정하지 않는다.

## 다음 진행
1. 이번 문서 전용 Draft PR의 변경 범위(`AGENTS.md`, 이 파일)와 규칙 중복·충돌 검토. **병합하지 않음**.
2. PR #33의 전체 검증 및 Preview 상태를 별도 확인한 후 그 결과를 원래 기능 PR에 기록. 현재 완료로 표시하지 않음.
3. 규칙 적용을 승인하면 각 작업 AI의 **실제 체크아웃 브랜치에 해당 규칙이 포함되는지** 확인. 단순히 GitHub에 한 브랜치로 파일이 존재하는 것만으로 적용되지 않는다.
4. GPT 프로젝트의 앱 내부 지침은 GitHub 파일로 자동 변경되지 않으므로, 사용자 프로젝트 지침에는 간결한 협업 규칙을 별도로 추가한다.

## 갱신 방법
- 이 문서는 현재 브랜치, 미완료 검증, 다음 작업과 승인 경계만 유지한다. 길어지면 상세 이력을 `docs/TASKS.md`·PR에 남긴다.
- 내용을 변경할 담당자가 지정된 경우에만 갱신하고, 갱신 날짜·기준 커밋·실제 확인 범위를 함께 바꾼다. 미확인 상태를 임의로 '완료' 처리하지 않는다.
