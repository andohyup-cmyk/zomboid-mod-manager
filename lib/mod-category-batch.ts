import { validateModCategories } from "./mod-category-assignment";

export type BatchCategoryRequest = Readonly<{
  modId: string;
  categoryIds: readonly string[];
  primaryCategoryId: string | null;
}>;

const MAX_BATCH_MODS = 100;

export function toggleBatchModSelection(selected: readonly string[], modId: string): string[] {
  if (selected.includes(modId)) return selected.filter((id) => id !== modId);
  if (selected.length >= MAX_BATCH_MODS) return [...selected];
  return [...selected, modId];
}

export function selectAllBatchMods(visibleModIds: readonly string[]): string[] {
  const unique = [...new Set(visibleModIds)].slice(0, MAX_BATCH_MODS);
  return unique;
}

export function buildBatchCategoryRequests(
  modIds: readonly string[],
  categoryIds: readonly string[],
  primaryCategoryId: string | null
): BatchCategoryRequest[] | null {
  const uniqueMods = [...new Set(modIds)];
  if (uniqueMods.length === 0 || uniqueMods.length > MAX_BATCH_MODS) return null;
  const checked = validateModCategories({ categoryIds, primaryCategoryId });
  if (!checked.ok) return null;
  return uniqueMods.map((modId) => ({
    modId,
    categoryIds: checked.assignment.categoryIds,
    primaryCategoryId: checked.assignment.primaryCategoryId
  }));
}
