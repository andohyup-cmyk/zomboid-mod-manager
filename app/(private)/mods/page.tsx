import Link from "next/link";
import { getOwnerAccess } from "@/lib/auth";
import {
  applyCatalogListFilters,
  CATALOG_LIST_LIMIT,
  parseCatalogListFilters,
  parseCategoryScopeFilter,
  parseModIdFilter,
  UNCLASSIFIED_CATEGORY_FILTER,
  type CatalogListInput
} from "@/lib/catalog-read";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { CategoryManager } from "@/components/CategoryManager";
import { ModCatalogList, type QuickFilterMode } from "@/components/ModCatalogList";
import { PcModIdBackfillPanel } from "@/components/PcModIdBackfillPanel";

export const dynamic = "force-dynamic";

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

export default async function ModsPage({
  searchParams
}: {
  searchParams: Promise<CatalogListInput & { category?: string }>;
}) {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;
  const rawParams = await searchParams;
  const { query, archive, sort, build, multiplayer } = parseCatalogListFilters(rawParams);
  const category = parseCategoryScopeFilter(rawParams.category);
  const modIdFilter = parseModIdFilter(rawParams.modId);

  const specificCategoryUuid = category && category !== UNCLASSIFIED_CATEGORY_FILTER ? category : "";
  const hasServerFilters = Boolean(
    query
    || archive !== "active"
    || build
    || multiplayer
    || specificCategoryUuid
    || modIdFilter === "present"
  );

  // Run all owner-scoped reads in a single parallel round-trip to minimize mobile latency.
  const base = access.supabase.from("mods")
    .select("id,title,workshop_id,verification_status,build_compatibility,multiplayer_compatibility,is_archived,created_at,mod_ids(value)")
    .eq("owner_id", access.user.id)
    .limit(CATALOG_LIST_LIMIT);
  const req = applyCatalogListFilters(base, { query, archive, sort, build, multiplayer });

  const [
    { data: categoryRows },
    { data: primaryRows },
    { data, error },
    categoryLinksRes,
    allModsRes
  ] = await Promise.all([
    access.supabase.from("categories")
      .select("id,name,sort_order").eq("owner_id", access.user.id)
      .order("sort_order", { ascending: true }).order("name", { ascending: true }).limit(200),
    access.supabase.from("mod_category_primary")
      .select("mod_id,category_id").eq("owner_id", access.user.id).limit(500),
    req,
    specificCategoryUuid
      ? access.supabase.from("mod_categories")
          .select("mod_id").eq("owner_id", access.user.id)
          .eq("category_id", specificCategoryUuid).limit(CATALOG_LIST_LIMIT)
      : Promise.resolve({ data: null }),
    hasServerFilters
      ? access.supabase.from("mods")
          .select("id,title,workshop_id,mod_ids(value)")
          .eq("owner_id", access.user.id)
          .limit(500)
      : Promise.resolve({ data: null })
  ]);

  const categories = (categoryRows ?? []) as { id: string; name: string }[];
  const rawItems = (data ?? []) as CatalogMod[];

  const categoryModIdSet = specificCategoryUuid
    ? new Set((categoryLinksRes.data ?? []).map((row) => row.mod_id as string))
    : null;

  // Apply server-level filters (specific category UUID or modId=present);
  // unclassified / missing Mod ID quick chips filter instantly on the client.
  const items = rawItems.filter((mod) => {
    if (categoryModIdSet && !categoryModIdSet.has(mod.id)) return false;
    if (modIdFilter === "present" && (mod.mod_ids?.length ?? 0) === 0) return false;
    return true;
  });

  const allOwnerMods = (allModsRes.data ?? rawItems) as {
    id: string;
    title: string;
    workshop_id: string;
    mod_ids: { value: string }[] | null;
  }[];

  const primaryByMod = new Map<string, string>();
  if (categories.length > 0 && primaryRows?.length) {
    const names = new Map(categories.map((item) => [item.id, item.name]));
    for (const row of primaryRows) {
      const name = names.get(row.category_id as string);
      if (name) primaryByMod.set(row.mod_id as string, name);
    }
  }

  const initialQuickFilter: QuickFilterMode =
    category === UNCLASSIFIED_CATEGORY_FILTER
      ? "unclassified"
      : modIdFilter === "missing"
        ? "missing_mod_id"
        : "all";

  const activeFilters = [
    archive !== "active",
    sort !== "recent",
    build !== "",
    multiplayer !== "",
    category !== "",
    modIdFilter !== ""
  ].filter(Boolean).length;

  const catalogWriteEnabled =
    isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isTestCategoryWriteAllowed(process.env);

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
        <details className="panel group p-4" open={hasServerFilters || sort !== "recent"}>
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
            <label className="text-sm">카테고리
              <select name="category" defaultValue={category} className="field mt-1">
                <option value="">전체</option>
                <option value={UNCLASSIFIED_CATEGORY_FILTER}>미분류만</option>
                {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Mod ID
              <select name="modId" defaultValue={modIdFilter} className="field mt-1">
                <option value="">전체</option>
                <option value="missing">미확인만</option>
                <option value="present">확인됨만</option>
              </select>
            </label>
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
      <CategoryManager initialCategories={categories} writeEnabled={isTestCategoryWriteAllowed(process.env)} />
      {!error && (
        <PcModIdBackfillPanel
          catalogMods={allOwnerMods.map((mod) => ({
            id: mod.id,
            title: mod.title,
            workshopId: mod.workshop_id,
            existingModIds: (mod.mod_ids ?? []).map((x) => x.value)
          }))}
          writeEnabled={catalogWriteEnabled}
        />
      )}
      {error && <p role="alert" className="text-sm text-red-300">모드 목록을 불러오지 못했습니다.</p>}
      {!error && items.length === 0 && (
        <div className="panel p-7 text-center">
          <p className="font-semibold">조건에 맞는 모드가 없습니다.</p>
          <p className="muted mt-2 text-sm">필터를 초기화하거나 등록 화면에서 추가해 주세요.</p>
        </div>
      )}
      {!error && items.length > 0 && (
        <ModCatalogList
          key={initialQuickFilter}
          items={items.map((mod) => ({
            id: mod.id,
            title: mod.title,
            workshop_id: mod.workshop_id,
            build_compatibility: mod.build_compatibility,
            multiplayer_compatibility: mod.multiplayer_compatibility,
            is_archived: mod.is_archived,
            modIdsText: mod.mod_ids?.length ? mod.mod_ids.map((x) => x.value).join(", ") : "미확인",
            hasModId: Boolean(mod.mod_ids?.length),
            primaryCategoryName: primaryByMod.get(mod.id) ?? null
          }))}
          categories={categories}
          writeEnabled={isTestCategoryWriteAllowed(process.env)}
          initialQuickFilter={initialQuickFilter}
          hasServerFilters={hasServerFilters}
        />
      )}
      {rawItems.length >= CATALOG_LIST_LIMIT && (
        <p className="muted text-xs">최대 {CATALOG_LIST_LIMIT}건만 표시됩니다. 조건을 좁혀 검색해 주세요.</p>
      )}
    </section>
  );
}
