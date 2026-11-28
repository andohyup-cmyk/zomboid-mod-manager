import type { ProfileModSelection } from "./profile-mod-id-state";
import { describeFreeSelection } from "./group-selection-rule";
import type { SelectionGroupRule } from "./selection-groups";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_GROUP_MEMBERS = 50;

export type SelectionGroupSave = {
  id: string | null;
  label: string;
  minSelected: number | null;
  maxSelected: number | null;
  modIdRefs: string[];
};

export type StoredSelectionGroup = {
  id: string;
  label: string;
  minSelected: number | null;
  maxSelected: number | null;
  verified: boolean;
  evidenceUrl: string | null;
  members: { modIdRef: string; workshopId: string; modId: string }[];
};

function count(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_GROUP_MEMBERS
    ? value : undefined;
}

/** Null min/max = free selection (default). No implicit required/exclusive rule. */
export function parseSelectionGroupSave(input: unknown): SelectionGroupSave | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const keys = Object.keys(row).sort().join(",");
  if (keys !== "id,label,maxSelected,minSelected,modIdRefs") return null;
  if (row.id !== null && (typeof row.id !== "string" || !UUID.test(row.id))) return null;
  if (typeof row.label !== "string" || row.label.trim() !== row.label
    || row.label.length < 1 || row.label.length > 120) return null;
  const min = count(row.minSelected);
  const max = count(row.maxSelected);
  if (min === undefined || max === undefined) return null;
  if (!Array.isArray(row.modIdRefs) || row.modIdRefs.length < 1 || row.modIdRefs.length > MAX_GROUP_MEMBERS
    || row.modIdRefs.some((ref) => typeof ref !== "string" || !UUID.test(ref))) return null;
  const refs = (row.modIdRefs as string[]).map((ref) => ref.toLowerCase());
  if (new Set(refs).size !== refs.length) return null;
  if (min !== null && max !== null && min > max) return null;
  if (max !== null && max > refs.length) return null;
  if (min !== null && min > refs.length) return null;
  return {
    id: row.id === null ? null : (row.id as string).toLowerCase(),
    label: row.label, minSelected: min, maxSelected: max, modIdRefs: refs
  };
}

export function parseSelectionGroupDelete(input: unknown): { id: string } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  if (Object.keys(row).length !== 1 || typeof row.id !== "string" || !UUID.test(row.id)) return null;
  return { id: row.id.toLowerCase() };
}

/** Free groups add no constraint, so only explicit rules are passed to output validation. */
export function toSelectionGroupRules(groups: readonly StoredSelectionGroup[]): SelectionGroupRule[] {
  return groups
    .filter((group) => group.minSelected !== null || group.maxSelected !== null)
    .map((group) => ({
      id: group.id,
      label: group.label,
      members: group.members.map(({ workshopId, modId }) => ({ workshopId, modId })),
      minSelected: group.minSelected ?? 0,
      maxSelected: group.maxSelected ?? group.members.length,
      evidenceUrl: group.evidenceUrl,
      verified: group.verified
    }));
}

export type GroupStatus = { text: string; tone: "ok" | "warn" | "free" };

export function describeGroupStatus(
  group: StoredSelectionGroup,
  selections: readonly Pick<ProfileModSelection, "workshopId" | "modId" | "enabled">[]
): GroupStatus {
  const active = new Set(selections.filter((s) => s.enabled).map((s) => JSON.stringify([s.workshopId, s.modId])));
  const selected = group.members.filter((m) => active.has(JSON.stringify([m.workshopId, m.modId]))).length;
  const total = group.members.length;
  if (group.minSelected === null && group.maxSelected === null) {
    return { text: describeFreeSelection(total, selected), tone: "free" };
  }
  const range = `${group.minSelected ?? 0}~${group.maxSelected ?? total}개`;
  const below = group.minSelected !== null && selected < group.minSelected;
  const above = group.maxSelected !== null && selected > group.maxSelected;
  const note = below ? " · 최소 미달" : above ? " · 최대 초과" : "";
  return { text: `${range} 규칙 · 현재 ${selected}개${note}${group.verified ? "" : " (근거 미확인, 권고)"}`, tone: below || above ? "warn" : "ok" };
}
