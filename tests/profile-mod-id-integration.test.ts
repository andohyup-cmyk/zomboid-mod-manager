import assert from "node:assert/strict";
import test from "node:test";
import { addProfileModSelections } from "../lib/profile-mod-id-integration";
import { getEnabledProfileMods, updateProfileModState } from "../lib/profile-mod-id-state";
import { validateProfileSelection } from "../lib/profile-selection";

const firstWorkshop = "1234567890";
const secondWorkshop = "9876543210";
const existingWorkshop = "5555555555";
const catalog = [
  { workshopId: firstWorkshop, modIds: ["Shared", "Engine", "Unselected"] },
  { workshopId: secondWorkshop, modIds: ["Shared"] },
  { workshopId: existingWorkshop, modIds: ["Map", "Vehicle", "Weapon"] }
] as const;
const warnings = [{
  code: "duplicate-mod-id",
  modId: "Shared",
  workshopIds: [firstWorkshop, secondWorkshop]
}];

const map = Object.freeze({
  workshopId: existingWorkshop, modId: "Map", primaryCategoryId: "maps", enabled: true, loadOrder: 0
});
const vehicle = Object.freeze({
  workshopId: existingWorkshop, modId: "Vehicle", primaryCategoryId: "vehicles", enabled: true, loadOrder: 1
});
const weapon = Object.freeze({
  workshopId: existingWorkshop, modId: "Weapon", primaryCategoryId: "weapons", enabled: true, loadOrder: 2
});
const shared = Object.freeze({
  workshopId: firstWorkshop,
  modId: "Shared",
  primaryCategoryId: "vehicles",
  tags: Object.freeze(["transport", "utility"]),
  modIdUuid: "d74cd0ae-1843-4a52-89db-c4a883cf9505"
});
const engine = Object.freeze({
  workshopId: firstWorkshop,
  modId: "Engine",
  primaryCategoryId: "vehicles",
  tags: Object.freeze(["parts"]),
  modIdUuid: "44279632-7b45-4060-b52a-91b6383775e2"
});

test("validates explicit Mod IDs and applies category placement through removal and re-addition", () => {
  const existing = Object.freeze([map, vehicle, weapon]);
  const paddedShared = Object.freeze({
    ...shared, workshopId: ` ${firstWorkshop} `, modId: " Shared ", enabled: false, loadOrder: 99
  });
  const candidates = Object.freeze([paddedShared, engine]);
  assert.deepEqual(validateProfileSelection(catalog, candidates), {
    ok: true,
    modIds: ["Shared", "Engine"],
    workshopIds: [firstWorkshop],
    warnings
  });

  const added = addProfileModSelections(catalog, existing, candidates);
  assert.ok(added.ok);
  const selectedShared = { ...shared, enabled: true };
  const selectedEngine = { ...engine, enabled: true };
  assert.deepEqual(added.warnings, warnings);
  assert.deepEqual(added.selections, [map, vehicle, selectedShared, selectedEngine, weapon]);
  assert.deepEqual(existing, [map, vehicle, weapon]);
  assert.deepEqual(candidates, [paddedShared, engine]);

  const disabled = updateProfileModState(added.selections, shared, "disable");
  assert.deepEqual(disabled, [map, vehicle, { ...selectedShared, enabled: false }, selectedEngine, weapon]);
  assert.deepEqual(getEnabledProfileMods(disabled), [map, vehicle, selectedEngine, weapon]);
  const enabled = updateProfileModState(disabled, shared, "enable");
  assert.deepEqual(enabled, added.selections);

  const removed = updateProfileModState(enabled, shared, "remove");
  assert.deepEqual(removed, [map, vehicle, selectedEngine, weapon]);
  const readded = addProfileModSelections(catalog, removed, [shared]);
  assert.ok(readded.ok);
  assert.deepEqual(readded.selections, [map, vehicle, selectedEngine, selectedShared, weapon]);
});

test("keeps the disabled pair as an anchor and adds the same Mod ID from another Workshop once", () => {
  const disabledShared = Object.freeze({ ...shared, enabled: false, loadOrder: 3 });
  const existing = Object.freeze([vehicle, disabledShared, weapon]);
  const otherShared = {
    ...shared,
    workshopId: secondWorkshop,
    modIdUuid: "1037b467-5135-431f-af79-a3c641a46178"
  };
  const result = addProfileModSelections(catalog, existing, [
    { ...shared, primaryCategoryId: "maps" },
    otherShared,
    { ...otherShared, primaryCategoryId: "weapons" }
  ]);
  assert.ok(result.ok);
  assert.deepEqual(result.warnings, warnings);
  assert.deepEqual(result.selections, [vehicle, disabledShared, { ...otherShared, enabled: true }, weapon]);
  assert.deepEqual(getEnabledProfileMods(result.selections), [vehicle, { ...otherShared, enabled: true }, weapon]);
});

test("rejects the full batch when a Mod ID belongs to a different Workshop", () => {
  const existing = Object.freeze([map, weapon]);
  const result = addProfileModSelections(catalog, existing, [
    shared,
    { workshopId: secondWorkshop, modId: "Engine" }
  ]);

  assert.deepEqual(result, {
    ok: false,
    errors: [{ index: 1, code: "unknown-mod-id", workshopId: secondWorkshop, modId: "Engine" }],
    warnings
  });
  assert.deepEqual(existing, [map, weapon]);
});
