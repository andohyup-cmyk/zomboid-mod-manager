import assert from "node:assert/strict";
import test from "node:test";
import {
  insertProfileModsByCategory,
  type ProfileCategoryMod
} from "../lib/profile-category-insertion";

const workshopId = "1234567890";

function selection(modId: string, primaryCategoryId?: string | null): ProfileCategoryMod {
  return { workshopId, modId, primaryCategoryId };
}

test("inserts after the last mod with the same primary category", () => {
  const first = selection("VehicleA", "vehicles");
  const last = selection("VehicleB", "vehicles");
  const map = selection("Map", "maps");
  const addition = selection("VehicleC", "vehicles");

  assert.deepEqual(insertProfileModsByCategory([first, last, map], [addition]), [
    first, last, addition, map
  ]);
});

test("uses the last match when a category is split and preserves the existing order", () => {
  const first = selection("VehicleA", "vehicles");
  const map = selection("Map", "maps");
  const last = selection("VehicleB", "vehicles");
  const weapon = selection("Weapon", "weapons");
  const addition = selection("VehicleC", "vehicles");

  assert.deepEqual(insertProfileModsByCategory([first, map, last, weapon], [addition]), [
    first, map, last, addition, weapon
  ]);
});

test("appends missing and unknown categories even when an existing category is unknown", () => {
  const existing = [selection("Unknown", null), selection("Map", "maps")];
  const additions = [
    selection("Vehicle", "vehicles"),
    selection("Unconfirmed", null),
    { workshopId, modId: "Omitted" },
    selection("Blank", " \t ")
  ];

  assert.deepEqual(insertProfileModsByCategory(existing, additions), [...existing, ...additions]);
});

test("uses the primary category for placement and preserves all tags", () => {
  const vehicle = selection("VehicleA", "vehicles");
  const map: ProfileCategoryMod = {
    ...selection("Map", "maps"),
    tags: ["vehicles", "utility"]
  };
  const addition: ProfileCategoryMod = {
    ...selection("VehicleB", "vehicles"),
    tags: ["maps", "utility"]
  };

  assert.deepEqual(insertProfileModsByCategory([vehicle, map], [addition]), [vehicle, addition, map]);
});

test("processes additions in sequence and preserves their order within each category", () => {
  const vehicle = selection("VehicleA", "vehicles");
  const map = selection("MapA", "maps");
  const vehicleB = selection("VehicleB", "vehicles");
  const mapB = selection("MapB", "maps");
  const vehicleC = selection("VehicleC", "vehicles");
  const weapon = selection("WeaponA", "weapons");
  const mapC = selection("MapC", "maps");
  const weaponB = selection("WeaponB", "weapons");

  assert.deepEqual(
    insertProfileModsByCategory([vehicle, map], [vehicleB, mapB, vehicleC, weapon, mapC, weaponB]),
    [vehicle, vehicleB, vehicleC, map, mapB, mapC, weapon, weaponB]
  );
});

test("skips selected pairs and repeated additions without replacing the first record", () => {
  const existing = selection("Shared", "vehicles");
  const addition = selection("New", "vehicles");
  const duplicate = { ...selection(" Shared ", "maps"), workshopId: ` ${workshopId} ` };
  const repeated = { ...selection("New", "weapons"), tags: ["utility"] };
  const trailing = selection("Furniture", "furniture");

  assert.deepEqual(
    insertProfileModsByCategory([existing, trailing], [duplicate, addition, repeated]),
    [existing, addition, trailing]
  );
});

test("keeps the same Mod ID from another Workshop and distinguishes Mod ID case", () => {
  const existing = selection("Shared", "vehicles");
  const otherWorkshop = { ...existing, workshopId: "9876543210" };
  const otherMod = selection("shared", "vehicles");

  assert.deepEqual(
    insertProfileModsByCategory([existing], [otherWorkshop, otherMod]),
    [existing, otherWorkshop, otherMod]
  );
});

test("compares category IDs case-sensitively after trimming outer whitespace", () => {
  const upper = selection("MapA", "Maps");
  const lower = selection("MapB", "maps");
  const addition = selection("MapC", " Maps ");

  assert.deepEqual(insertProfileModsByCategory([upper, lower], [addition]), [
    upper, addition, lower
  ]);
});

test("returns a fresh list and leaves frozen inputs and their records intact", () => {
  const existingMod = Object.freeze(selection("Map", "maps"));
  const newMod = Object.freeze({
    ...selection("Vehicle", "vehicles"),
    tags: Object.freeze(["transport", "utility"])
  });
  const existing = Object.freeze([existingMod]);
  const additions = Object.freeze([newMod]);
  const result = insertProfileModsByCategory(existing, additions);

  assert.notStrictEqual(result, existing);
  assert.strictEqual(result[0], existingMod);
  assert.strictEqual(result[1], newMod);
  assert.deepEqual(existing, [existingMod]);
  assert.deepEqual(additions, [newMod]);
  assert.deepEqual(insertProfileModsByCategory([], additions), [newMod]);
  assert.notStrictEqual(insertProfileModsByCategory(existing, []), existing);
});
