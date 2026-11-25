import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanSteamDescription,
  extractSteamUpdatedAt,
  formatSteamDate,
  stripWorkshopSuffixFromTitle,
  summarizeModDescription
} from "../lib/steam-description";
import { parseSteamWorkshopDetails } from "../lib/steam-metadata";

test("cleanSteamDescription strips BBCode, images, dividers, and Workshop/Mod ID boilerplate", () => {
  const raw = [
    "[h1][b]VSGirlBody[/b][/h1]",
    "[img]https://example.test/banner.png[/img]",
    "All versions of variable body shapes have been integrated.",
    "----------------",
    "[url=https://example.test]Wiki[/url] and [url=https://example.test]https://example.test[/url]",
    "[*] Item one",
    "Workshop ID: 3640496116",
    "Mod ID: VSGirlBody"
  ].join("\n");

  const cleaned = cleanSteamDescription(raw);
  assert.doesNotMatch(cleaned, /\[img\]|\[h1\]|\[url=|Workshop ID:|Mod ID:|----/);
  assert.match(cleaned, /VSGirlBody/);
  assert.match(cleaned, /All versions of variable body shapes/);
  assert.match(cleaned, /Wiki/);
  assert.match(cleaned, /• Item one/);
});

test("summarizeModDescription extracts a concise 1-2 line summary bounded to maxChars", () => {
  const longText = "First sentence describes the mod clearly. Second sentence adds extra details. " + "More text ".repeat(30);
  const summary = summarizeModDescription(longText, 90);
  assert.ok(summary.length <= 92);
  assert.match(summary, /First sentence describes the mod clearly\./);
  assert.equal(summarizeModDescription(""), "");
});

test("extractSteamUpdatedAt and formatSteamDate parse Steam Unix timestamps safely", () => {
  const iso = extractSteamUpdatedAt({ time_updated: 1794753368 });
  assert.equal(iso, "2026-11-15T14:36:08.000Z");
  assert.equal(formatSteamDate(iso), "2026-11-15");
  assert.equal(extractSteamUpdatedAt({ time_updated: 0 }), null);
  assert.equal(extractSteamUpdatedAt({ time_updated: "not-a-number" }), null);
  assert.equal(formatSteamDate(null), null);
});

test("parseSteamWorkshopDetails returns cleaned description, short summary, and steamUpdatedAt", () => {
  const parsed = parseSteamWorkshopDetails(["3640496116"], {
    response: {
      publishedfiledetails: [{
        publishedfileid: "3640496116",
        result: 1,
        consumer_app_id: 108600,
        title: "Sample Mod",
        description: "[b]Great mod[/b]\n[img]https://a.test/x.png[/img]\nImproves gameplay.\nWorkshop ID: 3640496116",
        time_updated: 1794753368,
        tags: [{ tag: "Build 42" }, { tag: "Clothing/Armor" }]
      }]
    }
  }, "2026-11-25");

  assert.equal(parsed.records.length, 1);
  assert.doesNotMatch(parsed.records[0].description, /\[img\]|Workshop ID:/);
  assert.ok(parsed.shortDescriptionByWorkshopId["3640496116"].includes("Great mod"));
  assert.equal(parsed.steamUpdatedAtByWorkshopId["3640496116"], "2026-11-15T14:36:08.000Z");
});

test("stripWorkshopSuffixFromTitle removes trailing (Workshop ID) suffix without losing normal titles", () => {
  assert.equal(stripWorkshopSuffixFromTitle("RepairAnyClothes (Workshop 2142622992)"), "RepairAnyClothes");
  assert.equal(stripWorkshopSuffixFromTitle("BetterSortCC (Workshop 2313387159)"), "BetterSortCC");
  assert.equal(stripWorkshopSuffixFromTitle("[B42.22] VSGirlBody(Integrated)"), "[B42.22] VSGirlBody(Integrated)");
  assert.equal(stripWorkshopSuffixFromTitle("Workshop 2142622992"), "Workshop 2142622992");
});
