import Link from "next/link";
import { statusLabel, statusStyle } from "@/lib/status-display";
import { getOwnerAccess } from "@/lib/auth";
import {
  applyCatalogListFilters,
  CATALOG_LIST_LIMIT,
  parseCatalogListFilters,
  parseCategoryFilter,
  type CatalogListInput
} from "@/lib/catalog-read";

type CatalogMod = {
  id: string;
  title: string;
  workshop_id: string;
  verification_status: string;
  build_compatibility: string;
  multiplayer_compatibility: string;
  is_archived: boolean;
  created_at: string;
  mod_ids: { value: string }[] | null;
};

export default async function ModsPage({ searchParams }: { searchParams: Promise<CatalogListInput & { category?: string }> }) {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;
  const rawParams = await searchParams;
  const { query, archive, sort, build, multiplayer } = parseCatalogListFilters(rawParams);
  const category = parseCategoryFilter(rawParams.category);

  // Owner-scoped category data. Failures degrade to "no category info", never block the list.
  const { data: categoryRows } = await access.supabase.from("categories")
    .select("id,name,sort_order").eq("owner_id", access.user.id)
    .order("sort_order", { ascending: true }).order("name", { ascending: true }).limit(200);
  const categories = (categoryRows ?? []) as { id: string; name: string }[];
  let categoryModIds: string[] | null = null;
  if (category) {
    const { data: links } = await access.supabase.from("mod_categories")
      .select("mod_id").eq("owner_id", access.user.id).eq("category_id", category).limit(CATALOG_LIST_LIMIT);
    categoryModIds = (links ?? []).map(row => row.mod_id as string);
  }

  // Scope the query to the signed-in owner before applying optional filters.
  const base = access.supabase.from("mods")
    .select("id,title,workshop_id,verification_status,build_compatibility,multiplayer_compatibility,is_archived,created_at,mod_ids(value)")
    .eq("owner_id", access.user.id)
    .limit(CATALOG_LIST_LIMIT);
  const scoped = categoryModIds === null ? base
    : base.in("id", categoryModIds.length ? categoryModIds : ["00000000-0000-0000-0000-000000000000"]);
  const req = applyCatalogListFilters(scoped, { query, archive, sort, build, multiplayer });

  const { data, error } = await req;
  const items = (data ?? []) as CatalogMod[];

  const primaryByMod = new Map<string, string>();
  if (items.length > 0 && categories.length > 0) {
    const { data: primaries } = await access.supabase.from("mod_category_primary")
      .select("mod_id,category_id").eq("owner_id", access.user.id)
      .in("mod_id", items.map(item => item.id));
    const names = new Map(categories.map(item => [item.id, item.name]));
    for (const row of primaries ?? []) {
      const name = names.get(row.category_id as string);
      if (name) primaryByMod.set(row.mod_id as string, name);
    }
  }

  const activeFilters = [archive !== "active", sort !== "recent", build !== "", multiplayer !== "", category !== ""]
    .filter(Boolean).length;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">모드 카탈로그</h1>
        <Link href="/register" className="action shrink-0 text-sm">+ 등록</Link>
      </div>
      <form method="get" className="space-y-3">
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="q">이름 또는 Workshop ID 검색</label>
          <input id="q" className="field min-w-0 flex-1" name="q" defaultValue={query}
            type="search" inputMode="search" placeholder="모드 이름 또는 Workshop ID" />
          <button type="submit" className="action shrink-0">검색</button>
        </div>
        <details className="panel group p-4" open={activeFilters > 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
            <span>필터·정렬{activeFilters > 0 ? ` (${activeFilters}개 적용 중)` : ""}</span>
            <span className="muted text-xs group-open:hidden">펼치기</span>
            <span className="muted hidden text-xs group-open:inline">접기</span>
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-sm">목록
              <select name="archive" defaultValue={archive} className="field mt-1">
                <option value="active">사용 중</option><option value="archived">보관</option><option value="all">전체</option>
              </select>
            </label>
            <label className="text-sm">정렬
              <select name="sort" defaultValue={sort} className="field mt-1">
                <option value="recent">최근 등록</option><option value="oldest">오래된 순</option><option value="name">이름 순</option>
              </select>
            </label>
            {categories.length > 0 && (
              <label className="col-span-2 text-sm">카테고리
                <select name="category" defaultValue={category} className="field mt-1">
                  <option value="">전체</option>
                  {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            )}
            <label className="text-sm">B42.22
              <select name="build" defaultValue={build} className="field mt-1">
                <option value="">전체</option><option value="unverified">미확인</option>
                <option value="confirmed">확인</option><option value="reported_issue">문제 제보</option>
              </select>
            </label>
            <label className="text-sm">멀티플레이
              <select name="multiplayer" defaultValue={multiplayer} className="field mt-1">
                <option value="">전체</option><option value="unverified">미확인</option>
                <option value="confirmed">확인</option><option value="reported_issue">문제 제보</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="action text-sm">적용</button>
            <Link href="/mods" className="secondary-action text-sm">초기화</Link>
          </div>
        </details>
      </form>
      {error && <p role="alert" className="text-sm text-red-300">모드 목록을 불러오지 못했습니다.</p>}
      {!error && items.length === 0 && (
        <div className="panel p-7 text-center">
          <p className="font-semibold">조건에 맞는 모드가 없습니다.</p>
          <p className="muted mt-2 text-sm">필터를 초기화하거나 등록 화면에서 추가해 주세요.</p>
        </div>
      )}
      {!error && items.length > 0 && <p className="muted text-xs">{items.length}개 표시</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map(mod => (
          <li key={mod.id}>
            <Link href={`/mods/${mod.id}`}
              className="panel block space-y-2 p-4 transition-colors active:border-[#6ca67b] hover:border-[#6ca67b]">
              <div className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 break-words text-base font-bold">{mod.title}</h2>
                {mod.is_archived && <span className="shrink-0 rounded-md bg-[#2a3441] px-2 py-0.5 text-[11px]">보관</span>}
              </div>
              <p className="muted truncate text-xs">
                Workshop {mod.workshop_id} · Mod ID {mod.mod_ids?.length ? mod.mod_ids.map(x => x.value).join(", ") : "미확인"}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-md bg-[#1f3a4d] px-2 py-0.5 text-[#bfe3ff]">
                  {primaryByMod.get(mod.id) ?? "미분류"}
                </span>
                <span className={"rounded-md px-2 py-0.5 " + statusStyle(mod.build_compatibility)}>
                  B42.22 {statusLabel(mod.build_compatibility)}
                </span>
                <span className={"rounded-md px-2 py-0.5 " + statusStyle(mod.multiplayer_compatibility)}>
                  멀티 {statusLabel(mod.multiplayer_compatibility)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {items.length >= CATALOG_LIST_LIMIT && <p className="muted text-xs">최대 100건만 표시됩니다. 조건을 좁혀 검색해 주세요.</p>}
    </section>
  );
}
