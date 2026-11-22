import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_TABLES, inspectBackupSnapshot } from "../lib/backup-preview";

const owner = "owner-a";
const other = "owner-b";
const core = {
  mods: [
    { id: "m1", owner_id: owner, workshop_id: "9000011001" },
    { id: "m2", owner_id: owner, workshop_id: "9000011002" }
  ],
  modIds: [
    { id: "g1", mod_id: "m1", value: "TestMain" },
    { id: "g2", mod_id: "m2", value: "TestPatch" }
  ],
  researchRecords: [{ id: "r1", mod_id: "m1", raw_payload: {} }],
  profiles: [{ id: "p1", owner_id: owner }],
  profileMods: [{ profile_id: "p1", mod_id: "m1", enabled: true, load_order: 0 }],
  researchQueue: [{ id: "q1", owner_id: owner }],
  profileRevisions: [{ profile_id: "p1", revision: 1, owner_id: owner }],
  profileModChoices: [
    { profile_id: "p1", revision: 1, owner_id: owner, mod_id_entry_id: "g1", enabled: true, load_order: 0 },
    { profile_id: "p1", revision: 1, owner_id: owner, mod_id_entry_id: "g2", enabled: false, load_order: 1 }
  ],
  profileDownloads: [{ profile_id: "p1", revision: 1, owner_id: owner, workshop_id: "9000011003", load_order: 0 }],
  modRelations: [{
    id: "rel1", owner_id: owner, kind: "requires",
    subject_mod_id_entry_id: "g1", target_mod_id_entry_id: "g2",
    research_record_id: "r1", evidence_url: "https://example.test/evidence",
    checked_at: "2026-11-21", approved: true, approved_at: "2026-11-21T11:00:00Z"
  }]
};

type Data = typeof core;
function snapshot(data: Record<string, unknown>) {
  return {
    schemaVersion: 3, exportedAt: "2026-11-22T00:00:00Z",
    scope: "authorized-user-catalog-and-profiles",
    complete: true, warnings: [], data
  };
}
function modified(change: (d: Data) => void): string | undefined {
  const data = structuredClone(core);
  change(data);
  return inspectBackupSnapshot(snapshot(data)).error;
}

test("all ten v3 tables and their owner-scoped references produce a structurally complete preview", () => {
  const result = inspectBackupSnapshot(snapshot(core));
  assert.equal(result.error, undefined);
  assert.equal(result.preview?.complete, true);
  assert.deepEqual(result.preview?.counts,
    Object.fromEntries(BACKUP_TABLES.map(name => [name, core[name].length])));
});

test("a missing referenced game Mod ID cannot be reported as a complete export", () => {
  assert.match(modified(d => { d.modIds.splice(1, 1); }) ?? "", /Mod ID/);
});

test("an orphaned research record or relationship evidence cannot be silently retained", () => {
  assert.match(modified(d => { d.researchRecords[0].mod_id = "deleted-mod"; }) ?? "", /조사 기록/);
  assert.match(modified(d => { d.modRelations[0].research_record_id = "unknown"; }) ?? "", /관계/);
});

test("orphaned legacy profile links and saved revisions are rejected", () => {
  assert.match(modified(d => { d.profileMods[0].profile_id = "old-profile"; }) ?? "", /기존 프로필/);
  assert.match(modified(d => { d.profileRevisions[0].profile_id = "old-profile"; }) ?? "", /저장 회차/);
});

test("saved selections require the exact matching revision, parent and owner", () => {
  assert.match(modified(d => { d.profileModChoices[0].revision = 2; }) ?? "", /Mod ID 선택/);
  assert.match(modified(d => { d.profileModChoices[0].owner_id = other; }) ?? "", /Mod ID 선택/);
  assert.match(modified(d => { d.profileModChoices[0].mod_id_entry_id = "unknown"; }) ?? "", /Mod ID 선택/);
});

test("disabled choices keep their original position; gaps and duplicate load orders are rejected", () => {
  assert.equal(inspectBackupSnapshot(snapshot(core)).error, undefined);
  assert.match(modified(d => { d.profileModChoices[1].load_order = 5; }) ?? "", /순번/);
  assert.match(modified(d => { d.profileModChoices[1].load_order = 0; }) ?? "", /Mod ID 선택/);
  assert.match(modified(d => { d.profileModChoices[1].enabled = false; }) ?? "", /^$/);
});

test("a download-only Workshop must match the stored revision and have a canonical identifier", () => {
  assert.match(modified(d => { d.profileDownloads[0].workshop_id = "0009000011003"; }) ?? "", /다운로드/);
  assert.match(modified(d => { d.profileDownloads[0].revision = 9; }) ?? "", /다운로드/);
});

test("a relationship is tied to its subject's owner and research parent", () => {
  assert.match(modified(d => { d.modRelations[0].owner_id = other; }) ?? "", /관계/);
  assert.match(modified(d => { d.modRelations[0].subject_mod_id_entry_id = "g2"; }) ?? "", /관계/);
  assert.match(modified(d => { d.modRelations[0].target_mod_id_entry_id = "unknown"; }) ?? "", /관계/);
});

test("approved and pending relation timestamps cannot contradict the approval state", () => {
  assert.match(modified(d => { d.modRelations[0].approved_at = ""; }) ?? "", /관계/);
  assert.match(modified(d => { d.modRelations[0].approved = false; }) ?? "", /관계/);
});

test("unrelated owners cannot be mixed into a single supposedly owner-scoped snapshot", () => {
  assert.match(modified(d => { d.researchQueue[0].owner_id = other; }) ?? "", /소유자/);
  assert.match(modified(d => { d.mods[1].owner_id = other; }) ?? "", /소유자|Mod ID 선택|기존 프로필|관계/);
});

test("duplicate parent/Mod ID and relation identifiers cannot be silently accepted", () => {
  assert.match(modified(d => { d.mods[1].workshop_id = "9000011001"; }) ?? "", /중복/);
  assert.match(modified(d => { d.modIds[1].id = "g1"; }) ?? "", /Mod ID/);
  assert.match(modified(d => { d.modRelations.push(structuredClone(d.modRelations[0])); }) ?? "", /관계/);
});

test("a queue outage remains a partial snapshot; legacy formats remain structurally inspectable", () => {
  const queueMissing = { ...core, researchQueue: null };
  const partial = inspectBackupSnapshot({
    ...snapshot(queueMissing), complete: false, warnings: ["queue unavailable"]
  });
  assert.equal(partial.error, undefined);
  assert.equal(partial.preview?.complete, false);
  const v2Data = Object.fromEntries(BACKUP_TABLES.filter(name => name !== "modRelations")
    .map(name => [name, core[name]]));
  const legacy = inspectBackupSnapshot({ ...snapshot(v2Data), schemaVersion: 2 });
  assert.equal(legacy.error, undefined);
  assert.equal(legacy.preview?.complete, false);
});

test("reference checks do not mutate source arrays or objects", () => {
  const source = structuredClone(core);
  const before = JSON.stringify(source);
  assert.equal(inspectBackupSnapshot(snapshot(source)).error, undefined);
  assert.equal(JSON.stringify(source), before);
});
