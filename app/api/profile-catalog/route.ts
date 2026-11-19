import { getOwnerAccess } from "@/lib/auth";
import {
  catalogSearchFilters,
  PROFILE_CATALOG_PAGE_SIZE,
  PROFILE_CATALOG_SEARCH_LIMIT,
  toEditorCatalogPage,
  type CatalogRow
} from "@/lib/profile-editor-catalog";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const access = await getOwnerAccess();
  if (access.kind === "signed-out") return Response.json({ error: "signed-out" }, { status: 401, headers });
  if (access.kind === "denied") return Response.json({ error: "denied" }, { status: 403, headers });
  if (access.kind !== "authorized") return Response.json({ error: "unavailable" }, { status: 503, headers });

  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, PROFILE_CATALOG_SEARCH_LIMIT);
  const after = params.get("after");
  if (after !== null && !/^\d{5,20}$/.test(after)) {
    return Response.json({ error: "invalid-cursor" }, { status: 400, headers });
  }

  let catalog = access.supabase.from("mods")
    .select(query ? "title,workshop_id,mod_ids(id,value),matching:mod_ids()" : "title,workshop_id,mod_ids(id,value)", {
      count: "exact"
    })
    .eq("owner_id", access.user.id)
    .eq("is_archived", false)
    .order("workshop_id")
    .order("value", { referencedTable: "mod_ids" })
    .limit(PROFILE_CATALOG_PAGE_SIZE);

  if (query) {
    const filters = catalogSearchFilters(query);
    catalog = catalog.filter("matching.value", "imatch", filters.pattern).or(filters.or);
  }
  if (after !== null) catalog = catalog.gt("workshop_id", after);

  const { data, error, count, status } = await catalog;
  if (status === 401 || status === 403) return Response.json({ error: "denied" }, { status, headers });
  if (error || !data || (data.length === 0 && count !== null && count > 0)) {
    return Response.json({ error: "unavailable" }, { status: 502, headers });
  }

  return Response.json(toEditorCatalogPage(data as unknown as CatalogRow[], count), { headers });
}
