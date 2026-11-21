import assert from "node:assert/strict";
import test from "node:test";
import type { LoadedProfileSnapshot } from "../lib/profile-snapshot-read";
import { buildSavedProfileOutput, type SavedModIdentity } from "../lib/saved-profile-output";

const first = "1234567890";
const second = "2345678901";
const extra = "3456789012";
const snapshot: LoadedProfileSnapshot = Object.freeze({
  selections: Object.freeze([
    Object.freeze({ workshopId: first, modId: "Core", modIdUuid: "uuid-a", enabled: true }),
    Object.freeze({ workshopId: first, modId: "Optional", modIdUuid: "uuid-b", enabled: false }),
    Object.freeze({ workshopId: second, modId: "Patch", modIdUuid: "uuid-c", enabled: true })
  ]),
  downloadOnlyWorkshopIds: Object.freeze([extra, first])
});
const trusted: readonly SavedModIdentity[] = Object.freeze([
  Object.freeze({ workshopId: first, modId: "Core", modIdUuid: "uuid-a" }),
  Object.freeze({ workshopId: first, modId: "Optional", modIdUuid: "uuid-b" }),
  Object.freeze({ workshopId: second, modId: "Patch", modIdUuid: "uuid-c" })
]);
const catalog = Object.freeze([
  Object.freeze({ workshopId: first, modIds: Object.freeze(["Core", "Optional"]) }),
  Object.freeze({ workshopId: second, modIds: Object.freeze(["Patch"]) })
]);
const plain = { categoryPriority: [] };
const prefix = { modIdPrefix: "\\" } as const;

const build = (
  saved: LoadedProfileSnapshot = snapshot,
  identities: readonly SavedModIdentity[] = trusted,
  input = { catalog } as const,
  options: { modIdPrefix: "" | "\\"; warningsAcknowledged?: boolean } = prefix
) => buildSavedProfileOutput(saved, identities, input, plain, options);

test("generates Mods and WorkshopItems from active rows in their original saved order", () => {
  const result = build();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.report.preview, {
    mods: "Mods=\\Core;\\Patch",
    workshopItems: `WorkshopItems=${first};${second};${extra}`
  });
  assert.equal(result.report.copyStatus, "ready");
  assert.equal(result.report.copyText, `Mods=\\Core;\\Patch\nWorkshopItems=${first};${second};${extra}`);
  assert.ok(result.report.issues.some(issue => issue.code === "compatibility-unverified"));
});

test("disabled Mod ID keeps its stored slot and returns to that spot on re-enable", () => {
  const updated = {
    ...snapshot, selections: snapshot.selections.map(s =>
      s.modIdUuid === "uuid-b" ? { ...s, enabled: true } : s)
  };
  const report = build(updated);
  assert.equal(report.ok, true);
  if (report.ok) assert.equal(report.report.preview?.mods, "Mods=\\Core;\\Optional;\\Patch");
});

test("does not turn download-only Workshop into an enabled game Mod ID", () => {
  const saved = { selections: [], downloadOnlyWorkshopIds: [extra] };
  const report = build(saved, [], { catalog });
  assert.equal(report.ok, true);
  if (report.ok) {
    assert.equal(report.report.copyStatus, "ready");
    assert.equal(report.report.copyText, `Mods=\nWorkshopItems=${extra}`);
  }
});

test("an empty saved draft is retained but cannot be copied as server settings", () => {
  const result = build({ selections: [], downloadOnlyWorkshopIds: [] }, []);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.report.copyStatus, "blocked");
    assert.equal(result.report.copyText, null);
    assert.ok(result.report.issues.some(issue => issue.code === "empty-profile"));
  }
});

test("rejects a missing, stale, or changed Mod ID UUID binding before output", () => {
  assert.deepEqual(build(snapshot, trusted.filter(s => s.modIdUuid !== "uuid-b")), {
    ok: false, reason: "missing-source"
  });
  assert.deepEqual(build(snapshot, trusted.map(s =>
    s.modIdUuid === "uuid-c" ? { ...s, workshopId: first } : s)), {
    ok: false, reason: "missing-source"
  });
  assert.deepEqual(build(snapshot, trusted, { catalog: [catalog[0]] }), {
    ok: false, reason: "missing-source"
  });
});

test("does not silently resolve a duplicated or ambiguous trusted source", () => {
  assert.deepEqual(build(snapshot, [...trusted, trusted[0]]), {
    ok: false, reason: "duplicate-source"
  });
  assert.deepEqual(build(snapshot, [...trusted, {
    workshopId: first, modId: "Core", modIdUuid: "uuid-d"
  }]), {
    ok: false, reason: "duplicate-source"
  });
  assert.deepEqual(build({
    ...snapshot, selections: [...snapshot.selections, snapshot.selections[0]]
  }), { ok: false, reason: "invalid-snapshot" });
});

test("honors existing verified dependency blocks and never automatically inserts required Mods", () => {
  const result = buildSavedProfileOutput(snapshot, trusted, {
    catalog,
    relationships: [{
      kind: "requires-mod", modId: "Patch", requiredModId: "Missing",
      verifiedSource: "https://example.test/verified"
    }]
  }, plain, prefix);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.report.copyStatus, "blocked");
    assert.equal(result.report.copyText, null);
    assert.ok(result.report.issues.some(issue => issue.code === "missing-required-mod"));
    assert.deepEqual(snapshot.selections.map(s => s.modId), ["Core", "Optional", "Patch"]);
  }
});

test("confirmed conflict requires acknowledgement, preserving both chosen entries", () => {
  const options = { ...prefix, warningsAcknowledged: false };
  const input = {
    catalog,
    relationships: [{
      kind: "incompatible-mods" as const, modId: "Core", incompatibleModId: "Patch",
      verifiedSource: "https://example.test/verified"
    }]
  };
  const waiting = buildSavedProfileOutput(snapshot, trusted, input, plain, options);
  assert.equal(waiting.ok, true);
  if (waiting.ok) {
    assert.equal(waiting.report.copyStatus, "confirmation-required");
    assert.equal(waiting.report.copyText, null);
  }
  const approved = buildSavedProfileOutput(snapshot, trusted, input, plain,
    { ...prefix, warningsAcknowledged: true });
  assert.equal(approved.ok, true);
  if (approved.ok) assert.equal(approved.report.preview?.mods, "Mods=\\Core;\\Patch");
});

test("existing group constraints run only for explicitly supplied groups", () => {
  const group = {
    id: "variants", label: "choose one", members: [
      { workshopId: first, modId: "Core" },
      { workshopId: second, modId: "Patch" }
    ], minSelected: 0, maxSelected: 1, verified: true,
    evidenceUrl: "https://example.test/group-proof"
  };
  const result = buildSavedProfileOutput(snapshot, trusted, { catalog }, plain, prefix, [group]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.report.copyStatus, "blocked");
    assert.ok(result.report.issues.some(issue => issue.code === "group-selection-violation"));
  }
  const free = build();
  assert.equal(free.ok, true);
  if (free.ok) assert.equal(free.report.copyStatus, "ready");
});

test("recognizes an explicitly selected duplicate game ID from different Workshops", () => {
  const saved: LoadedProfileSnapshot = {
    selections: [
      { workshopId: first, modId: "Core", modIdUuid: "uuid-a", enabled: true },
      { workshopId: second, modId: "Core", modIdUuid: "uuid-z", enabled: true }
    ], downloadOnlyWorkshopIds: []
  };
  const sources = [
    trusted[0], { workshopId: second, modId: "Core", modIdUuid: "uuid-z" }
  ];
  const catalog = [
    { workshopId: first, modIds: ["Core"] },
    { workshopId: second, modIds: ["Core"] }
  ];
  const result = buildSavedProfileOutput(saved, sources, { catalog }, plain, prefix);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.report.copyStatus, "confirmation-required");
    assert.equal(result.report.preview?.mods, "Mods=\\Core");
    assert.equal(result.report.preview?.workshopItems, `WorkshopItems=${first};${second}`);
    assert.ok(result.report.issues.some(issue => issue.code === "duplicate-mod-id"));
  }
});

test("all inputs remain immutable and output prefix is explicit", () => {
  const before = JSON.stringify({ snapshot, trusted, catalog });
  const result = build(snapshot, trusted, { catalog }, { modIdPrefix: "" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.report.preview?.mods, "Mods=Core;Patch");
  assert.equal(JSON.stringify({ snapshot, trusted, catalog }), before);
});
