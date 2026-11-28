import { ProfileModEditor } from "@/components/ProfileModEditor";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogModUuid } from "@/lib/catalog-read";
import { isCatalogWriteAllowed, isCategoryWriteAllowed } from "@/lib/catalog-write-protection";
import { buildPrimaryCategoryMap } from "@/lib/data-sync";
import {
  PROFILE_CATALOG_PAGE_SIZE,
  toEditorCatalogPage,
  type CatalogRow,
  type EditorCatalogPage
} from "@/lib/profile-editor-catalog";
import { isTestProfileSnapshotWriteAllowed } from "@/lib/profile-snapshot-write";
import type { StoredSelectionGroup } from "@/lib/selection-group-input";
import { sortCategoriesForLoadOrder } from "@/lib/steam-category-rules";
import { stripWorkshopSuffixFromTitle } from "@/lib/steam-description";

export const dynamic = "force-dynamic";

type GroupRow = {
  id: string;
  label: string;
  min_selected: number | null;
  max_selected: number | null;
  verified: boolean;
  evidence_url: string | null;
};

export default async function ProfileEditorPage({
  searchParams
}: {
  searchParams: Promise<{ profileId?: string }>;
}) {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;

  const params = await searchParams;
  const requestedId = typeof params.profileId === "string" && isCatalogModUuid(params.profileId)
    ? params.profileId.toLowerCase()
    : null;

  const owner = access.user.id;
  const [
    { data: profileRows },
    { data: categoryRows },
    catalogRes,
    primaryRes,
    groupsRes
  ] = await Promise.all([
    access.supabase
      .from("profiles")
      .select("id,name")
      .eq("owner_id", owner)
      .order("created_at", { ascending: false })
      .limit(100),
    access.supabase
      .from("categories")
      .select("id,name,sort_order")
      .eq("owner_id", owner)
      .limit(200),
    access.supabase
      .from("mods")
      .select("id,title,workshop_id,mod_ids(id,value)", { count: "exact" })
      .eq("owner_id", owner)
      .eq("is_archived", false)
      .order("workshop_id")
      .order("value", { referencedTable: "mod_ids" })
      .limit(PROFILE_CATALOG_PAGE_SIZE),
    access.supabase
      .from("mod_category_primary")
      .select("mod_id,category_id")
      .eq("owner_id", owner)
      .limit(1000),
    access.supabase
      .from("selection_groups")
      .select("id,label,min_selected,max_selected,verified,evidence_url")
      .eq("owner_id", owner)
      .order("label", { ascending: true })
      .limit(101)
  ]);

  const initialProfiles = ((profileRows ?? []) as { id: string; name: string }[]).map((row) => ({
    id: row.id,
    name: row.name
  }));
  const initialProfileId = requestedId && initialProfiles.some((p) => p.id.toLowerCase() === requestedId)
    ? initialProfiles.find((p) => p.id.toLowerCase() === requestedId)?.id ?? null
    : null;

  const orderedCategories = sortCategoriesForLoadOrder(
    (categoryRows ?? []) as { id: string; name: string; sort_order: number }[]
  );
  const recommendationOptions = {
    categoryPriority: orderedCategories.map((cat) => cat.id)
  };

  let initialCatalogPage: EditorCatalogPage | null = null;
  if (!catalogRes.error && catalogRes.data) {
    const primaryByMod = !primaryRes.error
      ? buildPrimaryCategoryMap(
          orderedCategories,
          (primaryRes.data ?? []) as { mod_id: string; category_id: string }[]
        )
      : new Map<string, { id: string; label: string }>();
    const rows = (catalogRes.data as unknown as (CatalogRow & { id: string })[]).map((row) => ({
      ...row,
      title: stripWorkshopSuffixFromTitle(row.title),
      primaryCategory: primaryByMod.get(row.id) ?? null
    }));
    initialCatalogPage = toEditorCatalogPage(rows, catalogRes.count);
  }

  let initialGroups: StoredSelectionGroup[] | undefined;
  if (!groupsRes.error && groupsRes.data && groupsRes.data.length <= 100) {
    const groupRows = groupsRes.data as GroupRow[];
    if (groupRows.length === 0) {
      initialGroups = [];
    } else {
      const membersRes = await access.supabase
        .from("selection_group_members")
        .select("group_id,mod_id_ref")
        .eq("owner_id", owner)
        .in("group_id", groupRows.map((g) => g.id))
        .limit(5001);
      if (!membersRes.error && membersRes.data && membersRes.data.length <= 5000) {
        const memberRows = membersRes.data as { group_id: string; mod_id_ref: string }[];
        const refs = [...new Set(memberRows.map((m) => m.mod_id_ref))];
        const idsRes = refs.length
          ? await access.supabase.from("mod_ids").select("id,value,mods(workshop_id)").in("id", refs).limit(5001)
          : { data: [], error: null };
        if (!idsRes.error && idsRes.data) {
          const byRef = new Map<string, { workshopId: string; modId: string }>();
          for (const row of idsRes.data as { id: string; value: string; mods: { workshop_id: string } | { workshop_id: string }[] | null }[]) {
            const mod = Array.isArray(row.mods) ? row.mods[0] : row.mods;
            if (mod?.workshop_id) byRef.set(row.id, { workshopId: mod.workshop_id, modId: row.value });
          }
          initialGroups = groupRows.map((g) => ({
            id: g.id,
            label: g.label,
            minSelected: g.min_selected,
            maxSelected: g.max_selected,
            verified: g.verified,
            evidenceUrl: g.evidence_url,
            members: memberRows.filter((m) => m.group_id === g.id).flatMap((m) => {
              const ref = byRef.get(m.mod_id_ref);
              return ref ? [{ modIdRef: m.mod_id_ref, ...ref }] : [];
            })
          }));
        }
      }
    }
  }

  const testWriteEnabled = isCategoryWriteAllowed(process.env);
  const profileWriteEnabled = testWriteEnabled
    || isTestProfileSnapshotWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL);

  return (
    <ProfileModEditor
      recommendationOptions={recommendationOptions}
      groupWriteEnabled={testWriteEnabled}
      profileWriteEnabled={profileWriteEnabled}
      initialProfiles={initialProfiles}
      initialProfileId={initialProfileId}
      initialCatalogPage={initialCatalogPage}
      initialGroups={initialGroups}
    />
  );
}
