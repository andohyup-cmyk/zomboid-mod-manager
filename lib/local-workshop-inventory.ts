/**
 * Read-only comparison of explicit profile Mod IDs against a PC mod.info scan.
 * The scan is not authoritative evidence of which files the game loaded or B42.22/MP compatibility.
 */
export type LocalModInfo = {
  workshopId: string;
  modId: string;
  relativePath: string;
  requires: readonly string[];
};

export type LocalWorkshopInventory = {
  targetBuild: string;
  scannedAtUtc: string;
  mods: readonly LocalModInfo[];
};

export type InventoryParseResult =
  | { ok: true; inventory: LocalWorkshopInventory }
  | { ok: false; error: string };

export type InventorySelection = {
  workshopId: string;
  modId: string;
  enabled: boolean;
};

export type InventoryIssue = {
  code: "mod-info-missing" | "workshop-mismatch" | "b42-metadata-unverified"
    | "version-dependent-requires" | "required-mod-missing" | "required-mod-after";
  severity: "warning" | "info";
  message: string;
};

export type InventoryComparison = {
  checked: number;
  matched: number;
  issues: readonly InventoryIssue[];
};

const MAX_RECORDS = 3000;
const workshopPattern = /^[1-9][0-9]{4,19}$/;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequirement(value: string): string {
  return value.trim().replace(/^\\+/, "").trim();
}

/** Parse the standalone PowerShell audit, never interpreting display names or compatibility flags. */
export function parseLocalWorkshopInventory(value: unknown): InventoryParseResult {
  if (!object(value) || !Array.isArray(value.mods) || value.mods.length > MAX_RECORDS
    || typeof value.targetBuild !== "string" || !/^42(?:\.\d+)?$/.test(value.targetBuild)
    || typeof value.scannedAtUtc !== "string" || Number.isNaN(Date.parse(value.scannedAtUtc))) {
    return { ok: false, error: "로컬 mod.info 조사 JSON 형식이 올바르지 않습니다." };
  }
  const mods: LocalModInfo[] = [];
  for (const [index, row] of value.mods.entries()) {
    if (!object(row) || typeof row.workshopId !== "string" || !workshopPattern.test(row.workshopId)
      || typeof row.modId !== "string" || !row.modId.trim() || row.modId.length > 200
      || typeof row.relativePath !== "string" || row.relativePath.length > 500
      || !row.relativePath.replaceAll("/", "\\").startsWith(`${row.workshopId}\\`)
      || !/[\\/]mod\.info$/i.test(row.relativePath)
      || !Array.isArray(row.requires) || row.requires.length > 100
      || row.requires.some((requirement: unknown) => typeof requirement !== "string" || requirement.length > 200)) {
      return { ok: false, error: `${index + 1}번째 mod.info 기록을 검증할 수 없습니다.` };
    }
    mods.push({
      workshopId: row.workshopId,
      modId: row.modId.trim(),
      relativePath: row.relativePath,
      requires: [...new Set((row.requires as string[]).map(normalizeRequirement).filter(Boolean))]
    });
  }
  return { ok: true, inventory: { targetBuild: value.targetBuild, scannedAtUtc: value.scannedAtUtc, mods } };
}

function recordVersion(path: string): string | null {
  return path.match(/[\\/](42(?:\.\d+)?|common)[\\/]mod\.info$/i)?.[1]?.toLowerCase() ?? null;
}

function buildCandidates(records: readonly LocalModInfo[], targetBuild: string): readonly LocalModInfo[] {
  const exact = records.filter((record) => recordVersion(record.relativePath) === targetBuild);
  if (exact.length) return exact;
  const targetMinor = Number(targetBuild.split(".")[1] ?? 0);
  const b42 = records.filter((record) => {
    const version = recordVersion(record.relativePath);
    if (!version?.startsWith("42")) return false;
    const minor = version.split(".")[1];
    return minor === undefined || Number(minor) <= targetMinor;
  });
  if (b42.length) return b42;
  const common = records.filter((record) => recordVersion(record.relativePath) === "common");
  return common.length ? common : records;
}

/**
 * Reports potential problems only; never blocks copy or silently reorders selections.
 * If several B42 version folders disagree, only requirements common to all are checked.
 */
export function compareLocalInventory(
  inventory: LocalWorkshopInventory,
  selections: readonly InventorySelection[],
  targetBuild = "42.22"
): InventoryComparison {
  const active = selections.filter((selection) => selection.enabled);
  const positions = new Map<string, number>();
  active.forEach((selection, index) => {
    if (!positions.has(selection.modId)) positions.set(selection.modId, index);
  });
  const byPair = new Map<string, LocalModInfo[]>();
  const byModId = new Set<string>();
  for (const record of inventory.mods) {
    const key = JSON.stringify([record.workshopId, record.modId]);
    const matches = byPair.get(key) ?? [];
    matches.push(record);
    byPair.set(key, matches);
    byModId.add(record.modId);
  }
  const issues: InventoryIssue[] = [];
  let matched = 0;
  for (const [index, selection] of active.entries()) {
    const records = byPair.get(JSON.stringify([selection.workshopId, selection.modId]));
    if (!records?.length) {
      const mismatch = byModId.has(selection.modId);
      issues.push({
        code: mismatch ? "workshop-mismatch" : "mod-info-missing",
        severity: "warning",
        message: mismatch
          ? `${selection.modId}: 설치 조사 자료에 같은 Mod ID가 있지만 Workshop ${selection.workshopId}에서는 확인되지 않았습니다.`
          : `${selection.modId}: 설치 조사 자료에서 Workshop ${selection.workshopId}의 Mod ID를 찾지 못했습니다.`
      });
      continue;
    }
    matched++;
    const candidates = buildCandidates(records, targetBuild);
    const b42 = candidates.some((record) => recordVersion(record.relativePath)?.startsWith("42"));
    if (!b42) issues.push({
      code: "b42-metadata-unverified", severity: "info",
      message: `${selection.modId}: B42용 mod.info 경로를 확인하지 못했습니다. 이 파일의 적용 버전은 미확인입니다.`
    });
    const sets = candidates.map((record) => new Set(record.requires));
    const required = [...(sets[0] ?? [])].filter((id) => sets.every((set) => set.has(id)));
    if (sets.some((set) => set.size !== required.length)) issues.push({
      code: "version-dependent-requires", severity: "info",
      message: `${selection.modId}: B42 하위 버전별 require= 값이 다릅니다. 공통으로 선언된 의존성만 비교하며 게임의 실제 로드 경로는 미확인입니다.`
    });
    for (const id of required) {
      const requiredIndex = positions.get(id);
      if (requiredIndex === undefined) issues.push({
        code: "required-mod-missing", severity: "warning",
        message: `${selection.modId}: 로컬 mod.info의 require=${id}가 활성 목록에 없습니다. 적용 버전·필수 여부는 별도 확인이 필요합니다.`
      });
      else if (requiredIndex > index) issues.push({
        code: "required-mod-after", severity: "warning",
        message: `${selection.modId}: 로컬 mod.info에서 참조한 ${id}가 뒤에 배치되어 있습니다. 실제 로드 순서를 확인하세요.`
      });
    }
  }
  return { checked: active.length, matched, issues };
}
