import assert from "node:assert/strict";
import test from "node:test";
import { isPreviewQueueWriteAllowed } from "../lib/preview-queue-write";
import { isCatalogWriteAllowed } from "../lib/catalog-write-protection";

const url = "https://smofdbjgcgdmscamknpw.supabase.co";
const env = {
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_XYLhTcgMEscWoUCB5UHZoDebfwPQ",
  VERCEL_GIT_COMMIT_REF: "feature/preview-queue-write-isolated",
  RESEARCH_QUEUE_PREVIEW_WRITE_ENABLED: "true",
  RESEARCH_QUEUE_PREVIEW_VERCEL_PROJECT_ID: "prj_XYLhTcgMEscWoUCB5UHZoDebfwPQ",
  RESEARCH_QUEUE_PREVIEW_SUPABASE_ORIGIN: url,
  NEXT_PUBLIC_SUPABASE_URL: url
};
test("queue writes allowed only for explicitly opted-in isolated Preview", () => {
  assert.equal(isPreviewQueueWriteAllowed(env, url), true);
  assert.equal(isCatalogWriteAllowed(env, url), false);
});
test("fails closed for missing flag, production, different project or branch", () => {
  for (const override of [
    { RESEARCH_QUEUE_PREVIEW_WRITE_ENABLED: undefined },
    { VERCEL_ENV: "production" },
    { VERCEL_TARGET_ENV: "production" },
    { VERCEL_PROJECT_ID: "prj_other" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_GIT_COMMIT_REF: "feature/remaining-mvp-safe-batch" },
    { RESEARCH_QUEUE_PREVIEW_VERCEL_PROJECT_ID: "prj_other" }
  ]) assert.equal(isPreviewQueueWriteAllowed({ ...env, ...override }, url), false);
});
test("never writes to production or malformed Supabase origins", () => {
  for (const value of [
    "https://ducvnpjzoerpiggfdyck.supabase.co",
    "http://smofdbjgcgdmscamknpw.supabase.co",
    url + "/rest/v1",
    url + ".attacker.invalid"
  ]) {
    assert.equal(isPreviewQueueWriteAllowed({ ...env, NEXT_PUBLIC_SUPABASE_URL: value }, url), false);
    assert.equal(isPreviewQueueWriteAllowed({ ...env, RESEARCH_QUEUE_PREVIEW_SUPABASE_ORIGIN: value }, url), false);
    assert.equal(isPreviewQueueWriteAllowed(env, value), false);
  }
});
