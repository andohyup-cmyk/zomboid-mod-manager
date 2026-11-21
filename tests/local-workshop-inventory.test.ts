import assert from "node:assert/strict";
import test from "node:test";
import { compareLocalInventory, parseLocalWorkshopInventory } from "../lib/local-workshop-inventory";

const path = (id: string, name: string, version: string | null = "42") =>
  `${id}\\mods\\${name}\\${version ? `${version}\\` : ""}mod.info`;
const row = (workshopId: string, modId: string, requires: string[] = [], version: string | null = "42") =>
  ({ workshopId, modId, requires, relativePath: path(workshopId, modId, version) });
const source = (mods: ReturnType<typeof row>[]) => ({ targetBuild: "42.22", scannedAtUtc: "2026-11-20T16:36:57Z", mods });
const selected = (workshopId: string, modId: string, enabled = true) => ({ workshopId, modId, enabled });
function parse(mods: ReturnType<typeof row>[]) {
  const result = parseLocalWorkshopInventory(source(mods));
  if (!result.ok) throw new Error(result.error);
  return result.inventory;
}

test("accepts 42 version files and normalizes backslash-prefixed requires, never trusting displayName", () => {
  const inventory = parse([row("3640496116", "42_VSGirlBodyNSFW"), row("12345", "Patch", ["\\Core", "\\Core", ""])]);
  assert.deepEqual(inventory.mods[1].requires, ["Core"]);
  const result = compareLocalInventory(inventory, [selected("3640496116", "42_VSGirlBodyNSFW")]);
  assert.deepEqual(result, { checked: 1, matched: 1, issues: [] });
});

test("selects B42 metadata instead of incompatible root fallback for SwapIt", () => {
  const inventory = parse([
    row("2366717227", "SwapIt", ["EasyConfigChucked"], null),
    row("2366717227", "SwapIt", ["\\ChuckleberryFinnAlertSystem", "\\errorMagnifier"], "42.0"),
    row("3077900375", "ChuckleberryFinnAlertSystem"),
    row("2896041179", "errorMagnifier")
  ]);
  const selections = [selected("3077900375", "ChuckleberryFinnAlertSystem"), selected("2896041179", "errorMagnifier"), selected("2366717227", "SwapIt")];
  assert.deepEqual(compareLocalInventory(inventory, selections).issues, []);
  const missing = compareLocalInventory(inventory, [selected("2366717227", "SwapIt")]);
  assert.deepEqual(missing.issues.map((issue) => issue.code), ["required-mod-missing", "required-mod-missing"]);
  assert.ok(missing.issues.every((issue) => !issue.message.includes("EasyConfigChucked")));
});

test("handles several Mod IDs from one Workshop and never marks them all active", () => {
  const inventory = parse([row("3119788162", "ETO_B"), row("3119788162", "ETO_P")]);
  const result = compareLocalInventory(inventory, [selected("3119788162", "ETO_B"), selected("3119788162", "ETO_P", false)]);
  assert.equal(result.checked, 1);
  assert.equal(result.matched, 1);
  assert.deepEqual(result.issues, []);
});

test("reports missing and reversed order as warnings and never blocks or reorders the input", () => {
  const inventory = parse([row("12345", "Core"), row("23456", "Patch", ["Core", "Other"])]);
  const selections = Object.freeze([selected("23456", "Patch"), selected("12345", "Core")]);
  const result = compareLocalInventory(inventory, selections);
  assert.deepEqual(result.issues.map((issue) => issue.code), ["required-mod-after", "required-mod-missing"]);
  assert.equal(selections[0].modId, "Patch");
  assert.ok(result.issues.every((issue) => issue.severity === "warning"));
});

test("reports a Workshop/Mod ID pair mismatch separately from an absent Mod ID", () => {
  const inventory = parse([row("12345", "Core")]);
  const result = compareLocalInventory(inventory, [selected("23456", "Core"), selected("23456", "Missing")]);
  assert.deepEqual(result.issues.map(({code}) => code), ["workshop-mismatch", "mod-info-missing"]);
});

test("uses exact 42.22 metadata; otherwise checks common requirements only when B42 variants disagree", () => {
  const records = [row("12345", "Core"), row("23456", "Patch", ["Core"], "42.13"), row("23456", "Patch", ["Other"], "42.20")];
  const uncertain = compareLocalInventory(parse(records), [selected("23456", "Patch")]);
  assert.deepEqual(uncertain.issues.map(({code}) => code), ["version-dependent-requires"]);
  const exact = compareLocalInventory(parse([...records, row("23456", "Patch", ["Core"], "42.22")]), [selected("23456", "Patch")]);
  assert.deepEqual(exact.issues.map(({code}) => code), ["required-mod-missing"]);
});

test("treats only common/root paths as unverified and never infers B42/MP compatibility", () => {
  const inventory = parse([row("12345", "Core", [], "common"), row("23456", "RootOnly", [], null)]);
  const result = compareLocalInventory(inventory, [selected("12345", "Core"), selected("23456", "RootOnly")]);
  assert.deepEqual(result.issues.map(({code}) => code), ["b42-metadata-unverified", "b42-metadata-unverified"]);
});

test("rejects invalid scans including path mismatches and excessively large inventories", () => {
  assert.equal(parseLocalWorkshopInventory({}).ok, false);
  const bad = source([row("12345", "Mod")]);
  bad.mods[0].relativePath = "99999\\mods\\Mod\\42\\mod.info";
  assert.equal(parseLocalWorkshopInventory(bad).ok, false);
  assert.equal(parseLocalWorkshopInventory(source(Array.from({ length: 3001 }, () => row("12345", "Core")))).ok, false);
});
