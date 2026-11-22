export type CategoryOption = Readonly<{
  id: string;
  name: string;
  sort_order: number;
}>;

export type ModCategoryDraft = Readonly<{
  modId: string;
  categoryIds: readonly string[];
  primaryCategoryId: string | null;
}>;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Fail closed on malformed or incomplete owner-scoped API responses.
export function parseCategoryCatalog(input: unknown): CategoryOption[] | null {
  if (!record(input) || !Array.isArray(input.categories) || input.categories.length > 500) return null;
  const ids = new Set<string>();
  const categories: CategoryOption[] = [];
  for (const item of input.categories) {
    if (!record(item) || typeof item.id !== "string" || !UUID.test(item.id)
      || typeof item.name !== "string" || !item.name.trim()
      || item.name.trim() !== item.name || item.name.length > 120
      || typeof item.sort_order !== "number" || !Number.isSafeInteger(item.sort_order)
      || item.sort_order < 0) return null;
    const id = item.id.toLowerCase();
    if (ids.has(id)) return null;
    ids.add(id);
    categories.push({ id, name: item.name, sort_order: item.sort_order });
  }
  return categories.sort((a, b) => a.sort_order - b.sort_order
    || a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id));
}

export function parseModCategoryDraft(
  input: unknown, modId: string, categories: readonly CategoryOption[]
): ModCategoryDraft | null {
  if (!record(input) || typeof input.modId !== "string"
    || input.modId.toLowerCase() !== modId.toLowerCase()
    || !Array.isArray(input.categoryIds) || input.categoryIds.length > 64) return null;
  const allowed = new Set(categories.map(item => item.id));
  const ids: string[] = [];
  for (const raw of input.categoryIds) {
    if (typeof raw !== "string" || !UUID.test(raw)) return null;
    const id = raw.toLowerCase();
    if (!allowed.has(id) || ids.includes(id)) return null;
    ids.push(id);
  }
  if (ids.length === 0) {
    if (input.primaryCategoryId !== null) return null;
    return { modId: modId.toLowerCase(), categoryIds: [], primaryCategoryId: null };
  }
  if (typeof input.primaryCategoryId !== "string" || !UUID.test(input.primaryCategoryId)
    || !ids.includes(input.primaryCategoryId.toLowerCase())) return null;
  return {
    modId: modId.toLowerCase(), categoryIds: ids,
    primaryCategoryId: input.primaryCategoryId.toLowerCase()
  };
}

export function toggleModCategory(
  draft: ModCategoryDraft, categoryId: string
): ModCategoryDraft {
  if (draft.categoryIds.includes(categoryId)) {
    const ids = draft.categoryIds.filter(id => id !== categoryId);
    return { ...draft, categoryIds: ids, primaryCategoryId: ids.includes(draft.primaryCategoryId ?? "")
      ? draft.primaryCategoryId : (ids[0] ?? null) };
  }
  if (draft.categoryIds.length >= 64) return draft;
  return {
    ...draft, categoryIds: [...draft.categoryIds, categoryId],
    primaryCategoryId: draft.primaryCategoryId ?? categoryId
  };
}

export function changeModPrimary(draft: ModCategoryDraft, categoryId: string): ModCategoryDraft {
  if (!draft.categoryIds.includes(categoryId)) return draft;
  return { ...draft, primaryCategoryId: categoryId };
}

export function modCategoryChanged(
  saved: ModCategoryDraft, draft: ModCategoryDraft
): boolean {
  if (saved.modId !== draft.modId || saved.primaryCategoryId !== draft.primaryCategoryId
    || saved.categoryIds.length !== draft.categoryIds.length) return true;
  return new Set(saved.categoryIds).size !== new Set(draft.categoryIds).size
    || saved.categoryIds.some(id => !draft.categoryIds.includes(id));
}

export function canSaveModCategories(draft: ModCategoryDraft): boolean {
  return draft.categoryIds.length > 0 && draft.categoryIds.length <= 64
    && new Set(draft.categoryIds).size === draft.categoryIds.length
    && draft.primaryCategoryId !== null
    && draft.categoryIds.includes(draft.primaryCategoryId);
}
