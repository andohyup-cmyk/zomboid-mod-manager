import { checkBackupV3References } from "./backup-reference-integrity";
import { checkBackupV4Categories } from "./backup-category-integrity";

export const LEGACY_BACKUP_TABLES = [
  "mods", "modIds", "researchRecords", "profiles", "profileMods", "researchQueue"
] as const;
export const NEW_PROFILE_BACKUP_TABLES = [
  "profileRevisions", "profileModChoices", "profileDownloads"
] as const;
export const NEW_RELATION_BACKUP_TABLES = ["modRelations"] as const;
export const V2_BACKUP_TABLES = [...LEGACY_BACKUP_TABLES, ...NEW_PROFILE_BACKUP_TABLES] as const;
export const V3_BACKUP_TABLES = [...V2_BACKUP_TABLES, ...NEW_RELATION_BACKUP_TABLES] as const;
export const NEW_CATEGORY_BACKUP_TABLES = ["categories", "modCategories", "modCategoryPrimary"] as const;
export const BACKUP_TABLES = [...V3_BACKUP_TABLES, ...NEW_CATEGORY_BACKUP_TABLES] as const;
export const OPTIONAL_GROUP_BACKUP_TABLES = ["selectionGroups", "selectionGroupMembers"] as const;

export type BackupTable = typeof BACKUP_TABLES[number];
export type OptionalGroupBackupTable = typeof OPTIONAL_GROUP_BACKUP_TABLES[number];
export type BackupPreview = {
  exportedAt: string;
  complete: boolean;
  warnings: string[];
  counts: Record<BackupTable, number | null>;
  optionalCounts?: Partial<Record<OptionalGroupBackupTable, number>>;
};

/**
 * Only v4 exports can be complete for the category-enabled test schema.
 * Older v1/v2/v3 files remain inspectable but lack newer entity types.
 * This checks structure, not a transactionally consistent database backup.
 */
export function inspectBackupSnapshot(input: unknown):
  { preview: BackupPreview; error?: never } | { preview?: never; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "백업 JSON은 객체여야 합니다." };
  }
  const raw = input as Record<string, unknown>;
  const version = raw.schemaVersion;
  if (typeof version !== "number" || ![1,2,3,4].includes(version)
    || raw.scope !== "authorized-user-catalog-and-profiles"
    || typeof raw.exportedAt !== "string"
    || !Number.isFinite(Date.parse(raw.exportedAt))) {
    return { error: "지원하는 데이터 내보내기 형식이 아닙니다." };
  }
  if (typeof raw.complete !== "boolean" || !Array.isArray(raw.warnings)
    || raw.warnings.length > 50
    || raw.warnings.some(x => typeof x !== "string" || x.length > 2000)
    || !raw.data || typeof raw.data !== "object" || Array.isArray(raw.data)) {
    return { error: "백업 완결성 정보 또는 데이터 영역이 올바르지 않습니다." };
  }

  const data = raw.data as Record<string, unknown>;
  const counts = {} as Record<BackupTable, number | null>;
  for (const table of BACKUP_TABLES) {
    const missingLegacy = (version === 1
      && (NEW_PROFILE_BACKUP_TABLES as readonly string[]).includes(table))
      || (version <= 2
        && (NEW_RELATION_BACKUP_TABLES as readonly string[]).includes(table))
      || (version <= 3
        && (NEW_CATEGORY_BACKUP_TABLES as readonly string[]).includes(table));
    if (missingLegacy) {
      counts[table] = null;
      continue;
    }
    const entries = data[table];
    if (entries === null && table === "researchQueue") {
      counts[table] = null;
      continue;
    }
    if (!Array.isArray(entries) || entries.length > 10000
      || entries.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
      return { error: `${table} 백업 항목이 누락되었거나 형식·개수 제한을 초과했습니다.` };
    }
    counts[table] = entries.length;
  }

  const optionalCounts: Partial<Record<OptionalGroupBackupTable, number>> = {};
  for (const table of OPTIONAL_GROUP_BACKUP_TABLES) {
    if (!(table in data) || data[table] === undefined) continue;
    const entries = data[table];
    if (!Array.isArray(entries) || entries.length > 10000
      || entries.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
      return { error: `${table} 백업 항목의 형식·개수 제한이 올바르지 않습니다.` };
    }
    optionalCounts[table] = entries.length;
  }

  if (raw.complete && (counts.researchQueue === null || raw.warnings.length !== 0)) {
    return { error: "완전한 백업 표시와 실제 데이터·경고 상태가 일치하지 않습니다." };
  }

  // Structural row counts alone cannot detect a profile or relation that
  // references a missing game Mod ID, an old revision, or a foreign owner.
  if (version === 3 || version === 4) {
    const checked = checkBackupV3References(data as Parameters<typeof checkBackupV3References>[0]);
    if (!checked.ok) {
      return { error: "백업 참조 무결성 검증 실패: " + checked.reason };
    }
  }
  if (version === 4) {
    const checked = checkBackupV4Categories(data as Parameters<typeof checkBackupV4Categories>[0]);
    if (!checked.ok) {
      return { error: "백업 카테고리 무결성 검증 실패: " + checked.reason };
    }
  }
  const warnings = [...raw.warnings] as string[];
  if (version === 1) {
    warnings.push("이전 버전(v1) 파일에는 프로필 수정 회차·개별 Mod ID 선택·다운로드 전용 목록·모드 관계 승인 기록이 포함되지 않습니다.");
  }
  if (version === 2) {
    warnings.push("이전 버전(v2) 파일에는 모드 관계 및 승인 상태(modRelations)가 포함되지 않습니다.");
  }
  if (version === 3) {
    warnings.push("이전 버전(v3) 파일에는 다중 카테고리 및 대표 카테고리 기록이 없어 부분 백업입니다.");
  }
  return {
    preview: {
      exportedAt: raw.exportedAt,
      complete: raw.complete && version === 4,
      warnings,
      counts,
      ...(Object.keys(optionalCounts).length > 0 ? { optionalCounts } : {})
    }
  };
}
