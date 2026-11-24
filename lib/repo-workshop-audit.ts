import rawRepoAudit from "../tests/fixtures/zomboid-workshop-audit-20261123-2334.json";
import {
  parseLocalWorkshopInventory,
  type LocalWorkshopInventory
} from "./local-workshop-inventory";
import { normalizeGameModId } from "./mod-detail-edit";
import type { ResearchRecord } from "./workshop";

export const REPO_AUDIT_FILENAME = "zomboid-workshop-audit-20261123-2334.json";

let cachedInventory: LocalWorkshopInventory | null = null;

/** Load and cache the repository's PC mod.info audit fixture via the standard validator. */
export function getRepoWorkshopInventory(): LocalWorkshopInventory {
  if (cachedInventory) return cachedInventory;
  const parsed = parseLocalWorkshopInventory(rawRepoAudit);
  if (!parsed.ok) {
    throw new Error(`Invalid repository PC audit fixture: ${parsed.error}`);
  }
  cachedInventory = parsed.inventory;
  return cachedInventory;
}

export function getRepoAuditSummary() {
  const inventory = getRepoWorkshopInventory();
  const workshops = new Set<string>();
  const modIds = new Set<string>();
  for (const entry of inventory.mods) {
    workshops.add(entry.workshopId);
    const normalized = normalizeGameModId(entry.modId);
    if (normalized) modIds.add(normalized);
  }
  return {
    fileName: REPO_AUDIT_FILENAME,
    targetBuild: inventory.targetBuild,
    scannedAtUtc: inventory.scannedAtUtc,
    workshopCount: workshops.size,
    modIdCount: modIds.size
  };
}

/**
 * Fill empty modIds on Steam-fetched registration candidates using a PC mod.info inventory.
 * Never alters compatibility statuses, never activates Mod IDs in profiles,
 * and never overwrites non-empty modIds.
 */
export function attachPcModIdsToResearchRecords(
  records: readonly ResearchRecord[],
  inventory: LocalWorkshopInventory = getRepoWorkshopInventory()
): ResearchRecord[] {
  const byWorkshop = new Map<string, string[]>();
  for (const entry of inventory.mods) {
    const normalized = normalizeGameModId(entry.modId);
    if (!normalized) continue;
    const list = byWorkshop.get(entry.workshopId) ?? [];
    if (!list.includes(normalized)) list.push(normalized);
    byWorkshop.set(entry.workshopId, list);
  }

  return records.map((record) => {
    if (record.modIds.length > 0) return record;
    const scanned = byWorkshop.get(record.workshopId);
    if (!scanned || scanned.length === 0) return record;
    return {
      ...record,
      modIds: [...scanned]
    };
  });
}
