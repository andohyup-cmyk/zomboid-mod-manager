import { isTestCategoryWriteAllowed } from "./category-persistence-input";

function httpsOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const { origin, protocol } = new URL(value);
    if (protocol === "https:" && (value === origin || value === `${origin}/`)) return origin;
  } catch {
    return null;
  }

  return null;
}

export function isCatalogWriteAllowed(env: Readonly<Record<string, string | undefined>>, clientUrl: string | undefined): boolean {
  // A separate trial project can also have a Production deployment.
  if (env.VERCEL_ENV !== "production" || env.VERCEL_TARGET_ENV !== "production") return false;
  const projectId = env.VERCEL_PROJECT_ID;
  if (!projectId || projectId.trim() !== projectId || projectId !== env.CATALOG_WRITE_PRODUCTION_VERCEL_PROJECT_ID) {
    return false;
  }

  const approvedOrigin = httpsOrigin(env.CATALOG_WRITE_PRODUCTION_SUPABASE_ORIGIN);
  // Next.js may inline the public URL used to construct the Supabase client at build time.
  return approvedOrigin !== null
    && approvedOrigin === httpsOrigin(env.NEXT_PUBLIC_SUPABASE_URL)
    && approvedOrigin === httpsOrigin(clientUrl);
}

/**
 * Category / selection-group writes: allowed on the approved Production project
 * (isCatalogWriteAllowed) or on the isolated test Preview (isTestCategoryWriteAllowed).
 * Every category/group API route and its page must use this single guard.
 */
export function isCategoryWriteAllowed(env: Readonly<Record<string, string | undefined>>): boolean {
  return isTestCategoryWriteAllowed(env)
    || isCatalogWriteAllowed(env, env.NEXT_PUBLIC_SUPABASE_URL);
}
