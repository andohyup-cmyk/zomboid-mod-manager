import { validateModCategories } from "./mod-category-assignment";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEST_DB = "https://smofdbjgcgdmscamknpw.supabase.co";
const TEST_BRANCH = "feature/test-mod-category-persistence-20261122";
const TEST_PROJECT = "prj_XYLhTcgMEscWoUCB5UHZoDebfwPQ";

export function isTestCategoryWriteAllowed(
  env: Readonly<Record<string, string | undefined>>
): boolean {
  return env.VERCEL_ENV === "preview" && env.VERCEL_TARGET_ENV !== "production"
    && env.VERCEL_PROJECT_ID === TEST_PROJECT
    && env.VERCEL_GIT_COMMIT_REF === TEST_BRANCH
    && env.NEXT_PUBLIC_SUPABASE_URL === TEST_DB
    && env.MOD_CATEGORY_TEST_WRITE_ENABLED === "true";
}
/**
 * Check the category membership/primary pair returned by the owner-scoped
 * read API. This is a response guard, not a replacement for DB constraints.
 */
export function isStoredCategoryPrimaryConsistent(
  members: readonly { category_id: string }[],
  primary: { category_id: string } | null
): boolean {
  if (members.length > 64) return false;
  const ids = members.map(row => row.category_id);
  if (ids.some(id => typeof id !== "string" || id.length === 0)
    || new Set(ids).size !== ids.length) return false;
  return ids.length === 0 ? primary === null
    : primary !== null && ids.includes(primary.category_id);
}

export function parseCategoryCreate(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  if (Object.keys(row).length !== 1 || typeof row.name !== "string"
    || row.name.trim() !== row.name || row.name.length < 1 || row.name.length > 120) return null;
  return { name: row.name };
}
export function parseCategoryAssignment(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  if (Object.keys(row).length !== 3 || typeof row.modId !== "string"
    || !UUID.test(row.modId)) return null;
  const checked = validateModCategories({
    categoryIds: row.categoryIds, primaryCategoryId: row.primaryCategoryId
  });
  if (!checked.ok || !checked.assignment.categoryIds.every(id => UUID.test(id))) return null;
  return {
    modId: row.modId.toLowerCase(),
    categoryIds: checked.assignment.categoryIds.map(id => id.toLowerCase()),
    primaryCategoryId: checked.assignment.primaryCategoryId.toLowerCase()
  };
}
