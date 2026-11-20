import assert from "node:assert/strict";
import test from "node:test";
import { inspectBackupSnapshot, BACKUP_TABLES } from "../lib/backup-preview";

const empty = Object.fromEntries(BACKUP_TABLES.map(table => [table, []]));
const snapshot = {
  schemaVersion: 1, exportedAt: "2026-11-20T00:00:00.000Z",
  scope: "authorized-user-catalog-and-profiles", complete: true, warnings: [],
  data: empty
};
test("recognizes a complete six-table read-only export", () => {
  const result = inspectBackupSnapshot(snapshot);
  assert.equal(result.error, undefined);
  assert.equal(result.preview?.complete, true);
  assert.deepEqual(result.preview?.counts, Object.fromEntries(BACKUP_TABLES.map(table => [table, 0])));
});
test("partial queue export is surfaced as incomplete, not restore-safe", () => {
  const result = inspectBackupSnapshot({ ...snapshot, complete: false,
    warnings: ["research_queue migration pending"],
    data: { ...empty, researchQueue: null } });
  assert.equal(result.preview?.complete, false);
  assert.equal(result.preview?.counts.researchQueue, null);
});
test("rejects a falsely marked complete export", () => {
  assert.ok(inspectBackupSnapshot({ ...snapshot, data: { ...empty, researchQueue: null } }).error);
  assert.ok(inspectBackupSnapshot({ ...snapshot, warnings: ["missing"] }).error);
});
test("refuses missing tables, unsupported format and corrupt arrays", () => {
  assert.ok(inspectBackupSnapshot({ ...snapshot, data: { mods: [] } }).error);
  assert.ok(inspectBackupSnapshot({ ...snapshot, schemaVersion: 2 }).error);
  assert.ok(inspectBackupSnapshot({ ...snapshot, data: { ...empty, mods: [null] } }).error);
});
