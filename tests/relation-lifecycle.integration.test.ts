import assert from "node:assert/strict";
import test from "node:test";
import { parseRelationDraft, parseRelationApproval } from "../lib/mod-relation-review-input";
import { projectCatalogEvidence, type CatalogEvidenceParent } from "../lib/catalog-evidence-output";
import { planSavedRelationTargetCoverage } from "../lib/saved-relation-target-coverage";
import { projectReviewedRelations, type ReviewedRelationRow } from "../lib/reviewed-mod-relations";
import { buildSavedProfileOutput, type SavedModIdentity } from "../lib/saved-profile-output";
import { BACKUP_TABLES, inspectBackupSnapshot } from "../lib/backup-preview";

const owner = "11111111-1111-4111-8111-111111111111";
const relationId = "22222222-2222-4222-8222-222222222222";
const sourceUuid = "33333333-3333-4333-8333-333333333333";
const targetUuid = "44444444-4444-4444-8444-444444444444";
const recordId = "55555555-5555-4555-8555-555555555555";
const evidenceUrl = "https://example.test/fictional-relation-proof";
const date = "2026-11-20";

const main: SavedModIdentity = Object.freeze({
  modIdUuid: sourceUuid, workshopId: "9000099811", modId: "DemoMain"
});
const patch: SavedModIdentity = Object.freeze({
  modIdUuid: targetUuid, workshopId: "9000099812", modId: "DemoPatch"
});

const parent: CatalogEvidenceParent = Object.freeze({
  id: "parent-a", owner_id: owner, workshop_id: main.workshopId,
  source_url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${main.workshopId}`,
  verification_status: "unverified", build_compatibility: "unverified",
  multiplayer_compatibility: "unverified", researched_at: date, is_archived: false
});
const research = Object.freeze({
  id: recordId, mod_id: parent.id, created_at: "2026-11-20T12:00:00Z",
  raw_payload: Object.freeze({
    workshopId: main.workshopId, title: "Test fixture only",
    sourceUrl: parent.source_url, sources: [evidenceUrl],
    checkedAt: date, modIds: [main.modId],
    verificationStatus: "unverified", buildCompatibility: "unverified",
    multiplayerCompatibility: "unverified"
  })
});
const draftInput = Object.freeze({
  kind: "requires",
  subjectModIdUuid: sourceUuid,
  targetModIdUuid: targetUuid,
  evidenceRecordId: recordId,
  sourceUrl: evidenceUrl,
  checkedAt: date
});
const savedOnlyMain = Object.freeze({
  selections: Object.freeze([
    Object.freeze({ ...main, enabled: true })
  ]),
  downloadOnlyWorkshopIds: Object.freeze([] as string[])
});

function examine(approved: boolean, withTargetSelected = false) {
  const draft = parseRelationDraft(draftInput);
  assert.equal(draft.ok, true);
  if (!draft.ok) throw new Error("Fixture draft invalid");
  const row: ReviewedRelationRow = {
    id: relationId, ownerId: owner, kind: draft.value.kind,
    subjectModIdUuid: draft.value.subjectModIdUuid,
    targetModIdUuid: draft.value.targetModIdUuid,
    evidenceRecordId: draft.value.evidenceRecordId,
    sourceUrl: draft.value.sourceUrl, checkedAt: draft.value.checkedAt,
    approved
  };
  const snapshot = withTargetSelected
    ? { selections: [...savedOnlyMain.selections, { ...patch, enabled: true }],
        downloadOnlyWorkshopIds: [] }
    : savedOnlyMain;
  const bindings = snapshot.selections.map(({ modIdUuid, workshopId, modId }) =>
    ({ modIdUuid, workshopId, modId })
  );
  const sourceParents = withTargetSelected
    ? [parent, {
        ...parent, id: "parent-b", workshop_id: patch.workshopId,
        source_url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${patch.workshopId}`
      }]
    : [parent];
  const catalogEvidence = projectCatalogEvidence(owner, bindings, sourceParents, [research]);
  assert.equal(catalogEvidence.ok, true);
  if (!catalogEvidence.ok) throw new Error("Fixture evidence invalid");
  const plan = planSavedRelationTargetCoverage(bindings, [row]);
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error("Fixture coverage invalid");
  const ruleIdentities = [...bindings, ...(plan.missingTargetUuids.length ? [patch] : [])];
  const rules = projectReviewedRelations(owner, ruleIdentities, catalogEvidence.evidence, plan.relevant);
  assert.equal(rules.ok, true);
  if (!rules.ok) throw new Error("Fixture relation invalid");
  const output = buildSavedProfileOutput(snapshot, bindings, {
    catalog: catalogEvidence.catalog, archivedWorkshopIds: catalogEvidence.archivedWorkshopIds
  }, { categoryPriority: [], rules: rules.rules }, { modIdPrefix: "" });
  assert.equal(output.ok, true);
  if (!output.ok) throw new Error("Fixture output invalid");
  return { row, plan, rules, output, snapshot, catalogEvidence };
}

test("test-only draft input is accepted, but its unapproved relationship never blocks output", () => {
  const draft = parseRelationDraft(draftInput);
  assert.equal(draft.ok, true);
  assert.equal(parseRelationApproval({ relationId, confirm: false }).ok, false);
  const before = examine(false);
  assert.deepEqual(before.rules.rules, []);
  assert.deepEqual(before.rules.withheld, [
    { id: relationId, reason: "not-approved" }
  ]);
  assert.equal(before.output.report.issues.some(i => i.code === "missing-required-mod"), false);
  assert.equal(before.output.report.preview?.mods, "Mods=DemoMain");
  assert.equal(before.output.report.preview?.workshopItems, "WorkshopItems=9000099811");
});

test("explicit approval causes a missing, unselected dependency to block settings output", () => {
  assert.equal(parseRelationApproval({ relationId, confirm: true }).ok, true);
  const after = examine(true);
  assert.equal(after.plan.missingTargetUuids.length, 1);
  assert.deepEqual(after.plan.missingTargetUuids, [targetUuid]);
  assert.equal(after.rules.rules.length, 1);
  assert.equal(after.output.report.copyStatus, "blocked");
  assert.equal(after.output.report.copyText, null);
  assert.ok(after.output.report.issues.some(i => i.code === "missing-required-mod"));
  assert.equal(after.output.report.preview?.mods, "Mods=DemoMain");
  assert.equal(after.output.report.preview?.workshopItems, "WorkshopItems=9000099811");
  assert.equal(after.snapshot.selections.some(s => s.modIdUuid === targetUuid), false);
});

test("selecting the required Mod ID explicitly clears the blocker without reordering", () => {
  const result = examine(true, true);
  assert.deepEqual(result.plan.missingTargetUuids, []);
  assert.equal(result.output.report.issues.some(i => i.code === "missing-required-mod"), false);
  assert.equal(result.output.report.preview?.mods, "Mods=DemoMain;DemoPatch");
  assert.equal(result.output.report.preview?.workshopItems, "WorkshopItems=9000099811;9000099812");
  assert.deepEqual(result.snapshot.selections.map(s => s.modIdUuid), [sourceUuid, targetUuid]);
});

test("research evidence change cannot silently keep an old approval", () => {
  const result = examine(true);
  const expired = projectReviewedRelations(owner, [main, patch], [{
    ...result.catalogEvidence.evidence[0], checkedAt: "2026-11-19"
  }], [result.row]);
  assert.equal(expired.ok, true);
  if (expired.ok) {
    assert.equal(expired.rules.length, 0);
    assert.deepEqual(expired.withheld, [
      { id: relationId, reason: "missing-approved-evidence" }
    ]);
  }
});

test("JSON v3 includes both draft and approved relation records without claiming restore safety", () => {
  const before = examine(false).row;
  const after = examine(true).row;
  const data: Record<string, unknown[]> = Object.fromEntries(
    BACKUP_TABLES.map(name => [name, []])
  );
  // Exported relations use the actual DB column names and reference actual
  // owner-owned mods/Mod ID rows and the recorded research parent.
  data.mods = [
    { id: "parent-a", owner_id: owner, workshop_id: main.workshopId },
    { id: "parent-b", owner_id: owner, workshop_id: patch.workshopId }
  ];
  data.modIds = [
    { id: sourceUuid, mod_id: "parent-a", value: main.modId },
    { id: targetUuid, mod_id: "parent-b", value: patch.modId }
  ];
  data.researchRecords = [research];
  const relationRecords = [before, { ...after, id: "66666666-6666-4666-8666-666666666666" }];
  data.modRelations = relationRecords.map(row => ({
    id: row.id, owner_id: row.ownerId, kind: row.kind,
    subject_mod_id_entry_id: row.subjectModIdUuid,
    target_mod_id_entry_id: row.targetModIdUuid,
    research_record_id: row.evidenceRecordId,
    evidence_url: row.sourceUrl, checked_at: row.checkedAt,
    approved: row.approved,
    approved_at: row.approved ? "2026-11-20T13:00:00Z" : null
  }));
  const inspected = inspectBackupSnapshot({
    schemaVersion: 3, exportedAt: "2026-11-20T00:00:00.000Z",
    scope: "authorized-user-catalog-and-profiles", complete: true, warnings: [],
    data
  });
  assert.equal(inspected.error, undefined);
  assert.equal(inspected.preview?.counts.modRelations, 2);
  assert.equal(relationRecords[0].approved, false);
  assert.equal(relationRecords[1].approved, true);
  // Structure inspection is not a database restore or a transactional snapshot.
});

test("frozen fictional fixture data remains unchanged across the full pipeline", () => {
  const before = JSON.stringify({ main, patch, parent, research, draftInput, savedOnlyMain });
  examine(false);
  examine(true);
  assert.equal(JSON.stringify({ main, patch, parent, research, draftInput, savedOnlyMain }), before);
});
