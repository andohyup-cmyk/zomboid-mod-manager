import type { ProfileModSelection } from "./profile-mod-id-state";

/** Per-group constraints are explicit. No implicit required/all-or-one rule. */
export type GroupMember = { workshopId: string; modId: string };
export type SelectionGroupRule = {
  id: string;
  label: string;
  members: readonly GroupMember[];
  minSelected: number;
  maxSelected: number;
  evidenceUrl?: string | null;
  verified: boolean;
};
export type GroupViolation = {
  groupId: string;
  severity: "error" | "info";
  code: "invalid-rule" | "unknown-member" | "too-few" | "too-many" | "unverified";
  message: string;
};

function key(member: GroupMember): string {
  return JSON.stringify([member.workshopId.trim(), member.modId.trim()]);
}

/**
 * Structural mistakes and missing catalog references always block rule use.
 * Unverified selection claims never block server output solely on hearsay.
 */
export function validateSelectionGroups(
  rules: readonly SelectionGroupRule[],
  catalog: readonly GroupMember[],
  selections: readonly Pick<ProfileModSelection, "workshopId" | "modId" | "enabled">[]
): GroupViolation[] {
  const known = new Set(catalog.map(key));
  const active = new Set(selections.filter(x => x.enabled).map(key));
  const violations: GroupViolation[] = [];
  const groupIds = new Set<string>();

  for (const rule of rules) {
    if (!rule.id.trim() || groupIds.has(rule.id)
      || !rule.label.trim() || rule.label.length > 120
      || !Number.isSafeInteger(rule.minSelected) || !Number.isSafeInteger(rule.maxSelected)
      || rule.minSelected < 0 || rule.maxSelected < rule.minSelected
      || rule.maxSelected > rule.members.length || rule.members.length === 0
      || new Set(rule.members.map(key)).size !== rule.members.length
      || rule.members.some(x => !x.modId.trim() || !x.workshopId.trim())) {
      violations.push({ groupId: rule.id, severity: "error", code: "invalid-rule",
        message: `${rule.label || rule.id}: 선택 그룹 규칙이 잘못되었거나 미확정입니다.` });
      continue;
    }
    groupIds.add(rule.id);
    if (rule.members.some(x => !known.has(key(x)))) {
      violations.push({ groupId: rule.id, severity: "error", code: "unknown-member",
        message: `${rule.label}: 카탈로그에 없는 Workshop/Mod ID 조합이 있습니다.` });
      continue;
    }

    const selected = rule.members.filter(x => active.has(key(x))).length;
    if (!rule.verified) {
      violations.push({ groupId: rule.id, severity: "info", code: "unverified",
        message: `${rule.label}: 규칙 확인 근거가 없어 권고 정보만 표시합니다.` });
      continue;
    }
    if (selected < rule.minSelected) violations.push({
      groupId: rule.id, severity: "error", code: "too-few",
      message: `${rule.label}: 최소 ${rule.minSelected}개를 활성화해야 합니다(현재 ${selected}개).`
    });
    if (selected > rule.maxSelected) violations.push({
      groupId: rule.id, severity: "error", code: "too-many",
      message: `${rule.label}: 최대 ${rule.maxSelected}개까지만 활성화할 수 있습니다(현재 ${selected}개).`
    });
  }
  return violations;
}
