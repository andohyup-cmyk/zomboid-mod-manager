/**
 * Read-only referential integrity checks for the ten JSON v3 export areas.
 * Runs on in-memory JSON only, without DB access or any restore operation.
 *
 * This is intentionally narrower than PostgreSQL FK/RLS verification:
 * it catches missing, duplicate and cross-owner references in the exported
 * rows. It does NOT assert that sequential API queries were an atomic backup.
 */
export const BACKUP_REFERENCE_AREAS = [
  "mods", "modIds", "researchRecords", "profiles", "profileMods",
  "researchQueue", "profileRevisions", "profileModChoices",
  "profileDownloads", "modRelations"
] as const;

export type BackupReferenceArea = typeof BACKUP_REFERENCE_AREAS[number];

type Row = Record<string, unknown>;
type Data = Record<BackupReferenceArea, readonly Row[] | null>;
type Indexed = { row: Row; owner: string };

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() === value && value.length > 0
    ? value : null;
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}
function validDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function checkBackupV3References(
  data: Data
): { ok: true } | { ok: false; reason: string } {
  const fail = (message: string) => ({ ok: false as const, reason: message });
  const ownerIds = new Set<string>();

  const owner = (row: Row): string | null => {
    const uid = str(row.owner_id);
    if (!uid) return null;
    ownerIds.add(uid);
    return uid;
  };
  const index = (
    rows: readonly Row[] | null,
    key: (row: Row) => string | null,
    getOwner: (row: Row) => string | null
  ): Map<string, Indexed> | null => {
    if (!rows) return null;
    const indexed = new Map<string, Indexed>();
    for (const row of rows) {
      const k = key(row);
      const uid = getOwner(row);
      if (!k || !uid || indexed.has(k)) return null;
      indexed.set(k, { row, owner: uid });
    }
    return indexed;
  };
  const mods = index(data.mods, row => str(row.id), row => owner(row));
  if (!mods) return fail("모드 ID/소유자/고유성이 올바르지 않습니다.");

  const profiles = index(data.profiles, row => str(row.id),
    row => owner(row));
  if (!profiles) return fail("프로필 ID/소유자/고유성이 올바르지 않습니다.");

  const modWorkshop = new Set<string>();
  for (const { row, owner: uid } of mods.values()) {
    const workshopId = str(row.workshop_id);
    if (!workshopId || !/^[1-9][0-9]{4,19}$/.test(workshopId)
      || modWorkshop.has(JSON.stringify([uid, workshopId]))) {
      return fail("중복되었거나 잘못된 모드 Workshop ID가 있습니다.");
    }
    modWorkshop.add(JSON.stringify([uid, workshopId]));
  }

  const modIds = index(data.modIds, row => str(row.id), row => {
    const parent = mods.get(str(row.mod_id) ?? "");
    return parent && str(row.value) ? parent.owner : null;
  });
  if (!modIds) return fail("게임 Mod ID가 없거나 연결된 모드가 누락·중복됐습니다.");
  const modIdPairs = new Set<string>();
  for (const { row } of modIds.values()) {
    const pair = JSON.stringify([row.mod_id, row.value]);
    if (modIdPairs.has(pair)) return fail("같은 Workshop에 게임 Mod ID가 중복됩니다.");
    modIdPairs.add(pair);
  }

  const research = index(data.researchRecords,
    row => str(row.id), row => mods.get(str(row.mod_id) ?? "")?.owner ?? null);
  if (!research) return fail("조사 기록의 참조 모드가 누락·중복됐습니다.");

  const revisions = index(data.profileRevisions,
    row => integer(row.revision) && row.revision > 0 && str(row.profile_id)
      ? JSON.stringify([row.profile_id, row.revision]) : null,
    row => {
      const uid = owner(row);
      return uid && profiles.get(str(row.profile_id) ?? "")?.owner === uid ? uid : null;
    });
  if (!revisions) return fail("프로필 저장 회차의 소유자·참조·고유성이 일치하지 않습니다.");

  const legacy = index(data.profileMods,
    row => str(row.profile_id) && str(row.mod_id)
      ? JSON.stringify([row.profile_id, row.mod_id]) : null,
    row => {
      const profile = profiles.get(str(row.profile_id) ?? "");
      const mod = mods.get(str(row.mod_id) ?? "");
      return profile && mod && profile.owner === mod.owner ? profile.owner : null;
    });
  if (!legacy) return fail("기존 프로필 모드 연결의 소유자·참조·고유성이 일치하지 않습니다.");

  const orders = new Map<string, Set<number>>();
  const recordOrder = (profileId: unknown, revision: unknown, indexValue: unknown,
    area: BackupReferenceArea): boolean => {
    if (!str(profileId) || !integer(revision) || !integer(indexValue) || indexValue < 0) {
      return false;
    }
    const key = JSON.stringify([area, profileId, revision]);
    const positions = orders.get(key) ?? new Set<number>();
    if (positions.has(indexValue)) return false;
    positions.add(indexValue);
    orders.set(key, positions);
    return true;
  };

  const choices = index(data.profileModChoices,
    row => str(row.profile_id) && integer(row.revision) && str(row.mod_id_entry_id)
      ? JSON.stringify([row.profile_id, row.revision, row.mod_id_entry_id]) : null,
    row => {
      const uid = owner(row);
      const r = revisions.get(JSON.stringify([row.profile_id, row.revision]));
      const m = modIds.get(str(row.mod_id_entry_id) ?? "");
      return uid && r?.owner === uid && m?.owner === uid &&
        typeof row.enabled === "boolean" &&
        recordOrder(row.profile_id, row.revision, row.load_order, "profileModChoices")
        ? uid : null;
    });
  if (!choices) return fail("프로필 Mod ID 선택의 소유자·순번·연결이 일치하지 않습니다.");

  const downloads = index(data.profileDownloads,
    row => str(row.profile_id) && integer(row.revision) && str(row.workshop_id)
      ? JSON.stringify([row.profile_id, row.revision, row.workshop_id]) : null,
    row => {
      const uid = owner(row);
      const r = revisions.get(JSON.stringify([row.profile_id, row.revision]));
      const workshop = str(row.workshop_id);
      return uid && r?.owner === uid && workshop && /^[1-9][0-9]{4,19}$/.test(workshop)
        && recordOrder(row.profile_id, row.revision, row.load_order, "profileDownloads")
        ? uid : null;
    });
  if (!downloads) return fail("다운로드 전용 Workshop의 소유자·순번·연결이 일치하지 않습니다.");

  for (const positions of orders.values()) {
    if (positions.size && Math.max(...positions) !== positions.size - 1) {
      return fail("프로필 선택의 순번이 0부터 연속되지 않습니다.");
    }
  }

  const queue = data.researchQueue;
  if (queue !== null) {
    const seen = new Set<string>();
    for (const row of queue) {
      const uid = owner(row);
      const id = str(row.id);
      if (!uid || !id || seen.has(id)) {
        return fail("조사 대기함 ID/소유자/고유성이 올바르지 않습니다.");
      }
      seen.add(id);
    }
  }

  const relations = index(data.modRelations, row => str(row.id), row => {
    const uid = owner(row);
    const subject = modIds.get(str(row.subject_mod_id_entry_id) ?? "");
    const target = modIds.get(str(row.target_mod_id_entry_id) ?? "");
    const record = research.get(str(row.research_record_id) ?? "");
    if (!uid || !subject || !target || !record ||
      subject.owner !== uid || target.owner !== uid || record.owner !== uid ||
      subject.row.mod_id !== record.row.mod_id ||
      row.subject_mod_id_entry_id === row.target_mod_id_entry_id ||
      !["requires", "incompatibleMods", "loadBefore", "loadAfter"].includes(String(row.kind)) ||
      !str(row.evidence_url) || !validDate(row.checked_at) ||
      typeof row.approved !== "boolean" ||
      (row.approved === true
        ? typeof row.approved_at !== "string" || !Number.isFinite(Date.parse(row.approved_at))
        : row.approved_at !== null)) {
      return null;
    }
    return uid;
  });
  if (!relations) return fail("관계·승인 기록의 모드·조사 근거·소유자 연결이 일치하지 않습니다.");

  if (ownerIds.size > 1) return fail("서로 다른 소유자의 정보가 하나의 백업에 섞여 있습니다.");
  return { ok: true };
}
