import assert from "node:assert/strict";
import test from "node:test";
import { aiResearchInbox } from "../lib/ai-research-inbox";
import { normalizeResearchRecord } from "../lib/workshop";

test("every ChatGPT-delivered inbox record is valid and IDs are unique", () => {
  const workshopIds = new Set<string>();
  for (const item of aiResearchInbox) {
    const result = normalizeResearchRecord(item);
    assert.ok(result.record, result.error ?? "조사 결과가 유효하지 않습니다.");
    assert.equal(workshopIds.has(result.record.workshopId), false);
    workshopIds.add(result.record.workshopId);
    assert.ok(result.record.sources.length > 0, "조사 근거 링크가 필요합니다.");
  }
});

test("the first proof-of-concept record does not claim B42.22/multiplayer compatibility", () => {
  const first = normalizeResearchRecord(aiResearchInbox[0]);
  assert.ok(first.record);
  assert.equal(first.record.workshopId, "3552615247");
  assert.equal(first.record.modIds.length, 5);
  assert.equal(first.record.buildCompatibility, "unverified");
  assert.equal(first.record.multiplayerCompatibility, "unverified");
});
