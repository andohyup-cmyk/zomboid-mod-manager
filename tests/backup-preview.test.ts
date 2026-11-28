import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectBackupSnapshot, BACKUP_TABLES, LEGACY_BACKUP_TABLES,
  NEW_PROFILE_BACKUP_TABLES, NEW_RELATION_BACKUP_TABLES, NEW_CATEGORY_BACKUP_TABLES,
  V2_BACKUP_TABLES, V3_BACKUP_TABLES
} from "../lib/backup-preview";

const emptyV4 = Object.fromEntries(BACKUP_TABLES.map(table => [table, []]));
const emptyV2 = Object.fromEntries(V2_BACKUP_TABLES.map(table => [table, []]));
const emptyV1 = Object.fromEntries(LEGACY_BACKUP_TABLES.map(table => [table, []]));
const sample = {
  schemaVersion: 4, exportedAt: "2026-11-21T00:00:00.000Z",
  scope: "authorized-user-catalog-and-profiles", complete: true, warnings: [],
  data: emptyV4
};

test("current v4 export must include all thirteen owner-scoped data areas", () => {
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

test("v4 missing relationship or revisioned tables cannot claim a backup", () => {
  for (const name of [...NEW_PROFILE_BACKUP_TABLES, ...NEW_RELATION_BACKUP_TABLES]) {
    const data: Record<string, unknown> = { ...emptyV4 };
    delete data[name];
    assert.ok(inspectBackupSnapshot({ ...sample, data }).error, name);
    assert.ok(inspectBackupSnapshot({
      ...sample, data: { ...emptyV4, [name]: null }
    }).error, name);
  }
});

test("v3 stays inspectable but is partial without category data", () => {
  const data = Object.fromEntries(V3_BACKUP_TABLES.map(name => [name, []]));
  const result = inspectBackupSnapshot({ ...sample, schemaVersion: 3, data });
  assert.equal(result.error, undefined);
  assert.equal(result.preview?.complete, false);
  assert.deepEqual(NEW_CATEGORY_BACKUP_TABLES.map(name => result.preview?.counts[name]), [null, null, null]);
  assert.match(result.preview?.warnings[0] ?? "", /v3/);
});

test("v4 requires each of the three category areas", () => {
  for (const name of NEW_CATEGORY_BACKUP_TABLES) {
    const data: Record<string, unknown> = { ...emptyV4 };
    delete data[name];
    assert.ok(inspectBackupSnapshot({ ...sample, data }).error, name);
    assert.ok(inspectBackupSnapshot({ ...sample, data: { ...emptyV4, [name]: null } }).error, name);
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
    data: { ...emptyV4, researchQueue: null }
  });
  assert.equal(result.preview?.complete, false);
  assert.equal(result.preview?.counts.researchQueue, null);
});

test("rejects falsely marked complete exports, unsupported versions and malformed rows", () => {
  assert.ok(inspectBackupSnapshot({
    ...sample, data: { ...emptyV4, researchQueue: null }
  }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, warnings: ["missing"] }).error);
  assert.ok(inspectBackupSnapshot({
    ...sample, schemaVersion: 1, data: { ...emptyV1, researchQueue: null }
  }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, schemaVersion: 5 }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, schemaVersion: 0 }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, data: { ...emptyV4, mods: [null] } }).error);
  assert.ok(inspectBackupSnapshot({ ...sample, data: { mods: [] } }).error);
});

test("counts a genuinely connected v4 profile and relationship export", () => {
  const owner = "owner-fixture";
  const data = {
    ...emptyV4,
    mods: [
      { id: "mod-a", owner_id: owner, workshop_id: "3552615247" },
      { id: "mod-b", owner_id: owner, workshop_id: "3552615248" }
    ],
    modIds: [
      { id: "id1", mod_id: "mod-a", value: "DemoMain" },
      { id: "id2", mod_id: "mod-b", value: "DemoPatch" }
    ],
    researchRecords: [{ id: "research-a", mod_id: "mod-a", raw_payload: {} }],
    profiles: [{ id: "p", owner_id: owner, name: "Example" }],
    profileMods: [{ profile_id: "p", mod_id: "mod-a", enabled: true, load_order: 0 }],
    profileRevisions: [{ profile_id: "p", owner_id: owner, revision: 1 }],
    profileModChoices: [
      { profile_id: "p", owner_id: owner, revision: 1, mod_id_entry_id: "id1", enabled: true, load_order: 0 },
      { profile_id: "p", owner_id: owner, revision: 1, mod_id_entry_id: "id2", enabled: false, load_order: 1 }
    ],
    profileDownloads: [
      { profile_id: "p", owner_id: owner, revision: 1, workshop_id: "3552615247", load_order: 0 }
    ],
    modRelations: [
      { id: "a", owner_id: owner, kind: "requires",
        subject_mod_id_entry_id: "id1", target_mod_id_entry_id: "id2",
        research_record_id: "research-a", evidence_url: "https://example.test/evidence",
        checked_at: "2026-11-20", approved: false, approved_at: null },
      { id: "b", owner_id: owner, kind: "loadBefore",
        subject_mod_id_entry_id: "id1", target_mod_id_entry_id: "id2",
        research_record_id: "research-a", evidence_url: "https://example.test/evidence",
        checked_at: "2026-11-20", approved: true, approved_at: "2026-11-21T00:00:00Z" }
    ]
  };
  const result = inspectBackupSnapshot({ ...sample, data });
  assert.equal(result.error, undefined);
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

test("optional selection group tables are counted when present and validated for referential integrity", () => {
  const owner = "owner-fixture";
  const withGroups = {
    ...sample,
    data: {
      ...sample.data,
      mods: [{ id: "mod-a", owner_id: owner, workshop_id: "3552615247" }],
      modIds: [
        { id: "m1", mod_id: "mod-a", value: "BodyA" },
        { id: "m2", mod_id: "mod-a", value: "BodyB" }
      ],
      selectionGroups: [{ id: "g1", owner_id: owner, label: "체형", min_selected: null, max_selected: 1 }],
      selectionGroupMembers: [
        { owner_id: owner, group_id: "g1", mod_id_ref: "m1" },
        { owner_id: owner, group_id: "g1", mod_id_ref: "m2" }
      ]
    }
  };
  const ok = inspectBackupSnapshot(withGroups);
  assert.equal(ok.error, undefined);
  assert.equal(ok.preview?.complete, true);
  assert.deepEqual(ok.preview?.optionalCounts, { selectionGroups: 1, selectionGroupMembers: 2 });

  const malformed = {
    ...sample,
    data: { ...sample.data, selectionGroups: "not-an-array" }
  };
  assert.ok(inspectBackupSnapshot(malformed).error);

  const orphanMember = {
    ...withGroups,
    data: {
      ...withGroups.data,
      selectionGroupMembers: [{ owner_id: owner, group_id: "g1", mod_id_ref: "missing-mod-id" }]
    }
  };
  assert.match(inspectBackupSnapshot(orphanMember).error ?? "", /선택 그룹 무결성/);

  const halfMissing = {
    ...withGroups,
    data: {
      ...sample.data,
      selectionGroups: [{ id: "g1", owner_id: owner, label: "체형" }]
    }
  };
  assert.match(inspectBackupSnapshot(halfMissing).error ?? "", /함께 포함/);
});

