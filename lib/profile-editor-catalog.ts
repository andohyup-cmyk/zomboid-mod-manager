export const PROFILE_CATALOG_PAGE_SIZE = 24;
export const PROFILE_CATALOG_SEARCH_LIMIT = 200;

export type EditorCatalogEntry = {
  readonly title: string;
  readonly workshopId: string;
  readonly modIds: readonly { readonly value: string; readonly uuid?: string }[];
  readonly category?: { readonly id: string; readonly label: string };
};

export type EditorCatalogPage = {
  readonly entries: readonly EditorCatalogEntry[];
  readonly nextCursor: string | null;
};

export type CatalogRow = {
  id?: string;
  title: string;
  workshop_id: string;
  mod_ids: { id: string | null; value: string }[] | null;
  primaryCategory?: { readonly id: string; readonly label: string } | null;
};

/** Builds a literal, case-insensitive DB search and quotes it for the PostgREST OR grammar. */
export function catalogSearchFilters(query: string) {
  const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quoted = `"${pattern.replace(/["\\]/g, "\\$&")}"`;
  return { pattern, or: `title.imatch.${quoted},workshop_id.imatch.${quoted},matching.not.is.null` };
}

export function toEditorCatalogPage(rows: readonly CatalogRow[], remainingCount: number | null): EditorCatalogPage {
  const entries = rows.map((row): EditorCatalogEntry => {
    const ids = new Map<string, string | null>();
    for (const { id, value } of row.mod_ids ?? []) {
      const modId = value.trim();
      if (!modId) continue;
      if (!ids.has(modId)) ids.set(modId, id);
      else if (ids.get(modId) !== id) ids.set(modId, null);
    }
    return {
      title: row.title,
      workshopId: row.workshop_id,
      modIds: [...ids].map(([value, uuid]) => uuid ? { value, uuid } : { value }),
      ...(row.primaryCategory ? { category: row.primaryCategory } : {})
    };
  });

  return {
    entries,
    nextCursor: remainingCount === null || remainingCount > rows.length
      ? rows.at(-1)?.workshop_id ?? null
      : null
  };
}

export function mergeEditorCatalog(
  existing: readonly EditorCatalogEntry[],
  incoming: readonly EditorCatalogEntry[]
): readonly EditorCatalogEntry[] {
  const entries = new Map(existing.map((entry) => [entry.workshopId, entry]));
  for (const entry of incoming) entries.set(entry.workshopId, entry);
  return [...entries.values()];
}
