import "server-only";
import type { getOwnerAccess } from "./auth";
import type { DraftRelationInput } from "./mod-relation-review-input";
import { projectCatalogEvidence, type CatalogEvidenceParent } from "./catalog-evidence-output";
import { projectReviewedRelations } from "./reviewed-mod-relations";
import type { SavedModIdentity } from "./saved-profile-output";

type AuthorizedAccess = Extract<Awaited<ReturnType<typeof getOwnerAccess>>, { kind: "authorized" }>;

/**
 * This verification is performed both when an owner drafts a relation and
 * immediately before its separate explicit approval. SQL RLS repeats the
 * owner, source, date, and candidate checks to prevent direct Data API bypass.
 */
export async function verifyOwnerRelationEvidence(
  access: AuthorizedAccess,
  draft: DraftRelationInput
): Promise<boolean> {
  const { data: modEntries, error: entriesError } = await access.supabase
    .from("mod_ids").select("id,mod_id,value")
    .in("id", [draft.subjectModIdUuid, draft.targetModIdUuid]).limit(3);
  if (entriesError || !modEntries || modEntries.length !== 2) return false;
  const entryById = new Map(modEntries.map(entry => [entry.id, entry]));
  const subject = entryById.get(draft.subjectModIdUuid);
  const target = entryById.get(draft.targetModIdUuid);
  if (!subject || !target) return false;

  const parentIds = [...new Set([subject.mod_id, target.mod_id])];
  const { data: modParents, error: parentsError } = await access.supabase.from("mods")
    .select("id,owner_id,workshop_id,source_url,verification_status,build_compatibility,multiplayer_compatibility,researched_at,is_archived")
    .eq("owner_id", access.user.id).in("id", parentIds).limit(3);
  if (parentsError || !modParents || modParents.length !== parentIds.length) return false;
  const byParent = new Map<string, CatalogEvidenceParent>(
    modParents.map(parent => [parent.id, parent])
  );
  const subjectParent = byParent.get(subject.mod_id);
  const targetParent = byParent.get(target.mod_id);
  if (!subjectParent || !targetParent) return false;

  // More than one approved research record is ambiguous. In that case no
  // relationship can be upgraded to verified without an explicit new design.
  const { data: research, error: researchError } = await access.supabase.from("research_records")
    .select("id,mod_id,raw_payload,created_at")
    .eq("mod_id", subject.mod_id).limit(2);
  if (researchError || !research || research.length !== 1
    || research[0].id !== draft.evidenceRecordId) return false;

  const identities: SavedModIdentity[] = [
    { modIdUuid: subject.id, modId: subject.value, workshopId: subjectParent.workshop_id },
    { modIdUuid: target.id, modId: target.value, workshopId: targetParent.workshop_id }
  ];
  const projected = projectCatalogEvidence(
    access.user.id, [identities[0]], [subjectParent], research
  );
  if (!projected.ok) return false;

  const reviewed = projectReviewedRelations(
    access.user.id, identities, projected.evidence, [{
      id: "00000000-0000-4000-8000-000000000001",
      ownerId: access.user.id,
      kind: draft.kind,
      subjectModIdUuid: draft.subjectModIdUuid,
      targetModIdUuid: draft.targetModIdUuid,
      evidenceRecordId: draft.evidenceRecordId,
      sourceUrl: draft.sourceUrl,
      checkedAt: draft.checkedAt,
      approved: true
    }]
  );
  return reviewed.ok && reviewed.rules.length === 1 && reviewed.withheld.length === 0;
}
