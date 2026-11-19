export type ProfileCatalogEntry = {
  readonly workshopId: string;
  readonly modIds: readonly string[];
};

export type ProfileSelection = {
  readonly workshopId?: string | null;
  readonly modId?: string | null;
};

export type ProfileSelectionError =
  | { index: number; code: "missing-workshop-id" | "missing-mod-id" }
  | { index: number; code: "unknown-workshop-id"; workshopId: string }
  | { index: number; code: "unknown-mod-id"; workshopId: string; modId: string };

export type ProfileSelectionWarning = {
  code: "duplicate-mod-id";
  modId: string;
  workshopIds: string[];
};

export type ProfileSelectionResult =
  | { ok: true; modIds: string[]; workshopIds: string[]; warnings: ProfileSelectionWarning[] }
  | { ok: false; errors: ProfileSelectionError[]; warnings: ProfileSelectionWarning[] };

/**
 * Validates explicit selections against known Workshop and Mod ID pairs.
 * Error indexes are zero-based. Each duplicate warning lists all known providers of the selected ID.
 */
export function validateProfileSelection(
  catalog: readonly ProfileCatalogEntry[],
  selections: readonly ProfileSelection[]
): ProfileSelectionResult {
  const catalogWorkshopIds = new Set<string>();
  const workshopsByModId = new Map<string, Set<string>>();

  for (const { workshopId, modIds } of catalog) {
    catalogWorkshopIds.add(workshopId);
    for (const modId of modIds) {
      let providers = workshopsByModId.get(modId);
      if (!providers) {
        providers = new Set<string>();
        workshopsByModId.set(modId, providers);
      }
      providers.add(workshopId);
    }
  }

  const errors: ProfileSelectionError[] = [];
  const warningsByModId = new Map<string, ProfileSelectionWarning>();
  const modIds: string[] = [];
  const workshopIds = new Set<string>();

  selections.forEach((selection, index) => {
    const workshopId = selection.workshopId?.trim();
    const modId = selection.modId?.trim();
    if (!workshopId) errors.push({ index, code: "missing-workshop-id" });
    if (!modId) errors.push({ index, code: "missing-mod-id" });
    if (!workshopId || !modId) return;

    if (!catalogWorkshopIds.has(workshopId)) {
      errors.push({ index, code: "unknown-workshop-id", workshopId });
      return;
    }

    const providers = workshopsByModId.get(modId);
    if (!providers?.has(workshopId)) {
      errors.push({ index, code: "unknown-mod-id", workshopId, modId });
      return;
    }

    modIds.push(modId);
    workshopIds.add(workshopId);
    if (providers.size > 1 && !warningsByModId.has(modId)) {
      warningsByModId.set(modId, {
        code: "duplicate-mod-id",
        modId,
        workshopIds: [...providers]
      });
    }
  });

  const warnings = [...warningsByModId.values()];
  if (errors.length > 0) return { ok: false, errors, warnings };
  return { ok: true, modIds, workshopIds: [...workshopIds], warnings };
}
