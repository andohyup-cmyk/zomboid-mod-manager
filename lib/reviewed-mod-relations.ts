import type { EvidenceSummary } from "./catalog-evidence-output";
import type { SavedModIdentity } from "./saved-profile-output";
import type { ProfileOrderRule } from "./profile-mod-recommended-order";

export type ReviewedRelationKind = "requires" | "incompatibleMods" | "loadBefore" | "loadAfter";

/**
 * Proposed future persisted row, NOT a new database table or public API.
 * These records must come from owner-restricted DB queries, not client JSON.
 */
export type ReviewedRelationRow = Readonly<{
  id: string;
  ownerId: string;
  kind: ReviewedRelationKind;
  subjectModIdUuid: string;
  targetModIdUuid: string;
  evidenceRecordId: string;
  sourceUrl: string;
  checkedAt: string;
  approved: boolean;
}>;

export type WithheldRelation = Readonly<{
  id: string;
  reason: "not-approved" | "missing-catalog-identity" | "missing-approved-evidence";
}>;

export type ReviewedRelationsResult =
  | Readonly<{ ok: true; rules: readonly ProfileOrderRule[]; withheld: readonly WithheldRelation[] }>
  | Readonly<{ ok: false; reason: "too-many" | "foreign-owner" | "invalid-identity" | "duplicate-relation" | "invalid-relation" | "ambiguous-evidence" }>;

/** No user-provided text can become a verified blocking rule without review. */
function validEvidenceUrl(value: string): boolean {
  if (!value || value.length > 2000 || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:")
      && !url.username && !url.password && url.hash.length === 0;
  } catch {
    return false;
  }
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function reference(id: SavedModIdentity) {
  return { workshopId: id.workshopId, modId: id.modId };
}

/**
 * Fail closed for corrupt/foreign input, withhold otherwise unproven rules.
 * Provider-qualified identities prevent same game Mod ID across different
 * Workshops from being conflated. Does NOT modify order or activate Mods.
 */
export function projectReviewedRelations(
  ownerId: string,
  identities: readonly SavedModIdentity[],
  evidence: readonly EvidenceSummary[],
  rows: readonly ReviewedRelationRow[]
): ReviewedRelationsResult {
  if (!ownerId || identities.length > 1000 || evidence.length > 1000 || rows.length > 500) {
    return { ok: false, reason: "too-many" };
  }
  const byUuid = new Map<string, SavedModIdentity>();
  const byPair = new Set<string>();
  for (const identity of identities) {
    if (!identity.modIdUuid || !identity.workshopId || !identity.modId
      || byUuid.has(identity.modIdUuid)) return { ok: false, reason: "invalid-identity" };
    const pair = JSON.stringify([identity.workshopId, identity.modId]);
    if (byPair.has(pair)) return { ok: false, reason: "invalid-identity" };
    byPair.add(pair);
    byUuid.set(identity.modIdUuid, identity);
  }
  const evidenceByWorkshop = new Map<string, EvidenceSummary>();
  for (const record of evidence) {
    if (!record.workshopId || evidenceByWorkshop.has(record.workshopId)) {
      return { ok: false, reason: "ambiguous-evidence" };
    }
    evidenceByWorkshop.set(record.workshopId, record);
  }
  const rules: ProfileOrderRule[] = [];
  const withheld: WithheldRelation[] = [];
  const ids = new Set<string>();
  const relations = new Set<string>();
  for (const row of rows) {
    if (row.ownerId !== ownerId) return { ok: false, reason: "foreign-owner" };
    if (typeof row.id !== "string" || !row.id
      || ids.has(row.id)) return { ok: false, reason: "duplicate-relation" };
    ids.add(row.id);
    if (!["requires", "incompatibleMods", "loadBefore", "loadAfter"].includes(row.kind)
      || typeof row.subjectModIdUuid !== "string"
      || typeof row.targetModIdUuid !== "string"
      || typeof row.evidenceRecordId !== "string"
      || typeof row.checkedAt !== "string"
      || typeof row.sourceUrl !== "string"
      || typeof row.approved !== "boolean"
      || !row.subjectModIdUuid || !row.targetModIdUuid
      || row.subjectModIdUuid === row.targetModIdUuid) {
      return { ok: false, reason: "invalid-relation" };
    }
    const key = JSON.stringify(row.kind === "incompatibleMods"
      ? [row.kind, ...[row.subjectModIdUuid, row.targetModIdUuid].sort()]
      : [row.kind, row.subjectModIdUuid, row.targetModIdUuid]);
    if (relations.has(key)) return { ok: false, reason: "duplicate-relation" };
    relations.add(key);

    if (!row.approved) {
      withheld.push({ id: row.id, reason: "not-approved" });
      continue;
    }
    const subject = byUuid.get(row.subjectModIdUuid);
    const target = byUuid.get(row.targetModIdUuid);
    if (!subject || !target) {
      withheld.push({ id: row.id, reason: "missing-catalog-identity" });
      continue;
    }
    const sourceEvidence = evidenceByWorkshop.get(subject.workshopId);
    if (!sourceEvidence
      || sourceEvidence.reason !== "matched-approved-record"
      || sourceEvidence.researchRecordId !== row.evidenceRecordId
      || sourceEvidence.checkedAt !== row.checkedAt
      || !validDate(row.checkedAt)
      || !validEvidenceUrl(row.sourceUrl)
      || !sourceEvidence.sources.includes(row.sourceUrl)) {
      withheld.push({ id: row.id, reason: "missing-approved-evidence" });
      continue;
    }
    rules.push({
      kind: row.kind,
      mod: reference(subject),
      target: reference(target),
      evidence: {
        verified: true,
        source: row.sourceUrl,
        checkedAt: row.checkedAt
      }
    });
  }
  return { ok: true, rules, withheld };
}
