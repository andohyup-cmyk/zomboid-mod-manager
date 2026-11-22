/** Read-only category reference validation for the thirteen-area JSON v4 export. */
type Row = Record<string, unknown>;
type CategoryData = {
  mods: readonly Row[];
  profiles: readonly Row[];
  researchQueue: readonly Row[] | null;
  profileRevisions: readonly Row[];
  profileModChoices: readonly Row[];
  profileDownloads: readonly Row[];
  modRelations: readonly Row[];
  categories: readonly Row[];
  modCategories: readonly Row[];
  modCategoryPrimary: readonly Row[];
};
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 && v.trim() === v ? v : null;

export function checkBackupV4Categories(data: CategoryData):
  { ok: true } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason });
  const owners = new Set<string>();
  for (const name of [
    "mods", "profiles", "profileRevisions", "profileModChoices",
    "profileDownloads", "modRelations", "categories", "modCategories",
    "modCategoryPrimary"
  ] as const) {
    for (const row of data[name]) {
      const uid = str(row.owner_id);
      if (!uid) return fail(`${name} 소유자가 누락됐습니다.`);
      owners.add(uid);
    }
  }
  for (const row of data.researchQueue ?? []) {
    const uid = str(row.owner_id);
    if (!uid) return fail("영구 대기함 소유자가 누락됐습니다.");
    owners.add(uid);
  }
  if (owners.size > 1) return fail("서로 다른 소유자의 카테고리 데이터가 섞여 있습니다.");

  const mods = new Map<string, string>();
  for (const row of data.mods) {
    const id = str(row.id), uid = str(row.owner_id);
    if (!id || !uid || mods.has(id)) return fail("모드 ID가 올바르지 않습니다.");
    mods.set(id, uid);
  }
  const categories = new Map<string, string>(), names = new Set<string>();
  for (const row of data.categories) {
    const id = str(row.id), uid = str(row.owner_id), name = str(row.name);
    if (!id || !uid || !name || name.length > 120 ||
      !Number.isSafeInteger(row.sort_order) || (row.sort_order as number) < 0 ||
      categories.has(id) || names.has(JSON.stringify([uid, name]))) {
      return fail("카테고리 정의의 ID·이름·순서·중복이 잘못됐습니다.");
    }
    categories.set(id, uid);
    names.add(JSON.stringify([uid, name]));
  }
  const members = new Map<string, Set<string>>();
  for (const row of data.modCategories) {
    const uid = str(row.owner_id), modId = str(row.mod_id), categoryId = str(row.category_id);
    if (!uid || !modId || !categoryId || mods.get(modId) !== uid ||
      categories.get(categoryId) !== uid) {
      return fail("카테고리 소속의 참조·소유자가 일치하지 않습니다.");
    }
    const set = members.get(modId) ?? new Set<string>();
    if (set.has(categoryId) || set.size >= 64) return fail("카테고리 소속 중복 또는 64개 초과입니다.");
    set.add(categoryId);
    members.set(modId, set);
  }
  const primaries = new Set<string>();
  for (const row of data.modCategoryPrimary) {
    const uid = str(row.owner_id), modId = str(row.mod_id), categoryId = str(row.category_id);
    if (!uid || !modId || !categoryId || mods.get(modId) !== uid ||
      categories.get(categoryId) !== uid || !members.get(modId)?.has(categoryId) ||
      primaries.has(modId)) {
      return fail("대표 카테고리의 소속·소유자·고유성이 올바르지 않습니다.");
    }
    primaries.add(modId);
  }
  for (const modId of members.keys()) {
    if (!primaries.has(modId)) return fail("분류된 모드의 대표 카테고리가 없습니다.");
  }
  return { ok: true };
}
