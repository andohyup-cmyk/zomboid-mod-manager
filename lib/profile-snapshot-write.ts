import type { ProfileSavePlan } from "./profile-persistence-plan";

const TEST_SUPABASE = "https://smofdbjgcgdmscamknpw.supabase.co";
const TEST_VERCEL_PROJECT = "prj_XYLhTcgMEscWoUCB5UHZoDebfwPQ";
const TEST_BRANCH = "feature/profile-atomic-save-20261121";

function httpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && (value === parsed.origin || value === parsed.origin + "/")
      ? parsed.origin : null;
  } catch {
    return null;
  }
}

/** Only the approved test project, one Preview branch, and explicit opt-in. */
export function isTestProfileSnapshotWriteAllowed(
  env: Readonly<Record<string, string | undefined>>,
  supabaseUrl: string | undefined
): boolean {
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_TARGET_ENV !== "production"
    && env.PROFILE_SNAPSHOT_TEST_WRITE_ENABLED === "true"
    && env.VERCEL_GIT_COMMIT_REF === TEST_BRANCH
    && env.VERCEL_PROJECT_ID === TEST_VERCEL_PROJECT
    && httpsOrigin(env.NEXT_PUBLIC_SUPABASE_URL) === TEST_SUPABASE
    && httpsOrigin(supabaseUrl) === TEST_SUPABASE;
}

/**
 * RPC payload uses array position as load order. Never accept client-supplied
 * load_order, owner_id or revision when projecting rows to the database RPC.
 */
export function toAtomicProfileRpcPayload(
  plan: Extract<ProfileSavePlan, { ok: true }>
): {
  p_expected_revision: number;
  p_choices: Array<{ mod_id_entry_id: string; enabled: boolean }>;
  p_downloads: string[];
} {
  return {
    p_expected_revision: plan.expectedRevision,
    p_choices: plan.choices.map(({ mod_id_entry_id, enabled }) => ({ mod_id_entry_id, enabled })),
    p_downloads: plan.downloads.map(({ workshop_id }) => workshop_id)
  };
}

export function profileSnapshotErrorStatus(code: string | undefined): number {
  switch (code) {
    case "PZ001":
    case "23505":
      return 409;
    case "PZ002":
    case "22P02":
      return 400;
    case "PZ003":
      return 422;
    case "42501":
      return 403;
    default:
      return 503;
  }
}
