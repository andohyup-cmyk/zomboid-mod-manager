import type { SavedModIdentity } from "./saved-profile-output";
import type { ReviewedRelationRow } from "./reviewed-mod-relations";

export type RelationCoveragePlan =
  | Readonly<{
      ok: true;
      relevant: readonly ReviewedRelationRow[];
      missingTargetUuids: readonly string[];
    }>
  | Readonly<{ ok: false; reason: "unbounded" | "invalid-selection" | "invalid-relation" }>;

/**
 * A saved profile contains only its explicit choices. Verified requires-rules
 * still need the *catalog identities* of unselected target mods to detect
 * missing requirements. Fetch those identities for evaluation ONLY:
 * never append them to the saved selections, Mods=, or WorkshopItems=.
 *
 * Ignore relations whose subjects are not part of this saved profile.
 * Callers must fetch rows through owner-scoped RLS before calling this.
 */
export function planSavedRelationTargetCoverage(
  selectedIdentities: readonly SavedModIdentity[],
  ownerRelationRows: readonly ReviewedRelationRow[]
): RelationCoveragePlan {
  if (selectedIdentities.length > 500 || ownerRelationRows.length > 500) {
    return { ok: false, reason: "unbounded" };
  }
  const saved = new Set<string>();
  for (const identity of selectedIdentities) {
    if (!identity.modIdUuid || saved.has(identity.modIdUuid)) {
      return { ok: false, reason: "invalid-selection" };
    }
    saved.add(identity.modIdUuid);
  }

  const relevant: ReviewedRelationRow[] = [];
  const missingTargets = new Set<string>();
  for (const row of ownerRelationRows) {
    if (!saved.has(row.subjectModIdUuid)) continue;
    if (!row.id || !row.targetModIdUuid) {
      return { ok: false, reason: "invalid-relation" };
    }
    relevant.push(row);
    if (!saved.has(row.targetModIdUuid)) missingTargets.add(row.targetModIdUuid);
  }
  return { ok: true, relevant, missingTargetUuids: [...missingTargets] };
}
