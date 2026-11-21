# 시험 DB 모드 관계 신규 테이블 적용 기록 (2026-11-21)

대상 **시험 Supabase**: `smofdbjgcgdmscamknpw`. 운영 DB에는 적용하지 않는다.

## 적용 전 확인 및 복구 기준

- 기존 `public.mods`, `public.mod_ids`, `public.research_records`의 **행 수는 모두 0** (2026-11-21 실조회). 따라서 관계 테이블의 기존 사용자 데이터는 존재하지 않는다.
- 기존 테이블의 스키마, FK 및 정책을 읽기 전용으로 점검했다. 기존 테이블을 ALTER/DELETE/UPDATE 하지 않는다.
- 연결된 Supabase 도구에 **DB 전체 백업 생성 기능은 제공되지 않음**. 아래 SQL 자체와 변경 전 테이블·정책 목록을 GitHub에 기록하는 것은 **스키마 변경 이력**이지 전체 DB 백업이라고 주장하지 않는다.
- 새 테이블은 비어 있고 기존 테이블에는 손대지 않으므로 복구 범위는 이 신규 테이블에 한정된다. 실제 삭제/롤백은 별도 승인 전에는 하지 않는다.
- 기존 연구 대기함 `research_queue`의 pending 1건은 건드리지 않는다.

## 변경 계획 및 적용 SQL

```sql
-- TEST SUPABASE ONLY: smofdbjgcgdmscamknpw
-- New table only. Existing mods/mod_ids/research_records remain untouched.
-- No client write permissions: a reviewed write API/RPC is NOT approved yet.
create table public.mod_relations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  kind text not null check (kind in ('requires','incompatibleMods','loadBefore','loadAfter')),
  subject_mod_id_entry_id uuid not null references public.mod_ids(id),
  target_mod_id_entry_id uuid not null references public.mod_ids(id),
  research_record_id uuid not null references public.research_records(id),
  evidence_url text not null check (char_length(evidence_url) between 8 and 2000),
  checked_at date not null,
  approved boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mod_relations_distinct_endpoints check (subject_mod_id_entry_id <> target_mod_id_entry_id),
  constraint mod_relations_approval_timestamp check ((not approved and approved_at is null) or (approved and approved_at is not null)),
  constraint mod_relations_unique_pair unique (owner_id, kind, subject_mod_id_entry_id, target_mod_id_entry_id)
);
create index mod_relations_owner_subject_idx on public.mod_relations (owner_id, subject_mod_id_entry_id);
create index mod_relations_owner_target_idx on public.mod_relations (owner_id, target_mod_id_entry_id);
create index mod_relations_research_idx on public.mod_relations (research_record_id);
alter table public.mod_relations enable row level security;
revoke all on table public.mod_relations from public, anon, authenticated;
grant select on table public.mod_relations to authenticated;
create policy "authorized owner can read reviewed mod relations"
on public.mod_relations for select to authenticated
using (
  owner_id = (select auth.uid())
  and (select public.is_authorized_user())
  and exists (
    select 1 from public.mod_ids s
    join public.mods sm on sm.id = s.mod_id
    where s.id = subject_mod_id_entry_id and sm.owner_id = (select auth.uid())
  )
  and exists (
    select 1 from public.mod_ids t
    join public.mods tm on tm.id = t.mod_id
    where t.id = target_mod_id_entry_id and tm.owner_id = (select auth.uid())
  )
  and exists (
    select 1 from public.research_records rr
    join public.mods rm on rm.id = rr.mod_id
    join public.mod_ids s2 on s2.mod_id = rm.id
    where rr.id = research_record_id
      and s2.id = subject_mod_id_entry_id
      and rm.owner_id = (select auth.uid())
  )
);
```

## 권한 모델

- `anon`: 권한 없음.
- `authenticated`: **SELECT만**. `INSERT/UPDATE/DELETE` 없음. 현재 관계 입력/승인 API가 없으므로 승인 상태를 임의 조작할 경로를 열지 않는다.
- RLS: `auth.uid()`, `is_authorized_user()`, 양쪽 `mod_ids`의 소유자, 출처 `research_records`가 관계 주체의 Workshop 모드에 속하는지 모두 확인.
- `approved`는 기본 `false`; 승인 시각이 없는 approved=true 레코드는 체크 제약으로 거부.
- 근거 URL의 **실제 승인된 조사 기록과 일치 여부**는 앱 검증기가 다시 확인한다. SQL 문자열 체크만으로 Steam 출처를 인증하지 않는다.
- 서버에서 저장할 수 있는 승인 RPC는 이번 변경에서 **구현하지 않음**.

## 적용 후 검증

적용 전 SQL·스키마를 기록한 다음 시험 DB에 한정해 마이그레이션을 수행하고 RLS, GRANT, 테이블/데이터 개수를 재확인한다. 실행 결과는 `docs/TASKS.md`와 Draft PR에 기록한다.
