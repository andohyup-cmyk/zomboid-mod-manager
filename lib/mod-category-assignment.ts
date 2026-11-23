/**
 * Category assignment rules:
 * one mod may have 0 categories (unclassified, primary = null) or
 * 1..64 categories with exactly one primary category included in categoryIds.
 * This is a pure validator; it never writes to a database or changes profile order.
 */
export type ModCategoryAssignment = Readonly<{
  categoryIds: readonly string[];
  primaryCategoryId: string | null;
}>;

export type CategoryValidationResult =
  | Readonly<{ ok: true; assignment: ModCategoryAssignment }>
  | Readonly<{ ok: false; reason: "invalid" | "duplicate" | "primary-missing" }>;

const MAX_CATEGORIES_PER_MOD = 64;
const MAX_CATEGORY_ID_LENGTH = 128;

export function validateModCategories(input: unknown): CategoryValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "invalid" };
  }
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some(key => key !== "categoryIds" && key !== "primaryCategoryId") ||
    !Array.isArray(value.categoryIds) ||
    (value.primaryCategoryId !== null && typeof value.primaryCategoryId !== "string") ||
    value.categoryIds.length > MAX_CATEGORIES_PER_MOD
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (value.categoryIds.length === 0) {
    if (value.primaryCategoryId !== null) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, assignment: { categoryIds: [], primaryCategoryId: null } };
  }
  if (!value.categoryIds.every(id =>
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= MAX_CATEGORY_ID_LENGTH &&
    id.trim() === id &&
    !id.includes("\u0000")
  )) {
    return { ok: false, reason: "invalid" };
  }
  const ids: string[] = value.categoryIds;
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "duplicate" };
  if (value.primaryCategoryId === null || !ids.includes(value.primaryCategoryId)) {
    return { ok: false, reason: "primary-missing" };
  }
  return {
    ok: true,
    assignment: { categoryIds: [...ids], primaryCategoryId: value.primaryCategoryId }
  };
}
