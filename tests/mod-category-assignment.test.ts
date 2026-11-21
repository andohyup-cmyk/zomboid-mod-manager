import assert from "node:assert/strict";
import test from "node:test";
import { validateModCategories } from "../lib/mod-category-assignment";

test("one category can be the primary", () => {
  assert.deepEqual(validateModCategories({ categoryIds: ["vehicle"], primaryCategoryId: "vehicle" }), {
    ok: true,
    assignment: { categoryIds: ["vehicle"], primaryCategoryId: "vehicle" }
  });
});

test("multiple categories are permitted with exactly one primary", () => {
  assert.deepEqual(validateModCategories({
    categoryIds: ["vehicle", "quality-of-life", "ui"],
    primaryCategoryId: "quality-of-life"
  }), {
    ok: true,
    assignment: {
      categoryIds: ["vehicle", "quality-of-life", "ui"],
      primaryCategoryId: "quality-of-life"
    }
  });
});

test("primary must belong to selected categories", () => {
  assert.deepEqual(validateModCategories({
    categoryIds: ["vehicle", "ui"], primaryCategoryId: "map"
  }), { ok: false, reason: "primary-missing" });
});

test("empty category selection is rejected", () => {
  assert.deepEqual(validateModCategories({ categoryIds: [], primaryCategoryId: "" }), {
    ok: false, reason: "empty"
  });
});

test("duplicate category identifiers are rejected", () => {
  assert.deepEqual(validateModCategories({
    categoryIds: ["vehicle", "vehicle"], primaryCategoryId: "vehicle"
  }), { ok: false, reason: "duplicate" });
});

test("invalid identifiers and malformed payloads fail closed", () => {
  for (const input of [
    null, [], {}, "vehicle",
    { categoryIds: "vehicle", primaryCategoryId: "vehicle" },
    { categoryIds: ["vehicle"], primaryCategoryId: null },
    { categoryIds: [null], primaryCategoryId: "vehicle" },
    { categoryIds: [" vehicle"], primaryCategoryId: " vehicle" },
    { categoryIds: [""], primaryCategoryId: "" },
    { categoryIds: ["vehicle\u0000"], primaryCategoryId: "vehicle\u0000" },
    { categoryIds: ["v".repeat(129)], primaryCategoryId: "v".repeat(129) },
    { categoryIds: Array.from({ length: 65 }, (_, i) => String(i)), primaryCategoryId: "0" },
    { categoryIds: ["vehicle"], primaryCategoryId: "vehicle", owner_id: "another-user" }
  ]) {
    const result = validateModCategories(input);
    assert.equal(result.ok, false, JSON.stringify(input)?.slice(0,100));
  }
});

test("input arrays are never mutated", () => {
  const categoryIds = Object.freeze(["ui", "quality-of-life"]);
  const result = validateModCategories({ categoryIds, primaryCategoryId: "ui" });
  assert.equal(result.ok, true);
  assert.deepEqual(categoryIds, ["ui", "quality-of-life"]);
  if (result.ok) assert.notEqual(result.assignment.categoryIds, categoryIds);
});

test("category order is preserved; validator never sorts by itself", () => {
  const result = validateModCategories({
    categoryIds: ["map", "ui", "vehicle"], primaryCategoryId: "vehicle"
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.assignment.categoryIds, ["map", "ui", "vehicle"]);
});
