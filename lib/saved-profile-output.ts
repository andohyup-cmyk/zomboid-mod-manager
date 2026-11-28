import type { LoadedProfileSnapshot } from "./profile-snapshot-read";
import type { ProfileOrderPreviewOptions } from "./profile-order-preview";
import type { SelectionGroupRule } from "./selection-groups";
import type { ServerConfigInput, ServerConfigOptions } from "./server-config";
import { buildProfileServerConfig } from "./profile-server-output";

/** Trusted catalog bindings must come from the authenticated owner's DB reads. */
export type SavedModIdentity = Readonly<{
  modIdUuid: string;
  workshopId: string;
  modId: string;
}>;

type OutputInput = Omit<
  ServerConfigInput,
  "selectedMods" | "downloadOnlyWorkshopIds" | "profileRuleIssues"
>;

type OutputResult = ReturnType<typeof buildProfileServerConfig>;
export type SavedProfileOutputResult =
  | Readonly<{ ok: true; report: OutputResult }>
  | Readonly<{ ok: false; reason: "missing-source" | "duplicate-source" | "invalid-snapshot" }>;

/**
 * Connects an immutable, owner-validated saved snapshot to the existing output
 * engine without reordering, auto-enabling, or inventing compatibility evidence.
 * This function does not query or change the DB or the game server.
 */
export function buildSavedProfileOutput(
  snapshot: LoadedProfileSnapshot,
  sourceBindings: readonly SavedModIdentity[],
  input: OutputInput,
  recommendation: ProfileOrderPreviewOptions,
  options: ServerConfigOptions,
  selectionGroups: readonly SelectionGroupRule[] = []
): SavedProfileOutputResult {
  if (snapshot.selections.length > 500 || snapshot.downloadOnlyWorkshopIds.length > 500) {
    return { ok: false, reason: "invalid-snapshot" };
  }

  const sourceByUuid = new Map<string, SavedModIdentity>();
  const sourceByPair = new Set<string>();
  for (const source of sourceBindings) {
    if (!source.modIdUuid || !source.workshopId || !source.modId
      || sourceByUuid.has(source.modIdUuid)) {
      return { ok: false, reason: "duplicate-source" };
    }
    const pair = JSON.stringify([source.workshopId, source.modId]);
    if (sourceByPair.has(pair)) return { ok: false, reason: "duplicate-source" };
    sourceByPair.add(pair);
    sourceByUuid.set(source.modIdUuid, source);
  }

  const used = new Set<string>();
  for (const selection of snapshot.selections) {
    if (used.has(selection.modIdUuid) || typeof selection.enabled !== "boolean") {
      return { ok: false, reason: "invalid-snapshot" };
    }
    used.add(selection.modIdUuid);
    const source = sourceByUuid.get(selection.modIdUuid);
    if (!source || source.workshopId !== selection.workshopId || source.modId !== selection.modId) {
      return { ok: false, reason: "missing-source" };
    }
    if (!input.catalog.some(entry =>
      entry.workshopId === selection.workshopId && entry.modIds.includes(selection.modId))) {
      return { ok: false, reason: "missing-source" };
    }
  }

  const report = buildProfileServerConfig(snapshot.selections, {
    ...input,
    downloadOnlyWorkshopIds: snapshot.downloadOnlyWorkshopIds
  }, recommendation, options, selectionGroups);
  return { ok: true, report };
}
