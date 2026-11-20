function exactHttpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (value === url.origin || value === url.origin + "/") ? url.origin : null;
  } catch { return null; }
}

/** Separate queue-only exception; never use this to authorize catalog writes. */
export function isPreviewQueueWriteAllowed(
  env: Readonly<Record<string, string | undefined>>,
  clientUrl: string | undefined
): boolean {
  if (env.VERCEL_ENV !== "preview" || env.VERCEL_TARGET_ENV === "production") return false;
  if (env.RESEARCH_QUEUE_PREVIEW_WRITE_ENABLED !== "true") return false;
  if (!env.VERCEL_PROJECT_ID || env.VERCEL_PROJECT_ID !== env.RESEARCH_QUEUE_PREVIEW_VERCEL_PROJECT_ID) return false;
  if (env.VERCEL_GIT_COMMIT_REF !== "feature/preview-queue-write-isolated") return false;
  const expected = exactHttpsOrigin(env.RESEARCH_QUEUE_PREVIEW_SUPABASE_ORIGIN);
  if (expected !== "https://smofdbjgcgdmscamknpw.supabase.co") return false;
  return expected === exactHttpsOrigin(env.NEXT_PUBLIC_SUPABASE_URL)
    && expected === exactHttpsOrigin(clientUrl);
}
