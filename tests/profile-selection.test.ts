import assert from "node:assert/strict";
import test from "node:test";
import { validateProfileSelection } from "../lib/profile-selection";

const firstWorkshop = "1234567890";
const secondWorkshop = "9876543210";
const thirdWorkshop = "18446744073709551615";
const catalog = [
  { workshopId: firstWorkshop, modIds: ["Core", "Extra", "Optional"] },
  { workshopId: secondWorkshop, modIds: ["Other"] },
  { workshopId: thirdWorkshop, modIds: [] }
] as const;

test("returns only explicitly selected Mod IDs in order and deduplicates Workshop IDs by first selection", () => {
  const result = validateProfileSelection(catalog, [
    { workshopId: secondWorkshop, modId: "Other" },
    { workshopId: firstWorkshop, modId: "Extra" },
    { workshopId: firstWorkshop, modId: "Core" }
  ]);

  assert.deepEqual(result, {
    ok: true,
    modIds: ["Other", "Extra", "Core"],
    workshopIds: [secondWorkshop, firstWorkshop],
    warnings: []
  });
});

test("accepts an empty profile without enabling any catalog Mod IDs", () => {
  assert.deepEqual(validateProfileSelection(catalog, []), {
    ok: true,
    modIds: [],
    workshopIds: [],
    warnings: []
  });
});

test("trims selection whitespace while preserving the case and precision of IDs", () => {
  const result = validateProfileSelection(
    [{ workshopId: thirdWorkshop, modIds: ["MixedCase"] }],
    [{ workshopId: ` ${thirdWorkshop}\t`, modId: " MixedCase " }]
  );

  assert.deepEqual(result, {
    ok: true,
    modIds: ["MixedCase"],
    workshopIds: [thirdWorkshop],
    warnings: []
  });
});

test("reports empty and missing ID fields with their selection index", () => {
  const result = validateProfileSelection(catalog, [
    { workshopId: " \t", modId: "" },
    {},
    { workshopId: firstWorkshop, modId: null }
  ]);

  assert.deepEqual(result, {
    ok: false,
    errors: [
      { index: 0, code: "missing-workshop-id" },
      { index: 0, code: "missing-mod-id" },
      { index: 1, code: "missing-workshop-id" },
      { index: 1, code: "missing-mod-id" },
      { index: 2, code: "missing-mod-id" }
    ],
    warnings: []
  });
});

test("rejects unknown Workshop IDs, mismatched pairs and unlisted Mod IDs without returning a partial selection", () => {
  const result = validateProfileSelection(catalog, [
    { workshopId: firstWorkshop, modId: "Core" },
    { workshopId: "1111111111", modId: "Core" },
    { workshopId: firstWorkshop, modId: "Other" },
    { workshopId: firstWorkshop, modId: firstWorkshop },
    { workshopId: firstWorkshop, modId: "core" },
    { workshopId: thirdWorkshop, modId: "Unknown" }
  ]);

  assert.deepEqual(result, {
    ok: false,
    errors: [
      { index: 1, code: "unknown-workshop-id", workshopId: "1111111111" },
      { index: 2, code: "unknown-mod-id", workshopId: firstWorkshop, modId: "Other" },
      { index: 3, code: "unknown-mod-id", workshopId: firstWorkshop, modId: firstWorkshop },
      { index: 4, code: "unknown-mod-id", workshopId: firstWorkshop, modId: "core" },
      { index: 5, code: "unknown-mod-id", workshopId: thirdWorkshop, modId: "Unknown" }
    ],
    warnings: []
  });
});

const overlappingCatalog = [
  { workshopId: firstWorkshop, modIds: ["Shared", "Shared", "AnotherShared", "Local", "Local"] },
  { workshopId: secondWorkshop, modIds: ["Shared", "AnotherShared"] },
  { workshopId: thirdWorkshop, modIds: ["Shared"] }
] as const;
const sharedIdWarning = {
  code: "duplicate-mod-id",
  modId: "Shared",
  workshopIds: [firstWorkshop, secondWorkshop, thirdWorkshop]
};

test("warns about all providers of a selected duplicate Mod ID without adding their Workshop IDs", () => {
  const result = validateProfileSelection(overlappingCatalog, [
    { workshopId: secondWorkshop, modId: "Shared" },
    { workshopId: firstWorkshop, modId: "Local" }
  ]);

  assert.deepEqual(result, {
    ok: true,
    modIds: ["Shared", "Local"],
    workshopIds: [secondWorkshop, firstWorkshop],
    warnings: [sharedIdWarning]
  });
});

test("keeps selections in order when multiple selected Workshops provide the same Mod ID", () => {
  const result = validateProfileSelection(overlappingCatalog, [
    { workshopId: secondWorkshop, modId: "Shared" },
    { workshopId: firstWorkshop, modId: "AnotherShared" },
    { workshopId: firstWorkshop, modId: "Shared" }
  ]);

  assert.deepEqual(result, {
    ok: true,
    modIds: ["Shared", "AnotherShared", "Shared"],
    workshopIds: [secondWorkshop, firstWorkshop],
    warnings: [
      sharedIdWarning,
      { code: "duplicate-mod-id", modId: "AnotherShared", workshopIds: [firstWorkshop, secondWorkshop] }
    ]
  });
});

test("reports duplicate candidates for valid selections alongside errors in other selections", () => {
  const result = validateProfileSelection(overlappingCatalog, [
    { workshopId: firstWorkshop, modId: "Shared" },
    { workshopId: secondWorkshop }
  ]);

  assert.deepEqual(result, {
    ok: false,
    errors: [{ index: 1, code: "missing-mod-id" }],
    warnings: [sharedIdWarning]
  });
});
