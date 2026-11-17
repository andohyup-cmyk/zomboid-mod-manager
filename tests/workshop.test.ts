import assert from "node:assert/strict";
import test from "node:test";
import {
  extractWorkshopLinks,
  normalizeResearchRecord,
  parseResearchPayload,
  workshopIdFromUrl
} from "../lib/workshop";

test("extracts distinct workshop IDs from multiple Steam links", () => {
  const input = [
    "https://steamcommunity.com/sharedfiles/filedetails/?id=1234567890&searchtext=test",
    "https://steamcommunity.com/workshop/filedetails/?id=9876543210",
    "https://steamcommunity.com/sharedfiles/filedetails/?id=1234567890"
  ].join("\n");
  assert.deepEqual(extractWorkshopLinks(input), ["1234567890", "9876543210"]);
});

test("rejects lookalike domains and non-workshop URLs", () => {
  assert.equal(workshopIdFromUrl("https://steamcommunity.com.evil.test/sharedfiles/filedetails/?id=1234567890"), null);
  assert.equal(workshopIdFromUrl("javascript:alert(1)"), null);
  assert.equal(workshopIdFromUrl("https://steamcommunity.com/profiles/1234567890"), null);
});

test("multiple Mod IDs stay separate from Workshop ID", () => {
  const result = normalizeResearchRecord({
    workshopId: "1234567890",
    title: "Test mod",
    modIds: ["Body_A", "Body_B", "Body_A"]
  });
  assert.ok(result.record);
  assert.deepEqual(result.record.modIds, ["Body_A", "Body_B"]);
  assert.equal(result.record.buildCompatibility, "unverified");
  assert.equal(result.record.multiplayerCompatibility, "unverified");
});

test("rejects mismatching Steam source and duplicate payload items", () => {
  const mismatch = normalizeResearchRecord({
    workshopId: "1234567890",
    title: "Test",
    sourceUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=9876543210"
  });
  assert.ok(mismatch.error);
  const payload = parseResearchPayload(JSON.stringify([
    { workshopId: "1234567890", title: "A" },
    { workshopId: "1234567890", title: "B" }
  ]));
  assert.equal(payload.records.length, 1);
  assert.equal(payload.errors.length, 1);
});
