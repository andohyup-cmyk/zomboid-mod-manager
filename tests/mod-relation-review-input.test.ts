import assert from "node:assert/strict";
import test from "node:test";
import {
  isTestRelationPreview, isTestRelationWriteAllowed, parseRelationDraft, parseRelationApproval
} from "../lib/mod-relation-review-input";

const subject = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const target = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const evidence = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const draft = {
  kind: "requires", subjectModIdUuid: subject, targetModIdUuid: target,
  evidenceRecordId: evidence,
  sourceUrl: "https://example.test/verified",
  checkedAt: "2026-11-20"
};
const env = {
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "preview",
  MOD_RELATION_TEST_WRITE_ENABLED: "true",
  VERCEL_GIT_COMMIT_REF: "feature/mobile-relation-e2e-harness-20261122",
  VERCEL_PROJECT_ID: "prj_XYLhTcgMEscWoUCB5UHZoDebfwPQ",
  NEXT_PUBLIC_SUPABASE_URL: "https://smofdbjgcgdmscamknpw.supabase.co"
};

test("draft accepts exactly four relation kinds with canonical UUIDs", () => {
  for (const kind of ["requires","incompatibleMods","loadBefore","loadAfter"]) {
    assert.deepEqual(parseRelationDraft({ ...draft, kind }), {
      ok: true, value: { ...draft, kind }
    });
  }
  const changed = parseRelationDraft({ ...draft, subjectModIdUuid: subject.toUpperCase() });
  assert.equal(changed.ok, true);
  if (changed.ok) assert.equal(changed.value.subjectModIdUuid, subject);
});

test("draft cannot embed approval, owner, revision or arbitrary fields", () => {
  for (const extra of [
    { approved: true }, { approved_at: "2026-11-20" },
    { owner_id: subject }, { load_order: 2 }, { source: "manual" }
  ]) assert.equal(parseRelationDraft({ ...draft, ...extra }).ok, false);
});

test("missing target, same UUID and malformed kinds are rejected", () => {
  for (const input of [
    { ...draft, targetModIdUuid: subject },
    { ...draft, subjectModIdUuid: "wrong" },
    { ...draft, evidenceRecordId: null },
    { ...draft, kind: "requires-workshop" },
    { ...draft, targetModIdUuid: undefined },
    null, [], {}
  ]) assert.equal(parseRelationDraft(input).ok, false);
});

test("non-URL and unsafe source syntax are rejected", () => {
  for (const sourceUrl of [
    "", "javascript:alert(1)", "file:///etc/passwd",
    "https://user:pass@example.test/verified",
    "https://example.test/verified#fragment",
    "https://example.test/verified ", "x".repeat(2100)
  ]) assert.equal(parseRelationDraft({ ...draft, sourceUrl }).ok, false);
});

test("impossible dates and malformed timestamps cannot be written", () => {
  for (const checkedAt of ["2026-02-30", "2026-13-01", "2026-1-2",
    "2026-11-20T12:00:00Z", "now", null]) {
    assert.equal(parseRelationDraft({ ...draft, checkedAt }).ok, false);
  }
});

test("approval requires an explicit true and only one relation ID", () => {
  assert.deepEqual(parseRelationApproval({ relationId: subject, confirm: true }), {
    ok: true, value: { relationId: subject, confirm: true }
  });
  for (const input of [
    { relationId: subject },
    { relationId: subject, confirm: false },
    { relationId: subject, confirm: "true" },
    { relationId: subject, confirm: true, approved: true },
    { relationId: "invalid", confirm: true },
    { relationId: subject, confirm: true, ownerId: target },
    null
  ]) assert.equal(parseRelationApproval(input).ok, false);
});

test("write is blocked by default and when not explicitly enabled", () => {
  assert.equal(isTestRelationWriteAllowed(env, env.NEXT_PUBLIC_SUPABASE_URL), true);
  assert.equal(isTestRelationWriteAllowed({
    ...env, MOD_RELATION_TEST_WRITE_ENABLED: undefined
  }, env.NEXT_PUBLIC_SUPABASE_URL), false);
  assert.equal(isTestRelationWriteAllowed({
    ...env, MOD_RELATION_TEST_WRITE_ENABLED: "false"
  }, env.NEXT_PUBLIC_SUPABASE_URL), false);
});

test("production, development, branch drift, project drift cannot write", () => {
  const cases = [
    { VERCEL_ENV: "production" }, { VERCEL_ENV: "development" },
    { VERCEL_ENV: undefined }, { VERCEL_TARGET_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_GIT_COMMIT_REF: "feature/test-mod-relations-schema-20261121" },
    { VERCEL_PROJECT_ID: "another-project" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://smofdbjgcgdmscamknpw.supabase.co.example.com" },
    { NEXT_PUBLIC_SUPABASE_URL: "http://smofdbjgcgdmscamknpw.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://smofdbjgcgdmscamknpw.supabase.co/path" }
  ];
  for (const item of cases) assert.equal(isTestRelationWriteAllowed({
    ...env, ...item
  }, env.NEXT_PUBLIC_SUPABASE_URL), false);
});

test("server Supabase address must also exactly match the approved test origin", () => {
  for (const url of [
    undefined, "https://production.supabase.co",
    "https://smofdbjgcgdmscamknpw.supabase.co.bad.tld",
    "http://smofdbjgcgdmscamknpw.supabase.co"
  ]) assert.equal(isTestRelationWriteAllowed(env, url), false);
});

test("read-only mobile diagnostic Preview remains available without an opt-in to writes", () => {
  assert.equal(isTestRelationPreview({
    ...env, MOD_RELATION_TEST_WRITE_ENABLED: undefined
  }, env.NEXT_PUBLIC_SUPABASE_URL), true);
  assert.equal(isTestRelationWriteAllowed({
    ...env, MOD_RELATION_TEST_WRITE_ENABLED: undefined
  }, env.NEXT_PUBLIC_SUPABASE_URL), false);
  assert.equal(isTestRelationPreview({
    ...env, VERCEL_GIT_COMMIT_REF: "main"
  }, env.NEXT_PUBLIC_SUPABASE_URL), false);
  assert.equal(isTestRelationPreview({
    ...env, VERCEL_ENV: "production"
  }, env.NEXT_PUBLIC_SUPABASE_URL), false);
  assert.equal(isTestRelationPreview({
    ...env, NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co"
  }, env.NEXT_PUBLIC_SUPABASE_URL), false);
});
