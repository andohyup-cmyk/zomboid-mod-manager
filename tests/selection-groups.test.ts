import assert from "node:assert/strict";
import test from "node:test";
import { validateSelectionGroups, type SelectionGroupRule } from "../lib/selection-groups";

const first = { workshopId: "3552615247", modId: "optionA" };
const second = { workshopId: "3552615247", modId: "optionB" };
const other = { workshopId: "2142622992", modId: "patch" };
const catalog = [first, second, other];
const selections = [{ ...first, enabled: true }, { ...second, enabled: false }, { ...other, enabled: true }];
const rule: SelectionGroupRule = {
  id: "opt", label: "One optional body variant", members: [first, second],
  minSelected: 1, maxSelected: 1, verified: true,
  evidenceUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=3552615247"
};

test("accepts exactly one enabled option without forcing other Mod IDs", () => {
  assert.deepEqual(validateSelectionGroups([rule], catalog, selections), []);
});
test("reports too few when all group members disabled", () => {
  const issues = validateSelectionGroups([rule], catalog, selections.map(x => ({ ...x, enabled: false })));
  assert.equal(issues[0].code, "too-few");
});
test("reports too many with confirmed mutually exclusive options", () => {
  const issues = validateSelectionGroups([rule], catalog, [ { ...first, enabled: true }, { ...second, enabled: true } ]);
  assert.equal(issues[0].code, "too-many");
});
test("unverified group is informational even when selections violate it", () => {
  const issues = validateSelectionGroups([{ ...rule, verified: false }], catalog, []);
  assert.equal(issues[0].severity, "info");
  assert.equal(issues[0].code, "unverified");
});
test("missing catalog member and wrong Workshop provider cannot activate", () => {
  const issues = validateSelectionGroups([rule], [first, other], selections);
  assert.equal(issues[0].code, "unknown-member");
});
test("rejects inconsistent bounds, duplicate IDs, missing labels and duplicate members", () => {
  const bad = { ...rule, minSelected: 3, maxSelected: 1 };
  assert.equal(validateSelectionGroups([bad], catalog, selections)[0].code, "invalid-rule");
  assert.equal(validateSelectionGroups([{ ...rule, members: [first, first] }], catalog, selections)[0].code, "invalid-rule");
  assert.equal(validateSelectionGroups([{ ...rule, label: "" }], catalog, selections)[0].code, "invalid-rule");
  assert.equal(validateSelectionGroups([rule, rule], catalog, selections)[0].code, "invalid-rule");
});
test("keeps disabled selections and provider-qualified IDs distinct", () => {
  const wrongProvider = [{ workshopId: "2142622992", modId: "optionA", enabled: true }];
  assert.equal(validateSelectionGroups([rule], catalog, wrongProvider)[0].code, "too-few");
});
