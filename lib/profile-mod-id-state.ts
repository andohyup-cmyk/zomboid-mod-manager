type ProfileModIdentity = {
  readonly workshopId: string;
  readonly modId: string;
};

export type ProfileModSelection = ProfileModIdentity & {
  readonly enabled: boolean;
  readonly primaryCategoryId?: string | null;
  readonly tags?: readonly string[];
  readonly modIdUuid?: string;
  readonly loadOrder?: number;
};

/**
 * Changes one existing selection in a profile. IDs are compared case-sensitively
 * after trimming. Missing selections leave the list contents unchanged.
 */
export function updateProfileModState(
  selections: readonly ProfileModSelection[],
  target: ProfileModIdentity,
  action: "enable" | "disable" | "remove"
): ProfileModSelection[] {
  const workshopId = target.workshopId.trim();
  const modId = target.modId.trim();
  const index = selections.findIndex((selection) =>
    selection.workshopId.trim() === workshopId && selection.modId.trim() === modId
  );
  const result = [...selections];
  if (index < 0) return result;

  if (action === "remove") {
    result.splice(index, 1);
  } else {
    const selection = result[index];
    const enabled = action === "enable";
    if (selection.enabled !== enabled) {
      result[index] = { ...selection, enabled };
    }
  }

  return result;
}

/** Returns the enabled selections in their profile order. */
export function getEnabledProfileMods<T extends ProfileModSelection>(selections: readonly T[]): T[] {
  return selections.filter((selection) => selection.enabled);
}
