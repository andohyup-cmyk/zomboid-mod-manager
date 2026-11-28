import assert from "node:assert/strict";
import test from "node:test";
import {
  planCatalogMutation,
  type CatalogMutationSnapshot
} from "../lib/catalog-mutation-preview";

const id = "a1a2a3a4-b1b2-c1c2-d1d2-e1e2e3e4e5e6";
const timestamp = "2026-11-21T10:20:00.123456+00:00";
const active: CatalogMutationSnapshot = Object.freeze({
  id,
  updatedAt: timestamp,
  title: "Original title",
  description: "Original description",
  isArchived: false
});
const archived: CatalogMutationSnapshot = Object.freeze({ ...active, isArchived: true });

function request(action: "edit_metadata" | "archive" | "restore", extra: Record<string, unknown> = {}) {
  return { action, modId: id, expectedUpdatedAt: timestamp, ...extra };
}

test("explicit archive creates only an is_archived patch", () => {
  assert.deepEqual(planCatalogMutation(request("archive"), active), {
    ok: true, modId: id, expectedUpdatedAt: timestamp, patch: { is_archived: true }
  });
});

test("explicit restore creates only an is_archived patch", () => {
  assert.deepEqual(planCatalogMutation(request("restore"), archived), {
    ok: true, modId: id, expectedUpdatedAt: timestamp, patch: { is_archived: false }
  });
});

test("repeated archive or restore is a no-op, not another write", () => {
  assert.deepEqual(planCatalogMutation(request("archive"), archived), {
    ok: false, reason: "unchanged", message: "이미 보관된 모드입니다."
  });
  assert.deepEqual(planCatalogMutation(request("restore"), active), {
    ok: false, reason: "unchanged", message: "이미 사용 중인 모드입니다."
  });
});

test("valid metadata edits only include changed title or description", () => {
  assert.deepEqual(planCatalogMutation(request("edit_metadata", {
    title: "  New title  ", description: "Original description"
  }), active), {
    ok: true, modId: id, expectedUpdatedAt: timestamp, patch: { title: "New title" }
  });
  assert.deepEqual(planCatalogMutation(request("edit_metadata", {
    description: "  Multi-line\nDescription  "
  }), active), {
    ok: true, modId: id, expectedUpdatedAt: timestamp, patch: { description: "Multi-line\nDescription" }
  });
});

test("empty or unchanged metadata never creates a write plan", () => {
  for (const extra of [{}, { title: "Original title" }, { description: " Original description " }]) {
    const result = planCatalogMutation(request("edit_metadata", extra), active);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unchanged");
  }
});

test("invalid titles are rejected before any write", () => {
  for (const title of ["", "   ", "A".repeat(201), 42, null, "hello\u0000world"]) {
    const result = planCatalogMutation(request("edit_metadata", { title }), active);
    assert.equal(result.ok, false, String(title).slice(0, 20));
    if (!result.ok) assert.equal(result.reason, "invalid");
  }
});

test("description 4000 character boundary and invalid types", () => {
  const accepted = planCatalogMutation(request("edit_metadata", { description: "A".repeat(4000) }), active);
  assert.equal(accepted.ok, true);
  for (const description of ["B".repeat(4001), false, null, "bad\u0000text"]) {
    const result = planCatalogMutation(request("edit_metadata", { description }), active);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid");
  }
});

test("title exactly 200 characters is valid", () => {
  const result = planCatalogMutation(request("edit_metadata", { title: "A".repeat(200) }), active);
  assert.equal(result.ok, true);
});

test("owner, Workshop ID, Mod IDs, research data and compatibility cannot be overwritten", () => {
  const forbidden = [
    { owner_id: id },
    { workshopId: "9876543210" },
    { workshop_id: "9876543210" },
    { modIds: ["unreviewed"] },
    { researchRecords: [] },
    { source_url: "https://invalid.example/" },
    { verificationStatus: "confirmed" },
    { buildCompatibility: "confirmed" },
    { multiplayerCompatibility: "confirmed" },
    { updated_at: "2027-01-01" },
    { is_archived: false }
  ];
  for (const fields of forbidden) {
    const result = planCatalogMutation(request("edit_metadata", { title: "Changed", ...fields }), active);
    assert.equal(result.ok, false, JSON.stringify(fields));
    if (!result.ok) assert.equal(result.reason, "invalid");
  }
});

test("archive and restore reject extra content, including metadata", () => {
  for (const action of ["archive", "restore"] as const) {
    const result = planCatalogMutation(request(action, { title: "Hidden edit" }), archived);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid");
  }
});

test("optimistic lock rejects a stale updated_at without producing a patch", () => {
  const result = planCatalogMutation(request("edit_metadata", {
    title: "Conflict", expectedUpdatedAt: "2026-11-20T10:20:00.123456+00:00"
  }), active);
  assert.deepEqual(result, {
    ok: false, reason: "stale", message: "다른 변경이 먼저 반영되었습니다. 최신 내용을 다시 불러와 주세요."
  });
});

test("request must contain a matching UUID and observed version", () => {
  for (const extra of [
    { modId: "../mods" },
    { modId: "3552615247" },
    { modId: "b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2" },
    { expectedUpdatedAt: "" },
    { expectedUpdatedAt: null }
  ]) {
    const result = planCatalogMutation(request("archive", extra), active);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid");
  }
});

test("unknown actions and malformed requests fail closed", () => {
  for (const raw of [null, [], "archive", {}, { ...request("archive"), action: "delete" }]) {
    const result = planCatalogMutation(raw, active);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid");
  }
});

test("planning does not mutate the original snapshot", () => {
  const before = JSON.stringify(active);
  planCatalogMutation(request("edit_metadata", { title: "New title", description: "New description" }), active);
  planCatalogMutation(request("archive"), active);
  assert.equal(JSON.stringify(active), before);
});
