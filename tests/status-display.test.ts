import assert from "node:assert/strict";
import test from "node:test";
import { statusLabel, statusStyle } from "../lib/status-display";

test("known states map to Korean labels; unknown values are shown unchanged", () => {
  assert.equal(statusLabel("confirmed"), "확인");
  assert.equal(statusLabel("unverified"), "미확인");
  assert.equal(statusLabel("reported_issue"), "문제 제보");
  assert.equal(statusLabel("weird"), "weird");
});

test("unknown states never get the confirmed style", () => {
  assert.notEqual(statusStyle("weird"), statusStyle("confirmed"));
});
