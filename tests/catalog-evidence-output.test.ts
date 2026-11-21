import assert from "node:assert/strict";
import test from "node:test";
import {
  projectCatalogEvidence, type CatalogEvidenceParent, type CatalogEvidenceRecord
} from "../lib/catalog-evidence-output";
import type { SavedModIdentity } from "../lib/saved-profile-output";
import { buildSavedProfileOutput } from "../lib/saved-profile-output";

const owner = "11111111-1111-4111-8111-111111111111";
const workshopId = "3552615247";
const sourceUrl = `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`;
const parent: CatalogEvidenceParent = Object.freeze({
  id: "mod-parent-a", owner_id: owner, workshop_id: workshopId,
  source_url: sourceUrl, verification_status: "confirmed",
  build_compatibility: "confirmed", multiplayer_compatibility: "confirmed",
  researched_at: "2026-11-20", is_archived: false
});
const sources: readonly SavedModIdentity[] = Object.freeze([
  Object.freeze({ workshopId, modId: "Main", modIdUuid: "uuid-main" }),
  Object.freeze({ workshopId, modId: "Optional", modIdUuid: "uuid-option" })
]);
const raw = Object.freeze({
  workshopId, title: "Fictional mod", description: "Test only",
  sourceUrl, sources: ["https://example.test/verified-claims"],
  checkedAt: "2026-11-20", modIds: ["Main", "Optional"],
  verificationStatus: "confirmed", buildCompatibility: "confirmed",
  multiplayerCompatibility: "confirmed"
});
const row: CatalogEvidenceRecord = Object.freeze({
  id: "research-a", mod_id: parent.id, raw_payload: raw,
  created_at: "2026-11-20T12:00:00Z"
});
const evaluate = (
  parents: readonly CatalogEvidenceParent[] = [parent],
  records: readonly CatalogEvidenceRecord[] = [row],
  selected: readonly SavedModIdentity[] = sources,
  requestedOwner = owner
) => projectCatalogEvidence(requestedOwner, selected, parents, records);

test("matches owner, research source, date, Workshop and exact selected Mod IDs", () => {
  const result = evaluate();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.catalog, [{
    workshopId, modIds: ["Main", "Optional"],
    modMetadata: [
      { modId: "Main", buildCompatibility: "unverified", multiplayerCompatibility: "confirmed" },
      { modId: "Optional", buildCompatibility: "unverified", multiplayerCompatibility: "confirmed" }
    ]
  }]);
  assert.deepEqual(result.evidence, [{
    workshopId, researchRecordId: "research-a", checkedAt: "2026-11-20",
    sources: ["https://example.test/verified-claims"],
    recordedBuildClaim: "confirmed", recordedMultiplayerClaim: "confirmed",
    evaluatedBuild42_22: "unverified", evaluatedMultiplayer: "confirmed",
    reason: "matched-approved-record"
  }]);
});

test("a generic B42 confirmed claim never establishes B42.22 compatibility", () => {
  const result = evaluate([parent], [{
    ...row, raw_payload: { ...raw, buildTarget: "42.22", buildCompatibility: "confirmed" }
  }]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.evidence[0].recordedBuildClaim, "confirmed");
    assert.equal(result.evidence[0].evaluatedBuild42_22, "unverified");
    assert.equal(result.catalog[0].modMetadata?.[0].buildCompatibility, "unverified");
  }
});

test("reported multiplayer issues remain separate from build claims", () => {
  const result = evaluate(
    [{ ...parent, multiplayer_compatibility: "reported_issue" }],
    [{ ...row, raw_payload: { ...raw, multiplayerCompatibility: "reported_issue" } }]
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.evidence[0].evaluatedMultiplayer, "reported_issue");
    assert.equal(result.evidence[0].evaluatedBuild42_22, "unverified");
  }
});

test("missing source URL evidence prevents confirmed multiplayer status", () => {
  const result = evaluate([parent], [{
    ...row, raw_payload: { ...raw, sources: [] }
  }]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.evidence[0].reason, "missing-evidence");
    assert.equal(result.evidence[0].evaluatedMultiplayer, "unverified");
  }
});

test("missing or duplicate research records never promote a claim", () => {
  const noRecords = evaluate([parent], []);
  assert.equal(noRecords.ok, true);
  if (noRecords.ok) {
    assert.equal(noRecords.evidence[0].reason, "missing-record");
    assert.equal(noRecords.evidence[0].evaluatedMultiplayer, "unverified");
  }
  const duplicates = evaluate([parent], [row, { ...row, id: "another-research" }]);
  assert.equal(duplicates.ok, true);
  if (duplicates.ok) {
    assert.equal(duplicates.evidence[0].reason, "ambiguous-records");
    assert.equal(duplicates.evidence[0].evaluatedMultiplayer, "unverified");
  }
});

test("mismatched dates, status, Workshop, sources and candidate membership fail closed", () => {
  const altered = [
    { ...raw, checkedAt: "2026-11-19" },
    { ...raw, workshopId: "9000000001" },
    { ...raw, sourceUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=9000000001" },
    { ...raw, modIds: ["Main"] },
    { ...raw, multiplayerCompatibility: "unverified" },
    { ...raw, verificationStatus: "unverified" }
  ];
  for (const raw_payload of altered) {
    const result = evaluate([parent], [{ ...row, raw_payload }]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.evidence[0].reason, "unmatched-record");
      assert.equal(result.evidence[0].evaluatedMultiplayer, "unverified");
    }
  }
});

test("archived source remains reported for downstream warning without removing choices", () => {
  const result = evaluate([{ ...parent, is_archived: true }]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.archivedWorkshopIds, [workshopId]);
    assert.deepEqual(result.catalog[0].modIds, ["Main", "Optional"]);
  }
});

test("cross-owner parents and unrecognized research parents reject the whole projection", () => {
  assert.deepEqual(evaluate([{ ...parent, owner_id: "other" }]), {
    ok: false, reason: "foreign-owner"
  });
  assert.deepEqual(evaluate([parent], [{ ...row, mod_id: "unknown-parent" }]), {
    ok: false, reason: "unknown-source"
  });
  assert.deepEqual(evaluate([parent], [row], [{ ...sources[0], workshopId: "9999999999" }]), {
    ok: false, reason: "unknown-source"
  });
});

test("duplicate and noncanonical parent records are rejected", () => {
  assert.deepEqual(evaluate([parent, parent]), { ok: false, reason: "duplicate-parent" });
  assert.deepEqual(evaluate([{ ...parent, workshop_id: "0003552615247" }]), {
    ok: false, reason: "invalid-parent"
  });
});

test("does not mutate frozen source or database rows", () => {
  const before = JSON.stringify({ parent, row, sources });
  assert.equal(evaluate().ok, true);
  assert.equal(JSON.stringify({ parent, row, sources }), before);
});

test("large unbounded payload is rejected instead of truncating trust evidence", () => {
  const many = Array.from({ length: 1001 }, (_, i) => ({ ...row, id: String(i) }));
  assert.deepEqual(evaluate([parent], many), { ok: false, reason: "unbounded" });
});

test("matched catalog claims reach the existing settings validator without claiming B42.22", () => {
  const projection = evaluate();
  assert.equal(projection.ok, true);
  if (!projection.ok) return;
  const saved = {
    selections: [{ workshopId, modId: "Main", modIdUuid: "uuid-main", enabled: true }],
    downloadOnlyWorkshopIds: []
  };
  const output = buildSavedProfileOutput(saved, sources,
    { catalog: projection.catalog, archivedWorkshopIds: projection.archivedWorkshopIds },
    { categoryPriority: [] }, { modIdPrefix: "" });
  assert.equal(output.ok, true);
  if (output.ok) {
    assert.equal(output.report.preview?.mods, "Mods=Main");
    // The source-backed multiplayer claim is recorded, but Build 42.22
    // and required dependencies remain unknown in the current schema.
    assert.equal(output.report.issues.filter(i => i.code === "compatibility-unverified").length, 1);
    assert.ok(output.report.issues.some(i => i.code === "dependency-unverified"));
    assert.equal(output.report.issues.some(i => i.code === "compatibility-reported-issue"), false);
  }
});

test("archived claimed Workshop produces the existing warning and requires confirmation", () => {
  const projection = evaluate([{ ...parent, is_archived: true }]);
  assert.equal(projection.ok, true);
  if (!projection.ok) return;
  const saved = {
    selections: [{ workshopId, modId: "Main", modIdUuid: "uuid-main", enabled: true }],
    downloadOnlyWorkshopIds: []
  };
  const output = buildSavedProfileOutput(saved, sources,
    { catalog: projection.catalog, archivedWorkshopIds: projection.archivedWorkshopIds },
    { categoryPriority: [] }, { modIdPrefix: "" });
  assert.equal(output.ok, true);
  if (output.ok) {
    assert.equal(output.report.copyStatus, "confirmation-required");
    assert.ok(output.report.issues.some(i => i.code === "archived-workshop"));
  }
});
