import assert from "node:assert/strict";
import test from "node:test";
import { moveProfileMod } from "../lib/profile-mod-order";

test("moves item 25 to position 3 and shifts positions 3 through 24 down one", () => {
  const items = Object.freeze(Array.from({ length: 28 }, (_, index) => index + 1));
  const ordered = moveProfileMod(items, 25, 3);

  assert.deepEqual(ordered, [1, 2, 25, ...items.slice(2, 24), 26, 27, 28]);
  assert.equal(items[24], 25);
  assert.equal(new Set(ordered).size, items.length);
});

test("moves down across disabled selections and preserves their state and relative order", () => {
  const first = Object.freeze({ modId: "First", enabled: true });
  const disabled = Object.freeze({ modId: "Disabled", enabled: false });
  const last = Object.freeze({ modId: "Last", enabled: true });
  const items = Object.freeze([first, disabled, last]);

  const ordered = moveProfileMod(items, 1, 3);
  assert.deepEqual(ordered, [disabled, last, first]);
  assert.strictEqual(ordered[0], disabled);
  assert.deepEqual(items, [first, disabled, last]);
});

test("keeps the list for invalid, empty or unchanged positions", () => {
  const items = Object.freeze(["A", "B"]);
  for (const [from, to] of [[0, 1], [1, 3], [1, 1], [1.5, 2], [1, NaN]]) {
    assert.strictEqual(moveProfileMod(items, from, to), items);
  }
  const empty = Object.freeze([]);
  assert.strictEqual(moveProfileMod(empty, 1, 1), empty);
});
