import { canonicalWorkshopId, type VerificationStatus } from "./workshop";

export { canonicalWorkshopId };

type ModSelection = { workshopId?: string; modId: string };
type ModMetadata = {
  modId: string;
  buildCompatibility?: VerificationStatus;
  multiplayerCompatibility?: VerificationStatus;
  dependencyReviewSource?: string;
};
type WorkshopItem = {
  workshopId: string;
  modIds: readonly string[];
  modMetadata?: readonly ModMetadata[];
};

type ModRelationship = (
  | { kind: "requires-mod"; modId: string; requiredModId: string }
  | { kind: "requires-workshop"; workshopId: string; requiredWorkshopId: string }
  | { kind: "incompatible-mods"; modId: string; incompatibleModId: string }
  | { kind: "load-before"; beforeModId: string; afterModId: string }
) & { verifiedSource?: string };

const ISSUE_SEVERITY = {
  "empty-profile": "error",
  "missing-workshop-id": "error",
  "invalid-workshop-id": "error",
  "invalid-mod-id": "error",
  "mod-not-in-workshop": "error",
  "missing-required-mod": "error",
  "missing-required-workshop": "error",
  "duplicate-mod-id": "warning",
  "incompatible-mods": "warning",
  "archived-workshop": "warning",
  "load-order-violation": "warning",
  "load-order-cycle": "warning",
  "ambiguous-mod-source": "info",
  "compatibility-unverified": "info",
  "compatibility-reported-issue": "info",
  "dependency-unverified": "info",
  "load-order-unverified": "info",
  "profile-rule-unverified": "info",
  "group-selection-violation": "error",
  "group-rule-unverified": "info"
} as const;

type IssueCode = keyof typeof ISSUE_SEVERITY;
type ReportIssue = (code: IssueCode, message: string) => void;

export type ProfileRuleIssue = { code: IssueCode; message: string };

export type ServerConfigInput = {
  catalog: readonly WorkshopItem[];
  selectedMods?: readonly ModSelection[];
  downloadOnlyWorkshopIds?: readonly string[];
  archivedWorkshopIds?: readonly string[];
  relationships?: readonly ModRelationship[];
  profileRuleIssues?: readonly ProfileRuleIssue[];
};

export type ServerConfigOptions = {
  modIdPrefix: "" | "\\";
  warningsAcknowledged?: boolean;
};

type ServerConfigIssue = {
  code: IssueCode;
  severity: (typeof ISSUE_SEVERITY)[IssueCode];
  message: string;
};

type ServerConfigResult = {
  issues: ServerConfigIssue[];
  recommendedModOrder: string[] | null;
  preview: { mods: string; workshopItems: string } | null;
  copyStatus: "ready" | "blocked" | "confirmation-required";
  copyText: string | null;
};

function isOutputModId(modId: unknown): boolean {
  if (typeof modId !== "string" || !modId || modId !== modId.trim() || /[;=\\]/.test(modId)) return false;
  return [...modId].every((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127 && code !== 0x2028 && code !== 0x2029;
  });
}

function checkModMetadata(metadata: ModMetadata, report: ReportIssue) {
  const compatibility = [
    { label: "B42.22", status: metadata.buildCompatibility },
    { label: "멀티플레이", status: metadata.multiplayerCompatibility }
  ];
  for (const { label, status } of compatibility) {
    if (!status || status === "unverified") {
      report("compatibility-unverified", `${metadata.modId}의 ${label} 호환성은 미확인입니다.`);
    } else if (status === "reported_issue") {
      report("compatibility-reported-issue", `${metadata.modId}의 ${label} 호환성 문제 보고가 있습니다.`);
    }
  }
  if (!metadata.dependencyReviewSource?.trim()) {
    report("dependency-unverified", `${metadata.modId}의 의존성 검토 상태는 미확인입니다.`);
  }
}

function recommendModOrder(
  modIds: Iterable<string>,
  predecessors: ReadonlyMap<string, readonly string[]>
): string[] | null {
  const pending = new Set(modIds);
  const order: string[] = [];
  while (pending.size > 0) {
    const next = [...pending].find((id) =>
      (predecessors.get(id) ?? []).every((predecessor) => !pending.has(predecessor))
    );
    if (next === undefined) return null;
    order.push(next);
    pending.delete(next);
  }
  return order;
}

function checkRelationships(
  relationships: readonly ModRelationship[],
  modPositions: ReadonlyMap<string, number>,
  workshopIds: ReadonlySet<string>,
  report: ReportIssue
): string[] | null {
  const predecessors = new Map<string, string[]>();
  let orderViolation = false;

  for (const relationship of relationships) {
    const verified = Boolean(relationship.verifiedSource?.trim());
    switch (relationship.kind) {
      case "requires-mod": {
        const { modId, requiredModId } = relationship;
        if (!modPositions.has(modId)) break;
        if (!verified || !isOutputModId(requiredModId)) {
          report("dependency-unverified", `${modId}와 ${requiredModId || "대상 Mod ID"}의 필수 의존 관계는 미확인입니다.`);
        } else if (!modPositions.has(requiredModId)) {
          report("missing-required-mod", `${modId}에 필요한 Mod ID ${requiredModId}를 선택해 주세요.`);
        }
        break;
      }
      case "requires-workshop": {
        const workshopId = canonicalWorkshopId(relationship.workshopId);
        const requiredId = canonicalWorkshopId(relationship.requiredWorkshopId);
        if (!workshopId || !workshopIds.has(workshopId)) break;
        if (!verified || !requiredId) {
          report("dependency-unverified", `Workshop ${workshopId}의 필수 Workshop 의존 관계는 미확인입니다.`);
        } else if (!workshopIds.has(requiredId)) {
          report("missing-required-workshop", `Workshop ${workshopId}에 필요한 Workshop ${requiredId}를 선택해 주세요.`);
        }
        break;
      }
      case "incompatible-mods": {
        const { modId, incompatibleModId } = relationship;
        if (!modPositions.has(modId) || !modPositions.has(incompatibleModId)) break;
        if (verified) {
          report("incompatible-mods", `${modId}와 ${incompatibleModId}의 동시 선택을 확인해 주세요.`);
        } else {
          report("compatibility-unverified", `${modId}와 ${incompatibleModId}의 충돌 여부는 미확인입니다.`);
        }
        break;
      }
      case "load-before": {
        const { beforeModId, afterModId } = relationship;
        const before = modPositions.get(beforeModId);
        const after = modPositions.get(afterModId);
        if (before === undefined || after === undefined) break;
        if (!verified) {
          report("load-order-unverified", `${beforeModId}와 ${afterModId}의 로드 순서 제약은 미확인입니다.`);
          break;
        }
        const requiredBefore = predecessors.get(afterModId) ?? [];
        requiredBefore.push(beforeModId);
        predecessors.set(afterModId, requiredBefore);
        if (before >= after) {
          orderViolation = true;
          report("load-order-violation", `${beforeModId}를 ${afterModId}보다 앞에 배치해 주세요.`);
        }
        break;
      }
    }
  }

  if (!orderViolation) return null;
  const order = recommendModOrder(modPositions.keys(), predecessors);
  if (!order) report("load-order-cycle", "순환하는 로드 순서 조건을 함께 만족할 수 없습니다.");
  return order;
}

export function buildServerConfig(input: ServerConfigInput, options: ServerConfigOptions): ServerConfigResult {
  const { catalog, selectedMods = [], downloadOnlyWorkshopIds = [], archivedWorkshopIds = [], relationships = [] } = input;
  const issues: ServerConfigIssue[] = [];
  const report: ReportIssue = (code, message) => {
    issues.push({ code, severity: ISSUE_SEVERITY[code], message });
  };

  const catalogByWorkshopId = new Map<string, Map<string, ModMetadata>>();
  for (const item of catalog) {
    const workshopId = canonicalWorkshopId(item.workshopId);
    if (!workshopId) continue;
    const candidates = catalogByWorkshopId.get(workshopId) ?? new Map<string, ModMetadata>();
    const metadata = new Map(item.modMetadata?.map((detail) => [detail.modId, detail]));
    for (const modId of item.modIds) {
      candidates.set(modId, metadata.get(modId) ?? candidates.get(modId) ?? { modId });
    }
    catalogByWorkshopId.set(workshopId, candidates);
  }

  if (selectedMods.length === 0 && downloadOnlyWorkshopIds.length === 0) {
    report("empty-profile", "실제 Mod ID 또는 다운로드 전용 Workshop 항목을 선택해 주세요.");
  }

  const workshopIds = new Set<string>();
  const modPositions = new Map<string, number>();
  const duplicateModIds = new Set<string>();
  for (const selection of selectedMods) {
    const { modId, workshopId: selectedWorkshopId } = selection;
    if (!isOutputModId(modId)) {
      report("invalid-mod-id", "출력할 수 있는 실제 Mod ID를 선택해 주세요.");
      continue;
    }
    if (!selectedWorkshopId || (typeof selectedWorkshopId === "string" && !selectedWorkshopId.trim())) {
      report("missing-workshop-id", `${modId}에 연결된 Workshop ID가 없습니다.`);
      continue;
    }
    const workshopId = canonicalWorkshopId(selectedWorkshopId);
    if (!workshopId) {
      report("invalid-workshop-id", `Workshop ID ${selectedWorkshopId}의 숫자 형식을 확인해 주세요.`);
      continue;
    }
    const metadata = catalogByWorkshopId.get(workshopId)?.get(modId);
    if (!metadata) {
      report("mod-not-in-workshop", `${modId}가 Workshop ${workshopId}의 Mod ID 목록에 없습니다.`);
      continue;
    }
    workshopIds.add(workshopId);
    if (modPositions.has(modId)) {
      duplicateModIds.add(modId);
      continue;
    }
    modPositions.set(modId, modPositions.size);
    checkModMetadata(metadata, report);
  }
  for (const modId of duplicateModIds) {
    report("duplicate-mod-id", `${modId}가 여러 번 선택되어 출력에서는 처음 한 번만 표시합니다.`);
  }
  for (const id of downloadOnlyWorkshopIds) {
    const workshopId = canonicalWorkshopId(id);
    if (workshopId) workshopIds.add(workshopId);
    else report("invalid-workshop-id", `다운로드 전용 Workshop ID ${id}의 숫자 형식을 확인해 주세요.`);
  }

  const archived = new Set(archivedWorkshopIds.map(canonicalWorkshopId));
  for (const workshopId of workshopIds) {
    if (archived.has(workshopId)) {
      report("archived-workshop", `보관된 Workshop ${workshopId}가 선택되어 있습니다.`);
    }
  }
  if (issues.some(({ severity }) => severity === "error")) {
    return { issues, recommendedModOrder: null, preview: null, copyStatus: "blocked", copyText: null };
  }

  const providerByModId = new Map<string, string>();
  for (const workshopId of workshopIds) {
    for (const modId of catalogByWorkshopId.get(workshopId)?.keys() ?? []) {
      if (!modPositions.has(modId)) continue;
      const provider = providerByModId.get(modId);
      if (provider) {
        report("ambiguous-mod-source", `${modId}를 제공하는 Workshop이 ${provider}, ${workshopId}로 겹쳐 실제 게임에서 사용할 출처는 미확인입니다.`);
      } else {
        providerByModId.set(modId, workshopId);
      }
    }
  }

  const recommendedModOrder = checkRelationships(relationships, modPositions, workshopIds, report);
  for (const issue of input.profileRuleIssues ?? []) report(issue.code, issue.message);
  const preview = {
    mods: "Mods=" + [...modPositions.keys()].map((id) => options.modIdPrefix + id).join(";"),
    workshopItems: "WorkshopItems=" + [...workshopIds].join(";")
  };

  let copyStatus: ServerConfigResult["copyStatus"] = "ready";
  if (issues.some(({ severity }) => severity === "error")) copyStatus = "blocked";
  else if (!options.warningsAcknowledged && issues.some(({ severity }) => severity === "warning")) {
    copyStatus = "confirmation-required";
  }

  const copyText = copyStatus === "ready" ? `${preview.mods}\n${preview.workshopItems}` : null;
  return { issues, recommendedModOrder, preview, copyStatus, copyText };
}
