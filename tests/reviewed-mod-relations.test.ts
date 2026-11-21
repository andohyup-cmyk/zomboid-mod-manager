import assert from "node:assert/strict";
import test from "node:test";
import {
  projectReviewedRelations,
  type ReviewedRelationRow
} from "../lib/reviewed-mod-relations";
import type { EvidenceSummary } from "../lib/catalog-evidence-output";
import type { SavedModIdentity } from "../lib/saved-profile-output";
import { buildSavedProfileOutput } from "../lib/saved-profile-output";

const owner = "11111111-1111-4111-8111-111111111111";
const first = "3552615247";
const second = "2142622992";
const guide = "https://example.test/approved-relation-guide";
const identities: readonly SavedModIdentity[] = Object.freeze([
  Object.freeze({ modIdUuid: "id-a", workshopId: first, modId: "Main" }),
  Object.freeze({ modIdUuid: "id-b", workshopId: second, modId: "Patch" }),
  Object.freeze({ modIdUuid: "id-c", workshopId: second, modId: "Main" })
]);
const evidence: readonly EvidenceSummary[] = Object.freeze([Object.freeze({
  workshopId: first, researchRecordId: "research-a",
  checkedAt: "2026-11-20", sources: [guide],
  recordedBuildClaim: "unverified",
  recordedMultiplayerClaim: "unverified",
  evaluatedBuild42_22: "unverified",
  evaluatedMultiplayer: "unverified",
  reason: "matched-approved-record"
})]);
const row: ReviewedRelationRow = Object.freeze({
  id: "relation-1", ownerId: owner, kind: "requires",
  subjectModIdUuid: "id-a", targetModIdUuid: "id-b",
  evidenceRecordId: "research-a", sourceUrl: guide,
  checkedAt: "2026-11-20", approved: true
});
const run = (
  rows: readonly ReviewedRelationRow[] = [row],
  candidateIdentities = identities,
  approvedEvidence = evidence,
  userId = owner
) => projectReviewedRelations(userId, candidateIdentities, approvedEvidence, rows);

test("approved record becomes provider-qualified verified dependency rule", () => {
  const output = run();
  assert.equal(output.ok, true);
  if (output.ok) {
    assert.deepEqual(output.withheld, []);
    assert.deepEqual(output.rules, [{
      kind: "requires",
      mod: { workshopId: first, modId: "Main" },
      target: { workshopId: second, modId: "Patch" },
      evidence: { verified: true, source: guide, checkedAt: "2026-11-20" }
    }]);
  }
});

test("unapproved claim never generates a blocking rule", () => {
  const output = run([{ ...row, approved: false }]);
  assert.deepEqual(output, { ok: true, rules: [],
    withheld: [{ id: "relation-1", reason: "not-approved" }] });
});

test("stale, missing, mismatched or ambiguous research does not activate a rule", () => {
  const variants: EvidenceSummary[][] = [
    [],
    [{ ...evidence[0], reason: "ambiguous-records" }],
    [{ ...evidence[0], researchRecordId: "other" }],
    [{ ...evidence[0], checkedAt: "2026-11-19" }],
    [{ ...evidence[0], sources: [] }]
  ];
  for (const variant of variants) {
    const output = run([row], identities, variant);
    assert.equal(output.ok, true);
    if (output.ok) {
      assert.deepEqual(output.rules, []);
      assert.equal(output.withheld[0].reason, "missing-approved-evidence");
    }
  }
});

test("an unapproved web URL or invalid check date cannot become verified", () => {
  for (const sourceUrl of ["https://wrong.example/guide", "javascript:alert(1)",
    "https://name:pass@example.test/approved-relation-guide",
    "https://example.test/approved-relation-guide#fragment"]) {
    const output = run([{ ...row, sourceUrl }]);
    assert.equal(output.ok, true);
    if (output.ok) assert.equal(output.rules.length, 0);
  }
  const output = run([{ ...row, checkedAt: "2026-02-30" }],
    identities, [{ ...evidence[0], checkedAt: "2026-02-30" }]);
  assert.equal(output.ok, true);
  if (output.ok) assert.equal(output.rules.length, 0);
});

test("an unresolved required target is withheld rather than invented", () => {
  const result = run([row], [identities[0]]);
  assert.deepEqual(result, { ok: true, rules: [],
    withheld: [{ id: "relation-1", reason: "missing-catalog-identity" }] });
});

test("foreign-owner row rejects the entire projection", () => {
  assert.deepEqual(run([{ ...row, ownerId: "other" }]), {
    ok: false, reason: "foreign-owner"
  });
  assert.deepEqual(run([row, { ...row, id: "r2", ownerId: "other", approved: false }]), {
    ok: false, reason: "foreign-owner"
  });
});

test("duplicate row IDs, duplicate logical claims and invalid self links are rejected", () => {
  assert.deepEqual(run([row, row]), { ok: false, reason: "duplicate-relation" });
  assert.deepEqual(run([row, { ...row, id: "r2" }]), {
    ok: false, reason: "duplicate-relation"
  });
  assert.deepEqual(run([{ ...row, targetModIdUuid: "id-a" }]), {
    ok: false, reason: "invalid-relation"
  });
  const conflict = { ...row, kind: "incompatibleMods" as const };
  assert.deepEqual(run([conflict, {
    ...conflict, id: "r2", subjectModIdUuid: "id-b", targetModIdUuid: "id-a"
  }]), { ok: false, reason: "duplicate-relation" });
});

test("ambiguous catalog IDs and duplicate research subjects never become trusted", () => {
  assert.deepEqual(run([row], [identities[0], identities[0]]), {
    ok: false, reason: "invalid-identity"
  });
  assert.deepEqual(run([row], identities, [evidence[0], evidence[0]]), {
    ok: false, reason: "ambiguous-evidence"
  });
});

test("does not conflate identical game Mod IDs provided by distinct Workshops", () => {
  const result = run([{ ...row, targetModIdUuid: "id-c" }]);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.rules[0], {
    kind: "requires",
    mod: { workshopId: first, modId: "Main" },
    target: { workshopId: second, modId: "Main" },
    evidence: { verified: true, source: guide, checkedAt: "2026-11-20" }
  });
});

test("verified dependency can block output when the catalog target is not selected", () => {
  const proof = run();
  assert.equal(proof.ok, true);
  if (!proof.ok) return;
  const result = buildSavedProfileOutput({
    selections: [{ modIdUuid: "id-a", workshopId: first, modId: "Main", enabled: true }],
    downloadOnlyWorkshopIds: []
  }, identities, {
    catalog: [
      { workshopId: first, modIds: ["Main"] },
      { workshopId: second, modIds: ["Patch", "Main"] }
    ]
  }, { categoryPriority: [], rules: proof.rules }, { modIdPrefix: "" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.report.copyStatus, "blocked");
    assert.equal(result.report.copyText, null);
    assert.ok(result.report.issues.some(issue => issue.code === "missing-required-mod"));
  }
});

test("verified conflicting active pairs only require confirmation and do not change original order", () => {
  const projected = run([{ ...row, kind: "incompatibleMods" }]);
  assert.equal(projected.ok, true);
  if (!projected.ok) return;
  const selections = [
    { modIdUuid: "id-a", workshopId: first, modId: "Main", enabled: true },
    { modIdUuid: "id-b", workshopId: second, modId: "Patch", enabled: true }
  ];
  const result = buildSavedProfileOutput({
    selections, downloadOnlyWorkshopIds: []
  }, identities, {
    catalog: [{ workshopId: first, modIds: ["Main"] }, { workshopId: second, modIds: ["Patch"] }]
  }, { categoryPriority: [], rules: projected.rules }, { modIdPrefix: "" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.report.copyStatus, "confirmation-required");
    assert.equal(result.report.preview?.mods, "Mods=Main;Patch");
    assert.ok(result.report.issues.some(issue => issue.code === "incompatible-mods"));
  }
  assert.deepEqual(selections.map(s => s.modId), ["Main", "Patch"]);
});

test("verified load-before rule reports mismatch without automatically reordering", () => {
  const projected = run([{ ...row, kind: "loadBefore" }]);
  assert.equal(projected.ok, true);
  if (!projected.ok) return;
  const selections = [
    { modIdUuid: "id-b", workshopId: second, modId: "Patch", enabled: true },
    { modIdUuid: "id-a", workshopId: first, modId: "Main", enabled: true }
  ];
  const result = buildSavedProfileOutput({
    selections, downloadOnlyWorkshopIds: []
  }, identities, {
    catalog: [{ workshopId: first, modIds: ["Main"] }, { workshopId: second, modIds: ["Patch"] }]
  }, { categoryPriority: [], rules: projected.rules }, { modIdPrefix: "" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.report.copyStatus, "confirmation-required");
    assert.equal(result.report.preview?.mods, "Mods=Patch;Main");
    assert.ok(result.report.issues.some(issue => issue.code === "load-order-violation"));
  }
});

test("frozen inputs remain untouched by proof checks", () => {
  const before = JSON.stringify({ identities, evidence, row });
  assert.equal(run().ok, true);
  assert.equal(JSON.stringify({ identities, evidence, row }), before);
});
