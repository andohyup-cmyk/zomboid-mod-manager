import assert from "node:assert/strict";
import test from "node:test";
import { isCatalogWriteAllowed } from "../lib/catalog-write-protection";

const production = {
  VERCEL_ENV: "production",
  VERCEL_TARGET_ENV: "production",
  VERCEL_PROJECT_ID: "prj_productionFixture",
  CATALOG_WRITE_PRODUCTION_VERCEL_PROJECT_ID: "prj_productionFixture",
  CATALOG_WRITE_PRODUCTION_SUPABASE_ORIGIN: "https://catalog.example.invalid",
  NEXT_PUBLIC_SUPABASE_URL: "https://catalog.example.invalid/"
};

function canWrite(env: Readonly<Record<string, string | undefined>>): boolean {
  return isCatalogWriteAllowed(env, production.NEXT_PUBLIC_SUPABASE_URL);
}

test("allows the verified Production project and Supabase origin", () => {
  assert.equal(canWrite(production), true);
});

test("blocks preview, development, custom and unknown environments even with production configuration", () => {
  for (const environment of ["preview", "development", "staging", "", undefined]) {
    assert.equal(canWrite({ ...production, VERCEL_ENV: environment }), false);
    assert.equal(canWrite({ ...production, VERCEL_TARGET_ENV: environment }), false);
  }
  assert.equal(canWrite({}), false);
});

test("blocks a different Vercel project even when its deployment is labelled Production", () => {
  assert.equal(canWrite({ ...production, VERCEL_PROJECT_ID: "prj_trialFixture" }), false);
});

test("blocks missing production settings and missing or mismatched Supabase targets", () => {
  for (const setting of Object.keys(production)) {
    assert.equal(canWrite({ ...production, [setting]: undefined }), false, setting);
  }
  assert.equal(canWrite({ ...production, NEXT_PUBLIC_SUPABASE_URL: "https://trial.example.invalid" }), false);
  assert.equal(canWrite({ ...production, NEXT_PUBLIC_SUPABASE_URL: "https://catalog.example.invalid.other.invalid" }), false);
});

test("blocks when the URL used by the Supabase client differs from runtime configuration", () => {
  assert.equal(isCatalogWriteAllowed(production, "https://trial.example.invalid"), false);
  assert.equal(isCatalogWriteAllowed(production, undefined), false);
});

test("requires bare HTTPS origins and rejects malformed or path-qualified configuration", () => {
  for (const value of ["http://catalog.example.invalid", "catalog.example.invalid", "not a URL",
    "https://catalog.example.invalid/api", "https://catalog.example.invalid/?x=1", "https://catalog.example.invalid/#fragment",
    "https://user@catalog.example.invalid", " https://catalog.example.invalid"]) {
    assert.equal(canWrite({ ...production, NEXT_PUBLIC_SUPABASE_URL: value }), false);
    assert.equal(canWrite({ ...production, CATALOG_WRITE_PRODUCTION_SUPABASE_ORIGIN: value }), false);
  }
});
