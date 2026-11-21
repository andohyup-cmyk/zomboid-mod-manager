import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectBackupSnapshot, BACKUP_TABLES, LEGACY_BACKUP_TABLES, NEW_PROFILE_BACKUP_TABLES
} from "../lib/backup-preview";

const emptyV2 = Object.fromEntries(BACKUP_TABLES.map(table => [table, []]));
const emptyV1 = Object.fromEntries(LEGACY_BACKUP_TABLES.map(table => [table, []]));
const sample = {
  schemaVersion: 2, exportedAt: "2026-11-21T00:00:00.000Z",
  scope: "authorized-user-catalog-and-profiles", complete: true, warnings: [],
  data: emptyV2
};

test("recognizes a complete nine-table version 2 read-only export", () => {
  const result = inspectBackupSnapshot(sample);
  assert.equal(result.error, undefined);
  assert.equal(result.preview?.complete, true);
  assert.deepEqual(result.preview?.counts, Object.fromEntries(BACKUP_TABLES.map(table => [table, 0])));
  assert.deepEqual(result.preview?.warnings, []);
});

test("legacy v1 export is inspectable but never called complete for newer schema", () => {
  const legacy = {
    ...sample, schemaVersion: 1, data: emptyV1
  };
  const result = inspectBackupSnapshot(legacy);
  assert.equal(result.error, undefined);
  assert.equal(result.preview?.complete, false);
  assert.deepEqual(LEGACY_BACKUP_TABLES.map(table => result.preview?.counts[table]), Array(6).fill(0));
  assert.deepEqual(NEW_PROFILE_BACKUP_TABLES.map(table => result.preview?.counts[table]), [null, null, null]);
  assert.match(result.preview?.warnings[0] ?? "", /이전 버전\(v1\)/);
});

test("v2 missing any revisioned profile table cannot claim a complete backup", () => {
  for (const name of NEW_PROFILE_BACKUP_TABLES) {
    const data: Record<string, unknown> = { ...emptyV2 };
    delete data[name];
    assert.ok(inspectBackupSnapshot({ ...sample, data }).error, name);
    assert.ok(inspectBackupSnapshot({ ...sample, data: { ...emptyV2, [name]: null } }).error, name);
  }
});

test("partial queue export is surfaced as incomplete, not restore-safe", () => {
  const result = inspectBackupSnapshot({ ...sample, complete: false,
    warnings: ["research_queue unavailable"],
    data: { ...emptyV2, researchQueue: null } });
  assert.equal(result.preview?.complete, false);
  assert.equal(result.preview?.counts.researchQueue, null);
});

test("rejects falsely marked complete exports for v1 and v2", () => {
  assert.ok(inspectBackupSnapshot({ ...sample, data: { ...emptyV2, researchQueue: null } }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, warnings: ["missing"] }).error);
  assert.ok(inspectBackupSnapshot({
    ...sample, schemaVersion: 1, data: { ...emptyV1, researchQueue: null }
  }).error);
});

test("refuses missing required old tables, unsupported versions and invalid rows", () => {
  assert.ok(inspectBackupSnapshot({ ...sample, data: { mods: [] } }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, schemaVersion: 3 }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, schemaVersion: 0 }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, data: { ...emptyV2, mods: [null] } }).error);
});

test("counts current revisioned profile rows independently from legacy profile links", () => {
  const result = inspectBackupSnapshot({
    ...sample,
    data: {
      ...emptyV2,
      profileMods: [{ profile_id: "legacy", mod_id: "workshop" }],
      profileRevisions: [{ profile_id: "p", revision: 1 }],
      profileModChoices: [
        { mod_id_entry_id: "id1", enabled: true, load_order: 0 },
        { mod_id_entry_id: "id2", enabled: false, load_order: 1 }
      ],
      profileDownloads: [{ workshop_id: "3552615247", load_order: 0 }]
    }
  });
  assert.equal(result.preview?.complete, true);
  assert.equal(result.preview?.counts.profileMods, 1);
  assert.equal(result.preview?.counts.profileRevisions, 1);
  assert.equal(result.preview?.counts.profileModChoices, 2);
  assert.equal(result.preview?.counts.profileDownloads, 1);
});
