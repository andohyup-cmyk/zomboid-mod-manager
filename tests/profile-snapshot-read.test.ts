import assert from "node:assert/strict";
import test from "node:test";
import { reconstructProfileSnapshot } from "../lib/profile-snapshot-read";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const parents = Object.freeze([
  Object.freeze({ id: "m1", owner_id: owner, workshop_id: "3552615247" }),
  Object.freeze({ id: "m2", owner_id: owner, workshop_id: "2142622992" })
]);
const entries = Object.freeze([
  Object.freeze({ id: "a", mod_id: "m1", value: "Core" }),
  Object.freeze({ id: "b", mod_id: "m1", value: "Optional" }),
  Object.freeze({ id: "c", mod_id: "m2", value: "Core" })
]);
const choices = Object.freeze([
  Object.freeze({ mod_id_entry_id: "b", enabled: false, load_order: 0 }),
  Object.freeze({ mod_id_entry_id: "c", enabled: true, load_order: 1 }),
  Object.freeze({ mod_id_entry_id: "a", enabled: true, load_order: 2 })
]);
const downloads = Object.freeze([
  Object.freeze({ workshop_id: "3620000001", load_order: 0 }),
  Object.freeze({ workshop_id: "3552615247", load_order: 1 })
]);

test("restores each exact game Mod ID, disabled slot, source and order", () => {
  const result = reconstructProfileSnapshot(owner, choices, downloads, entries, parents);
  assert.deepEqual(result, {
    selections: [
      { workshopId: "3552615247", modId: "Optional", modIdUuid: "b", enabled: false },
      { workshopId: "2142622992", modId: "Core", modIdUuid: "c", enabled: true },
      { workshopId: "3552615247", modId: "Core", modIdUuid: "a", enabled: true }
    ],
    downloadOnlyWorkshopIds: ["3620000001", "3552615247"]
  });
});

test("empty saved revision safely restores an empty draft", () => {
  assert.deepEqual(reconstructProfileSnapshot(owner, [], [], [], []), {
    selections: [], downloadOnlyWorkshopIds: []
  });
});

test("foreign Workshop ownership is never included in output", () => {
  assert.equal(reconstructProfileSnapshot(owner, choices, downloads, entries,
    [{ ...parents[0], owner_id: other }, parents[1]]), null);
});

test("missing Mod ID or parent is not silently discarded", () => {
  assert.equal(reconstructProfileSnapshot(owner, choices, downloads, entries.slice(1), parents), null);
  assert.equal(reconstructProfileSnapshot(owner, choices, downloads, entries, parents.slice(1)), null);
});

test("out-of-order, duplicate or missing load positions are rejected", () => {
  assert.equal(reconstructProfileSnapshot(owner,
    [{ ...choices[0], load_order: 1 }], [], entries, parents), null);
  assert.equal(reconstructProfileSnapshot(owner,
    [choices[0], { ...choices[1], load_order: 0 }], [], entries, parents), null);
  assert.equal(reconstructProfileSnapshot(owner,
    [choices[0], { ...choices[0], load_order: 1 }], [], entries, parents), null);
  assert.equal(reconstructProfileSnapshot(owner,
    [], [{ ...downloads[0], load_order: 3 }], entries, parents), null);
});

test("invalid, duplicate and noncanonical download-only IDs are rejected", () => {
  assert.equal(reconstructProfileSnapshot(owner, [], [
    { workshop_id: "0003620000001", load_order: 0 }
  ], [], []), null);
  assert.equal(reconstructProfileSnapshot(owner, [], [
    { workshop_id: "3620000001", load_order: 0 },
    { workshop_id: "3620000001", load_order: 1 }
  ], [], []), null);
  assert.equal(reconstructProfileSnapshot(owner, [], [
    { workshop_id: "bad", load_order: 0 }
  ], [], []), null);
});

test("duplicate catalog IDs and malformed ownership inputs fail closed", () => {
  assert.equal(reconstructProfileSnapshot(owner, [], [], [entries[0], entries[0]], parents), null);
  assert.equal(reconstructProfileSnapshot(owner, [], [], entries, [parents[0], parents[0]]), null);
});

test("read-only reconstruction leaves frozen database rows unchanged", () => {
  const before = JSON.stringify({ choices, downloads, entries, parents });
  assert.ok(reconstructProfileSnapshot(owner, choices, downloads, entries, parents));
  assert.equal(JSON.stringify({ choices, downloads, entries, parents }), before);
});
