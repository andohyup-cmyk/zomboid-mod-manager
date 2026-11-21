import { normalizeResearchRecord, type ResearchRecord } from "./workshop";

export const CATALOG_LIST_LIMIT = 100;

export type CatalogListInput = {
  q?: string;
  archive?: string;
  build?: string;
  multiplayer?: string;
  sort?: string;
};

export type CatalogListFilters = {
  query: string;
  archive: "active" | "archived" | "all";
  build: "" | "unverified" | "confirmed" | "reported_issue";
  multiplayer: "" | "unverified" | "confirmed" | "reported_issue";
  sort: "recent" | "oldest" | "name";
};

const verificationStates = ["unverified", "confirmed", "reported_issue"] as const;

function verificationState(value: string | undefined): CatalogListFilters["build"] {
  return verificationStates.find(state => state === value) ?? "";
}

/** Normalize untrusted URL search parameters before building the owner-scoped query. */
export function parseCatalogListFilters(input: CatalogListInput): CatalogListFilters {
  return {
    query: typeof input.q === "string" ? input.q.trim().slice(0, 80) : "",
    archive: input.archive === "archived" || input.archive === "all" ? input.archive : "active",
    build: verificationState(input.build),
    multiplayer: verificationState(input.multiplayer),
    sort: input.sort === "oldest" || input.sort === "name" ? input.sort : "recent"
  };
}

type FilterableCatalogQuery<Q> = {
  eq(column: string, value: string | boolean): Q;
  ilike(column: string, pattern: string): Q;
  order(column: string, options: { ascending: boolean }): Q;
};

/** Adds optional search/filter/sort clauses; the caller MUST scope by owner_id. */
export function applyCatalogListFilters<Q extends FilterableCatalogQuery<Q>>(
  query: Q,
  filters: CatalogListFilters
): Q {
  let result = query;
  if (filters.archive !== "all") result = result.eq("is_archived", filters.archive === "archived");
  if (filters.build) result = result.eq("build_compatibility", filters.build);
  if (filters.multiplayer) result = result.eq("multiplayer_compatibility", filters.multiplayer);
  if (filters.query) {
    if (/^\d{5,20}$/.test(filters.query)) {
      result = result.eq("workshop_id", filters.query);
    } else {
      // Escape PostgREST LIKE wildcards and backslashes for a literal title search.
      const literal = filters.query.replace(/[\\%_]/g, "\\$&");
      result = result.ilike("title", "%" + literal + "%");
    }
  }
  if (filters.sort === "name") return result.order("title", { ascending: true });
  return result.order("created_at", { ascending: filters.sort === "oldest" });
}

export function isCatalogModUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function extractCatalogResearchSources(
  rows: ReadonlyArray<{ raw_payload: unknown; created_at: string }>
): Array<{ record: ResearchRecord; createdAt: string }> {
  return rows.flatMap(row => {
    const parsed = normalizeResearchRecord(row.raw_payload);
    return parsed.record ? [{ record: parsed.record, createdAt: row.created_at }] : [];
  });
}
