import type { ProfileModSelection } from "./profile-mod-id-state";
import { profileModKey } from "./profile-mod-order";

type ModIdentity = Pick<ProfileModSelection, "workshopId" | "modId">;
export type ProfileOrderReference = Pick<ModIdentity, "modId"> & Partial<Pick<ModIdentity, "workshopId">>;

export type ProfileOrderEvidence = {
  readonly verified: boolean;
  readonly source?: string;
  readonly checkedAt?: string;
  readonly verificationNote?: string;
};

type PairRule = {
  readonly kind: "loadAfter" | "loadBefore" | "requires" | "incompatibleMods";
  readonly mod: ProfileOrderReference;
  readonly target: ProfileOrderReference;
  readonly evidence?: ProfileOrderEvidence;
};

type PlacementRule = {
  readonly kind: "loadFirst" | "loadLast";
  readonly mod: ProfileOrderReference;
  readonly scope: "on" | "category" | "off";
  readonly evidence?: ProfileOrderEvidence;
};

export type ProfileOrderRule = PairRule | PlacementRule;

export type ProfileOrderWarning =
  | { readonly code: "duplicate-selection"; readonly mod: ModIdentity }
  | { readonly code: "unverified-rule"; readonly rule: ProfileOrderRule }
  | {
      readonly code: "ambiguous-reference";
      readonly rule: ProfileOrderRule;
      readonly endpoint: "mod" | "target";
      readonly matches: readonly ModIdentity[];
    }
  | { readonly code: "missing-target" | "disabled-target"; readonly rule: PairRule }
  | { readonly code: "missing-category"; readonly rule: PlacementRule }
  | { readonly code: "incompatible-mods"; readonly rule: PairRule; readonly mods: readonly ModIdentity[] }
  | { readonly code: "cycle"; readonly cycle: readonly ModIdentity[]; readonly rules: readonly ProfileOrderRule[] };

export type ProfileOrderReason =
  | {
      readonly kind: "verified-order";
      readonly before: ModIdentity;
      readonly after: ModIdentity;
      readonly rules: readonly ProfileOrderRule[];
    }
  | {
      readonly kind: "category-priority";
      readonly before: ModIdentity;
      readonly after: ModIdentity;
      readonly beforeCategoryId: string;
      readonly afterCategoryId: string | null;
    }
  | { readonly kind: "shifted-by-other-moves" };

export type ProfileOrderChange = {
  readonly mod: ModIdentity;
  readonly from: number;
  readonly to: number;
  readonly reasons: readonly ProfileOrderReason[];
};

export type ProfileOrderRecommendation<T extends ProfileModSelection> = {
  readonly currentOrder: readonly T[];
  readonly warnings: readonly ProfileOrderWarning[];
} & (
  | {
      readonly status: "ready" | "needs-review";
      readonly recommendedOrder: readonly T[];
      readonly changes: readonly ProfileOrderChange[];
    }
  | { readonly status: "blocked"; readonly recommendedOrder: null; readonly changes: readonly [] }
);

type EdgeMap = ReadonlyMap<number, readonly ProfileOrderRule[]>;
type PlacementGroup = Record<PlacementRule["kind"], Map<number, PlacementRule[]>>;

function identity(selection: ProfileModSelection): ModIdentity {
  return { workshopId: selection.workshopId.trim(), modId: selection.modId.trim() };
}

function findCycle(outgoing: readonly EdgeMap[], active: readonly number[]): number[] {
  const visited = new Set<number>();
  const pathPositions = new Map<number, number>();

  for (const root of active) {
    if (visited.has(root)) continue;
    const path = [{ index: root, next: outgoing[root].keys() }];
    pathPositions.set(root, 0);
    visited.add(root);
    while (path.length) {
      const frame = path[path.length - 1];
      const next = frame.next.next();
      if (next.done) {
        pathPositions.delete(frame.index);
        path.pop();
        continue;
      }
      const cycleStart = pathPositions.get(next.value);
      if (cycleStart !== undefined) {
        return [...path.slice(cycleStart).map(({ index }) => index), next.value];
      }
      if (visited.has(next.value)) continue;
      pathPositions.set(next.value, path.length);
      visited.add(next.value);
      path.push({ index: next.value, next: outgoing[next.value].keys() });
    }
  }
  return [];
}

function describeChanges(
  mods: readonly ModIdentity[],
  active: readonly number[],
  sorted: readonly number[],
  outgoing: readonly EdgeMap[],
  categories: readonly (string | null)[],
  ranks: readonly number[]
): ProfileOrderChange[] {
  const positions = new Map(sorted.map((index, offset) => [index, active[offset]]));
  const ruleReasons = mods.map<ProfileOrderReason[]>(() => []);
  for (const before of active) {
    for (const [after, rules] of outgoing[before]) {
      if (before < after) continue;
      const reason: ProfileOrderReason = { kind: "verified-order", before: mods[before], after: mods[after], rules };
      ruleReasons[before].push(reason);
      ruleReasons[after].push(reason);
    }
  }

  return active.flatMap((index) => {
    const to = positions.get(index) ?? index;
    if (index === to) return [];
    const reasons = ruleReasons[index];
    if (reasons.length === 0) {
      for (const other of active) {
        const otherTo = positions.get(other) ?? other;
        if (other === index || (index < other) === (to < otherTo)) continue;
        const [before, after] = to < otherTo ? [index, other] : [other, index];
        const category = categories[before];
        if (category === null || ranks[before] >= ranks[after]) continue;
        reasons.push({
          kind: "category-priority", before: mods[before], after: mods[after],
          beforeCategoryId: category, afterCategoryId: categories[after]
        });
        break;
      }
    }
    return [{
      mod: mods[index], from: index + 1, to: to + 1,
      reasons: reasons.length ? reasons : [{ kind: "shifted-by-other-moves" }]
    }];
  });
}

/**
 * Returns a preview over the existing profile order. Category IDs are in highest-to-lowest
 * priority order. Only caller-verified rules with a source or verification note are used.
 */
export function recommendProfileModOrder<T extends ProfileModSelection>(
  selections: readonly T[],
  options: { readonly categoryPriority: readonly string[]; readonly rules?: readonly ProfileOrderRule[] }
): ProfileOrderRecommendation<T> {
  const currentOrder = [...selections];
  const mods = currentOrder.map(identity);
  const warnings: ProfileOrderWarning[] = [];
  const blocked = (): ProfileOrderRecommendation<T> => ({
    status: "blocked", currentOrder, recommendedOrder: null, changes: [], warnings
  });
  const byPair = new Map<string, number>();
  const byModId = new Map<string, number[]>();
  for (const [index, mod] of mods.entries()) {
    const key = profileModKey(mod);
    if (byPair.has(key)) {
      warnings.push({ code: "duplicate-selection", mod });
      continue;
    }
    byPair.set(key, index);
    const matches = byModId.get(mod.modId);
    if (matches) matches.push(index);
    else byModId.set(mod.modId, [index]);
  }
  if (warnings.length) return blocked();

  function lookup(reference: ProfileOrderReference): readonly number[] {
    if (reference.workshopId === undefined) return byModId.get(reference.modId.trim()) ?? [];
    const index = byPair.get(profileModKey({ workshopId: reference.workshopId, modId: reference.modId }));
    return index === undefined ? [] : [index];
  }

  const active = currentOrder.flatMap((mod, index) => mod.enabled ? [index] : []);
  const categories = currentOrder.map((mod) => mod.primaryCategoryId?.trim() || null);
  const categoryRanks = new Map<string, number>();
  options.categoryPriority.forEach((id, rank) => {
    const category = id.trim();
    if (category && !categoryRanks.has(category)) categoryRanks.set(category, rank);
  });
  const ranks = categories.map((category) =>
    category === null ? options.categoryPriority.length : categoryRanks.get(category) ?? options.categoryPriority.length
  );
  const priority = [...active].sort((a, b) => (ranks[a] - ranks[b]) || (a - b));
  const indegree = currentOrder.map(() => 0);
  const outgoing = currentOrder.map(() => new Map<number, ProfileOrderRule[]>());
  const placements = new Map<string | null, PlacementGroup>();
  let missingRequiredMod = false;

  function addEdge(before: number, after: number, rules: readonly ProfileOrderRule[]) {
    const existing = outgoing[before].get(after);
    if (existing) existing.push(...rules);
    else {
      outgoing[before].set(after, [...rules]);
      indegree[after]++;
    }
  }

  function warnAmbiguous(rule: ProfileOrderRule, endpoint: "mod" | "target", matches: readonly number[]) {
    warnings.push({ code: "ambiguous-reference", rule, endpoint, matches: matches.map((index) => mods[index]) });
  }

  for (const rule of options.rules ?? []) {
    if ("scope" in rule && rule.scope === "off") continue;
    const subjects = lookup(rule.mod);
    if (!subjects.some((index) => currentOrder[index].enabled)) continue;
    const evidence = rule.evidence;
    if (!evidence?.verified || (!evidence.source?.trim() && !evidence.verificationNote?.trim())) {
      warnings.push({ code: "unverified-rule", rule });
      continue;
    }
    if (subjects.length > 1) {
      warnAmbiguous(rule, "mod", subjects);
      if (rule.kind === "requires") missingRequiredMod = true;
      continue;
    }
    const subject = subjects[0];

    if ("scope" in rule) {
      const category = categories[subject];
      if (rule.scope === "category" && category === null) {
        warnings.push({ code: "missing-category", rule });
        continue;
      }
      const scope = rule.scope === "on" ? null : category;
      let group = placements.get(scope);
      if (!group) {
        group = { loadFirst: new Map(), loadLast: new Map() };
        placements.set(scope, group);
      }
      const rules = group[rule.kind].get(subject);
      if (rules) rules.push(rule);
      else group[rule.kind].set(subject, [rule]);
      continue;
    }

    const targets = lookup(rule.target);
    if (rule.kind === "incompatibleMods" && !targets.some((index) => currentOrder[index].enabled)) continue;
    if (targets.length > 1) {
      warnAmbiguous(rule, "target", targets);
      if (rule.kind === "requires") missingRequiredMod = true;
      continue;
    }
    const target = targets[0];
    if (target === undefined || !currentOrder[target].enabled) {
      warnings.push({ code: target === undefined ? "missing-target" : "disabled-target", rule });
      if (rule.kind === "requires") missingRequiredMod = true;
      continue;
    }
    if (rule.kind === "incompatibleMods") {
      warnings.push({ code: "incompatible-mods", rule, mods: [mods[subject], mods[target]] });
    } else if (rule.kind === "loadBefore") {
      addEdge(subject, target, [rule]);
    } else if (rule.kind === "loadAfter") {
      addEdge(target, subject, [rule]);
    }
  }

  for (const [scope, group] of placements) {
    for (const kind of ["loadFirst", "loadLast"] as const) {
      for (const [subject, rules] of group[kind]) {
        for (const other of active) {
          if ((scope !== null && categories[other] !== scope) || group[kind].has(other)) continue;
          if (kind === "loadFirst") addEdge(subject, other, rules);
          else addEdge(other, subject, rules);
        }
      }
    }
  }

  const sorted: number[] = [];
  while (sorted.length < active.length) {
    const next = priority.find((index) => indegree[index] === 0);
    if (next === undefined) {
      const cycle = findCycle(outgoing, active);
      const rules = cycle.slice(1).flatMap((after, offset) => outgoing[cycle[offset]].get(after) ?? []);
      warnings.push({ code: "cycle", cycle: cycle.map((index) => mods[index]), rules: [...new Set(rules)] });
      return blocked();
    }
    sorted.push(next);
    indegree[next] = -1;
    for (const after of outgoing[next].keys()) indegree[after]--;
  }
  if (missingRequiredMod) return blocked();

  const recommendedOrder = [...currentOrder];
  sorted.forEach((index, offset) => { recommendedOrder[active[offset]] = currentOrder[index]; });
  return {
    status: warnings.length ? "needs-review" : "ready",
    currentOrder,
    recommendedOrder,
    changes: describeChanges(mods, active, sorted, outgoing, categories, ranks),
    warnings
  };
}
