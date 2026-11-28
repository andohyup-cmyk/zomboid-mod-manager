import { isCatalogModUuid } from "./catalog-read";
import { canonicalWorkshopId } from "./workshop";

const MAX_PROFILE_ROWS = 500;
const MAX_REVISION = Number.MAX_SAFE_INTEGER;
const validGameModId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200
  && value === value.trim() && !/[;\r\n\x00-\x1f]/.test(value);

export type TrustedProfileSaveContext = Readonly<{
  signedInOwnerId: string;
  profile: Readonly<{ id: string; ownerId: string; revision: number }>;
  /** Server-fetched candidates only, scoped by RLS and the signed-in owner. */
  candidates: readonly Readonly<{
    entryId: string;
    ownerId: string;
    workshopId: string;
    modId: string;
  }>[];
}>;

export type ProfileSaveRow = Readonly<{
  profile_id: string;
  mod_id_entry_id: string;
  enabled: boolean;
  load_order: number;
}>;
export type DownloadSaveRow = Readonly<{
  profile_id: string;
  workshop_id: string;
  load_order: number;
}>;

export type ProfileSavePlan =
  | Readonly<{
    ok: true;
    expectedRevision: number;
    choices: readonly ProfileSaveRow[];
    downloads: readonly DownloadSaveRow[];
  }>
  | Readonly<{ ok: false; reason: "invalid" | "forbidden" | "stale" | "unresolved" | "ambiguous" }>;

/**
 * Read-only persistence plan. No insert/update/DELETE is performed here.
 *
 * A future API must fetch the trusted context itself, enforce OAuth, RLS,
 * same-origin, deployment allowlists, and write rows atomically with revision CAS.
 * It must also preserve legacy profile_mods until a reviewed migration.
 */
export function planProfileSave(
  input: unknown,
  context: TrustedProfileSaveContext
): ProfileSavePlan {
  const fail = (reason: "invalid" | "forbidden" | "stale" | "unresolved" | "ambiguous"): ProfileSavePlan =>
    ({ ok: false, reason });
  if (!isCatalogModUuid(context.signedInOwnerId)
    || !isCatalogModUuid(context.profile.ownerId)
    || !isCatalogModUuid(context.profile.id)
    || context.signedInOwnerId !== context.profile.ownerId) {
    return fail("forbidden");
  }
  if (!Number.isSafeInteger(context.profile.revision) || context.profile.revision < 0) {
    return fail("invalid");
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("invalid");
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some(key =>
    !["profileId", "expectedRevision", "selections", "downloadOnlyWorkshopIds"].includes(key))) {
    return fail("invalid");
  }
  if (raw.profileId !== context.profile.id) return fail("forbidden");
  if (!Number.isSafeInteger(raw.expectedRevision) || (raw.expectedRevision as number) < 0
    || (raw.expectedRevision as number) > MAX_REVISION) return fail("invalid");
  if (raw.expectedRevision !== context.profile.revision) return fail("stale");
  if (!Array.isArray(raw.selections) || raw.selections.length > MAX_PROFILE_ROWS
    || !Array.isArray(raw.downloadOnlyWorkshopIds)
    || raw.downloadOnlyWorkshopIds.length > MAX_PROFILE_ROWS) return fail("invalid");

  // Reject any mixed-owner catalog snapshot, even if that row is not selected.
  const candidates = new Map<string, Readonly<{ entryId: string; ownerId: string; workshopId: string; modId: string }>>();
  const pairToId = new Map<string, string>();
  for (const candidate of context.candidates) {
    const workshopId = canonicalWorkshopId(candidate.workshopId);
    if (!isCatalogModUuid(candidate.entryId) || candidate.ownerId !== context.signedInOwnerId) {
      return fail("forbidden");
    }
    if (!workshopId || workshopId !== candidate.workshopId || !validGameModId(candidate.modId)) {
      return fail("invalid");
    }
    const pair = JSON.stringify([workshopId, candidate.modId]);
    if (pairToId.has(pair) && pairToId.get(pair) !== candidate.entryId) return fail("ambiguous");
    if (candidates.has(candidate.entryId)) {
      const prior = candidates.get(candidate.entryId)!;
      if (prior.workshopId !== candidate.workshopId || prior.modId !== candidate.modId) {
        return fail("ambiguous");
      }
    }
    pairToId.set(pair, candidate.entryId);
    candidates.set(candidate.entryId, candidate);
  }

  const choices: ProfileSaveRow[] = [];
  const usedPairs = new Set<string>();
  const usedEntries = new Set<string>();
  for (const item of raw.selections) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail("invalid");
    const selection = item as Record<string, unknown>;
    if (Object.keys(selection).some(key =>
      !["workshopId", "modId", "enabled", "modIdUuid"].includes(key))) return fail("invalid");
    const workshopId = canonicalWorkshopId(selection.workshopId);
    if (!workshopId || selection.workshopId !== workshopId
      || !validGameModId(selection.modId) || typeof selection.enabled !== "boolean") {
      return fail("invalid");
    }
    if (selection.modIdUuid !== undefined &&
      (typeof selection.modIdUuid !== "string" || !isCatalogModUuid(selection.modIdUuid))) {
      return fail("invalid");
    }
    const pair = JSON.stringify([workshopId, selection.modId]);
    if (usedPairs.has(pair)) return fail("ambiguous");
    usedPairs.add(pair);
    const entryId = pairToId.get(pair);
    if (!entryId || (selection.modIdUuid && selection.modIdUuid !== entryId)) return fail("unresolved");
    if (usedEntries.has(entryId)) return fail("ambiguous");
    usedEntries.add(entryId);
    choices.push({ profile_id: context.profile.id, mod_id_entry_id: entryId,
      enabled: selection.enabled, load_order: choices.length });
  }

  const downloads: DownloadSaveRow[] = [];
  const seenDownloads = new Set<string>();
  for (const rawId of raw.downloadOnlyWorkshopIds) {
    const workshopId = canonicalWorkshopId(rawId);
    if (!workshopId || workshopId !== rawId) return fail("invalid");
    if (seenDownloads.has(workshopId)) return fail("ambiguous");
    seenDownloads.add(workshopId);
    downloads.push({ profile_id: context.profile.id, workshop_id: workshopId, load_order: downloads.length });
  }
  return { ok: true, expectedRevision: context.profile.revision, choices, downloads };
}
