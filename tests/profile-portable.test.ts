import assert from "node:assert/strict";
import test from "node:test";
import { createPortableProfile, parsePortableProfile } from "../lib/profile-portable";

const mods = [
  { workshopId: "3552615247", modId: "Option_A", enabled: true },
  { workshopId: "3552615247", modId: "Option_B", enabled: false },
  { workshopId: "2142622992", modId: "RepairAnyClothes", enabled: true }
];

test("round trips provider, order, disabled state and download-only IDs", () => {
  const original = createPortableProfile(mods, ["3552615247", "2142622992"], "2026-11-20T00:00:00.000Z");
  const parsed = parsePortableProfile(JSON.parse(JSON.stringify(original)));
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.profile?.selections, mods);
  assert.deepEqual(parsed.profile?.downloadOnlyWorkshopIds, ["3552615247", "2142622992"]);
});
test("requires explicit exported kind and schema, never accepting arbitrary files", () => {
  assert.ok(parsePortableProfile({ selections: mods, downloadOnlyWorkshopIds: [] }).error);
  assert.ok(parsePortableProfile(null).error);
});
test("rejects duplicate provider/ID selections, invalid characters and ambiguous IDs", () => {
  const obj = createPortableProfile(mods, []);
  assert.ok(parsePortableProfile({ ...obj, selections: [mods[0], mods[0]] }).error);
  assert.ok(parsePortableProfile({ ...obj, selections: [{ ...mods[0], modId: "bad;injection" }] }).error);
  assert.ok(parsePortableProfile({ ...obj, selections: [{ ...mods[0], workshopId: "0003552615247" }] }).error);
  assert.ok(parsePortableProfile({ ...obj, selections: [{ ...mods[0], enabled: "yes" }] }).error);
});
test("rejects duplicate downloads, oversized input and missing objects", () => {
  const obj = createPortableProfile(mods, []);
  assert.ok(parsePortableProfile({ ...obj, downloadOnlyWorkshopIds: ["3552615247", "3552615247"] }).error);
  assert.ok(parsePortableProfile({ ...obj, selections: Array.from({ length: 501 }, () => mods[0]) }).error);
  assert.ok(parsePortableProfile({ ...obj, selections: [null] }).error);
});
