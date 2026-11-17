import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnlyDeployment } from "../lib/deployment-safety";

test("Vercel production keeps existing catalog write path", () => {
  assert.equal(isReadOnlyDeployment("production"), false);
});

test("preview, development, missing or unexpected environments are read-only", () => {
  assert.equal(isReadOnlyDeployment("preview"), true);
  assert.equal(isReadOnlyDeployment("development"), true);
  assert.equal(isReadOnlyDeployment(undefined), true);
  assert.equal(isReadOnlyDeployment("staging"), true);
});
