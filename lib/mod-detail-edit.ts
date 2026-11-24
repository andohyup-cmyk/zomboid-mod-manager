import { isCatalogModUuid } from "./catalog-read";
import type { LocalWorkshopInventory } from "./local-workshop-inventory";
import type { ResearchRecord } from "./workshop";

export const COMPATIBILITY_STATUSES = ["unverified", "confirmed", "reported_issue"] as const;
export type CompatibilityStatus = (typeof COMPATIBILITY_STATUSES)[number];

export type ModIdAddInput = Readonly<{
  modId: string;
  values: readonly string[];
}>;

export type BulkModIdBackfillInput = Readonly<{
  items: readonly ModIdAddInput[];
}>;

export type ModIdDeleteInput = Readonly<{
  modId: string;
  modIdEntryId: string;
}>;

export type ModDetailPatch = Readonly<{
  verification_status?: CompatibilityStatus;
  build_compatibility?: CompatibilityStatus;
  multiplayer_compatibility?: CompatibilityStatus;
  researched_at?: string | null;
  description?: string;
}>;

export type PcBackfillCatalogMod = Readonly<{
  id: string;
  title: string;
  workshopId: string;
  existingModIds: readonly string[];
}>;

export type PcBackfillCandidate = Readonly<{
  modId: string;
  title: string;
  workshopId: string;
  existingModIds: readonly string[];
  newModIds: readonly string[];
}>;

export type PcUnregisteredWorkshop = Readonly<{
  workshopId: string;
  modIds: readonly string[];
}>;

export type PcBackfillPlan = Readonly<{
  updates: readonly PcBackfillCandidate[];
  unregistered: readonly PcUnregisteredWorkshop[];
  alreadyCompleteCount: number;
  unmatchedScanWorkshops: number;
}>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_SET = new Set<string>(COMPATIBILITY_STATUSES);
const PATCH_KEYS = new Set([
  "verificationStatus",
  "buildCompatibility",
  "multiplayerCompatibility",
  "researchedAt",
  "description"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Normalize a single game Mod ID value; rejects blanks, control chars, or server-config delimiters. */
export function normalizeGameModId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^\\+/, "").trim();
  if (!cleaned || cleaned.length > 200) return null;
  if (/[\u0000-\u001f\u007f;]/.test(cleaned)) return null;
  return cleaned;
}

/** Parse newline- or comma-separated Mod ID input typed on mobile. */
export function parseModIdText(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\r\n,]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const normalized = normalizeGameModId(trimmed);
    if (!normalized) {
      invalid.push(trimmed);
      continue;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      valid.push(normalized);
    }
  }
  return { valid, invalid };
}

function parseValuesArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const normalized = normalizeGameModId(entry);
    if (!normalized) return null;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out.length > 0 ? out : null;
}

export function parseModIdAddInput(input: unknown): ModIdAddInput | null {
  if (!isRecord(input)) return null;
  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes("modId") || !keys.includes("values")) return null;
  if (typeof input.modId !== "string" || !isCatalogModUuid(input.modId)) return null;
  const values = parseValuesArray(input.values);
  if (!values) return null;
  return { modId: input.modId.toLowerCase(), values };
}

export function parseBulkModIdBackfillInput(input: unknown): BulkModIdBackfillInput | null {
  if (!isRecord(input)) return null;
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "items" || !Array.isArray(input.items)) return null;
  if (input.items.length === 0 || input.items.length > 200) return null;
  const items: ModIdAddInput[] = [];
  const seenMods = new Set<string>();
  for (const rawItem of input.items) {
    const parsed = parseModIdAddInput(rawItem);
    if (!parsed || seenMods.has(parsed.modId)) return null;
    seenMods.add(parsed.modId);
    items.push(parsed);
  }
  return { items };
}

export function parseModIdDeleteInput(input: unknown): ModIdDeleteInput | null {
  if (!isRecord(input)) return null;
  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes("modId") || !keys.includes("modIdEntryId")) return null;
  if (typeof input.modId !== "string" || !isCatalogModUuid(input.modId)) return null;
  if (typeof input.modIdEntryId !== "string" || !isCatalogModUuid(input.modIdEntryId)) return null;
  return { modId: input.modId.toLowerCase(), modIdEntryId: input.modIdEntryId.toLowerCase() };
}

function isValidIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseModDetailPatchInput(
  input: unknown
): { ok: true; patch: ModDetailPatch } | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: "변경 요청 형식이 올바르지 않습니다." };
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some(k => !PATCH_KEYS.has(k))) {
    return { ok: false, error: "수정할 수 없는 필드가 포함되어 있습니다." };
  }

  const patch: {
    verification_status?: CompatibilityStatus;
    build_compatibility?: CompatibilityStatus;
    multiplayer_compatibility?: CompatibilityStatus;
    researched_at?: string | null;
    description?: string;
  } = {};

  if ("verificationStatus" in input) {
    if (typeof input.verificationStatus !== "string" || !STATUS_SET.has(input.verificationStatus)) {
      return { ok: false, error: "조사 상태 값이 올바르지 않습니다." };
    }
    patch.verification_status = input.verificationStatus as CompatibilityStatus;
  }
  if ("buildCompatibility" in input) {
    if (typeof input.buildCompatibility !== "string" || !STATUS_SET.has(input.buildCompatibility)) {
      return { ok: false, error: "B42.22 호환성 값이 올바르지 않습니다." };
    }
    patch.build_compatibility = input.buildCompatibility as CompatibilityStatus;
  }
  if ("multiplayerCompatibility" in input) {
    if (typeof input.multiplayerCompatibility !== "string" || !STATUS_SET.has(input.multiplayerCompatibility)) {
      return { ok: false, error: "멀티 호환성 값이 올바르지 않습니다." };
    }
    patch.multiplayer_compatibility = input.multiplayerCompatibility as CompatibilityStatus;
  }
  if ("researchedAt" in input) {
    if (input.researchedAt === null || input.researchedAt === "") {
      patch.researched_at = null;
    } else if (typeof input.researchedAt === "string" && isValidIsoDate(input.researchedAt)) {
      patch.researched_at = input.researchedAt;
    } else {
      return { ok: false, error: "확인일은 YYYY-MM-DD 형식이어야 합니다." };
    }
  }
  if ("description" in input) {
    if (typeof input.description !== "string" || input.description.length > 4000 || input.description.includes("\u0000")) {
      return { ok: false, error: "설명은 최대 4000자여야 합니다." };
    }
    patch.description = input.description.trim();
  }

  return { ok: true, patch };
}

/**
 * Match a PC workshop mod.info scan against already-registered catalog mods.
 * Only proposes adding missing Mod IDs to existing catalog rows:
 * - never auto-registers uncataloged workshops,
 * - never mutates B42.22 / multiplayer compatibility,
 * - never activates Mod IDs in any profile.
 */
export function planPcModIdBackfill(
  inventory: LocalWorkshopInventory,
  catalogMods: readonly PcBackfillCatalogMod[]
): PcBackfillPlan {
  const byWorkshop = new Map<string, string[]>();
  for (const entry of inventory.mods) {
    const normalized = normalizeGameModId(entry.modId);
    if (!normalized) continue;
    const list = byWorkshop.get(entry.workshopId) ?? [];
    if (!list.includes(normalized)) list.push(normalized);
    byWorkshop.set(entry.workshopId, list);
  }

  const catalogWorkshops = new Set<string>();
  const updates: PcBackfillCandidate[] = [];
  let alreadyCompleteCount = 0;

  for (const mod of catalogMods) {
    catalogWorkshops.add(mod.workshopId);
    const scanned = byWorkshop.get(mod.workshopId);
    if (!scanned || scanned.length === 0) continue;
    const existing = new Set(mod.existingModIds);
    const newModIds = scanned.filter(id => !existing.has(id));
    if (newModIds.length > 0) {
      updates.push({
        modId: mod.id,
        title: mod.title,
        workshopId: mod.workshopId,
        existingModIds: mod.existingModIds,
        newModIds
      });
    } else {
      alreadyCompleteCount += 1;
    }
  }

  const unregistered: PcUnregisteredWorkshop[] = [];
  for (const [workshopId, modIds] of byWorkshop.entries()) {
    if (!catalogWorkshops.has(workshopId)) {
      unregistered.push({ workshopId, modIds });
    }
  }

  return {
    updates,
    unregistered,
    alreadyCompleteCount,
    unmatchedScanWorkshops: unregistered.length
  };
}

/**
 * Build a catalog approval payload for a PC-scanned workshop after explicit user review.
 * Uses Steam public title/description when available, falls back to the first Mod ID + Workshop ID,
 * and always keeps compatibility statuses unverified.
 */
export function buildPcRegistrationPayload(
  workshop: PcUnregisteredWorkshop,
  steamMatch?: ResearchRecord | null,
  checkedAt?: string
): ResearchRecord {
  const sourceUrl = `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshop.workshopId}`;
  const mergedModIds: string[] = [];
  for (const id of [...workshop.modIds, ...(steamMatch?.modIds ?? [])]) {
    if (!mergedModIds.includes(id)) mergedModIds.push(id);
  }
  const fallbackTitle = (workshop.modIds[0]
    ? `${workshop.modIds[0]} (Workshop ${workshop.workshopId})`
    : `Workshop ${workshop.workshopId}`).slice(0, 200);
  const title = (steamMatch?.title?.trim() || fallbackTitle).slice(0, 200);
  return {
    workshopId: workshop.workshopId,
    title,
    description: steamMatch?.description ?? "",
    sourceUrl,
    modIds: mergedModIds,
    verificationStatus: "unverified",
    buildCompatibility: "unverified",
    singleplayerCompatibility: "unverified",
    multiplayerCompatibility: "unverified",
    midServerAdditionCompatibility: "unverified",
    checkedAt: steamMatch?.checkedAt ?? checkedAt ?? null,
    sources: steamMatch?.sources?.length ? [...steamMatch.sources] : [sourceUrl]
  };
}
