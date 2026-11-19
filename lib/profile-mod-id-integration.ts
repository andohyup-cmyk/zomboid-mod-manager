import { insertProfileModsByCategory } from "./profile-category-insertion";
import type { ProfileModSelection } from "./profile-mod-id-state";
import {
  validateProfileSelection,
  type ProfileCatalogEntry,
  type ProfileSelectionResult,
  type ProfileSelectionWarning
} from "./profile-selection";

export type ProfileModAddition = Omit<ProfileModSelection, "enabled" | "loadOrder">;

export type ProfileModAddResult =
  | { ok: true; selections: ProfileModSelection[]; warnings: ProfileSelectionWarning[] }
  | Extract<ProfileSelectionResult, { ok: false }>;

/** Validates an entire batch before inserting its ordered Workshop and Mod ID pairs. */
export function addProfileModSelections(
  catalog: readonly ProfileCatalogEntry[],
  selections: readonly ProfileModSelection[],
  candidates: readonly ProfileModAddition[]
): ProfileModAddResult {
  const validation = validateProfileSelection(catalog, candidates);
  if (!validation.ok) return validation;

  const additions: ProfileModSelection[] = candidates.map((candidate) => ({
    workshopId: candidate.workshopId.trim(),
    modId: candidate.modId.trim(),
    primaryCategoryId: candidate.primaryCategoryId,
    tags: candidate.tags,
    modIdUuid: candidate.modIdUuid,
    enabled: true
  }));

  return {
    ok: true,
    selections: insertProfileModsByCategory(selections, additions),
    warnings: validation.warnings
  };
}
