import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeGameModId,
  parseBulkModIdBackfillInput,
  parseModDetailPatchInput,
  parseModIdAddInput,
  parseModIdDeleteInput,
  parseModIdText,
  planPcModIdBackfill
} from "../lib/mod-detail-edit";
import type { LocalWorkshopInventory } from "../lib/local-workshop-inventory";

const MOD_A = "11111111-1111-4111-8111-111111111111";
const MOD_B = "22222222-2222-4222-8222-222222222222";
const ENTRY_A = "33333333-3333-4333-8333-333333333333";

test("normalizeGameModId strips leading backslashes and rejects delimiters", () => {
  assert.equal(normalizeGameModId(" \\CoreLib "), "CoreLib");
  assert.equal(normalizeGameModId(""), null);
  assert.equal(normalizeGameModId("A;B"), null);
  assert.equal(normalizeGameModId("A\nB"), null);
  assert.equal(normalizeGameModId("x".repeat(201)), null);
});

test("parseModIdText splits comma/newline, deduplicates, and separates invalid entries", () => {
  const result = parseModIdText(" \\ModA, ModB \n ModA \n Bad;Id ");
  assert.deepEqual(result.valid, ["ModA", "ModB"]);
  assert.deepEqual(result.invalid, ["Bad;Id"]);
});

test("parseModIdAddInput and parseBulkModIdBackfillInput reject extra keys and duplicates", () => {
  assert.deepEqual(parseModIdAddInput({ modId: MOD_A, values: ["\\Core", "Core", "Extra"] }), {
    modId: MOD_A,
    values: ["Core", "Extra"]
  });
  assert.equal(parseModIdAddInput({ modId: "not-a-uuid", values: ["Core"] }), null);
  assert.equal(parseModIdAddInput({ modId: MOD_A, values: [], extra: 1 }), null);
  assert.equal(parseModIdAddInput({ modId: MOD_A, values: ["Bad;Id"] }), null);

  assert.deepEqual(
    parseBulkModIdBackfillInput({ items: [{ modId: MOD_A, values: ["Core"] }, { modId: MOD_B, values: ["Car"] }] }),
    { items: [{ modId: MOD_A, values: ["Core"] }, { modId: MOD_B, values: ["Car"] }] }
  );
  // Reject duplicate modId rows in a single batch
  assert.equal(
    parseBulkModIdBackfillInput({ items: [{ modId: MOD_A, values: ["Core"] }, { modId: MOD_A, values: ["Other"] }] }),
    null
  );
  assert.equal(parseBulkModIdBackfillInput({ items: [] }), null);
});

test("parseModIdDeleteInput validates both UUIDs strictly", () => {
  assert.deepEqual(parseModIdDeleteInput({ modId: MOD_A, modIdEntryId: ENTRY_A }), {
    modId: MOD_A,
    modIdEntryId: ENTRY_A
  });
  assert.equal(parseModIdDeleteInput({ modId: MOD_A, modIdEntryId: "bad" }), null);
  assert.equal(parseModIdDeleteInput({ modId: MOD_A, modIdEntryId: ENTRY_A, extra: true }), null);
});

test("parseModDetailPatchInput validates statuses, date, description, and blocks unknown fields", () => {
  const ok = parseModDetailPatchInput({
    verificationStatus: "confirmed",
    buildCompatibility: "reported_issue",
    multiplayerCompatibility: "unverified",
    researchedAt: "2026-11-24",
    description: "  메모 테스트  "
  });
  assert.deepEqual(ok, {
    ok: true,
    patch: {
      verification_status: "confirmed",
      build_compatibility: "reported_issue",
      multiplayer_compatibility: "unverified",
      researched_at: "2026-11-24",
      description: "메모 테스트"
    }
  });

  const clearedDate = parseModDetailPatchInput({ researchedAt: "" });
  assert.deepEqual(clearedDate, { ok: true, patch: { researched_at: null } });

  assert.equal(parseModDetailPatchInput({ workshopId: "12345" }).ok, false);
  assert.equal(parseModDetailPatchInput({ buildCompatibility: "compatible" }).ok, false);
  assert.equal(parseModDetailPatchInput({ researchedAt: "2026-02-30" }).ok, false);
  assert.equal(parseModDetailPatchInput({}).ok, false);
});

test("planPcModIdBackfill proposes only missing Mod IDs on registered mods and skips uncataloged workshops", () => {
  const inventory: LocalWorkshopInventory = {
    targetBuild: "42.22",
    scannedAtUtc: "2026-11-23T14:34:00Z",
    mods: [
      { workshopId: "3640496116", modId: "VSGirlBody", relativePath: "3640496116\\mods\\a\\42\\mod.info", requires: [] },
      { workshopId: "3640496116", modId: "VSGirlBody_Fix", relativePath: "3640496116\\mods\\b\\42\\mod.info", requires: [] },
      { workshopId: "3640496116", modId: "VSGirlBody", relativePath: "3640496116\\mods\\a\\mod.info", requires: [] },
      { workshopId: "2835852387", modId: "DisassembleContainer", relativePath: "2835852387\\mods\\c\\42\\mod.info", requires: [] },
      { workshopId: "9999999999", modId: "NotInCatalog", relativePath: "9999999999\\mods\\d\\42\\mod.info", requires: [] }
    ]
  };
  const plan = planPcModIdBackfill(inventory, [
    { id: MOD_A, title: "VSGirlBody", workshopId: "3640496116", existingModIds: ["VSGirlBody"] },
    { id: MOD_B, title: "Disassemble", workshopId: "2835852387", existingModIds: ["DisassembleContainer"] }
  ]);
  assert.equal(plan.updates.length, 1);
  assert.deepEqual(plan.updates[0], {
    modId: MOD_A,
    title: "VSGirlBody",
    workshopId: "3640496116",
    existingModIds: ["VSGirlBody"],
    newModIds: ["VSGirlBody_Fix"]
  });
  assert.equal(plan.alreadyCompleteCount, 1);
  assert.equal(plan.unmatchedScanWorkshops, 1);
});
