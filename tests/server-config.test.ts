import assert from "node:assert/strict";
import test from "node:test";
import { buildServerConfig } from "../lib/server-config";

const CORE = "9000000001";
const TOOLS = "9000000002";
const DOWNLOAD = "9000000003";
const verifiedSource = "Fictional test metadata";
const catalog = [
  { workshopId: CORE, modIds: ["ExampleCore", "ExamplePatch", "ExampleAlternate"] },
  { workshopId: TOOLS, modIds: ["ExampleTools"] },
  { workshopId: DOWNLOAD, modIds: ["ExampleDownloadMod"] }
].map((item) => ({
  ...item,
  modMetadata: item.modIds.map((modId) => ({
    modId,
    buildCompatibility: "confirmed" as const,
    multiplayerCompatibility: "confirmed" as const,
    dependencyReviewSource: verifiedSource
  }))
}));
const core = { workshopId: CORE, modId: "ExampleCore" };
const tools = { workshopId: TOOLS, modId: "ExampleTools" };
const patch = { workshopId: CORE, modId: "ExamplePatch" };
const prefixed = { modIdPrefix: "\\" } as const;

test("starts with no selected Mod IDs even for a single candidate", () => {
  const result = buildServerConfig({ catalog: [catalog[1]] }, prefixed);
  assert.equal(result.copyStatus, "blocked");
  assert.equal(result.preview, null);
  assert.equal(result.copyText, null);
  assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [["empty-profile", "error"]]);
});

test("outputs only explicitly selected Mod IDs in order and deduplicates Workshop IDs", () => {
  const result = buildServerConfig({ catalog, selectedMods: [core, tools, patch] }, prefixed);
  assert.equal(result.copyStatus, "ready");
  assert.deepEqual(result.preview, {
    mods: "Mods=\\ExampleCore;\\ExampleTools;\\ExamplePatch",
    workshopItems: `WorkshopItems=${CORE};${TOOLS}`
  });
  assert.equal(result.copyText, `Mods=\\ExampleCore;\\ExampleTools;\\ExamplePatch\nWorkshopItems=${CORE};${TOOLS}`);
  assert.deepEqual(result.issues, []);
});

test("includes only explicitly selected download-only Workshop items", () => {
  const result = buildServerConfig({
    catalog,
    selectedMods: [tools],
    downloadOnlyWorkshopIds: [DOWNLOAD, TOOLS, DOWNLOAD]
  }, prefixed);
  assert.equal(result.copyText, `Mods=\\ExampleTools\nWorkshopItems=${TOOLS};${DOWNLOAD}`);
});

test("a download-only selection produces a nonempty configuration without activating its mods", () => {
  const result = buildServerConfig({ catalog, downloadOnlyWorkshopIds: [DOWNLOAD] }, prefixed);
  assert.equal(result.copyStatus, "ready");
  assert.equal(result.copyText, `Mods=\nWorkshopItems=${DOWNLOAD}`);
});

test("uses the explicitly supplied Mod ID prefix and preserves large Workshop IDs as strings", () => {
  const workshopId = "18446744073709551615";
  const result = buildServerConfig({
    catalog: [{ workshopId, modIds: ["CaseSensitive"] }],
    selectedMods: [{ workshopId, modId: "CaseSensitive" }],
    downloadOnlyWorkshopIds: [workshopId]
  }, { modIdPrefix: "" });
  assert.equal(result.copyText, `Mods=CaseSensitive\nWorkshopItems=${workshopId}`);
});

test("treats leading-zero forms of a Workshop ID as the same item", () => {
  const result = buildServerConfig({
    catalog,
    selectedMods: [{ ...core, workshopId: `00${CORE}` }],
    downloadOnlyWorkshopIds: [CORE]
  }, prefixed);
  assert.equal(result.copyText, `Mods=\\ExampleCore\nWorkshopItems=${CORE}`);
});

test("blocks malformed Workshop IDs, even with confirmed warnings", () => {
  for (const id of ["00000", "18446744073709551616", "12,345", "12345\nWorkshopItems=67890"]) {
    const result = buildServerConfig({
      catalog,
      selectedMods: [core],
      downloadOnlyWorkshopIds: [id]
    }, { ...prefixed, warningsAcknowledged: true });
    assert.equal(result.copyStatus, "blocked", id);
    assert.equal(result.preview, null);
    assert.equal(result.copyText, null);
    assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [["invalid-workshop-id", "error"]]);
  }
});

test("blocks a missing Mod ID or a Mod ID that could alter the output lines", () => {
  for (const modId of ["", " ", "ExampleCore;Extra", "ExampleCore\nMods=Extra", "\\ExampleCore"]) {
    const result = buildServerConfig({
      catalog: [{ workshopId: CORE, modIds: [modId] }],
      selectedMods: [{ workshopId: CORE, modId }]
    }, prefixed);
    assert.equal(result.copyStatus, "blocked", modId);
    assert.equal(result.copyText, null);
    assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [["invalid-mod-id", "error"]]);
  }
});

test("rejects a Mod ID absent from its Workshop candidate list without changing case", () => {
  for (const modId of ["ExampleTools", "examplecore", CORE]) {
    const result = buildServerConfig({ catalog, selectedMods: [{ workshopId: CORE, modId }] }, prefixed);
    assert.equal(result.copyStatus, "blocked", modId);
    assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [["mod-not-in-workshop", "error"]]);
  }
});

test("a selected Mod ID without a Workshop ID blocks copy", () => {
  for (const workshopId of [undefined, "", " "]) {
    const result = buildServerConfig({
      catalog,
      selectedMods: [{ modId: core.modId, workshopId }],
      downloadOnlyWorkshopIds: [CORE]
    }, { ...prefixed, warningsAcknowledged: true });
    assert.equal(result.copyStatus, "blocked");
    assert.equal(result.preview, null);
    assert.equal(result.copyText, null);
    assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [["missing-workshop-id", "error"]]);
  }
});

test("deduplicates the output in first-selection order and requires warning acknowledgement", () => {
  const selectedMods = Object.freeze([core, tools, core, patch, core]);
  const input = { catalog, selectedMods };
  const result = buildServerConfig(input, prefixed);
  assert.equal(result.copyStatus, "confirmation-required");
  assert.equal(result.copyText, null);
  assert.equal(result.preview?.mods, "Mods=\\ExampleCore;\\ExampleTools;\\ExamplePatch");
  assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [["duplicate-mod-id", "warning"]]);
  const acknowledged = buildServerConfig(input, { ...prefixed, warningsAcknowledged: true });
  assert.equal(acknowledged.copyStatus, "ready");
  assert.equal(acknowledged.copyText, `Mods=\\ExampleCore;\\ExampleTools;\\ExamplePatch\nWorkshopItems=${CORE};${TOOLS}`);
  assert.deepEqual(selectedMods, [core, tools, core, patch, core]);
});

test("retains both explicitly selected Workshop IDs when the same Mod ID has two providers", () => {
  const secondProvider = "9000000004";
  const input = {
    catalog: [...catalog, { workshopId: secondProvider, modIds: [core.modId] }],
    selectedMods: [core, { workshopId: secondProvider, modId: core.modId }]
  };
  const result = buildServerConfig(input, prefixed);
  assert.equal(result.copyStatus, "confirmation-required");
  assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [
    ["duplicate-mod-id", "warning"],
    ["ambiguous-mod-source", "info"]
  ]);
  const acknowledged = buildServerConfig(input, { ...prefixed, warningsAcknowledged: true });
  assert.equal(acknowledged.copyText, `Mods=\\ExampleCore\nWorkshopItems=${CORE};${secondProvider}`);
});

test("reports an uncertain provider from a download-only Workshop as informational", () => {
  const result = buildServerConfig({
    catalog: [...catalog, { workshopId: "9000000004", modIds: [core.modId] }],
    selectedMods: [core],
    downloadOnlyWorkshopIds: ["9000000004"]
  }, prefixed);
  assert.equal(result.copyStatus, "ready");
  assert.equal(result.copyText, `Mods=\\ExampleCore\nWorkshopItems=${CORE};9000000004`);
  assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [["ambiguous-mod-source", "info"]]);
});

test("checks required Workshop downloads separately from required Mod ID activation", () => {
  const input = {
    catalog,
    selectedMods: [tools],
    relationships: [
      { kind: "requires-workshop", workshopId: TOOLS, requiredWorkshopId: CORE, verifiedSource },
      { kind: "requires-mod", modId: tools.modId, requiredModId: core.modId, verifiedSource }
    ]
  } as const;
  const result = buildServerConfig(input, prefixed);
  assert.equal(result.copyStatus, "blocked");
  assert.equal(result.copyText, null);
  assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [
    ["missing-required-workshop", "error"],
    ["missing-required-mod", "error"]
  ]);
  const downloaded = buildServerConfig({ ...input, downloadOnlyWorkshopIds: [CORE] }, prefixed);
  assert.deepEqual(downloaded.issues.map(({ code }) => code), ["missing-required-mod"]);
  assert.equal(downloaded.copyStatus, "blocked");
  assert.equal(downloaded.preview?.mods, "Mods=\\ExampleTools");
  const satisfied = buildServerConfig({ ...input, selectedMods: [core, tools] }, prefixed);
  assert.equal(satisfied.copyStatus, "ready");
  assert.deepEqual(satisfied.issues, []);
});

test("warns about known selected conflicts and allows copy only after acknowledgement", () => {
  const input = {
    catalog,
    selectedMods: [core, tools],
    relationships: [{ kind: "incompatible-mods", modId: core.modId, incompatibleModId: tools.modId, verifiedSource }]
  } as const;
  const waiting = buildServerConfig(input, prefixed);
  assert.equal(waiting.copyStatus, "confirmation-required");
  assert.equal(waiting.copyText, null);
  assert.deepEqual(waiting.issues.map(({ code, severity }) => [code, severity]), [["incompatible-mods", "warning"]]);
  const confirmed = buildServerConfig(input, { ...prefixed, warningsAcknowledged: true });
  assert.equal(confirmed.copyStatus, "ready");
  assert.equal(confirmed.copyText, `Mods=\\ExampleCore;\\ExampleTools\nWorkshopItems=${CORE};${TOOLS}`);
});

test("a verified missing dependency blocks copy even after acknowledging a duplicate warning", () => {
  const result = buildServerConfig({
    catalog,
    selectedMods: [tools, tools],
    relationships: [{ kind: "requires-mod", modId: tools.modId, requiredModId: core.modId, verifiedSource }]
  }, { ...prefixed, warningsAcknowledged: true });
  assert.equal(result.copyStatus, "blocked");
  assert.equal(result.copyText, null);
  assert.equal(result.preview?.mods, "Mods=\\ExampleTools");
  assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [
    ["duplicate-mod-id", "warning"],
    ["missing-required-mod", "error"]
  ]);
});

test("reports a recommended order without changing the order of selected Mod IDs", () => {
  const selectedMods = Object.freeze([patch, tools, core]);
  const relationships = [
    { kind: "load-before", beforeModId: core.modId, afterModId: tools.modId, verifiedSource },
    { kind: "load-before", beforeModId: tools.modId, afterModId: patch.modId, verifiedSource }
  ] as const;
  const result = buildServerConfig({ catalog, selectedMods, relationships }, prefixed);
  assert.equal(result.copyStatus, "confirmation-required");
  assert.equal(result.copyText, null);
  assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [
    ["load-order-violation", "warning"],
    ["load-order-violation", "warning"]
  ]);
  assert.deepEqual(result.recommendedModOrder, [core.modId, tools.modId, patch.modId]);
  assert.equal(result.preview?.mods, "Mods=\\ExamplePatch;\\ExampleTools;\\ExampleCore");
  assert.equal(result.preview?.workshopItems, `WorkshopItems=${CORE};${TOOLS}`);
  const acknowledged = buildServerConfig({ catalog, selectedMods, relationships }, {
    ...prefixed, warningsAcknowledged: true
  });
  assert.equal(acknowledged.copyText, `Mods=\\ExamplePatch;\\ExampleTools;\\ExampleCore\nWorkshopItems=${CORE};${TOOLS}`);
  assert.deepEqual(selectedMods, [patch, tools, core]);
});

test("reports contradictory order constraints without suggesting a partial order", () => {
  const result = buildServerConfig({
    catalog,
    selectedMods: [core, patch],
    relationships: [
      { kind: "load-before", beforeModId: core.modId, afterModId: patch.modId, verifiedSource },
      { kind: "load-before", beforeModId: patch.modId, afterModId: core.modId, verifiedSource }
    ]
  }, prefixed);
  assert.equal(result.copyStatus, "confirmation-required");
  assert.equal(result.recommendedModOrder, null);
  assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [
    ["load-order-violation", "warning"],
    ["load-order-cycle", "warning"]
  ]);
});

test("shows missing compatibility and dependency information without requiring confirmation", () => {
  const result = buildServerConfig({
    catalog: [{ workshopId: CORE, modIds: [core.modId] }], selectedMods: [core]
  }, prefixed);
  assert.equal(result.copyStatus, "ready");
  assert.equal(result.copyText, `Mods=\\ExampleCore\nWorkshopItems=${CORE}`);
  assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [
    ["compatibility-unverified", "info"], ["compatibility-unverified", "info"], ["dependency-unverified", "info"]
  ]);
  for (const issue of result.issues) assert.match(issue.message, /미확인/);
});

test("uses recorded build and multiplayer compatibility statuses independently", () => {
  const result = buildServerConfig({
    catalog: [{
      workshopId: CORE,
      modIds: [core.modId],
      modMetadata: [{
        modId: core.modId, buildCompatibility: "confirmed", multiplayerCompatibility: "unverified",
        dependencyReviewSource: verifiedSource
      }]
    }],
    selectedMods: [core]
  }, prefixed);
  assert.equal(result.copyStatus, "ready");
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0].message, /멀티플레이 호환성은 미확인/);
});

test("unverified dependency, conflict, and order claims are informative rather than blocking", () => {
  const result = buildServerConfig({
    catalog,
    selectedMods: [tools, core],
    relationships: [
      { kind: "requires-mod", modId: core.modId, requiredModId: patch.modId },
      { kind: "requires-workshop", workshopId: TOOLS, requiredWorkshopId: DOWNLOAD, verifiedSource: " " },
      { kind: "incompatible-mods", modId: core.modId, incompatibleModId: tools.modId },
      { kind: "load-before", beforeModId: core.modId, afterModId: tools.modId }
    ]
  }, prefixed);
  assert.equal(result.copyStatus, "ready");
  assert.equal(result.recommendedModOrder, null);
  assert.deepEqual(result.issues.map(({ code, severity }) => [code, severity]), [
    ["dependency-unverified", "info"], ["dependency-unverified", "info"],
    ["compatibility-unverified", "info"], ["load-order-unverified", "info"]
  ]);
  for (const issue of result.issues) assert.match(issue.message, /미확인/);
});
