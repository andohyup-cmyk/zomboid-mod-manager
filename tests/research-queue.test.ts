import assert from "node:assert/strict";
import test from "node:test";
import { prepareResearchQueueBatch } from "../lib/research-queue";

const make = (workshopId: string, source: string = "steam") => ({
  source, record: { workshopId, title: `Mod ${workshopId}`, modIds: [] }
});

test("rejects empty and oversized batches without any partial insert", () => {
  assert.ok(prepareResearchQueueBatch([]).error);
  assert.ok(prepareResearchQueueBatch(Array.from({ length: 21 }, (_, i) => make(String(i + 10000)))).error);
});

test("normalizes two Workshop IDs and keeps unverified compatibility", () => {
  const result = prepareResearchQueueBatch([make("3640496116"), make("3552615247")]);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.items?.map(item => item.workshop_id), ["3640496116", "3552615247"]);
  assert.deepEqual(result.items?.map(item => item.payload.buildCompatibility), ["unverified", "unverified"]);
  assert.deepEqual(result.items?.map(item => item.payload.modIds), [[], []]);
});

test("permits independent sources for a single Workshop, without overwriting another source", () => {
  const result = prepareResearchQueueBatch([make("3640496116", "steam"), make("3640496116", "manual")]);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.items?.map(item => item.source), ["steam", "manual"]);
});

test("rejects duplicate Workshop IDs from the same source", () => {
  const result = prepareResearchQueueBatch([make("3640496116"), make("3640496116")]);
  assert.match(result.error ?? "", /중복/);
  assert.equal(result.items, undefined);
});

test("rejects malformed sources, IDs and incompatible source URLs", () => {
  assert.ok(prepareResearchQueueBatch([make("3640496116", "untrusted")]).error);
  assert.ok(prepareResearchQueueBatch([make("0003640496116")]).error);
  assert.ok(prepareResearchQueueBatch([make("badid")]).error);
  assert.ok(prepareResearchQueueBatch([{
    source: "steam",
    record: {
      workshopId: "3640496116",
      title: "Not matching",
      sourceUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=3552615247"
    }
  }]).error);
});

test("invalid later item rejects the entire batch, not only that item", () => {
  const result = prepareResearchQueueBatch([make("3640496116"), make("invalid")]);
  assert.equal(result.items, undefined);
  assert.match(result.error ?? "", /2번/);
});
