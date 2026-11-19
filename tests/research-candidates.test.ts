import assert from "node:assert/strict";
import test from "node:test";
import { groupResearchCandidates } from "../lib/research-candidates";
import { normalizeResearchRecord } from "../lib/workshop";

test("keeps each source and its original payload for the same Workshop", () => {
  const inbox = normalizeResearchRecord({ workshopId: "12345", title: "Inbox", modIds: ["Core"] }).record!;
  const manual = normalizeResearchRecord({ workshopId: "0012345", title: "Manual", modIds: ["Option"] }).record!;
  const groups = groupResearchCandidates([inbox], [manual]);
  assert.deepEqual([...groups.keys()], ["12345"]);
  assert.deepEqual(groups.get("12345"), [
    { source: "inbox", record: inbox },
    { source: "manual", record: manual }
  ]);
  assert.equal(groups.get("12345")![1].record.workshopId, "0012345");
});

test("keeps the manual candidate when the inbox is empty or contains identical data", () => {
  const item = normalizeResearchRecord({ workshopId: "12345", title: "Same" }).record!;
  assert.deepEqual(groupResearchCandidates([], [item]).get("12345"), [{ source: "manual", record: item }]);
  assert.deepEqual(groupResearchCandidates([item], [item]).get("12345")?.map(c => c.source), ["inbox", "manual"]);
});
