import { canonicalWorkshopId } from "./workshop";
import type { ProfileModSelection } from "./profile-mod-id-state";

const MAX_SELECTIONS = 500;
const MAX_DOWNLOADS = 500;

export type PortableProfile = {
  schemaVersion: 1;
  kind: "pzmod-manager-profile-draft";
  exportedAt: string;
  selections: ProfileModSelection[];
  downloadOnlyWorkshopIds: string[];
};

type ParsedProfile = { profile: PortableProfile; error?: never } | { profile?: never; error: string };

const validModId = (id: unknown): id is string =>
  typeof id === "string" && id.length > 0 && id.length <= 200
  && id === id.trim() && !/[;\r\n\x00-\x1f]/.test(id);

function selectionKey(item: { workshopId: string; modId: string }): string {
  return JSON.stringify([item.workshopId, item.modId]);
}

export function createPortableProfile(
  selections: readonly ProfileModSelection[], downloads: readonly string[],
  exportedAt = new Date().toISOString()
): PortableProfile {
  return {
    schemaVersion: 1,
    kind: "pzmod-manager-profile-draft",
    exportedAt,
    selections: selections.map(({ workshopId, modId, enabled }) =>
      ({ workshopId, modId, enabled })),
    downloadOnlyWorkshopIds: [...downloads]
  };
}

/** Strict, offline-only JSON validation. This does not change any DB or game server. */
export function parsePortableProfile(value: unknown): ParsedProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "프로필 JSON은 객체여야 합니다." };
  }
  const raw = value as Record<string, unknown>;
  if (raw.kind !== "pzmod-manager-profile-draft" || raw.schemaVersion !== 1
    || typeof raw.exportedAt !== "string" || !Number.isFinite(Date.parse(raw.exportedAt))) {
    return { error: "지원하는 프로필 내보내기 파일이 아닙니다." };
  }
  if (!Array.isArray(raw.selections) || raw.selections.length > MAX_SELECTIONS
    || !Array.isArray(raw.downloadOnlyWorkshopIds) || raw.downloadOnlyWorkshopIds.length > MAX_DOWNLOADS) {
    return { error: "모드·다운로드 목록이 올바르지 않거나 500개 제한을 초과했습니다." };
  }
  const selections: ProfileModSelection[] = [];
  const seen = new Set<string>();
  for (const [index, item] of raw.selections.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: `${index + 1}번 Mod ID 선택 정보가 올바르지 않습니다.` };
    }
    const row = item as Record<string, unknown>;
    const workshopId = canonicalWorkshopId(row.workshopId);
    if (!workshopId || workshopId !== row.workshopId || !validModId(row.modId)
      || typeof row.enabled !== "boolean") {
      return { error: `${index + 1}번 선택 항목의 Workshop/Mod ID 및 활성 상태를 확인하세요.` };
    }
    const entry = { workshopId, modId: row.modId, enabled: row.enabled };
    const key = selectionKey(entry);
    if (seen.has(key)) return { error: `${index + 1}번 선택 항목이 중복되었습니다.` };
    seen.add(key);
    selections.push(entry);
  }
  const downloads: string[] = [];
  const downloadSet = new Set<string>();
  for (const value of raw.downloadOnlyWorkshopIds) {
    const id = canonicalWorkshopId(value);
    if (!id || value !== id || downloadSet.has(id)) {
      return { error: "다운로드 전용 Workshop ID의 형식·중복을 확인하세요." };
    }
    downloadSet.add(id);
    downloads.push(id);
  }
  return { profile: { schemaVersion: 1, kind: "pzmod-manager-profile-draft",
    exportedAt: raw.exportedAt, selections, downloadOnlyWorkshopIds: downloads } };
}
