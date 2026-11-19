import assert from "node:assert/strict";
import test from "node:test";
import { groupResearchCandidates, matchResearchCandidatesToInput } from "../lib/research-candidates";
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

test("does not display the static inbox item for a different requested Workshop URL", () => {
  const oldInbox = normalizeResearchRecord({
    workshopId: "3552615247",
    title: "Preloaded QoL mod"
  }).record!;
  const groups = groupResearchCandidates([oldInbox], []);
  const result = matchResearchCandidatesToInput(groups, ["3640496116"]);

  assert.deepEqual([...result.groups.keys()], []);
  assert.deepEqual(result.missingIds, ["3640496116"]);
  assert.deepEqual(result.excludedIds, ["3552615247"]);
  assert.deepEqual([...groups.keys()], ["3552615247"], "source inbox must stay intact");
});

test("matches each requested ID separately and reports partially missing items", () => {
  const inboxMatch = normalizeResearchRecord({ workshopId: "12345", title: "Inbox match" }).record!;
  const manualMatch = normalizeResearchRecord({ workshopId: "00012345", title: "Manual match" }).record!;
  const unrelated = normalizeResearchRecord({ workshopId: "55555", title: "Unrelated" }).record!;
  const groups = groupResearchCandidates([inboxMatch, unrelated], [manualMatch]);
  const result = matchResearchCandidatesToInput(groups, ["12345", "67890"]);

  assert.deepEqual([...result.groups.keys()], ["12345"]);
  assert.deepEqual(result.groups.get("12345")?.map(candidate => candidate.source), ["inbox", "manual"]);
  assert.deepEqual(result.missingIds, ["67890"]);
  assert.deepEqual(result.excludedIds, ["55555"]);
});

test("preserves existing manual JSON and inbox review when no Workshop ID is entered", () => {
  const inbox = normalizeResearchRecord({ workshopId: "12345", title: "Inbox" }).record!;
  const manual = normalizeResearchRecord({ workshopId: "67890", title: "Manual" }).record!;
  const groups = groupResearchCandidates([inbox], [manual]);
  const result = matchResearchCandidatesToInput(groups, []);

  assert.equal(result.groups, groups);
  assert.deepEqual([...result.groups.keys()], ["12345", "67890"]);
  assert.deepEqual(result.missingIds, []);
  assert.deepEqual(result.excludedIds, []);
});

test("Steam lookup for requested ID is kept separate from unrelated preloaded inbox", () => {
  const oldInbox = normalizeResearchRecord({ workshopId: "3552615247", title: "Old inbox" }).record!;
  const steam = normalizeResearchRecord({
    workshopId: "3640496116",
    title: "Steam public metadata",
    modIds: [],
    verificationStatus: "unverified",
    buildCompatibility: "unverified",
    multiplayerCompatibility: "unverified"
  }).record!;
  const groups = groupResearchCandidates([oldInbox], [], [steam]);
  const result = matchResearchCandidatesToInput(groups, ["3640496116"]);
  assert.deepEqual([...result.groups.keys()], ["3640496116"]);
  assert.deepEqual(result.groups.get("3640496116")?.map(c => c.source), ["steam"]);
  assert.deepEqual(result.excludedIds, ["3552615247"]);
  assert.deepEqual(result.missingIds, []);
  assert.deepEqual(result.groups.get("3640496116")?.[0].record.modIds, []);
  assert.equal(result.groups.get("3640496116")?.[0].record.buildCompatibility, "unverified");
});
