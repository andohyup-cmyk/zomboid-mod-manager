import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { BACKUP_TABLES, inspectBackupSnapshot } from "../lib/backup-preview";

// Exercise the actual Next route's GET implementation while replacing only its
// authentication and Supabase transport imports. No real DB or user credentials.
const AUTH_IMPORT = 'import { getOwnerAccess } from "@/lib/auth";';
const INSPECT_IMPORT = 'import { inspectBackupSnapshot } from "@/lib/backup-preview";';
const routePath = join(process.cwd(), "app/api/data-export/route.ts");
const source = readFileSync(routePath, "utf8");
assert.ok(source.includes(AUTH_IMPORT), "auth import changed; update harness before testing");
assert.ok(source.includes(INSPECT_IMPORT), "inspector import changed; update harness before testing");
const isolated = source.replace(AUTH_IMPORT, "").replace(INSPECT_IMPORT, "");
assert.doesNotMatch(isolated, /^import\s/m, "unexpected new import in route");
const compiled = ts.transpileModule(isolated, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

type Row = Record<string, unknown>;
type Rows = Record<string, Row[]>;
const owner = "owner-fixture";
const other = "other-owner";
const example: Rows = {
  mods: [{ id: "mod-a", owner_id: owner, workshop_id: "9000099943" }],
  categories: [
    { id: "cat-a", owner_id: owner, name: "의상", sort_order: 10 },
    { id: "cat-b", owner_id: owner, name: "UI", sort_order: 20 }
  ],
  mod_categories: [
    { mod_id: "mod-a", owner_id: owner, category_id: "cat-a" },
    { mod_id: "mod-a", owner_id: owner, category_id: "cat-b" }
  ],
  mod_category_primary: [
    { mod_id: "mod-a", owner_id: owner, category_id: "cat-b" }
  ],
  research_queue: [
    { id: "queue-1", owner_id: owner },
    { id: "queue-2", owner_id: owner }
  ]
};

function makeDb(rows: Rows, failTable?: string) {
  const calls: Array<{ table: string; field: string; ids: string[]; start: number; end: number }> = [];
  const supabase = {
    from(table: string) {
      const order: string[] = [];
      let filterKey = "";
      let filterValues: string[] = [];
      const query = {
        select(projection: string) {
          assert.equal(projection, "*");
          return query;
        },
        in(field: string, ids: string[]) {
          filterKey = field;
          filterValues = ids;
          return query;
        },
        order(key: string, options: { ascending: boolean }) {
          assert.equal(options.ascending, true);
          order.push(key);
          return query;
        },
        async range(start: number, end: number) {
          calls.push({ table, field: filterKey, ids: [...filterValues], start, end });
          if (table === failTable) return { data: null, error: { message: "hidden database error" } };
          const result = (rows[table] ?? [])
            .filter(item => filterValues.includes(String(item[filterKey] ?? "")))
            .sort((a, b) => {
              for (const key of order) {
                const comparison = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
                if (comparison !== 0) return comparison;
              }
              return 0;
            });
          return { data: result.slice(start, end + 1), error: null };
        }
      };
      return query;
    }
  };
  return { supabase, calls };
}

function getRoute(access: unknown): () => Promise<Response> {
  // Execute the trusted, local TypeScript route after transpiling, not a
  // duplicate test-only implementation of the export algorithm.
  const factory = new Function("exports", "getOwnerAccess", "inspectBackupSnapshot",
    compiled + "\nreturn exports.GET;");
  return factory({}, async () => access, inspectBackupSnapshot) as () => Promise<Response>;
}

function setup(overrides: Partial<Rows> = {}, failTable?: string) {
  const data: Rows = structuredClone(example);
  for (const [table, rows] of Object.entries(overrides)) {
    if (rows !== undefined) data[table] = structuredClone(rows);
  }
  const db = makeDb(data, failTable);
  return { ...db, GET: getRoute({
    kind: "authorized", user: { id: owner }, supabase: db.supabase
  }) };
}

test("v4 route denies unsigned/unauthorized callers before querying data", async () => {
  for (const kind of ["anonymous", "forbidden", "not-configured"]) {
    const response = await getRoute({ kind })();
    assert.equal(response.status, 403);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.match(await response.text(), /접근 권한/);
  }
});

test("v4 route exports real 13-area payload contract with two categories and UI primary", async () => {
  const { GET, calls } = setup();
  const response = await GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename="zomboid-mod-manager-/);
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const snapshot = await response.json();
  assert.equal(snapshot.schemaVersion, 4);
  assert.equal(snapshot.complete, true);
  assert.deepEqual(Object.keys(snapshot.data).sort(), [...BACKUP_TABLES].sort());
  assert.deepEqual(snapshot.data.categories.map((row: Row) => row.name), ["의상", "UI"]);
  assert.deepEqual(snapshot.data.modCategories.map((row: Row) => row.category_id), ["cat-a", "cat-b"]);
  assert.equal(snapshot.data.modCategoryPrimary[0].category_id, "cat-b");
  const inspected = inspectBackupSnapshot(snapshot);
  assert.equal(inspected.error, undefined);
  assert.equal(inspected.preview?.complete, true);
  assert.deepEqual(
    [inspected.preview?.counts.categories, inspected.preview?.counts.modCategories,
      inspected.preview?.counts.modCategoryPrimary],
    [2, 2, 1]
  );
  const ownerScoped = calls.filter(x => ["categories", "mod_categories", "mod_category_primary", "research_queue"].includes(x.table));
  assert.equal(ownerScoped.length, 4);
  assert.ok(ownerScoped.every(x => x.field === "owner_id" && x.ids.length === 1 && x.ids[0] === owner));
});

test("v4 route owner-scopes database results without leaking other users", async () => {
  const rows = structuredClone(example);
  rows.mods.push({ id: "mod-other", owner_id: other, workshop_id: "9000099944" });
  rows.categories.push({ id: "cat-other", owner_id: other, name: "비공개", sort_order: 30 });
  rows.mod_categories.push({ mod_id: "mod-other", owner_id: other, category_id: "cat-other" });
  rows.mod_category_primary.push({ mod_id: "mod-other", owner_id: other, category_id: "cat-other" });
  rows.research_queue.push({ id: "queue-other", owner_id: other });
  const { GET } = setup(rows);
  const response = await GET();
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.doesNotMatch(text, /mod-other|cat-other|queue-other|비공개/);
});

test("v4 route exports a legitimate unclassified mod with empty assignment arrays", async () => {
  const { GET } = setup({ mod_categories: [], mod_category_primary: [] });
  const response = await GET();
  assert.equal(response.status, 200);
  const data = (await response.json()).data;
  assert.deepEqual(data.modCategories, []);
  assert.deepEqual(data.modCategoryPrimary, []);
  assert.equal(data.categories.length, 2);
});

test("v4 route detects missing primary and non-member primary before generating a download", async () => {
  for (const overrides of [
    { mod_category_primary: [] },
    { mod_category_primary: [{ mod_id: "mod-a", owner_id: owner, category_id: "cat-other" }] },
    { mod_categories: [{ mod_id: "mod-a", owner_id: owner, category_id: "cat-a" }] }
  ]) {
    const { GET } = setup(overrides);
    const response = await GET();
    assert.equal(response.status, 503);
    assert.match(await response.text(), /데이터 연결/);
    assert.equal(response.headers.get("content-disposition"), null);
  }
});

test("v4 route rejects duplicate memberships and mismatched category ownership", async () => {
  for (const overrides of [
    { mod_categories: [...example.mod_categories, example.mod_categories[0]] },
    { categories: [{ ...example.categories[0], owner_id: other }, example.categories[1]] }
  ]) {
    const { GET } = setup(overrides);
    const response = await GET();
    assert.equal(response.status, 503);
  }
});

test("v4 route returns partial export when research queue is unavailable, never complete", async () => {
  const { GET } = setup({}, "research_queue");
  const response = await GET();
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.data.researchQueue, null);
  assert.equal(snapshot.warnings.length, 1);
  const result = inspectBackupSnapshot(snapshot);
  assert.equal(result.preview?.complete, false);
  assert.equal(result.preview?.counts.researchQueue, null);
});

test("v4 route safely returns 503 if a required category table fails", async () => {
  for (const table of ["categories", "mod_categories", "mod_category_primary", "mods"]) {
    const { GET } = setup({}, table);
    const response = await GET();
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.doesNotMatch(body, /hidden database error/);
    assert.equal(response.headers.get("content-disposition"), null);
  }
});

test("v4 route paginates over 250 records without dropping data", async () => {
  const categories = Array.from({ length: 251 }, (_, i) => ({
    id: "cat-" + String(i).padStart(3, "0"),
    owner_id: owner, name: "분류" + i, sort_order: i
  }));
  const { GET, calls } = setup({
    categories, mod_categories: [], mod_category_primary: []
  });
  const response = await GET();
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.data.categories.length, 251);
  assert.equal(snapshot.data.categories[0].sort_order, 0);
  assert.ok(calls.some(x => x.table === "categories" && x.start === 250));
});

test("v4 route refuses more than 10000 rows of an owner table", async () => {
  const categories = Array.from({ length: 10001 }, (_, i) => ({
    id: "cat-" + i, owner_id: owner, name: "분류" + i, sort_order: i
  }));
  const { GET, calls } = setup({
    categories, mod_categories: [], mod_category_primary: []
  });
  const response = await GET();
  assert.equal(response.status, 503);
  assert.ok(calls.some(x => x.table === "categories" && x.start === 10000));
});

test("v4 route enforces the total UTF-8 8MB download limit", async () => {
  const { GET } = setup({
    research_queue: [{ id: "queue-large", owner_id: owner, notes: "가".repeat(2_750_000) }]
  });
  const response = await GET();
  assert.equal(response.status, 413);
  assert.equal(response.headers.get("content-disposition"), null);
  assert.match(await response.text(), /크기가 제한/);
});

test("v4 route omits empty dependent reads when no mod or profile exists", async () => {
  const { GET, calls } = setup({
    mods: [], categories: [], mod_categories: [],
    mod_category_primary: [], research_queue: []
  });
  const response = await GET();
  assert.equal(response.status, 200);
  assert.ok(!calls.some(x => ["mod_ids", "research_records", "profile_mods"].includes(x.table)));
});
