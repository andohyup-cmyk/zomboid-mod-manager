import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectBackupSnapshot, BACKUP_TABLES, LEGACY_BACKUP_TABLES,
  NEW_PROFILE_BACKUP_TABLES, NEW_RELATION_BACKUP_TABLES, V2_BACKUP_TABLES
} from "../lib/backup-preview";

const emptyV3 = Object.fromEntries(BACKUP_TABLES.map(table => [table, []]));
const emptyV2 = Object.fromEntries(V2_BACKUP_TABLES.map(table => [table, []]));
const emptyV1 = Object.fromEntries(LEGACY_BACKUP_TABLES.map(table => [table, []]));
const sample = {
  schemaVersion: 3, exportedAt: "2026-11-21T00:00:00.000Z",
  scope: "authorized-user-catalog-and-profiles", complete: true, warnings: [],
  data: emptyV3
};

test("current v3 export must include all ten owner-scoped data areas", () => {
  const result = inspectBackupSnapshot(sample);
  assert.equal(result.error, undefined);
  assert.equal(result.preview?.complete, true);
  assert.deepEqual(result.preview?.counts,
    Object.fromEntries(BACKUP_TABLES.map(table => [table, 0])));
  assert.deepEqual(result.preview?.warnings, []);
});

test("legacy v1 export is inspectable but cannot be called complete", () => {
  const legacy = { ...sample, schemaVersion: 1, data: emptyV1 };
  const result = inspectBackupSnapshot(legacy);
  assert.equal(result.error, undefined);
  assert.equal(result.preview?.complete, false);
  assert.deepEqual(LEGACY_BACKUP_TABLES.map(table => result.preview?.counts[table]), Array(6).fill(0));
  assert.deepEqual(NEW_PROFILE_BACKUP_TABLES.map(table => result.preview?.counts[table]), [null, null, null]);
  assert.deepEqual(NEW_RELATION_BACKUP_TABLES.map(table => result.preview?.counts[table]), [null]);
  assert.match(result.preview?.warnings[0] ?? "", /이전 버전\(v1\)/);
});

test("legacy v2 is inspectable but missing relation history makes it partial", () => {
  const result = inspectBackupSnapshot({ ...sample, schemaVersion: 2, data: emptyV2 });
  assert.equal(result.error, undefined);
  assert.equal(result.preview?.complete, false);
  assert.equal(result.preview?.counts.modRelations, null);
  assert.deepEqual(NEW_PROFILE_BACKUP_TABLES.map(table => result.preview?.counts[table]), [0,0,0]);
  assert.match(result.preview?.warnings[0] ?? "", /이전 버전\(v2\)/);
});

test("v3 missing relationship or revisioned tables cannot claim a backup", () => {
  for (const name of [...NEW_PROFILE_BACKUP_TABLES, ...NEW_RELATION_BACKUP_TABLES]) {
    const data: Record<string, unknown> = { ...emptyV3 };
    delete data[name];
    assert.ok(inspectBackupSnapshot({ ...sample, data }).error, name);
    assert.ok(inspectBackupSnapshot({
      ...sample, data: { ...emptyV3, [name]: null }
    }).error, name);
  }
});

test("v2 missing its revisioned profile tables is invalid, not a legacy exception", () => {
  for (const name of NEW_PROFILE_BACKUP_TABLES) {
    const data: Record<string, unknown> = { ...emptyV2 };
    delete data[name];
    assert.ok(inspectBackupSnapshot({
      ...sample, schemaVersion: 2, data
    }).error, name);
  }
});

test("a queue read failure is always incomplete even for v3", () => {
  const result = inspectBackupSnapshot({
    ...sample, complete: false,
    warnings: ["research_queue unavailable"],
    data: { ...emptyV3, researchQueue: null }
  });
  assert.equal(result.preview?.complete, false);
  assert.equal(result.preview?.counts.researchQueue, null);
});

test("rejects falsely marked complete exports, unsupported versions and malformed rows", () => {
  assert.ok(inspectBackupSnapshot({
    ...sample, data: { ...emptyV3, researchQueue: null }
  }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, warnings: ["missing"] }).error);
  assert.ok(inspectBackupSnapshot({
    ...sample, schemaVersion: 1, data: { ...emptyV1, researchQueue: null }
  }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, schemaVersion: 4 }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, schemaVersion: 0 }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, data: { ...emptyV3, mods: [null] } }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, data: { mods: [] } }).error);
});

test("counts current revisioned profile, legacy links, and relation approvals independently", () => {
  const result = inspectBackupSnapshot({
    ...sample,
    data: {
      ...emptyV3,
      profileMods: [{ profile_id: "legacy", mod_id: "workshop" }],
      profileRevisions: [{ profile_id: "p", revision: 1 }],
      profileModChoices: [
        { mod_id_entry_id: "id1", enabled: true, load_order: 0 },
        { mod_id_entry_id: "id2", enabled: false, load_order: 1 }
      ],
      profileDownloads: [{ workshop_id: "3552615247", load_order: 0 }],
      modRelations: [
        { id: "a", approved: false, kind: "requires" },
        { id: "b", approved: true, kind: "loadBefore" }
      ]
    }
  });
  assert.equal(result.preview?.complete, true);
  assert.equal(result.preview?.counts.profileMods, 1);
  assert.equal(result.preview?.counts.profileRevisions, 1);
  assert.equal(result.preview?.counts.profileModChoices, 2);
  assert.equal(result.preview?.counts.profileDownloads, 1);
  assert.equal(result.preview?.counts.modRelations, 2);
});

test("structure checks do not mutate the supplied source object", () => {
  const snapshot = structuredClone(sample);
  const before = JSON.stringify(snapshot);
  assert.equal(inspectBackupSnapshot(snapshot).error, undefined);
  assert.equal(JSON.stringify(snapshot), before);
});
