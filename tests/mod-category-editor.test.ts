import assert from "node:assert/strict";
import test from "node:test";
import {
  canSaveModCategories, changeModPrimary, modCategoryChanged, parseCategoryCatalog,
  parseModCategoryDraft, toggleModCategory
} from "../lib/mod-category-editor";

const modId = "11111111-1111-4111-8111-111111111111";
const a = "22222222-2222-4222-8222-222222222222";
const b = "33333333-3333-4333-8333-333333333333";
const c = "44444444-4444-4444-8444-444444444444";
const categories = [
  { id: a, name: "의상", sort_order: 1 },
  { id: b, name: "UI", sort_order: 2 },
  { id: c, name: "차량", sort_order: 3 }
];

test("owner category catalog is sorted and rejects malformed or duplicate rows", () => {
  const original = [categories[1], categories[0]];
  assert.deepEqual(parseCategoryCatalog({ categories: original }), [categories[0], categories[1]]);
  assert.equal(original[0].id, b);
  for (const data of [
    {}, { categories: "bad" }, { categories: [categories[0], categories[0]] },
    { categories: [{ ...categories[0], name: " 의상 " }] },
    { categories: [{ ...categories[0], sort_order: -1 }] },
    { categories: [{ ...categories[0], id: "not-uuid" }] }
  ]) assert.equal(parseCategoryCatalog(data), null);
});

test("membership payload must belong to current mod and known category definitions", () => {
  assert.deepEqual(parseModCategoryDraft({
    modId, categoryIds: [a, b], primaryCategoryId: b
  }, modId, categories), { modId, categoryIds: [a, b], primaryCategoryId: b });
  for (const invalid of [
    { modId: b, categoryIds: [a], primaryCategoryId: a },
    { modId, categoryIds: [c, c], primaryCategoryId: c },
    { modId, categoryIds: [a], primaryCategoryId: b },
    { modId, categoryIds: [a, "55555555-5555-4555-8555-555555555555"], primaryCategoryId: a },
    { modId, categoryIds: [], primaryCategoryId: a }
  ]) assert.equal(parseModCategoryDraft(invalid, modId, categories), null);
});

test("zero memberships with null primary is valid for both reads and clearing writes", () => {
  const empty = parseModCategoryDraft({ modId, categoryIds: [], primaryCategoryId: null }, modId, categories);
  assert.ok(empty);
  assert.equal(canSaveModCategories(empty), true);
  assert.equal(canSaveModCategories({ modId, categoryIds: [], primaryCategoryId: a }), false);
  const chosen = toggleModCategory(empty, a);
  assert.deepEqual(chosen.categoryIds, [a]);
  assert.equal(chosen.primaryCategoryId, a);
  assert.equal(canSaveModCategories(chosen), true);
  const cleared = toggleModCategory(chosen, a);
  assert.deepEqual(cleared.categoryIds, []);
  assert.equal(cleared.primaryCategoryId, null);
  assert.equal(canSaveModCategories(cleared), true);
  assert.equal(modCategoryChanged(chosen, cleared), true);
});

test("removing primary picks another selected member and never edits original", () => {
  const saved = Object.freeze({ modId, categoryIds: Object.freeze([a, b]), primaryCategoryId: a });
  const result = toggleModCategory(saved, a);
  assert.deepEqual(result.categoryIds, [b]);
  assert.equal(result.primaryCategoryId, b);
  assert.deepEqual(saved.categoryIds, [a, b]);
  assert.equal(saved.primaryCategoryId, a);
  assert.equal(changeModPrimary(saved, c), saved);
  assert.equal(changeModPrimary(saved, b).primaryCategoryId, b);
});

test("selection equality ignores order but compares primary and category membership", () => {
  const saved = { modId, categoryIds: [a, b], primaryCategoryId: a };
  assert.equal(modCategoryChanged(saved, { modId, categoryIds: [b, a], primaryCategoryId: a }), false);
  assert.equal(modCategoryChanged(saved, { modId, categoryIds: [b, a], primaryCategoryId: b }), true);
  assert.equal(modCategoryChanged(saved, { modId, categoryIds: [a], primaryCategoryId: a }), true);
});

test("64 categories is the draft write boundary; invalid primary is blocked", () => {
  const ids = Array.from({ length: 64 }, (_, index) =>
    (index + 1).toString(16).padStart(8, "0") + "-1111-4111-8111-111111111111");
  const saved = { modId, categoryIds: ids, primaryCategoryId: ids[0] };
  assert.equal(canSaveModCategories(saved), true);
  assert.equal(toggleModCategory(saved, a), saved);
  assert.equal(canSaveModCategories({ ...saved, categoryIds: [...ids, a] }), false);
  assert.equal(canSaveModCategories({ ...saved, primaryCategoryId: b }), false);
  assert.equal(canSaveModCategories({ ...saved, categoryIds: [a, a] }), false);
});
