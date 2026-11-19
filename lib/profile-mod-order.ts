import type { ProfileModSelection } from "./profile-mod-id-state";

export function profileModKey(selection: Pick<ProfileModSelection, "workshopId" | "modId">): string {
  return JSON.stringify([selection.workshopId.trim(), selection.modId.trim()]);
}

/** Moves one selection between one-based positions, preserving the other selections' order. */
export function moveProfileMod<T>(
  selections: readonly T[],
  from: number,
  to: number
): readonly T[] {
  if (from === to || !Number.isInteger(from) || !Number.isInteger(to)
    || from < 1 || from > selections.length || to < 1 || to > selections.length) {
    return selections;
  }

  const ordered = [...selections];
  const [moved] = ordered.splice(from - 1, 1);
  ordered.splice(to - 1, 0, moved);
  return ordered;
}
