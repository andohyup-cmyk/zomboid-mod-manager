// Isolated test-only prebuild guard; never print environment values or secrets.
const expected = {
  VERCEL_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_XYLhTcgMEscWoUCB5UHZoDebfwPQ",
  VERCEL_GIT_COMMIT_REF: "test/category-preview-origin-guard-20261122",
  NEXT_PUBLIC_SUPABASE_URL: "https://smofdbjgcgdmscamknpw.supabase.co"
};
const active = Boolean(process.env.VERCEL || process.env.VERCEL_ENV
  || process.env.VERCEL_GIT_COMMIT_REF);
if (!active) {
  console.log("[category-preview-preflight] Local build: no Vercel environment checked");
} else {
  const checks = {
    preview: process.env.VERCEL_ENV === expected.VERCEL_ENV
      && process.env.VERCEL_TARGET_ENV !== "production",
    project: process.env.VERCEL_PROJECT_ID === expected.VERCEL_PROJECT_ID,
    branch: process.env.VERCEL_GIT_COMMIT_REF === expected.VERCEL_GIT_COMMIT_REF,
    isolatedDatabaseOrigin:
      process.env.NEXT_PUBLIC_SUPABASE_URL === expected.NEXT_PUBLIC_SUPABASE_URL,
    anonKeyConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  };
  const failed = Object.entries(checks).filter(([,ok]) => !ok).map(([name])=>name);
  if (failed.length) {
    console.error("[category-preview-preflight] BLOCKED: " + failed.join(", "));
    process.exitCode = 1;
  } else {
    console.log("[category-preview-preflight] PASS: preview/project/branch/test-origin/key-present");
  }
}
