export type ProfileCategoryMod = {
  readonly workshopId: string;
  readonly modId: string;
  readonly primaryCategoryId?: string | null;
  readonly tags?: readonly string[];
};

/**
 * Inserts additions in selection order and returns a new list with the original records.
 * IDs are compared case-sensitively after trimming. An absent or blank category appends.
 */
export function insertProfileModsByCategory<T extends ProfileCategoryMod>(
  existing: readonly T[],
  additions: readonly T[]
): T[] {
  const result = [...existing];

  for (const addition of additions) {
    const workshopId = addition.workshopId.trim();
    const modId = addition.modId.trim();
    const alreadySelected = result.some((selected) =>
      selected.workshopId.trim() === workshopId && selected.modId.trim() === modId
    );
    if (alreadySelected) continue;

    const categoryId = addition.primaryCategoryId?.trim();
    let insertIndex = result.length;
    if (categoryId) {
      for (let index = result.length - 1; index >= 0; index--) {
        if (result[index].primaryCategoryId?.trim() === categoryId) {
          insertIndex = index + 1;
          break;
        }
      }
    }

    result.splice(insertIndex, 0, addition);
  }

  return result;
}
