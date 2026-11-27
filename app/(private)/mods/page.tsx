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
import { buildPrimaryCategoryMap } from "@/lib/data-sync";
import { sortCategoriesForLoadOrder } from "@/lib/steam-category-rules";
import { stripWorkshopSuffixFromTitle, summarizeModDescription } from "@/lib/steam-description";
import { ModCatalogList, type CatalogCategoryBadge } from "@/components/ModCatalogList";
import { ModsToolbar } from "@/components/ModsToolbar";

export const dynamic = "force-dynamic";

type CatalogMod = {
  id: string;
  title: string;
  description: string;
  short_description?: string | null;
  workshop_id: string;
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
    || modIdFilter !== ""
  );

  // Run all owner-scoped reads in a single parallel round-trip.
  const baseWithSummary = access.supabase.from("mods")
    .select("id,title,description,short_description,workshop_id,is_archived,created_at,mod_ids(value)")
    .eq("owner_id", access.user.id)
    .limit(CATALOG_LIST_LIMIT);
  const req = applyCatalogListFilters(baseWithSummary, { query, archive, sort, build, multiplayer });

  const [
    { data: categoryRows },
    { data: primaryRows },
    { data: memberRows },
    modsRes
  ] = await Promise.all([
    access.supabase.from("categories")
      .select("id,name,sort_order").eq("owner_id", access.user.id).limit(200),
    access.supabase.from("mod_category_primary")
      .select("mod_id,category_id").eq("owner_id", access.user.id).limit(1000),
    access.supabase.from("mod_categories")
      .select("mod_id,category_id").eq("owner_id", access.user.id).limit(5000),
    req
  ]);

  // Graceful fallback if short_description migration has not been executed on test DB yet.
  let data = modsRes.data as CatalogMod[] | null;
  let error = modsRes.error;
  if (error?.code === "42703") {
    const fallbackBase = access.supabase.from("mods")
      .select("id,title,description,workshop_id,is_archived,created_at,mod_ids(value)")
      .eq("owner_id", access.user.id)
      .limit(CATALOG_LIST_LIMIT);
    const fallbackRes = await applyCatalogListFilters(fallbackBase, { query, archive, sort, build, multiplayer });
    data = fallbackRes.data as CatalogMod[] | null;
    error = fallbackRes.error;
  }

  const orderedCategories = sortCategoriesForLoadOrder(
    (categoryRows ?? []) as { id: string; name: string; sort_order: number }[]
  );
  const categories = orderedCategories.map(({ id, name }) => ({ id, name }));
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const categoryRankById = new Map(categories.map((c, idx) => [c.id, idx]));

  const primaryByMod = buildPrimaryCategoryMap(
    categories,
    (primaryRows ?? []) as { mod_id: string; category_id: string }[]
  );

  const membersByMod = new Map<string, string[]>();
  for (const row of (memberRows ?? []) as { mod_id: string; category_id: string }[]) {
    if (!categoryNameById.has(row.category_id)) continue;
    const list = membersByMod.get(row.mod_id) ?? [];
    list.push(row.category_id);
    membersByMod.set(row.mod_id, list);
  }

  const rawItems = (data ?? []) as CatalogMod[];
  const items = rawItems.filter((mod) => {
    if (modIdFilter === "present" && (mod.mod_ids?.length ?? 0) === 0) return false;
    if (modIdFilter === "missing" && (mod.mod_ids?.length ?? 0) > 0) return false;
    return true;
  });

  const initialCategoryFilter =
    category === UNCLASSIFIED_CATEGORY_FILTER
      ? "unclassified"
      : specificCategoryUuid && categoryNameById.has(specificCategoryUuid)
        ? specificCategoryUuid
        : "all";

  const categoryWriteEnabled = isTestCategoryWriteAllowed(process.env);
  const catalogWriteEnabled =
    isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || categoryWriteEnabled;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">모드 카탈로그</h1>
      </div>

      <ModsToolbar
        query={query}
        archive={archive}
        category={category}
        modIdFilter={modIdFilter}
        categories={categories}
        categoryWriteEnabled={categoryWriteEnabled}
        autoWriteEnabled={catalogWriteEnabled}
      />

      {error && <p role="alert" className="text-sm text-red-300">모드 목록을 불러오지 못했습니다.</p>}
      {!error && items.length === 0 && (
        <div className="panel p-7 text-center">
          <p className="font-semibold">조건에 맞는 모드가 없습니다.</p>
          <p className="muted mt-2 text-sm">필터를 초기화하거나 등록 화면에서 추가해 주세요.</p>
        </div>
      )}
      {!error && items.length > 0 && (
        <ModCatalogList
          key={initialCategoryFilter}
          items={items.map((mod) => {
            const primary = primaryByMod.get(mod.id) ?? null;
            const memberIds = membersByMod.get(mod.id) ?? (primary ? [primary.id] : []);
            const uniqueIds = [...new Set(memberIds)];
            const badges: CatalogCategoryBadge[] = uniqueIds
              .map((catId) => ({
                id: catId,
                name: categoryNameById.get(catId) ?? "",
                isPrimary: primary?.id === catId
              }))
              .filter((b) => b.name.length > 0)
              .sort((a, b) => {
                if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
                return (categoryRankById.get(a.id) ?? 999) - (categoryRankById.get(b.id) ?? 999);
              });
            const shortText = (mod.short_description ?? "").trim()
              || summarizeModDescription(mod.description ?? "");
            return {
              id: mod.id,
              title: stripWorkshopSuffixFromTitle(mod.title),
              shortDescription: shortText,
              is_archived: mod.is_archived,
              categoryIds: uniqueIds,
              categories: badges,
              primaryCategoryName: primary?.label ?? null
            };
          })}
          categories={categories}
          initialCategoryFilter={initialCategoryFilter}
          hasServerFilters={hasServerFilters}
        />
      )}
      {rawItems.length >= CATALOG_LIST_LIMIT && (
        <p className="muted text-xs">최대 {CATALOG_LIST_LIMIT}건만 표시됩니다. 조건을 좁혀 검색해 주세요.</p>
      )}
    </section>
  );
}
