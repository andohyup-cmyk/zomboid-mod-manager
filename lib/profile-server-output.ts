import { getEnabledProfileMods, type ProfileModSelection } from "./profile-mod-id-state";
import { recommendProfileModOrder, type ProfileOrderReference } from "./profile-mod-recommended-order";
import type { ProfileOrderPreviewOptions } from "./profile-order-preview";
import { buildServerConfig, type ProfileRuleIssue, type ServerConfigInput, type ServerConfigOptions } from "./server-config";

function describeMod(mod: ProfileOrderReference) {
  return mod.workshopId ? `${mod.modId} (Workshop ${mod.workshopId})` : mod.modId;
}

// Preserve the editor's provider-qualified rule identities. Two Workshops can supply the same game ID.
function evaluateOrderRules(selections: readonly ProfileModSelection[], options: ProfileOrderPreviewOptions) {
  const issues: ProfileRuleIssue[] = [];
  if (!options.rules?.length || options.exampleRules) return issues;
  const result = recommendProfileModOrder(selections, options);
  for (const warning of result.warnings) {
    switch (warning.code) {
      case "cycle":
        issues.push({ code: "load-order-cycle", message: `확인된 순서 조건이 순환합니다. ${warning.cycle.map(describeMod).join(" → ")}` });
        break;
      case "missing-target":
      case "disabled-target":
        if (warning.rule.kind === "requires") {
          issues.push({ code: "missing-required-mod", message: `${describeMod(warning.rule.mod)}에 필요한 ${describeMod(warning.rule.target)}를 활성화하세요.` });
        }
        break;
      case "incompatible-mods":
        issues.push({ code: "incompatible-mods", message: `${warning.mods.map(describeMod).join(" / ")}의 동시 사용 충돌이 확인되었습니다.` });
        break;
      case "unverified-rule":
      case "ambiguous-reference":
      case "missing-category":
        issues.push({ code: "profile-rule-unverified", message: `${describeMod(warning.rule.mod)}의 ${warning.rule.kind} 규칙은 근거·대상·범위가 미확인입니다.` });
        break;
      case "duplicate-selection":
        // The output builder already warns for repeated game IDs.
        break;
    }
  }
  const changedByRule = result.changes.some((change) => change.reasons.some((reason) => reason.kind === "verified-order"));
  if (changedByRule) issues.push({ code: "load-order-violation", message: "현재 순서가 확인된 로드 순서 규칙과 다릅니다. 추천 정렬에서 이동 이유를 검토하세요." });
  return issues;
}

export function buildProfileServerConfig(
  selections: readonly ProfileModSelection[],
  input: Omit<ServerConfigInput, "selectedMods" | "profileRuleIssues">,
  recommendation: ProfileOrderPreviewOptions,
  options: ServerConfigOptions
) {
  return buildServerConfig({
    ...input,
    selectedMods: getEnabledProfileMods(selections),
    profileRuleIssues: evaluateOrderRules(selections, recommendation)
  }, options);
}
