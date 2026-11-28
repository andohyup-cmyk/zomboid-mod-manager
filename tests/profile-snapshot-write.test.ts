import assert from "node:assert/strict";
import test from "node:test";
import {
  isTestProfileSnapshotWriteAllowed,
  profileSnapshotErrorStatus,
  toAtomicProfileRpcPayload
} from "../lib/profile-snapshot-write";

const environment = {
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "preview",
  PROFILE_SNAPSHOT_TEST_WRITE_ENABLED: "true",
  VERCEL_GIT_COMMIT_REF: "feature/profile-atomic-save-20261121",
  VERCEL_PROJECT_ID: "prj_XYLhTcgMEscWoUCB5UHZoDebfwPQ",
  NEXT_PUBLIC_SUPABASE_URL: "https://smofdbjgcgdmscamknpw.supabase.co"
} as const;

test("approved Preview branch must explicitly opt in before test-only DB save", () => {
  assert.equal(isTestProfileSnapshotWriteAllowed(
    environment, environment.NEXT_PUBLIC_SUPABASE_URL
  ), true);
  assert.equal(isTestProfileSnapshotWriteAllowed(
    { ...environment, PROFILE_SNAPSHOT_TEST_WRITE_ENABLED: "false" },
    environment.NEXT_PUBLIC_SUPABASE_URL
  ), false);
  assert.equal(isTestProfileSnapshotWriteAllowed(
    { ...environment, PROFILE_SNAPSHOT_TEST_WRITE_ENABLED: undefined },
    environment.NEXT_PUBLIC_SUPABASE_URL
  ), false);
});

test("any production deployment stays blocked even when flag is set", () => {
  for (const modification of [
    { VERCEL_ENV: "production" },
    { VERCEL_TARGET_ENV: "production" },
    { VERCEL_ENV: "development" },
    { VERCEL_ENV: undefined }
  ]) {
    assert.equal(isTestProfileSnapshotWriteAllowed(
      { ...environment, ...modification }, environment.NEXT_PUBLIC_SUPABASE_URL
    ), false);
  }
});

test("all project, branch and Supabase origin boundaries must match exactly", () => {
  const changed = [
    { VERCEL_PROJECT_ID: "another-project" },
    { VERCEL_PROJECT_ID: undefined },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_GIT_COMMIT_REF: "feature/backup-v2-profile-snapshots-20261121" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://production-project.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://smofdbjgcgdmscamknpw.supabase.co.evil.example" },
    { NEXT_PUBLIC_SUPABASE_URL: "http://smofdbjgcgdmscamknpw.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://smofdbjgcgdmscamknpw.supabase.co/path" }
  ];
  for (const modification of changed) {
    assert.equal(isTestProfileSnapshotWriteAllowed(
      { ...environment, ...modification }, environment.NEXT_PUBLIC_SUPABASE_URL
    ), false);
  }
  assert.equal(isTestProfileSnapshotWriteAllowed(
    environment, "https://production-project.supabase.co"
  ), false);
});

test("RPC payload omits owner, profile, client order and protected metadata", () => {
  const planned = {
    ok: true as const,
    expectedRevision: 7,
    choices: [
      { profile_id: "p", mod_id_entry_id: "mod-a", enabled: true, load_order: 3 },
      { profile_id: "p", mod_id_entry_id: "mod-b", enabled: false, load_order: 0 }
    ],
    downloads: [
      { profile_id: "p", workshop_id: "3552615247", load_order: 8 }
    ]
  };
  assert.deepEqual(toAtomicProfileRpcPayload(planned), {
    p_expected_revision: 7,
    p_choices: [
      { mod_id_entry_id: "mod-a", enabled: true },
      { mod_id_entry_id: "mod-b", enabled: false }
    ],
    p_downloads: ["3552615247"]
  });
});

test("RPC statuses preserve stale and RLS denial, without revealing internal details", () => {
  assert.equal(profileSnapshotErrorStatus("PZ001"), 409);
  assert.equal(profileSnapshotErrorStatus("23505"), 409);
  assert.equal(profileSnapshotErrorStatus("PZ002"), 400);
  assert.equal(profileSnapshotErrorStatus("PZ003"), 422);
  assert.equal(profileSnapshotErrorStatus("42501"), 403);
  assert.equal(profileSnapshotErrorStatus("XX000"), 503);
  assert.equal(profileSnapshotErrorStatus(undefined), 503);
});
