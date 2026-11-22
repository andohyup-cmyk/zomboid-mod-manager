import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const script = "scripts/category-preview-target-guard.mjs";
const expected = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_XYLhTcgMEscWoUCB5UHZoDebfwPQ",
  VERCEL_GIT_COMMIT_REF: "test/category-preview-origin-guard-20261122",
  NEXT_PUBLIC_SUPABASE_URL: "https://smofdbjgcgdmscamknpw.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-key-present-not-a-secret"
};
function check(overrides: Record<string,string|undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", ...expected, ...overrides };
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), env, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
test("prebuild allows exact test Preview metadata without printing keys",()=>{
  const result=check();
  assert.equal(result.status,0);
  assert.match(result.stdout,/PASS/);
  assert.doesNotMatch(result.stdout+result.stderr,/test-key-present-not-a-secret/);
});
test("prebuild rejects production even with a matching project and branch",()=>{
  assert.equal(check({VERCEL_ENV:"production"}).status,1);
  assert.equal(check({VERCEL_TARGET_ENV:"production"}).status,1);
});
test("prebuild rejects another branch/project or an unknown database origin",()=>{
  assert.equal(check({VERCEL_GIT_COMMIT_REF:"main"}).status,1);
  assert.equal(check({VERCEL_PROJECT_ID:"wrong-project"}).status,1);
  assert.equal(check({NEXT_PUBLIC_SUPABASE_URL:"https://ducvnpjzoerpiggfdyck.supabase.co"}).status,1);
});
test("prebuild rejects missing anon key without exposing it",()=>{
  const result=check({NEXT_PUBLIC_SUPABASE_ANON_KEY:undefined});
  assert.equal(result.status,1);
  assert.match(result.stderr,/anonKeyConfigured/);
});
