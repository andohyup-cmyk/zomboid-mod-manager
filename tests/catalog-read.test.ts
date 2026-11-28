import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCatalogListFilters,
  CATALOG_LIST_LIMIT,
  extractCatalogResearchSources,
  isCatalogModUuid,
  parseCategoryFilter,
  parseCategoryScopeFilter,
  parseCatalogListFilters,
  parseModIdFilter
} from "../lib/catalog-read";

type QueryCall = { method: "eq" | "ilike" | "order"; column: string; value: string | boolean };

class QuerySpy {
  calls: QueryCall[] = [];

  eq(column: string, value: string | boolean): this {
    this.calls.push({ method: "eq", column, value });
    return this;
  }

  ilike(column: string, value: string): this {
    this.calls.push({ method: "ilike", column, value });
    return this;
  }

  order(column: string, options: { ascending: boolean }): this {
    this.calls.push({ method: "order", column, value: options.ascending });
    return this;
  }
}

function inspectQuery(input: Parameters<typeof parseCatalogListFilters>[0]): QueryCall[] {
  const query = new QuerySpy();
  applyCatalogListFilters(query, parseCatalogListFilters(input));
  return query.calls;
}

test("catalogue search defaults to active records and newest sorting", () => {
  assert.deepEqual(parseCatalogListFilters({}), {
    query: "", archive: "active", build: "", multiplayer: "", sort: "recent"
  });
  assert.deepEqual(inspectQuery({}), [
    { method: "eq", column: "is_archived", value: false },
    { method: "order", column: "created_at", value: false }
  ]);
});

test("unknown filter values cannot become database clauses", () => {
  assert.deepEqual(parseCatalogListFilters({
    archive: "deleted", build: "confirmed,unverified",
    multiplayer: "confirmed.invalid", sort: "random"
  }), {
    query: "", archive: "active", build: "", multiplayer: "", sort: "recent"
  });
});

test("Workshop ID search uses exact matching, not name matching", () => {
  assert.deepEqual(inspectQuery({
    q: " 3552615247 ", archive: "all",
    build: "confirmed", multiplayer: "unverified", sort: "oldest"
  }), [
    { method: "eq", column: "build_compatibility", value: "confirmed" },
    { method: "eq", column: "multiplayer_compatibility", value: "unverified" },
    { method: "eq", column: "workshop_id", value: "3552615247" },
    { method: "order", column: "created_at", value: true }
  ]);
});

test("name search escapes literal percent, underscore and backslash", () => {
  const calls = inspectQuery({ q: String.raw`Mod%_\\test`, archive: "archived", sort: "name" });
  assert.deepEqual(calls, [
    { method: "eq", column: "is_archived", value: true },
    { method: "ilike", column: "title", value: String.raw`%Mod\%\_\\\\test%` },
    { method: "order", column: "title", value: true }
  ]);
});

test("search input is trimmed and limited to 80 characters", () => {
  assert.equal(parseCatalogListFilters({ q: "  " + "A".repeat(100) + "  " }).query.length, 80);
  assert.equal(parseCatalogListFilters({ q: "1234" }).query, "1234");
  assert.equal(inspectQuery({ q: "1234" }).some(call => call.method === "ilike"), true);
});

test("supported sort and archive combinations do not silently change", () => {
  assert.deepEqual(inspectQuery({ archive: "all", sort: "name" }), [
    { method: "order", column: "title", value: true }
  ]);
  assert.deepEqual(inspectQuery({ archive: "archived", sort: "recent" }), [
    { method: "eq", column: "is_archived", value: true },
    { method: "order", column: "created_at", value: false }
  ]);
});

test("mod detail only accepts UUID-shaped paths", () => {
  assert.equal(isCatalogModUuid("a1a2a3a4-b1b2-c1c2-d1d2-e1e2e3e4e5e6"), true);
  assert.equal(isCatalogModUuid("A1A2A3A4-B1B2-C1C2-D1D2-E1E2E3E4E5E6"), true);
  assert.equal(isCatalogModUuid("3552615247"), false);
  assert.equal(isCatalogModUuid("../other-user"), false);
  assert.equal(isCatalogModUuid("a1a2a3a4-b1b2-c1c2-d1d2-e1e2e3e4e5e6?x=1"), false);
});

test("detail research sources keep valid records and ignore malformed payloads", () => {
  const record = {
    workshopId: "3552615247",
    title: "Example [B42] Mod",
    modIds: ["DemoModA", "DemoModB"],
    sourceUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=3552615247",
    sources: ["https://steamcommunity.com/sharedfiles/filedetails/?id=3552615247"],
    checkedAt: "2026-11-21",
    verificationStatus: "unverified",
    buildCompatibility: "unverified",
    multiplayerCompatibility: "unverified",
    singleplayerCompatibility: "unverified",
    midServerAdditionCompatibility: "unverified"
  };
  const rows = [
    { raw_payload: { ...record }, created_at: "2026-11-21T11:20:00Z" },
    { raw_payload: { ...record, title: "" }, created_at: "2026-11-21T11:19:00Z" },
    { raw_payload: { ...record, workshopId: "1234567890" }, created_at: "2026-11-21T11:18:00Z" }
  ];
  const result = extractCatalogResearchSources(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].createdAt, "2026-11-21T11:20:00Z");
  assert.deepEqual(result[0].record.modIds, ["DemoModA", "DemoModB"]);
  assert.equal(result[0].record.buildCompatibility, "unverified");
  assert.equal(result[0].record.multiplayerCompatibility, "unverified");
  assert.equal(result[0].record.sources.length, 1);
});

test("an empty detail history remains an empty list", () => {
  assert.deepEqual(extractCatalogResearchSources([]), []);
});

test("current catalogue list limit is explicitly tracked for future pagination", () => {
  assert.equal(CATALOG_LIST_LIMIT, 300);
});

test("category filter accepts only a UUID and lowercases it", () => {
  const id = "AAAAAAAA-1111-4111-8111-111111111111";
  assert.equal(parseCategoryFilter(id), id.toLowerCase());
  for (const bad of [undefined, "", "none", "x,y", `${id},${id}`, ["a"], 5, "1' or 1=1"]) {
    assert.equal(parseCategoryFilter(bad), "");
  }
});

test("category scope filter supports unclassified and modId filter supports missing/present", () => {
  const id = "AAAAAAAA-1111-4111-8111-111111111111";
  assert.equal(parseCategoryScopeFilter("unclassified"), "unclassified");
  assert.equal(parseCategoryScopeFilter(id), id.toLowerCase());
  assert.equal(parseCategoryScopeFilter("invalid"), "");
  assert.equal(parseModIdFilter("missing"), "missing");
  assert.equal(parseModIdFilter("present"), "present");
  assert.equal(parseModIdFilter("other"), "");
});
