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
 * All saved choices (including disabled ones) are still available as trusted
 * target identities. Only ENABLED subjects can affect output. Unapproved rows
 * are visible as withheld evidence, but must not trigger a secondary catalog
 * lookup: they cannot produce a verified rule.
 *
 * Callers must supply only owner-scoped RLS rows. The active UUID list must
 * be derived from the saved profile revision, NOT the request parameters.
 *
 * No identities are appended to saved selections, Mods= or WorkshopItems=.
 */
export function planSavedRelationTargetCoverage(
  selectedIdentities: readonly SavedModIdentity[],
  ownerRelationRows: readonly ReviewedRelationRow[],
  activeSubjectUuids: readonly string[] = selectedIdentities.map(source => source.modIdUuid)
): RelationCoveragePlan {
  if (selectedIdentities.length > 500 || ownerRelationRows.length > 500
    || activeSubjectUuids.length > 500) {
    return { ok: false, reason: "unbounded" };
  }
  const saved = new Set<string>();
  for (const identity of selectedIdentities) {
    if (!identity.modIdUuid || saved.has(identity.modIdUuid)) {
      return { ok: false, reason: "invalid-selection" };
    }
    saved.add(identity.modIdUuid);
  }

  const active = new Set<string>();
  for (const id of activeSubjectUuids) {
    if (!id || active.has(id) || !saved.has(id)) {
      return { ok: false, reason: "invalid-selection" };
    }
    active.add(id);
  }

  const relevant: ReviewedRelationRow[] = [];
  const missingTargets = new Set<string>();
  for (const row of ownerRelationRows) {
    if (!active.has(row.subjectModIdUuid)) continue;
    if (!row.id || !row.targetModIdUuid || typeof row.approved !== "boolean") {
      return { ok: false, reason: "invalid-relation" };
    }
    relevant.push(row);
    // Preserve unapproved rows in the withheld report, but never resolve
    // or activate their targets as trusted dependencies.
    if (row.approved && !saved.has(row.targetModIdUuid)) {
      missingTargets.add(row.targetModIdUuid);
    }
  }
  return { ok: true, relevant, missingTargetUuids: [...missingTargets] };
}
