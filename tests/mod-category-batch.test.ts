import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBatchCategoryRequests,
  selectAllBatchMods,
  toggleBatchModSelection
} from "../lib/mod-category-batch";

test("toggleBatchModSelection adds and removes without mutating input", () => {
  const initial = Object.freeze(["m1"]);
  assert.deepEqual(toggleBatchModSelection(initial, "m2"), ["m1", "m2"]);
  assert.deepEqual(toggleBatchModSelection(["m1", "m2"], "m1"), ["m2"]);
  assert.deepEqual(initial, ["m1"]);
});

test("selectAllBatchMods deduplicates and caps at 100", () => {
  const ids = Array.from({ length: 105 }, (_, i) => `m${i}`);
  const selected = selectAllBatchMods(["m0", ...ids]);
  assert.equal(selected.length, 100);
  assert.equal(new Set(selected).size, 100);
});

test("buildBatchCategoryRequests supports multi-category and 0-category unclassified clearing", () => {
  assert.deepEqual(
    buildBatchCategoryRequests(["m1", "m2", "m1"], ["c1", "c2"], "c2"),
    [
      { modId: "m1", categoryIds: ["c1", "c2"], primaryCategoryId: "c2" },
      { modId: "m2", categoryIds: ["c1", "c2"], primaryCategoryId: "c2" }
    ]
  );
  assert.deepEqual(
    buildBatchCategoryRequests(["m1"], [], null),
    [{ modId: "m1", categoryIds: [], primaryCategoryId: null }]
  );
});

test("buildBatchCategoryRequests rejects empty mods or inconsistent primary", () => {
  assert.equal(buildBatchCategoryRequests([], ["c1"], "c1"), null);
  assert.equal(buildBatchCategoryRequests(["m1"], [], "c1"), null);
  assert.equal(buildBatchCategoryRequests(["m1"], ["c1"], null), null);
  assert.equal(buildBatchCategoryRequests(["m1"], ["c1"], "c2"), null);
});
