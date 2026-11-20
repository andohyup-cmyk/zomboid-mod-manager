import assert from "node:assert/strict";
import test from "node:test";
import { parseSteamWorkshopDetails } from "../lib/steam-metadata";

function detail(id: string, overrides: Record<string, unknown> = {}) {
  return { publishedfileid: id, result: 1, consumer_app_id: 108600,
    title: `Title ${id}`, description: "Steam description", ...overrides };
}
const response = (...items: unknown[]) => ({ response: { publishedfiledetails: items } });

test("matches response by requested ID, ignoring extra entries and preserving order", () => {
  const parsed = parseSteamWorkshopDetails(["3552615247", "2142622992"],
    response(detail("2142622992"), detail("9999999999"), detail("3552615247")), "2026-11-20");
  assert.deepEqual(parsed.records.map(x => x.workshopId), ["3552615247", "2142622992"]);
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.records[0].modIds, []);
  assert.equal(parsed.records[0].buildCompatibility, "unverified");
  assert.equal(parsed.records[0].multiplayerCompatibility, "unverified");
  assert.equal(parsed.records[0].checkedAt, "2026-11-20");
});
test("rejects wrong app, failed requests and missing items independently", () => {
  const parsed = parseSteamWorkshopDetails(["3552615247", "2142622992", "1234512345"],
    response(detail("3552615247", { consumer_app_id: 480 }), detail("2142622992", { result: 9 })),
    "2026-11-20");
  assert.equal(parsed.records.length, 0);
  assert.equal(parsed.errors.length, 3);
});
test("handles malformed Steam payload, blank title and duplicate returned items", () => {
  assert.match(parseSteamWorkshopDetails(["3552615247"], null, "2026-11-20").errors[0], /형식/);
  const failed = parseSteamWorkshopDetails(["3552615247"], response(detail("3552615247", { title: " " })), "2026-11-20");
  assert.equal(failed.records.length, 0);
  const duplicated = parseSteamWorkshopDetails(["3552615247"],
    response(detail("3552615247"), detail("3552615247", { consumer_app_id: 480 })), "2026-11-20");
  assert.equal(duplicated.records.length, 1);
});
test("description is bounded and public metadata never asserts unknown gameplay properties", () => {
  const parsed = parseSteamWorkshopDetails(["3552615247"],
    response(detail("3552615247", { description: "x".repeat(12000) })), "2026-11-20");
  assert.equal(parsed.records[0].description.length, 4000);
  assert.equal(parsed.records[0].verificationStatus, "unverified");
});
