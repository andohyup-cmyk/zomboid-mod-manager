import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeResearchRecord,
  parseResearchPayload,
  parseWorkshopInput,
  workshopIdFromUrl
} from "../lib/workshop";

test("accepts a single Steam Workshop URL", () => {
  assert.deepEqual(parseWorkshopInput("http://www.steamcommunity.com/workshop/filedetails?id=1234567890"), {
    workshopIds: ["1234567890"],
    invalidPositions: []
  });
});

test("accepts a single numeric Workshop ID without losing precision", () => {
  assert.deepEqual(parseWorkshopInput("18446744073709551615"), {
    workshopIds: ["18446744073709551615"],
    invalidPositions: []
  });
});

test("extracts distinct workshop IDs from multiple Steam links", () => {
  const input = [
    "https://steamcommunity.com/sharedfiles/filedetails/?id=1234567890&searchtext=test",
    "https://steamcommunity.com/workshop/filedetails/?id=9876543210",
    "https://steamcommunity.com/sharedfiles/filedetails/?id=1234567890"
  ].join("\n");
  assert.deepEqual(parseWorkshopInput(input), {
    workshopIds: ["1234567890", "9876543210"],
    invalidPositions: []
  });
});

test("accepts multiple numeric IDs separated by spaces, newlines, or commas", () => {
  assert.deepEqual(parseWorkshopInput(" , 12345\t23456\r\n34567,45678, "), {
    workshopIds: ["12345", "23456", "34567", "45678"],
    invalidPositions: []
  });
});

test("deduplicates mixed IDs and links in order of first appearance", () => {
  const input = [
    "9876543210 1234567890",
    "https://steamcommunity.com/sharedfiles/filedetails/?id=009876543210,1234567890",
    "https://steamcommunity.com/workshop/filedetails/?id=2345678901"
  ].join("\n");
  assert.deepEqual(parseWorkshopInput(input), {
    workshopIds: ["9876543210", "1234567890", "2345678901"],
    invalidPositions: []
  });
});

test("reports invalid input positions while keeping valid Workshop IDs", () => {
  const invalidEntries = [
    "https://steamcommunity.com.evil.test/sharedfiles/filedetails/?id=12345",
    "https://steamcommunity.com/profiles/12345",
    "https://steamcommunity.com/sharedfiles/filedetails/?searchtext=12345",
    "https://steamcommunity.com/sharedfiles/filedetails/?id=Body_A",
    "https://steamcommunity.com/sharedfiles/filedetails/?id=12345&id=54321",
    "https://user@steamcommunity.com/sharedfiles/filedetails/?id=12345",
    "https:steamcommunity.com/sharedfiles/filedetails/?id=12345",
    "javascript:alert(1)",
    "1234",
    "00000",
    "18446744073709551616",
    "123456789012345678901",
    "-12345",
    "12345.5",
    "Body_A"
  ];
  for (const entry of invalidEntries) {
    assert.deepEqual(parseWorkshopInput(`, 12345, ${entry}\n54321`), {
      workshopIds: ["12345", "54321"],
      invalidPositions: [2]
    }, entry);
  }
  assert.deepEqual(parseWorkshopInput("Body_A, 1234"), {
    workshopIds: [],
    invalidPositions: [1, 2]
  });
});

test("ignores empty Workshop input entries", () => {
  assert.deepEqual(parseWorkshopInput(" ,\n\t, "), { workshopIds: [], invalidPositions: [] });
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
  assert.equal(result.record.workshopId, "1234567890");
  assert.deepEqual(result.record.modIds, ["Body_A", "Body_B"]);
  assert.equal(result.record.buildCompatibility, "unverified");
  assert.equal(result.record.multiplayerCompatibility, "unverified");
});

test("Workshop input normalization does not rewrite the manual JSON approval payload", () => {
  const workshopId = "0012345";
  assert.deepEqual(parseWorkshopInput(workshopId).workshopIds, ["12345"]);

  const { records, errors } = parseResearchPayload(JSON.stringify({
    workshopId,
    title: "Hand-entered research",
    sourceUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`,
    modIds: ["FixtureMod"]
  }));
  assert.deepEqual(errors, []);
  assert.equal(records[0]?.workshopId, workshopId);
  assert.deepEqual(records[0]?.modIds, ["FixtureMod"]);
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
