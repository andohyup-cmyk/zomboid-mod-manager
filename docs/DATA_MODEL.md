# 초기 데이터 모델

초기 SQL: `supabase/migrations/202611180001_init.sql`

- **authorized_users**: 본인 Google 로그인 후 관리자에게 허용받은 Supabase Auth UUID. 일반 사용자에게 읽기/쓰기를 허용하지 않음.
- **mods**: 카탈로그 항목, owner_id, Workshop ID, 제목, 설명, 호환성 상태, 보관 여부. 소유자별 Workshop ID 중복 금지.
- **mod_ids**: 실제 게임 설정에 사용할 Mod ID. 한 Workshop 항목에 여러 Mod ID를 연결 가능.
- **research_records**: 사용자 승인 시 조사 원문 JSON 기록.
- **profiles**: 소유자별 서버 프로필 초안. 현재 조회만 지원.
- **profile_mods**: 서버별 모드 사용 여부 및 순서 모델 초안. 현재 조회만 지원.

RLS는 auth.uid() 소유권과 허용 사용자 여부를 함께 검사한다. 승인 RPC는 SECURITY INVOKER로 실행되어 사용자 권한을 넘어서지 않는다.

## 아직 정책 미확정

- workshop_items 별도 테이블로 정규화할 필요와 Workshop/모드의 관계
- 하나의 Workshop에 복수 Mod ID가 있을 때 동시 사용인지 선택 옵션인지 구분
- 의존·충돌·패치·로드 순서 관계
- 카테고리·태그·선택 그룹의 규칙
- 수정·보관·이력·백업
- 친구 공유와 역할

현재 테이블이 모든 최종 요구사항을 충족한다는 뜻은 아니다.
