export const LEGACY_BACKUP_TABLES = [
  "mods", "modIds", "researchRecords", "profiles", "profileMods", "researchQueue"
] as const;
export const NEW_PROFILE_BACKUP_TABLES = [
  "profileRevisions", "profileModChoices", "profileDownloads"
] as const;
export const BACKUP_TABLES = [...LEGACY_BACKUP_TABLES, ...NEW_PROFILE_BACKUP_TABLES] as const;

export type BackupTable = typeof BACKUP_TABLES[number];
export type BackupPreview = {
  exportedAt: string;
  complete: boolean;
  warnings: string[];
  counts: Record<BackupTable, number | null>;
};

/**
 * Verify structure only. Never describe legacy v1 exports as complete backups:
 * they cannot contain the newer revisioned profile tables.
 */
export function inspectBackupSnapshot(input: unknown):
  { preview: BackupPreview; error?: never } | { preview?: never; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "백업 JSON은 객체여야 합니다." };
  }
  const raw = input as Record<string, unknown>;
  const legacy = raw.schemaVersion === 1;
  if ((!legacy && raw.schemaVersion !== 2)
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
    if (legacy && NEW_PROFILE_BACKUP_TABLES.some(name => name === table)) {
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

  if (raw.complete && (counts.researchQueue === null || raw.warnings.length !== 0)) {
    return { error: "완전한 백업 표시와 실제 데이터·경고 상태가 일치하지 않습니다." };
  }
  const warnings = [...raw.warnings] as string[];
  if (legacy) warnings.push("이전 버전(v1) 파일에는 프로필 수정 회차·개별 Mod ID 선택·다운로드 전용 데이터가 포함되지 않습니다.");
  return {
    preview: {
      exportedAt: raw.exportedAt,
      complete: raw.complete && !legacy,
      warnings,
      counts
    }
  };
}
