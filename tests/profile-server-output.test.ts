import assert from "node:assert/strict";
import test from "node:test";
import { updateProfileModState } from "../lib/profile-mod-id-state";
import { buildProfileServerConfig } from "../lib/profile-server-output";

const core = { workshopId: "12345", modId: "Core", modIdUuid: "first", enabled: true };
const optional = { workshopId: "12345", modId: "Optional", modIdUuid: "second", enabled: false };
const patch = { workshopId: "23456", modId: "Patch", modIdUuid: "third", enabled: true };
const alternate = { workshopId: "34567", modId: "Core", modIdUuid: "fourth", enabled: true };
const catalog = [
  { workshopId: "12345", modIds: ["Core", "Optional"] },
  { workshopId: "23456", modIds: ["Patch"] },
  { workshopId: "34567", modIds: ["Core"] }
];
const plain = { categoryPriority: [] };
const options = { modIdPrefix: "\\" } as const;
const evidence = { verified: true, verificationNote: "모의 근거" };

test("projects enabled rows in place and restores a disabled row to its original output slot", () => {
  const all = [core, optional, patch];
  const input = { catalog, downloadOnlyWorkshopIds: ["45678"] };
  const output = buildProfileServerConfig(all, input, plain, options);
  assert.equal(output.copyText, "Mods=\\Core;\\Patch\nWorkshopItems=12345;23456;45678");
  assert.ok(output.issues.some((issue) => issue.code === "dependency-unverified"));
  const reenabled = updateProfileModState(all, optional, "enable");
  assert.equal(buildProfileServerConfig(reenabled, input, plain, options).preview?.mods, "Mods=\\Core;\\Optional;\\Patch");
  assert.deepEqual(all.map((row) => [row.modIdUuid, row.enabled]), [["first", true], ["second", false], ["third", true]]);
});

test("requires the specified supplier even when an enabled alternative provides the same Mod ID", () => {
  const rule = { kind: "requires", mod: patch, target: core, evidence } as const;
  const output = buildProfileServerConfig([patch, alternate, { ...core, enabled: false }], { catalog },
    { categoryPriority: [], rules: [rule] }, { ...options, warningsAcknowledged: true });
  assert.equal(output.copyStatus, "blocked");
  assert.ok(output.issues.some((issue) => issue.code === "missing-required-mod" && issue.message.includes("12345")));
});

test("keeps rule evidence and warning acknowledgement separate from recommendation and input order", () => {
  const confirmed = { kind: "loadBefore", mod: core, target: patch, evidence } as const;
  const conflict = { kind: "incompatibleMods", mod: core, target: patch, evidence } as const;
  const unverified = { kind: "requires", mod: core, target: optional } as const;
  const rules = { categoryPriority: [], rules: [confirmed, conflict, unverified] };
  const result = buildProfileServerConfig([patch, core], { catalog }, rules, options);
  assert.equal(result.copyStatus, "confirmation-required");
  assert.equal(result.copyText, null);
  assert.ok(result.issues.some((issue) => issue.code === "load-order-violation"));
  assert.ok(result.issues.some((issue) => issue.code === "incompatible-mods"));
  assert.ok(result.issues.some((issue) => issue.code === "profile-rule-unverified" && issue.severity === "info"));
  assert.equal(buildProfileServerConfig([patch, core], { catalog }, rules, { ...options, warningsAcknowledged: true }).preview?.mods, "Mods=\\Patch;\\Core");
});

test("download-only Workshop selection satisfies a verified Workshop dependency without enabling its Mod IDs", () => {
  const relationships = [{ kind: "requires-workshop", workshopId: patch.workshopId, requiredWorkshopId: core.workshopId, verifiedSource: "mock" }] as const;
  assert.equal(buildProfileServerConfig([patch], { catalog, relationships }, plain, options).copyStatus, "blocked");
  const selected = { catalog, relationships, downloadOnlyWorkshopIds: [core.workshopId] };
  assert.equal(buildProfileServerConfig([patch], selected, plain, options).copyText, "Mods=\\Patch\nWorkshopItems=23456;12345");
});
