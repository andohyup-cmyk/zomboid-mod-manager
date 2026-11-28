import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogModUuid } from "@/lib/catalog-read";
import { isCatalogWriteAllowed, isCategoryWriteAllowed } from "@/lib/catalog-write-protection";
import { sortCategoriesForLoadOrder } from "@/lib/steam-category-rules";
import { cleanSteamDescription, formatSteamDate, stripWorkshopSuffixFromTitle, summarizeModDescription } from "@/lib/steam-description";
import { ModCategoryPanel } from "@/components/ModCategoryPanel";
import { ModDetailEditor } from "@/components/ModDetailEditor";

export const dynamic = "force-dynamic";

type CatalogDetail = {
  id: string;
  title: string;
  description: string;
  short_description?: string | null;
  workshop_id: string;
  steam_updated_at?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export default async function ModDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;
  const { id } = await params;
  if (!isCatalogModUuid(id)) notFound();

  const [
    modRes,
    { data: ids, error: idsError },
    { data: allCategories },
    { data: modCatRows },
    { data: primaryRow }
  ] = await Promise.all([
    access.supabase.from("mods")
      .select("id,title,description,short_description,workshop_id,steam_updated_at,is_archived,created_at,updated_at")
      .eq("owner_id", access.user.id).eq("id", id).maybeSingle(),
    access.supabase.from("mod_ids").select("id,value").eq("mod_id", id).order("value").limit(50),
    access.supabase.from("categories").select("id,name,sort_order").eq("owner_id", access.user.id).limit(200),
    access.supabase.from("mod_categories").select("category_id").eq("owner_id", access.user.id).eq("mod_id", id).limit(64),
    access.supabase.from("mod_category_primary").select("category_id").eq("owner_id", access.user.id).eq("mod_id", id).maybeSingle()
  ]);

  let data = modRes.data as CatalogDetail | null;
  let error = modRes.error;
  if (error?.code === "42703") {
    const fallback = await access.supabase.from("mods")
      .select("id,title,description,workshop_id,is_archived,created_at,updated_at")
      .eq("owner_id", access.user.id).eq("id", id).maybeSingle();
    data = fallback.data as CatalogDetail | null;
    error = fallback.error;
  }

  if (error || !data) notFound();
  const mod = data;
  const steamLink = `https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.workshop_id}`;
  const writeEnabled = isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isCategoryWriteAllowed(process.env);

  const orderedCategories = sortCategoriesForLoadOrder(
    (allCategories ?? []) as { id: string; name: string; sort_order: number }[]
  );
  const nameById = new Map(orderedCategories.map((c) => [c.id, c.name]));
  const rankById = new Map(orderedCategories.map((c, idx) => [c.id, idx]));
  const primaryId = (primaryRow?.category_id as string | undefined) ?? null;
  const assignedCategories = [...new Set((modCatRows ?? []).map((row) => row.category_id as string))]
    .map((catId) => ({
      id: catId,
      name: nameById.get(catId) ?? "",
      isPrimary: catId === primaryId
    }))
    .filter((item) => item.name.length > 0)
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return (rankById.get(a.id) ?? 999) - (rankById.get(b.id) ?? 999);
    });

  const displayTitle = stripWorkshopSuffixFromTitle(mod.title);
  const detailedDescription = cleanSteamDescription(mod.description || "") || mod.description || "";
  const shortDescription = (mod.short_description ?? "").trim()
    || summarizeModDescription(detailedDescription);
  const lastUpdated = formatSteamDate(mod.steam_updated_at);

  return (
    <section className="space-y-4">
      <Link href="/mods" className="inline-block py-2 text-sm text-[#b9efb0] underline">← 모드 목록</Link>

      {/* Top summary card: mirrors what appears in /mods list + last Steam update date */}
      <div className="panel space-y-3 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <h1 className="min-w-0 break-words text-2xl font-bold sm:text-3xl">{displayTitle}</h1>
          {mod.is_archived && (
            <span className="shrink-0 rounded-md bg-[#2a3441] px-2.5 py-1 text-xs text-amber-200">보관</span>
          )}
        </div>
        {shortDescription && (
          <p className="text-sm leading-6 text-[#dce7ef]">{shortDescription}</p>
        )}
        <div className="flex flex-wrap gap-1.5 text-xs">
          {assignedCategories.length > 0 ? (
            assignedCategories.map((cat) => (
              <span
                key={cat.id}
                className={
                  cat.isPrimary
                    ? "rounded-md bg-[#234332] px-2.5 py-1 font-semibold text-[#b9efb0]"
                    : "rounded-md bg-[#1f3a4d] px-2.5 py-1 text-[#bfe3ff]"
                }
              >
                {cat.isPrimary ? `★ ${cat.name}` : cat.name}
              </span>
            ))
          ) : (
            <span className="rounded-md bg-[#1f3a4d] px-2.5 py-1 text-[#bfe3ff]">미분류</span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#304154] pt-3 text-xs">
          <span className="muted">최근 스팀 업데이트: {lastUpdated ?? "미확인"}</span>
          <a
            href={steamLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#b9efb0] underline"
          >
            Steam Workshop 열기
          </a>
        </div>
      </div>

      {/* Detailed description card right below */}
      <section className="panel p-5" aria-label="모드 설명">
        <p className="muted whitespace-pre-wrap text-sm leading-6">
          {detailedDescription || "상세 설명이 없습니다."}
        </p>
      </section>

      <ModDetailEditor
        key={id}
        modId={id}
        modTitle={displayTitle}
        initialModIds={(ids ?? []) as { id: string; value: string }[]}
        idsError={Boolean(idsError)}
        initialIsArchived={mod.is_archived}
        writeEnabled={writeEnabled}
      />

      <ModCategoryPanel
        key={id}
        modId={id}
        writeEnabled={isCategoryWriteAllowed(process.env)}
        initialAssignedNames={assignedCategories.map((cat) => cat.name)}
      />
    </section>
  );
}
