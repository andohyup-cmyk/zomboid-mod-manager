import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_TABLES, inspectBackupSnapshot } from "../lib/backup-preview";

const owner = "owner-a", other = "owner-b";
const sample = {
  ...Object.fromEntries(BACKUP_TABLES.map(name => [name, []])),
  mods: [{ id: "m1", owner_id: owner, workshop_id: "9000011001" }],
  categories: [
    { id: "a", owner_id: owner, name: "UI", sort_order: 0 },
    { id: "b", owner_id: owner, name: "편의성", sort_order: 1 },
    { id: "c", owner_id: owner, name: "차량", sort_order: 2 }
  ],
  modCategories: [
    { owner_id: owner, mod_id: "m1", category_id: "a" },
    { owner_id: owner, mod_id: "m1", category_id: "b" }
  ],
  modCategoryPrimary: [{ owner_id: owner, mod_id: "m1", category_id: "b" }]
};
type Data = typeof sample;
function inspect(data: Record<string, unknown>) {
  return inspectBackupSnapshot({ schemaVersion: 4,
    exportedAt: "2026-11-22T00:00:00Z", scope: "authorized-user-catalog-and-profiles",
    complete: true, warnings: [], data });
}
function error(change: (data: Data) => void) {
  const data = structuredClone(sample);
  change(data);
  return inspect(data).error ?? "";
}
test("v4 preserves two memberships, one primary, unused definitions", () => {
  const result = inspect(sample);
  assert.equal(result.error, undefined);
  assert.equal(result.preview?.complete, true);
  assert.deepEqual([
    result.preview?.counts.categories,
    result.preview?.counts.modCategories,
    result.preview?.counts.modCategoryPrimary
  ], [3,2,1]);
});
test("unclassified mods and unused categories require no primary", () => {
  const d = structuredClone(sample);
  d.modCategories = []; d.modCategoryPrimary = [];
  assert.equal(inspect(d).error, undefined);
});
test("orphan and duplicate category IDs or names are rejected", () => {
  assert.match(error(d => { d.categories.splice(1, 1); }), /카테고리/);
  assert.match(error(d => { d.categories[1].id = "a"; }), /카테고리/);
  assert.match(error(d => { d.categories[1].name = "UI"; }), /카테고리/);
  assert.match(error(d => { d.categories[1].sort_order = -1; }), /카테고리/);
});
test("foreign and missing mod/category memberships are rejected", () => {
  assert.match(error(d => { d.modCategories[0].owner_id = other; }), /소유자/);
  assert.match(error(d => { d.modCategories[0].mod_id = "missing"; }), /참조/);
  assert.match(error(d => { d.modCategories[0].category_id = "missing"; }), /참조/);
  assert.match(error(d => { d.modCategories.push({ ...d.modCategories[0] }); }), /중복/);
});
test("primary category must be a unique member of its own mod", () => {
  assert.match(error(d => { d.modCategoryPrimary = []; }), /대표/);
  assert.match(error(d => { d.modCategoryPrimary[0].category_id = "c"; }), /대표/);
  assert.match(error(d => { d.modCategoryPrimary.push({ ...d.modCategoryPrimary[0] }); }), /대표/);
  assert.match(error(d => { d.modCategoryPrimary[0].owner_id = other; }), /소유자/);
});
test("a crafted JSON cannot assign more than 64 categories to a mod", () => {
  const d = structuredClone(sample);
  for (let i=0;i<63;i++) {
    const id = "extra-"+i;
    d.categories.push({ id, owner_id: owner, name: "신규"+i, sort_order: i+3 });
    d.modCategories.push({ owner_id: owner, mod_id: "m1", category_id: id });
  }
  assert.match(inspect(d).error ?? "", /64개/);
});
test("v4 source data remains unchanged after inspection", () => {
  const d=structuredClone(sample), before=JSON.stringify(d);
  assert.equal(inspect(d).error, undefined);
  assert.equal(JSON.stringify(d), before);
});
