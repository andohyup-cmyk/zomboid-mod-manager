import assert from "node:assert/strict";
import test from "node:test";
import { planPcModIdBackfill } from "../lib/mod-detail-edit";
import {
  attachPcModIdsToResearchRecords,
  getRepoAuditSummary,
  getRepoWorkshopInventory
} from "../lib/repo-workshop-audit";
import type { ResearchRecord } from "../lib/workshop";

test("repository PC audit fixture parses cleanly with 81 workshops and 130 unique Mod IDs", () => {
  const inventory = getRepoWorkshopInventory();
  const summary = getRepoAuditSummary();
  assert.equal(inventory.targetBuild, "42.22");
  assert.equal(inventory.mods.length, 209);
  assert.equal(summary.workshopCount, 81);
  assert.equal(summary.modIdCount, 130);
});

test("planPcModIdBackfill matches real fixture entries for registered workshops without adding uncataloged ones", () => {
  const inventory = getRepoWorkshopInventory();
  const plan = planPcModIdBackfill(inventory, [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "[B42.22] VSGirlBody(Integrated)",
      workshopId: "3640496116",
      existingModIds: []
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Disassemble Container With Items",
      workshopId: "2835852387",
      existingModIds: []
    }
  ]);

  assert.equal(plan.updates.length, 2);
  assert.equal(plan.updates[0].workshopId, "3640496116");
  assert.equal(plan.updates[0].newModIds.length, 10);
  assert.ok(plan.updates[0].newModIds.includes("42_VSGirlBodySFW"));
  assert.deepEqual(plan.updates[1].newModIds, ["Disassemble Container With Items"]);
  assert.equal(plan.alreadyCompleteCount, 0);
  assert.equal(plan.unmatchedScanWorkshops, 79);
});

test("attachPcModIdsToResearchRecords fills empty Steam modIds without changing compatibility statuses", () => {
  const steamRecord: ResearchRecord = {
    workshopId: "2835852387",
    title: "Disassemble Container With Items",
    description: "Steam summary",
    sourceUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2835852387",
    modIds: [],
    verificationStatus: "unverified",
    buildCompatibility: "unverified",
    singleplayerCompatibility: "unverified",
    multiplayerCompatibility: "unverified",
    midServerAdditionCompatibility: "unverified",
    checkedAt: "2026-11-24",
    sources: ["https://steamcommunity.com/sharedfiles/filedetails/?id=2835852387"]
  };
  const alreadyFilled: ResearchRecord = {
    ...steamRecord,
    workshopId: "3640496116",
    modIds: ["ManualCustomId"]
  };

  const enriched = attachPcModIdsToResearchRecords([steamRecord, alreadyFilled]);
  assert.deepEqual(enriched[0].modIds, ["Disassemble Container With Items"]);
  assert.equal(enriched[0].buildCompatibility, "unverified");
  assert.equal(enriched[0].multiplayerCompatibility, "unverified");
  assert.equal(enriched[0].verificationStatus, "unverified");
  assert.deepEqual(enriched[1].modIds, ["ManualCustomId"]);
});
