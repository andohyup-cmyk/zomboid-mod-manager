/** Selection groups are independent of categories and tags.
 * Default is free selection; constraints only apply when explicitly configured.
 * This module does not write profiles or auto-select mods.
 */
export type GroupSelectionRule = Readonly<{
  minimum?: number;
  maximum?: number;
}>;

export type GroupSelectionCheck =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: "invalid-rule" | "unknown-mod" | "duplicate-mod" | "below-minimum" | "above-maximum" }>;

export function checkGroupSelection(
  groupModIds: readonly string[],
  selectedModIds: readonly string[],
  rule: GroupSelectionRule = {}
): GroupSelectionCheck {
  const validCount = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (
    (rule.minimum !== undefined && !validCount(rule.minimum)) ||
    (rule.maximum !== undefined && !validCount(rule.maximum)) ||
    (rule.minimum !== undefined && rule.maximum !== undefined && rule.minimum > rule.maximum)
  ) return { ok: false, reason: "invalid-rule" };

  if (new Set(groupModIds).size !== groupModIds.length) return { ok: false, reason: "invalid-rule" };
  if (new Set(selectedModIds).size !== selectedModIds.length) return { ok: false, reason: "duplicate-mod" };
  const allowed = new Set(groupModIds);
  if (selectedModIds.some(id => !allowed.has(id))) return { ok: false, reason: "unknown-mod" };
  if (rule.minimum !== undefined && selectedModIds.length < rule.minimum) {
    return { ok: false, reason: "below-minimum" };
  }
  if (rule.maximum !== undefined && selectedModIds.length > rule.maximum) {
    return { ok: false, reason: "above-maximum" };
  }
  return { ok: true };
}

/** Label for a group with no explicit rule: free selection, 0..N, nothing auto-activated. */
export function describeFreeSelection(total: number, selected: number): string {
  const safeTotal = Number.isSafeInteger(total) && total > 0 ? total : 0;
  const safeSelected = Math.min(Math.max(Number.isSafeInteger(selected) ? selected : 0, 0), safeTotal);
  return `자유 선택 · 0~${safeTotal}개 중 ${safeSelected}개 선택`;
}
