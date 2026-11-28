import { canonicalWorkshopId, normalizeResearchRecord, type VerificationStatus } from "./workshop";
import type { ServerConfigInput } from "./server-config";
import type { SavedModIdentity } from "./saved-profile-output";

/** Rows must be queried with owner-scoped Supabase RLS, never client-supplied. */
export type CatalogEvidenceParent = Readonly<{
  id: string;
  owner_id: string;
  workshop_id: string;
  source_url: string;
  verification_status: string;
  build_compatibility: string;
  multiplayer_compatibility: string;
  researched_at: string | null;
  is_archived: boolean;
}>;

export type CatalogEvidenceRecord = Readonly<{
  id: string;
  mod_id: string;
  raw_payload: unknown;
  created_at: string;
}>;

export type EvidenceSummary = Readonly<{
  workshopId: string;
  researchRecordId: string | null;
  checkedAt: string | null;
  sources: readonly string[];
  recordedBuildClaim: VerificationStatus;
  recordedMultiplayerClaim: VerificationStatus;
  evaluatedBuild42_22: VerificationStatus;
  evaluatedMultiplayer: VerificationStatus;
  reason: "matched-approved-record" | "missing-record" | "ambiguous-records" | "unmatched-record" | "missing-evidence";
}>;

type CatalogEntry = ServerConfigInput["catalog"][number];

export type CatalogEvidenceProjection =
  | Readonly<{
      ok: true;
      catalog: readonly CatalogEntry[];
      archivedWorkshopIds: readonly string[];
      evidence: readonly EvidenceSummary[];
    }>
  | Readonly<{ ok: false; reason: "foreign-owner" | "invalid-parent" | "duplicate-parent" | "unknown-source" | "unbounded" }>;

const STATUSES = new Set<VerificationStatus>(["unverified", "confirmed", "reported_issue"]);
function status(value: string): VerificationStatus {
  return STATUSES.has(value as VerificationStatus) ? value as VerificationStatus : "unverified";
}
function dateMatch(actual: string | null, expected: string | null): boolean {
  return actual !== null && expected !== null && actual === expected
    && /^\d{4}-\d{2}-\d{2}$/.test(actual);
}

/**
 * Only faithfully matching, already approved research is used as a source of
 * catalog-recorded claims. A generic Build 42 claim is NEVER promoted to
 * Build 42.22 verified compatibility: the current schema has no build scope.
 *
 * This is a data provenance check, not live Steam or multiplayer verification.
 */
export function projectCatalogEvidence(
  ownerId: string,
  sources: readonly SavedModIdentity[],
  parents: readonly CatalogEvidenceParent[],
  researchRecords: readonly CatalogEvidenceRecord[]
): CatalogEvidenceProjection {
  if (sources.length > 500 || parents.length > 500 || researchRecords.length > 1000) {
    return { ok: false, reason: "unbounded" };
  }

  const parentByWorkshop = new Map<string, CatalogEvidenceParent>();
  const parentById = new Map<string, CatalogEvidenceParent>();
  for (const parent of parents) {
    if (parent.owner_id !== ownerId) return { ok: false, reason: "foreign-owner" };
    if (!parent.id || !parent.workshop_id ||
      canonicalWorkshopId(parent.workshop_id) !== parent.workshop_id) {
      return { ok: false, reason: "invalid-parent" };
    }
    if (parentByWorkshop.has(parent.workshop_id) || parentById.has(parent.id)) {
      return { ok: false, reason: "duplicate-parent" };
    }
    parentByWorkshop.set(parent.workshop_id, parent);
    parentById.set(parent.id, parent);
  }

  const modIdsByWorkshop = new Map<string, Set<string>>();
  for (const source of sources) {
    if (!source.modId || !source.modIdUuid) return { ok: false, reason: "unknown-source" };
    if (!parentByWorkshop.has(source.workshopId)) return { ok: false, reason: "unknown-source" };
    const members = modIdsByWorkshop.get(source.workshopId) ?? new Set<string>();
    members.add(source.modId);
    modIdsByWorkshop.set(source.workshopId, members);
  }

  const recordsByParent = new Map<string, CatalogEvidenceRecord[]>();
  for (const row of researchRecords) {
    if (!row.id || !parentById.has(row.mod_id)) return { ok: false, reason: "unknown-source" };
    const records = recordsByParent.get(row.mod_id) ?? [];
    records.push(row);
    recordsByParent.set(row.mod_id, records);
  }

  const catalog: CatalogEntry[] = [];
  const evidence: EvidenceSummary[] = [];
  const archivedWorkshopIds: string[] = [];
  for (const [workshopId, modIds] of modIdsByWorkshop) {
    const parent = parentByWorkshop.get(workshopId)!;
    if (parent.is_archived) archivedWorkshopIds.push(workshopId);
    const rows = recordsByParent.get(parent.id) ?? [];
    let reason: EvidenceSummary["reason"] = rows.length === 0 ? "missing-record"
      : rows.length > 1 ? "ambiguous-records" : "unmatched-record";
    let checkedAt: string | null = null;
    let selectedSources: string[] = [];
    let researchRecordId: string | null = null;
    let multiplayer: VerificationStatus = "unverified";

    if (rows.length === 1) {
      const row = rows[0];
      const parsed = normalizeResearchRecord(row.raw_payload);
      const record = parsed.record;
      const sourceMatch = record && record.workshopId === workshopId
        && record.sourceUrl === parent.source_url
        && record.verificationStatus === parent.verification_status
        && record.buildCompatibility === parent.build_compatibility
        && record.multiplayerCompatibility === parent.multiplayer_compatibility
        && dateMatch(record.checkedAt, parent.researched_at)
        && [...modIds].every(id => record.modIds.includes(id));
      if (sourceMatch && record) {
        researchRecordId = row.id;
        checkedAt = record.checkedAt;
        selectedSources = [...new Set(record.sources)];
        if (selectedSources.length > 0) {
          reason = "matched-approved-record";
          multiplayer = status(parent.multiplayer_compatibility);
        } else {
          reason = "missing-evidence";
        }
      }
    }

    // Missing build-version scope: do not treat a generic B42 claim as B42.22 proof.
    const build: VerificationStatus = "unverified";
    evidence.push({
      workshopId, researchRecordId, checkedAt, sources: selectedSources,
      recordedBuildClaim: status(parent.build_compatibility),
      recordedMultiplayerClaim: status(parent.multiplayer_compatibility),
      evaluatedBuild42_22: build,
      evaluatedMultiplayer: multiplayer,
      reason
    });
    catalog.push({
      workshopId,
      modIds: [...modIds],
      modMetadata: [...modIds].map(modId => ({
        modId,
        buildCompatibility: build,
        multiplayerCompatibility: multiplayer
        // No dependencyReviewSource: current DB has no vetted relation structure.
      }))
    });
  }
  return { ok: true, catalog, archivedWorkshopIds, evidence };
}
