import assert from "node:assert/strict";
import test from "node:test";
import { parseProfileCreateInput } from "../lib/profile-name";

test("parseProfileCreateInput accepts trimmed profile names and rejects invalid inputs", () => {
  assert.deepEqual(parseProfileCreateInput({ name: "  B42 멀티 서버  " }), { name: "B42 멀티 서버" });
  assert.equal(parseProfileCreateInput({ name: "" }), null);
  assert.equal(parseProfileCreateInput({ name: "   " }), null);
  assert.equal(parseProfileCreateInput({ name: "a".repeat(121) }), null);
  assert.equal(parseProfileCreateInput({ name: "bad\nname" }), null);
  assert.equal(parseProfileCreateInput({ name: "ok", owner_id: "1" }), null);
  assert.equal(parseProfileCreateInput(null), null);
});
