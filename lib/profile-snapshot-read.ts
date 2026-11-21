import { canonicalWorkshopId } from "./workshop";

export type SnapshotStoredChoice = Readonly<{
  mod_id_entry_id: string;
  enabled: boolean;
  load_order: number;
}>;
export type SnapshotStoredDownload = Readonly<{
  workshop_id: string;
  load_order: number;
}>;
export type SnapshotCatalogEntry = Readonly<{
  id: string;
  mod_id: string;
  value: string;
}>;
export type SnapshotCatalogParent = Readonly<{
  id: string;
  owner_id: string;
  workshop_id: string;
}>;
export type LoadedProfileSnapshot = Readonly<{
  selections: readonly Readonly<{
    workshopId: string;
    modId: string;
    modIdUuid: string;
    enabled: boolean;
  }>[];
  downloadOnlyWorkshopIds: readonly string[];
}>;

export function reconstructProfileSnapshot(
  ownerId: string,
  choices: readonly SnapshotStoredChoice[],
  downloads: readonly SnapshotStoredDownload[],
  entries: readonly SnapshotCatalogEntry[],
  parents: readonly SnapshotCatalogParent[]
): LoadedProfileSnapshot | null {
  if (choices.length > 500 || downloads.length > 500) return null;
  const parentById = new Map(parents.map(parent => [parent.id, parent]));
  const entryById = new Map(entries.map(entry => [entry.id, entry]));
  if (parentById.size !== parents.length || entryById.size !== entries.length) return null;
  const seenEntries = new Set<string>();
  const selections: Array<{ workshopId: string; modId: string; modIdUuid: string; enabled: boolean }> = [];
  for (const choice of choices) {
    if (choice.load_order !== selections.length || typeof choice.enabled !== "boolean"
      || seenEntries.has(choice.mod_id_entry_id)) return null;
    seenEntries.add(choice.mod_id_entry_id);
    const entry = entryById.get(choice.mod_id_entry_id);
    const parent = entry && parentById.get(entry.mod_id);
    if (!entry || !parent || parent.owner_id !== ownerId
      || canonicalWorkshopId(parent.workshop_id) !== parent.workshop_id
      || !entry.value || entry.value !== entry.value.trim()) return null;
    selections.push({
      workshopId: parent.workshop_id,
      modId: entry.value,
      modIdUuid: entry.id,
      enabled: choice.enabled
    });
  }

  const seenDownloads = new Set<string>();
  const downloadOnlyWorkshopIds: string[] = [];
  for (const download of downloads) {
    if (download.load_order !== downloadOnlyWorkshopIds.length
      || canonicalWorkshopId(download.workshop_id) !== download.workshop_id
      || seenDownloads.has(download.workshop_id)) return null;
    seenDownloads.add(download.workshop_id);
    downloadOnlyWorkshopIds.push(download.workshop_id);
  }
  return { selections, downloadOnlyWorkshopIds };
}
