import assert from "node:assert/strict";
import test from "node:test";
import { checkGroupSelection } from "../lib/group-selection-rule";

const members = ["a", "b", "c"];

test("default free selection allows none, one, or all members", () => {
  for (const selected of [[], ["a"], ["a", "b"], members]) {
    assert.deepEqual(checkGroupSelection(members, selected), { ok: true });
  }
});

test("explicit exclusive maximum one rejects two selections", () => {
  assert.deepEqual(checkGroupSelection(members, ["a", "b"], { maximum: 1 }), {
    ok: false, reason: "above-maximum"
  });
  assert.deepEqual(checkGroupSelection(members, ["a"], { maximum: 1 }), { ok: true });
});

test("explicit required minimum rejects an empty group", () => {
  assert.deepEqual(checkGroupSelection(members, [], { minimum: 1 }), {
    ok: false, reason: "below-minimum"
  });
});

test("explicit minimum and maximum are both enforced", () => {
  assert.deepEqual(checkGroupSelection(members, ["a"], { minimum: 2, maximum: 2 }), {
    ok: false, reason: "below-minimum"
  });
  assert.deepEqual(checkGroupSelection(members, ["a", "b"], { minimum: 2, maximum: 2 }), { ok: true });
  assert.deepEqual(checkGroupSelection(members, members, { minimum: 2, maximum: 2 }), {
    ok: false, reason: "above-maximum"
  });
});

test("unknown and duplicate mod identifiers cannot be silently accepted", () => {
  assert.deepEqual(checkGroupSelection(members, ["a", "z"]), { ok: false, reason: "unknown-mod" });
  assert.deepEqual(checkGroupSelection(members, ["a", "a"]), { ok: false, reason: "duplicate-mod" });
});

test("invalid rules fail closed", () => {
  for (const rule of [
    { minimum: -1 }, { maximum: -1 }, { minimum: 1.5 }, { maximum: Number.NaN },
    { minimum: 3, maximum: 1 }, { maximum: Number.POSITIVE_INFINITY }
  ]) {
    assert.deepEqual(checkGroupSelection(members, [], rule), { ok: false, reason: "invalid-rule" });
  }
});

test("empty group permits empty selection by default", () => {
  assert.deepEqual(checkGroupSelection([], []), { ok: true });
});

test("validation never changes member or selected order", () => {
  const group = Object.freeze(["c", "b", "a"]);
  const selected = Object.freeze(["b", "c"]);
  assert.deepEqual(checkGroupSelection(group, selected), { ok: true });
  assert.deepEqual(group, ["c", "b", "a"]);
  assert.deepEqual(selected, ["b", "c"]);
});
