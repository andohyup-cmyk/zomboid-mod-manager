import assert from "node:assert/strict";
import test from "node:test";
import {
  getEnabledProfileMods,
  updateProfileModState,
  type ProfileModSelection
} from "../lib/profile-mod-id-state";

const firstWorkshop = "1234567890";
const secondWorkshop = "9876543210";
const selected: ProfileModSelection = Object.freeze({
  workshopId: firstWorkshop,
  modId: "Shared",
  enabled: true,
  primaryCategoryId: "vehicles",
  tags: Object.freeze(["transport", "utility"]),
  modIdUuid: "d74cd0ae-1843-4a52-89db-c4a883cf9505",
  loadOrder: 5
});
const sameWorkshop: ProfileModSelection = {
  workshopId: firstWorkshop,
  modId: "Different",
  enabled: true,
  loadOrder: 1
};
const sameModId: ProfileModSelection = {
  workshopId: secondWorkshop,
  modId: "Shared",
  enabled: true,
  loadOrder: 8
};

test("disables the selected pair in place while preserving its category, order and metadata", () => {
  const selections = Object.freeze([sameWorkshop, selected, sameModId]);
  const result = updateProfileModState(selections, selected, "disable");

  assert.deepEqual(result, [sameWorkshop, { ...selected, enabled: false }, sameModId]);
  assert.notStrictEqual(result, selections);
  assert.strictEqual(selections[1], selected);
  assert.equal(selected.enabled, true);
});

test("enables a disabled selection in its existing position", () => {
  const disabled = Object.freeze({ ...selected, enabled: false });
  const selections = Object.freeze([sameWorkshop, disabled, sameModId]);
  const result = updateProfileModState(selections, selected, "enable");

  assert.deepEqual(result, [sameWorkshop, selected, sameModId]);
  assert.notStrictEqual(result, selections);
  assert.equal(disabled.enabled, false);
});

test("removes only the selected Workshop and Mod ID pair and preserves other rows", () => {
  const selections = Object.freeze([sameWorkshop, selected, sameModId]);
  const result = updateProfileModState(selections, selected, "remove");

  assert.deepEqual(result, [sameWorkshop, sameModId]);
  assert.deepEqual(selections, [sameWorkshop, selected, sameModId]);
});

test("matches IDs after trimming outer whitespace and preserves their case", () => {
  const selections = [selected, { ...selected, modId: "shared" }];
  const target = { workshopId: ` ${firstWorkshop} `, modId: " Shared\t" };

  assert.deepEqual(updateProfileModState(selections, target, "disable"), [
    { ...selected, enabled: false }, selections[1]
  ]);
});

test("returns a fresh unchanged list when the target is unselected", () => {
  const selections = Object.freeze([sameWorkshop, sameModId]);
  for (const action of ["enable", "disable", "remove"] as const) {
    const result = updateProfileModState(selections, selected, action);
    assert.deepEqual(result, selections);
    assert.notStrictEqual(result, selections);
  }
});

test("repeating a state change leaves the resulting selections unchanged", () => {
  const selections = [sameWorkshop, selected, sameModId];
  for (const action of ["enable", "disable", "remove"] as const) {
    const once = updateProfileModState(selections, selected, action);
    const twice = updateProfileModState(once, selected, action);
    assert.deepEqual(twice, once);
    assert.notStrictEqual(twice, once);
  }
});

test("projects enabled selections in input order without mutating or renumbering them", () => {
  const first = Object.freeze({ ...sameModId, label: "First" });
  const disabled = Object.freeze({ ...selected, enabled: false, label: "Disabled" });
  const last = Object.freeze({ ...sameWorkshop, label: "Last" });
  const selections = Object.freeze([first, disabled, last]);
  const enabled = getEnabledProfileMods(selections);

  assert.deepEqual(enabled.map(({ label, loadOrder }) => [label, loadOrder]), [
    ["First", 8], ["Last", 1]
  ]);
  assert.strictEqual(enabled[0], first);
  assert.strictEqual(enabled[1], last);
  assert.deepEqual(selections, [first, disabled, last]);
  assert.deepEqual(getEnabledProfileMods([disabled]), []);
});
