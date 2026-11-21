import assert from "node:assert/strict";
import test from "node:test";
import { planSavedRelationTargetCoverage } from "../lib/saved-relation-target-coverage";
import { projectReviewedRelations, type ReviewedRelationRow } from "../lib/reviewed-mod-relations";
import { buildSavedProfileOutput, type SavedModIdentity } from "../lib/saved-profile-output";
import type { EvidenceSummary } from "../lib/catalog-evidence-output";

const owner = "11111111-1111-4111-8111-111111111111";
const first = "3552615247";
const second = "2142622992";
const guide = "https://example.test/verified";
const selected: readonly SavedModIdentity[] = Object.freeze([
  Object.freeze({ modIdUuid: "id-a", workshopId: first, modId: "Main" })
]);
const unselected: SavedModIdentity = Object.freeze({
  modIdUuid: "id-b", workshopId: second, modId: "RequiredPatch"
});
const row: ReviewedRelationRow = Object.freeze({
  id: "relation-a",
  ownerId: owner,
  kind: "requires",
  subjectModIdUuid: "id-a",
  targetModIdUuid: "id-b",
  evidenceRecordId: "research-a",
  sourceUrl: guide,
  checkedAt: "2026-11-20",
  approved: true
});
const evidence: readonly EvidenceSummary[] = [{
  workshopId: first,
  researchRecordId: "research-a",
  checkedAt: "2026-11-20",
  sources: [guide],
  recordedBuildClaim: "unverified",
  recordedMultiplayerClaim: "unverified",
  evaluatedBuild42_22: "unverified",
  evaluatedMultiplayer: "unverified",
  reason: "matched-approved-record"
}];

test("an unselected relation target is explicitly requested for catalog lookup", () => {
  const result = planSavedRelationTargetCoverage(selected, [row]);
  assert.deepEqual(result, {
    ok: true, relevant: [row], missingTargetUuids: ["id-b"]
  });
});

test("a saved disabled target is known, so no extra lookup is required", () => {
  const result = planSavedRelationTargetCoverage([...selected, unselected], [row]);
  assert.deepEqual(result, {
    ok: true, relevant: [row], missingTargetUuids: []
  });
});

test("only relations of selected subjects are relevant to this saved profile", () => {
  const unrelated: ReviewedRelationRow = {
    ...row, id: "unrelated", subjectModIdUuid: "id-z", targetModIdUuid: "id-q"
  };
  const result = planSavedRelationTargetCoverage(selected, [unrelated, row]);
  assert.deepEqual(result, { ok: true, relevant: [row], missingTargetUuids: ["id-b"] });
});

test("unselected targets are deduplicated in first-occurrence order without modifying rows", () => {
  const before = JSON.stringify({ selected, row });
  const result = planSavedRelationTargetCoverage(selected, [
    row, { ...row, id: "second", kind: "loadBefore" },
    { ...row, id: "third", targetModIdUuid: "id-c", kind: "loadAfter" }
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.missingTargetUuids, ["id-b", "id-c"]);
  assert.equal(JSON.stringify({ selected, row }), before);
});

test("invalid selected UUIDs, empty target UUIDs, oversized relations are rejected", () => {
  assert.deepEqual(planSavedRelationTargetCoverage([selected[0], selected[0]], [row]), {
    ok: false, reason: "invalid-selection"
  });
  assert.deepEqual(planSavedRelationTargetCoverage(selected, [{ ...row, targetModIdUuid: "" }]), {
    ok: false, reason: "invalid-relation"
  });
  assert.deepEqual(planSavedRelationTargetCoverage(selected,
    Array.from({ length: 501 }, (_, i) => ({ ...row, id: String(i) }))), {
    ok: false, reason: "unbounded"
  });
});

test("approved missing requirement blocks server settings, without auto-activating target", () => {
  // This simulates the HTTP GET's trusted catalog lookup for a required,
  // unselected target. The saved selection remains untouched.
  const plan = planSavedRelationTargetCoverage(selected, [row]);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.missingTargetUuids, [unselected.modIdUuid]);
  const rules = projectReviewedRelations(owner,
    [...selected, unselected], evidence, plan.relevant);
  assert.equal(rules.ok, true);
  if (!rules.ok) return;

  const snapshot = {
    selections: [{
      workshopId: first, modId: "Main", modIdUuid: "id-a", enabled: true
    }],
    downloadOnlyWorkshopIds: [] as string[]
  };
  const report = buildSavedProfileOutput(snapshot, selected, {
    catalog: [{ workshopId: first, modIds: ["Main"] }]
  }, { categoryPriority: [], rules: rules.rules }, { modIdPrefix: "" });
  assert.equal(report.ok, true);
  if (report.ok) {
    assert.equal(report.report.copyStatus, "blocked");
    assert.equal(report.report.copyText, null);
    assert.equal(report.report.preview?.mods, "Mods=Main");
    assert.equal(report.report.preview?.workshopItems, `WorkshopItems=${first}`);
    assert.ok(report.report.issues.some(issue => issue.code === "missing-required-mod"));
  }
  assert.deepEqual(snapshot.selections.map(item => item.modId), ["Main"]);
});

test("explicitly disabled target is a missing active dependency and keeps its slot", () => {
  const plan = planSavedRelationTargetCoverage([...selected, unselected], [row]);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const rules = projectReviewedRelations(owner, [...selected, unselected],
    evidence, plan.relevant);
  assert.equal(rules.ok, true);
  if (!rules.ok) return;
  const saved = {
    selections: [
      { workshopId: first, modId: "Main", modIdUuid: "id-a", enabled: true },
      { workshopId: second, modId: "RequiredPatch", modIdUuid: "id-b", enabled: false }
    ],
    downloadOnlyWorkshopIds: [] as string[]
  };
  const report = buildSavedProfileOutput(saved, [...selected, unselected], {
    catalog: [
      { workshopId: first, modIds: ["Main"] },
      { workshopId: second, modIds: ["RequiredPatch"] }
    ]
  }, { categoryPriority: [], rules: rules.rules }, { modIdPrefix: "" });
  assert.equal(report.ok, true);
  if (report.ok) {
    assert.equal(report.report.copyStatus, "blocked");
    assert.ok(report.report.issues.some(issue => issue.code === "missing-required-mod"));
    assert.equal(report.report.preview?.mods, "Mods=Main");
  }
  assert.equal(saved.selections[1].enabled, false);
});

test("unapproved relation never blocks, even when its catalog target is known", () => {
  const plan = planSavedRelationTargetCoverage(selected, [{ ...row, approved: false }]);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const rules = projectReviewedRelations(owner, [...selected, unselected],
    evidence, plan.relevant);
  assert.equal(rules.ok, true);
  if (!rules.ok) return;
  assert.equal(rules.rules.length, 0);
  assert.deepEqual(rules.withheld, [{ id: "relation-a", reason: "not-approved" }]);
});

test("unrelated verified relationship does not block a different saved profile", () => {
  const other: ReviewedRelationRow = {
    ...row, id: "other", subjectModIdUuid: "id-z", targetModIdUuid: "id-q"
  };
  const plan = planSavedRelationTargetCoverage(selected, [other]);
  assert.deepEqual(plan, { ok: true, relevant: [], missingTargetUuids: [] });
});

test("same game Mod ID from another Workshop remains provider-qualified", () => {
  const duplicateName: SavedModIdentity = {
    modIdUuid: "id-c", workshopId: second, modId: "Main"
  };
  const specific: ReviewedRelationRow = { ...row, targetModIdUuid: "id-c" };
  const plan = planSavedRelationTargetCoverage(selected, [specific]);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const rules = projectReviewedRelations(owner, [...selected, duplicateName],
    evidence, plan.relevant);
  assert.equal(rules.ok, true);
  if (rules.ok) {
    assert.deepEqual(rules.rules[0].kind, "requires");
    assert.deepEqual(rules.rules[0].target, { workshopId: second, modId: "Main" });
  }
});
