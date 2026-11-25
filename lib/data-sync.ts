import { revalidatePath } from "next/cache";

/**
 * Single source of truth for cross-screen data synchronization.
 *
 * Every mutating API route MUST call `revalidateDomain(...)` after a successful write
 * and return `PRIVATE_NO_STORE_HEADERS`. Adding a new linked domain requires updating
 * `SYNC_DOMAIN_PATHS` and `SYNC_DOMAIN_BACKUP_TABLES` (enforced by tests/data-sync-contract.test.ts).
 */
export const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0"
} as const;

export const SYNC_DOMAIN_PATHS = {
  mod: ["/dashboard", "/mods", "/profiles", "/profiles/editor", "/backup"],
  modId: ["/dashboard", "/mods", "/profiles/editor", "/backup"],
  category: ["/dashboard", "/mods", "/profiles/editor", "/backup"],
  modCategory: ["/dashboard", "/mods", "/profiles/editor", "/backup"],
  profile: ["/dashboard", "/profiles", "/profiles/editor", "/backup"],
  profileSnapshot: ["/profiles", "/profiles/editor", "/backup"],
  selectionGroup: ["/profiles/editor", "/backup"],
  researchQueue: ["/register", "/backup"],
  modRelation: ["/profiles/editor", "/backup", "/diagnostics/relations"]
} as const;

export type SyncDomain = keyof typeof SYNC_DOMAIN_PATHS;

export const SYNC_DOMAIN_BACKUP_TABLES: Record<SyncDomain, readonly string[]> = {
  mod: ["mods", "researchRecords"],
  modId: ["modIds"],
  category: ["categories"],
  modCategory: ["modCategories", "modCategoryPrimary"],
  profile: ["profiles"],
  profileSnapshot: ["profileRevisions", "profileModChoices", "profileDownloads"],
  selectionGroup: ["selectionGroups", "selectionGroupMembers"],
  researchQueue: ["researchQueue"],
  modRelation: ["modRelations"]
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RevalidateTarget = Readonly<{
  path: string;
  type?: "page" | "layout";
}>;

export function getAffectedRevalidateTargets(
  domain: SyncDomain,
  options?: { modIds?: readonly string[] }
): readonly RevalidateTarget[] {
  const targets: RevalidateTarget[] = [];
  const seen = new Set<string>();
  const add = (path: string, type?: "page" | "layout") => {
    const key = `${type ?? "exact"}:${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push(type ? { path, type } : { path });
  };

  for (const path of SYNC_DOMAIN_PATHS[domain]) {
    add(path);
  }

  const modIds = (options?.modIds ?? []).filter((id) => UUID_RE.test(id));
  if (domain === "category") {
    add("/mods/[id]", "page");
  } else if (domain === "mod" || domain === "modId" || domain === "modCategory") {
    if (modIds.length > 0) {
      for (const id of modIds) add(`/mods/${id}`);
    } else {
      add("/mods/[id]", "page");
    }
  }

  return targets;
}

export function revalidateDomain(
  domain: SyncDomain,
  options?: { modIds?: readonly string[] }
): void {
  for (const target of getAffectedRevalidateTargets(domain, options)) {
    try {
      if (target.type) {
        revalidatePath(target.path, target.type);
      } else {
        revalidatePath(target.path);
      }
    } catch {
      // Ignore outside Next.js request/static generation store (e.g. unit tests).
    }
  }
}

export type PrimaryCategoryInfo = Readonly<{
  id: string;
  label: string;
}>;

/**
 * Shared primary-category resolver used across /mods, /api/profile-catalog,
 * and /api/profile-snapshots so all screens agree on each mod's primary category.
 */
export function buildPrimaryCategoryMap(
  categories: readonly { id: string; name: string }[],
  primaryRows: readonly { mod_id: string; category_id: string }[]
): Map<string, PrimaryCategoryInfo> {
  const byCategoryId = new Map<string, string>();
  for (const cat of categories) {
    byCategoryId.set(cat.id, cat.name);
  }
  const byModId = new Map<string, PrimaryCategoryInfo>();
  for (const row of primaryRows) {
    const label = byCategoryId.get(row.category_id);
    if (label) {
      byModId.set(row.mod_id, { id: row.category_id, label });
    }
  }
  return byModId;
}

/**
 * Exact active unclassified mod count: counts ONLY non-archived mods that have no
 * primary category row, preventing archived categorized mods from skewing counts.
 */
export function countActiveUnclassifiedMods(
  activeModIds: readonly string[],
  primaryModIds: readonly string[]
): number {
  const classified = new Set(primaryModIds);
  let count = 0;
  for (const id of activeModIds) {
    if (!classified.has(id)) count += 1;
  }
  return count;
}
