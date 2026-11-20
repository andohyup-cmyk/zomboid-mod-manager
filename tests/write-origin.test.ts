import assert from "node:assert/strict";
import test from "node:test";
import { isSameOriginRequest } from "../lib/write-origin";

test("allows matching browser origin for protected mutation", () => {
  assert.equal(isSameOriginRequest("https://preview.example.com/api/mods", "https://preview.example.com"), true);
});
test("rejects attacker origin and lookalike subdomain", () => {
  assert.equal(isSameOriginRequest("https://preview.example.com/api/mods", "https://attacker.example.com"), false);
  assert.equal(isSameOriginRequest("https://preview.example.com/api/mods", "https://preview.example.com.evil.org"), false);
});
test("rejects malformed, path-qualified and non-HTTP origin", () => {
  assert.equal(isSameOriginRequest("https://preview.example.com/api/mods", "null"), false);
  assert.equal(isSameOriginRequest("https://preview.example.com/api/mods", "https://preview.example.com/path"), false);
  assert.equal(isSameOriginRequest("https://preview.example.com/api/mods", "file://"), false);
});
test("allows local development and server clients with no origin (authorization remains mandatory)", () => {
  assert.equal(isSameOriginRequest("http://127.0.0.1:3000/api/mods", "http://127.0.0.1:3000"), true);
  assert.equal(isSameOriginRequest("https://preview.example.com/api/mods", null), true);
});
