import assert from "node:assert/strict";
import test from "node:test";
import { eligibleBatchApprovals, MAX_APPROVAL_BATCH_SIZE, unambiguousBatchCandidates } from "../lib/batch-approval-selection";
import { groupResearchCandidates, type ResearchCandidate } from "../lib/research-candidates";
import { normalizeResearchRecord } from "../lib/workshop";

function candidate(id: string, source: ResearchCandidate["source"] = "steam", name?: string): ResearchCandidate {
  const record = normalizeResearchRecord({ workshopId: id, title: name ?? `Workshop ${id}` }).record!;
  return { source, record };
}
function groups(...values: ResearchCandidate[]) {
  const data = new Map<string, ResearchCandidate[]>();
  for (const item of values) {
    const id = item.record.workshopId;
    data.set(id, [...(data.get(id) ?? []), item]);
  }
  return data;
}

test("selected candidates from existing groups are eligible for final review", () => {
  const a = candidate("5000000001");
  const b = candidate("5000000002");
  const match = groups(a, b);
  assert.deepEqual(eligibleBatchApprovals(match, { "5000000001": a, "5000000002": b }, {}), [
    ["5000000001", a], ["5000000002", b]
  ]);
});

test("selection from removed or different workshop is not approved", () => {
  const original = candidate("5000000001");
  const changed = candidate("5000000001");
  const wrong = candidate("5000000002");
  const match = groups(changed, wrong);
  assert.deepEqual(eligibleBatchApprovals(match, { "5000000001": original }, {}), []);
  assert.deepEqual(eligibleBatchApprovals(match, { "5000000001": wrong }, {}), []);
});

test("completed or currently saving items cannot be submitted again", () => {
  const items = Array.from({ length: 4 }, (_, i) => candidate(String(5000000010 + i)));
  const match = groups(...items);
  const selections = Object.fromEntries(items.map(i => [i.record.workshopId, i]));
  const states = {
    "5000000010": { state: "saving" },
    "5000000011": { state: "saved" },
    "5000000012": { state: "registered" },
    "5000000013": { state: "error" }
  };
  assert.deepEqual(eligibleBatchApprovals(match, selections, states), [["5000000013", items[3]]]);
});

test("a recoverable error remains eligible for explicit retry", () => {
  const a = candidate("5000000020");
  assert.deepEqual(eligibleBatchApprovals(groups(a), { "5000000020": a }, {
    "5000000020": { state: "error" }
  }), [["5000000020", a]]);
});

test("only first twenty current selections enter one batch", () => {
  const items = Array.from({ length: 25 }, (_, i) => candidate(String(5000000100 + i)));
  const g = groups(...items);
  const choices = Object.fromEntries(items.map(i => [i.record.workshopId, i]));
  const selection = eligibleBatchApprovals(g, choices, {});
  assert.equal(selection.length, MAX_APPROVAL_BATCH_SIZE);
  assert.deepEqual(selection.map(([id]) => id), items.slice(0, 20).map(i => i.record.workshopId));
});

test("all ambiguous sources remain available for explicit manual choice", () => {
  const steam = candidate("5000000200", "steam", "Current metadata");
  const inbox = candidate("5000000200", "inbox", "Older research");
  const queue = candidate("5000000201", "queue");
  const selected = unambiguousBatchCandidates(groups(steam, inbox, queue), {});
  assert.deepEqual(selected, [["5000000201", [queue]]]);
});

test("one candidate per workshop can be selected automatically, even from the queue", () => {
  const a = candidate("5000000210", "queue");
  const b = candidate("5000000211", "steam");
  const selection = unambiguousBatchCandidates(groups(a, b), {});
  assert.deepEqual(selection, [["5000000210", [a]], ["5000000211", [b]]]);
});

test("unambiguous select-all ignores already saved, registered and currently saving candidates", () => {
  const a = candidate("5000000220");
  const b = candidate("5000000221");
  const c = candidate("5000000222");
  const d = candidate("5000000223");
  const selection = unambiguousBatchCandidates(groups(a, b, c, d), {
    "5000000220": { state: "saved" },
    "5000000221": { state: "registered" },
    "5000000222": { state: "saving" },
    "5000000223": { state: "error" }
  });
  assert.deepEqual(selection, [["5000000223", [d]]]);
});

test("select-all stops at twenty without dropping or mutating the source groups", () => {
  const items = Array.from({ length: 23 }, (_, i) => candidate(String(5000000300 + i)));
  const g = groups(...items);
  const before = [...g.keys()];
  const selected = unambiguousBatchCandidates(g, {});
  assert.equal(selected.length, MAX_APPROVAL_BATCH_SIZE);
  assert.deepEqual([...g.keys()], before);
  assert.equal(g.size, 23);
});

test("explicit candidate choice from an ambiguous group can be approved", () => {
  const older = candidate("5000000400", "inbox");
  const fresh = candidate("5000000400", "steam");
  assert.deepEqual(eligibleBatchApprovals(groups(older, fresh), {
    "5000000400": fresh
  }, {}), [["5000000400", fresh]]);
});

test("no selections and no candidates produce no approval or mutation", () => {
  assert.deepEqual(eligibleBatchApprovals(groups(), {}, {}), []);
  assert.deepEqual(unambiguousBatchCandidates(groups(), {}), []);
});

test("result-state checks cannot mutate caller selections", () => {
  const a = candidate("5000000500");
  const choices = Object.freeze({ "5000000500": a });
  const before = JSON.stringify(choices);
  eligibleBatchApprovals(groups(a), choices, { "5000000500": { state: "saved" } });
  assert.equal(JSON.stringify(choices), before);
});
