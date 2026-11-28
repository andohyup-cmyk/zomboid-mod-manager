import assert from "node:assert/strict";
import test from "node:test";
import type { ProfileModSelection } from "../lib/profile-mod-id-state";
import {
  recommendProfileModOrder,
  type ProfileOrderReference,
  type ProfileOrderRule
} from "../lib/profile-mod-recommended-order";

const workshop = "1234567890";
const otherWorkshop = "9876543210";
const evidence = Object.freeze({
  verified: true,
  source: "https://example.invalid/verified-rule",
  checkedAt: "2026-11-18"
});

function mod(modId: string, primaryCategoryId?: string, enabled = true, workshopId = workshop): ProfileModSelection {
  return { modId, workshopId, primaryCategoryId, enabled };
}

function pairRule(
  kind: "loadAfter" | "loadBefore" | "requires" | "incompatibleMods",
  subject: string | ProfileOrderReference,
  target: string | ProfileOrderReference
): ProfileOrderRule {
  return {
    kind,
    mod: typeof subject === "string" ? { modId: subject } : subject,
    target: typeof target === "string" ? { modId: target } : target,
    evidence
  };
}

function positionRule(
  kind: "loadFirst" | "loadLast", modId: string, scope: "on" | "category" | "off"
): ProfileOrderRule {
  return { kind, mod: { modId }, scope, evidence };
}

test("uses caller category priority and keeps unranked categories at the end", () => {
  const unknown = mod("Unknown");
  const vehicle = mod("Vehicle", "vehicles");
  const unranked = mod("Unranked", "other");
  const core = mod("Core", "framework");
  const current = [unknown, vehicle, unranked, core];
  const result = recommendProfileModOrder(current, { categoryPriority: ["framework", "vehicles"] });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.currentOrder, current);
  assert.deepEqual(result.recommendedOrder, [core, vehicle, unknown, unranked]);
  assert.deepEqual(result.changes.find((change) => change.mod.modId === "Core"), {
    mod: { workshopId: workshop, modId: "Core" }, from: 4, to: 1,
    reasons: [{
      kind: "category-priority", before: { workshopId: workshop, modId: "Core" },
      after: { workshopId: workshop, modId: "Unknown" }, beforeCategoryId: "framework", afterCategoryId: null
    }]
  });
});

test("keeps existing relative order for a shared category or tied priorities", () => {
  const current = [mod("Zulu", "maps"), mod("Alpha", "maps"), mod("Beta", "other")];
  assert.deepEqual(recommendProfileModOrder(current, { categoryPriority: ["maps"] }).recommendedOrder, current);
  const result = recommendProfileModOrder(current, { categoryPriority: [] });
  assert.deepEqual(result.recommendedOrder, current);
  assert.deepEqual(result.changes, []);
});

test("enforces both edge directions and keeps evidence for changed positions", () => {
  const patch = mod("Patch");
  const core = mod("Core");
  const middle = mod("Middle");
  const after = pairRule("loadAfter", "Patch", "Middle");
  const before = pairRule("loadBefore", "Core", "Middle");
  const result = recommendProfileModOrder([patch, middle, core], { categoryPriority: [], rules: [after, before] });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.recommendedOrder, [core, middle, patch]);
  assert.deepEqual(result.changes.map(({ from, to }) => [from, to]), [[1, 3], [3, 1]]);
  assert.deepEqual(result.changes[0].reasons, [{
    kind: "verified-order", before: { workshopId: workshop, modId: "Middle" },
    after: { workshopId: workshop, modId: "Patch" }, rules: [after]
  }]);
});

test("places a lower-ranked category before a high-ranked one when a verified rule requires it", () => {
  const high = mod("High", "framework");
  const low = mod("Low", "vehicles");
  const result = recommendProfileModOrder([high, low], {
    categoryPriority: ["framework", "vehicles"],
    rules: [pairRule("loadAfter", "High", "Low")]
  });

  assert.deepEqual(result.recommendedOrder, [low, high]);
  assert.equal(result.changes[0].reasons[0].kind, "verified-order");
});

test("blocks a cycle and reports the actual cycle and its evidence", () => {
  const a = mod("A");
  const b = mod("B");
  const dependent = mod("Dependent");
  const pair = [pairRule("loadAfter", "B", "A"), pairRule("loadBefore", "B", "A")];
  const result = recommendProfileModOrder([a, b, dependent, mod("Independent")], {
    categoryPriority: [], rules: [...pair, pairRule("loadAfter", "Dependent", "B")]
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.recommendedOrder, null);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.warnings, [{
    code: "cycle",
    cycle: ["A", "B", "A"].map((modId) => ({ workshopId: workshop, modId })),
    rules: pair
  }]);
});

test("marks unavailable load order references for review with source and checked date", () => {
  const current = [mod("Main"), mod("Disabled", undefined, false)];
  const missing = pairRule("loadAfter", "Main", "Absent");
  const disabled = pairRule("loadBefore", "Main", "Disabled");
  const result = recommendProfileModOrder(current, { categoryPriority: [], rules: [missing, disabled] });

  assert.equal(result.status, "needs-review");
  assert.deepEqual(result.recommendedOrder, current);
  assert.deepEqual(result.warnings, [
    { code: "missing-target", rule: missing },
    { code: "disabled-target", rule: disabled }
  ]);
});

test("blocks missing, disabled and ambiguous required selections", () => {
  const current = [
    mod("Main"), mod("Disabled", undefined, false), mod("Shared"), mod("Shared", undefined, true, otherWorkshop)
  ];
  const result = recommendProfileModOrder(current, {
    categoryPriority: [],
    rules: [
      pairRule("requires", "Main", "Absent"),
      pairRule("requires", "Main", "Disabled"),
      pairRule("requires", "Main", "Shared")
    ]
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.recommendedOrder, null);
  assert.deepEqual(result.warnings.map(({ code }) => code), ["missing-target", "disabled-target", "ambiguous-reference"]);
});

test("a required selection with no order rule checks presence without inferring precedence", () => {
  const current = [mod("Main"), mod("Required")];
  const result = recommendProfileModOrder(current, {
    categoryPriority: [], rules: [pairRule("requires", "Main", "Required")]
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.recommendedOrder, current);
});

test("keeps different Workshop items separate and warns on ambiguous source and target references", () => {
  const main = mod("Main");
  const first = mod("Shared");
  const second = mod("Shared", undefined, false, otherWorkshop);
  const current = [main, first, second];
  const targetRule = pairRule("loadAfter", "Main", "Shared");
  const sourceRule = pairRule("loadBefore", "Shared", "Main");
  const result = recommendProfileModOrder(current, { categoryPriority: [], rules: [targetRule, sourceRule] });
  const matches = [workshop, otherWorkshop].map((workshopId) => ({ workshopId, modId: "Shared" }));

  assert.equal(result.status, "needs-review");
  assert.deepEqual(result.recommendedOrder, current);
  assert.deepEqual(result.warnings, [
    { code: "ambiguous-reference", rule: targetRule, endpoint: "target", matches },
    { code: "ambiguous-reference", rule: sourceRule, endpoint: "mod", matches }
  ]);
});

test("resolves a Workshop-qualified reference without conflating equal Mod ID strings", () => {
  const patch = mod("Patch");
  const first = mod("Shared");
  const second = mod("Shared", undefined, true, otherWorkshop);
  const result = recommendProfileModOrder([patch, first, second], {
    categoryPriority: [],
    rules: [pairRule("loadAfter", "Patch", { workshopId: ` ${otherWorkshop} `, modId: " Shared " })]
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.recommendedOrder, [first, second, patch]);
  assert.deepEqual(result.changes[1].reasons, [{ kind: "shifted-by-other-moves" }]);
});

test("ignores unverified rules even with a source, and requires provenance for verified claims", () => {
  const current = [mod("A"), mod("B")];
  const base = pairRule("loadAfter", "A", "B");
  const rules = [
    { ...base, evidence: undefined },
    { ...base, evidence: { ...evidence, verified: false } },
    { ...base, evidence: { verified: true, checkedAt: "2026-11-18" } }
  ];
  const result = recommendProfileModOrder(current, { categoryPriority: [], rules });
  assert.equal(result.status, "needs-review");
  assert.deepEqual(result.recommendedOrder, current);
  assert.deepEqual(result.warnings, rules.map((rule) => ({ code: "unverified-rule", rule })));

  const manual = { ...base, evidence: { verified: true, verificationNote: "Manually inspected rule file" } };
  assert.deepEqual(recommendProfileModOrder(current, {
    categoryPriority: [], rules: [manual]
  }).recommendedOrder, [current[1], current[0]]);
});

test("warns on active incompatibilities without creating order constraints", () => {
  const current = [mod("A"), mod("B"), mod("Disabled", undefined, false)];
  const conflict = pairRule("incompatibleMods", "A", "B");
  const result = recommendProfileModOrder(current, {
    categoryPriority: [], rules: [
      conflict, pairRule("incompatibleMods", "A", "Disabled"), pairRule("incompatibleMods", "A", "Absent")
    ]
  });
  assert.equal(result.status, "needs-review");
  assert.deepEqual(result.recommendedOrder, current);
  assert.deepEqual(result.warnings, [{
    code: "incompatible-mods", rule: conflict,
    mods: ["A", "B"].map((modId) => ({ workshopId: workshop, modId }))
  }]);
});

test("handles whole-list first and last with stable ties", () => {
  const regular = mod("Normal");
  const firstZ = mod("FirstZ");
  const firstA = mod("FirstA");
  const lastZ = mod("LastZ");
  const lastA = mod("LastA");
  const result = recommendProfileModOrder([lastZ, regular, firstZ, lastA, firstA], {
    categoryPriority: [], rules: [
      positionRule("loadFirst", "FirstZ", "on"), positionRule("loadFirst", "FirstA", "on"),
      positionRule("loadLast", "LastZ", "on"), positionRule("loadLast", "LastA", "on")
    ]
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.recommendedOrder, [firstZ, firstA, regular, lastZ, lastA]);
});

test("handles category first and last only within a known category and ignores off", () => {
  const last = mod("Last", "maps");
  const core = mod("Core", "framework");
  const regular = mod("Regular", "maps");
  const first = mod("First", "maps");
  const unknown = mod("Unknown");
  const missing = positionRule("loadFirst", "Unknown", "category");
  const result = recommendProfileModOrder([last, core, regular, first, unknown], {
    categoryPriority: ["framework", "maps"], rules: [
      positionRule("loadFirst", "First", "category"), positionRule("loadLast", "Last", "category"),
      positionRule("loadLast", "Core", "off"), missing
    ]
  });
  assert.equal(result.status, "needs-review");
  assert.deepEqual(result.recommendedOrder, [core, first, regular, last, unknown]);
  assert.deepEqual(result.warnings, [{ code: "missing-category", rule: missing }]);
});

test("blocks contradictory verified placement and explicit pair rules", () => {
  const a = mod("A", "maps");
  const b = mod("B", "maps");
  const rules = [positionRule("loadFirst", "A", "category"), pairRule("loadBefore", "B", "A")];
  const result = recommendProfileModOrder([b, a], { categoryPriority: ["maps"], rules });
  assert.equal(result.status, "blocked");
  assert.equal(result.recommendedOrder, null);
  const warning = result.warnings.find((item) => item.code === "cycle");
  assert.deepEqual(new Set(warning?.rules), new Set(rules));
});

test("preserves inactive slots and object references and stays deterministic on frozen inputs", () => {
  const vehicle = Object.freeze(mod("Vehicle", "vehicles"));
  const disabled = Object.freeze(mod("Disabled", "framework", false));
  const core = Object.freeze(mod("Core", "framework"));
  const secondDisabled = Object.freeze(mod("SecondDisabled", "vehicles", false));
  const current = Object.freeze([vehicle, disabled, core, secondDisabled]);
  const rule = Object.freeze(positionRule("loadFirst", "Disabled", "on"));
  const options = Object.freeze({ categoryPriority: Object.freeze(["framework", "vehicles"]), rules: Object.freeze([rule]) });
  const result = recommendProfileModOrder(current, options);

  assert.deepEqual(result, recommendProfileModOrder(current, options));
  assert.deepEqual(result.currentOrder, current);
  assert.notStrictEqual(result.currentOrder, current);
  assert.deepEqual(result.recommendedOrder, [core, disabled, vehicle, secondDisabled]);
  assert.strictEqual(result.recommendedOrder?.[1], disabled);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.changes.map(({ from, to }) => [from, to]), [[1, 3], [3, 1]]);
  assert.deepEqual(current, [vehicle, disabled, core, secondDisabled]);
});

test("blocks a repeated exact Workshop and Mod ID pair rather than collapsing it", () => {
  const result = recommendProfileModOrder([mod("A"), mod(" A ", undefined, false)], { categoryPriority: [] });
  assert.deepEqual(result.warnings, [{ code: "duplicate-selection", mod: { workshopId: workshop, modId: "A" } }]);
  assert.equal(result.status, "blocked");
});

test("keeps duplicate evidence for the same edge without counting the edge twice", () => {
  const a = mod("A");
  const b = mod("B");
  const rules = [pairRule("loadBefore", "B", "A"), pairRule("loadAfter", "A", "B")];
  const result = recommendProfileModOrder([a, b], { categoryPriority: [], rules });
  assert.deepEqual(result.recommendedOrder, [b, a]);
  const reason = result.changes[0].reasons[0];
  assert.equal(reason.kind, "verified-order");
  assert.deepEqual(reason.rules, rules);
});
