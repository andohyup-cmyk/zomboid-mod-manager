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

type SelectionGroupData = {
  mods: readonly Row[];
  modIds: readonly Row[];
  selectionGroups?: readonly Row[];
  selectionGroupMembers?: readonly Row[];
};

export function checkBackupV4SelectionGroups(
  data: SelectionGroupData
): { ok: true } | { ok: false; reason: string } {
  const hasGroups = data.selectionGroups !== undefined;
  const hasMembers = data.selectionGroupMembers !== undefined;
  if (!hasGroups && !hasMembers) return { ok: true };
  if (!hasGroups || !hasMembers) {
    return { ok: false, reason: "선택 그룹과 구성원 영역은 함께 포함되어야 합니다." };
  }

  const fail = (reason: string) => ({ ok: false as const, reason });
  const owners = new Set<string>();
  const modOwners = new Map<string, string>();
  for (const row of data.mods) {
    const id = str(row.id), uid = str(row.owner_id);
    if (id && uid) {
      modOwners.set(id, uid);
      owners.add(uid);
    }
  }
  const modIdOwners = new Map<string, string>();
  for (const row of data.modIds) {
    const id = str(row.id), modId = str(row.mod_id);
    const uid = modId ? modOwners.get(modId) : undefined;
    if (id && uid) modIdOwners.set(id, uid);
  }

  const groups = new Map<string, string>();
  const labels = new Set<string>();
  for (const row of data.selectionGroups!) {
    const id = str(row.id), uid = str(row.owner_id), label = str(row.label);
    const min = row.min_selected === undefined || row.min_selected === null ? null : row.min_selected;
    const max = row.max_selected === undefined || row.max_selected === null ? null : row.max_selected;
    if (!id || !uid || !label || label.length > 120) {
      return fail("선택 그룹 ID·소유자·이름이 올바르지 않습니다.");
    }
    if (min !== null && (!Number.isSafeInteger(min) || (min as number) < 0)) {
      return fail("선택 그룹 최소 선택 수가 올바르지 않습니다.");
    }
    if (max !== null && (!Number.isSafeInteger(max) || (max as number) < 0)) {
      return fail("선택 그룹 최대 선택 수가 올바르지 않습니다.");
    }
    if (min !== null && max !== null && (min as number) > (max as number)) {
      return fail("선택 그룹 최소 선택 수가 최대 선택 수보다 큽니다.");
    }
    if (groups.has(id) || labels.has(JSON.stringify([uid, label]))) {
      return fail("선택 그룹 ID 또는 이름이 중복됩니다.");
    }
    owners.add(uid);
    groups.set(id, uid);
    labels.add(JSON.stringify([uid, label]));
  }

  const pairs = new Set<string>();
  for (const row of data.selectionGroupMembers!) {
    const uid = str(row.owner_id), groupId = str(row.group_id), modIdRef = str(row.mod_id_ref);
    if (!uid || !groupId || !modIdRef) {
      return fail("선택 그룹 구성원 참조가 누락됐습니다.");
    }
    owners.add(uid);
    if (groups.get(groupId) !== uid || modIdOwners.get(modIdRef) !== uid) {
      return fail("선택 그룹 구성원의 그룹·Mod ID·소유자 연결이 일치하지 않습니다.");
    }
    const pair = JSON.stringify([groupId, modIdRef]);
    if (pairs.has(pair)) return fail("선택 그룹 구성원이 중복됩니다.");
    pairs.add(pair);
  }

  if (owners.size > 1) return fail("서로 다른 소유자의 선택 그룹 데이터가 섞여 있습니다.");
  return { ok: true };
}

