import assert from "node:assert/strict";
import test from "node:test";
import {
  describeGroupStatus, parseSelectionGroupDelete, parseSelectionGroupSave, toSelectionGroupRules,
  type StoredSelectionGroup
} from "../lib/selection-group-input";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const base = { id: null, label: "체형", minSelected: null, maxSelected: null, modIdRefs: [A, B] };

test("parseSelectionGroupSave accepts free selection default and explicit rules", () => {
  assert.deepEqual(parseSelectionGroupSave(base), { ...base });
  assert.equal(parseSelectionGroupSave({ ...base, maxSelected: 1 })?.maxSelected, 1);
  assert.equal(parseSelectionGroupSave({ ...base, id: A.toUpperCase() })?.id, A);
});

test("parseSelectionGroupSave rejects malformed input", () => {
  assert.equal(parseSelectionGroupSave({ ...base, extra: 1 }), null);
  assert.equal(parseSelectionGroupSave({ ...base, label: " x" }), null);
  assert.equal(parseSelectionGroupSave({ ...base, label: "" }), null);
  assert.equal(parseSelectionGroupSave({ ...base, modIdRefs: [] }), null);
  assert.equal(parseSelectionGroupSave({ ...base, modIdRefs: [A, A] }), null);
  assert.equal(parseSelectionGroupSave({ ...base, modIdRefs: ["nope"] }), null);
  assert.equal(parseSelectionGroupSave({ ...base, minSelected: 2, maxSelected: 1 }), null);
  assert.equal(parseSelectionGroupSave({ ...base, maxSelected: 3 }), null);
  assert.equal(parseSelectionGroupSave({ ...base, minSelected: -1 }), null);
  assert.equal(parseSelectionGroupSave({ ...base, minSelected: 1.5 }), null);
  assert.equal(parseSelectionGroupSave(null), null);
});

test("parseSelectionGroupDelete validates uuid", () => {
  assert.deepEqual(parseSelectionGroupDelete({ id: A }), { id: A });
  assert.equal(parseSelectionGroupDelete({ id: "x" }), null);
  assert.equal(parseSelectionGroupDelete({ id: A, more: 1 }), null);
});

const group = (min: number | null, max: number | null, verified = false): StoredSelectionGroup => ({
  id: A, label: "체형", minSelected: min, maxSelected: max, verified, evidenceUrl: null,
  members: [{ modIdRef: A, workshopId: "100001", modId: "BodyA" }, { modIdRef: B, workshopId: "100001", modId: "BodyB" }]
});
const sel = (modId: string, enabled = true) => ({ workshopId: "100001", modId, enabled });

test("free groups are not passed as constraints; explicit rules are", () => {
  assert.deepEqual(toSelectionGroupRules([group(null, null)]), []);
  const [rule] = toSelectionGroupRules([group(null, 1)]);
  assert.equal(rule.minSelected, 0);
  assert.equal(rule.maxSelected, 1);
  assert.equal(rule.verified, false);
});

test("describeGroupStatus reports free selection and advisory violations", () => {
  assert.deepEqual(describeGroupStatus(group(null, null), [sel("BodyA")]), { text: "자유 선택 · 0~2개 중 1개 선택", tone: "free" });
  const over = describeGroupStatus(group(null, 1), [sel("BodyA"), sel("BodyB")]);
  assert.equal(over.tone, "warn");
  assert.match(over.text, /최대 초과/);
  assert.match(over.text, /근거 미확인/);
  assert.equal(describeGroupStatus(group(1, 1, true), [sel("BodyA"), sel("BodyB", false)]).tone, "ok");
  assert.match(describeGroupStatus(group(1, null), []).text, /최소 미달/);
});
