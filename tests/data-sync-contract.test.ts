import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { BACKUP_TABLES, OPTIONAL_GROUP_BACKUP_TABLES } from "../lib/backup-preview";
import {
  buildPrimaryCategoryMap,
  countActiveUnclassifiedMods,
  getAffectedRevalidateTargets,
  PRIVATE_NO_STORE_HEADERS,
  revalidateDomain,
  SYNC_DOMAIN_BACKUP_TABLES,
  SYNC_DOMAIN_PATHS,
  type SyncDomain
} from "../lib/data-sync";
import { toEditorCatalogPage } from "../lib/profile-editor-catalog";

const REPO_ROOT = path.resolve(__dirname, "..");

function walkFiles(dir: string, targetName: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, targetName));
    } else if (entry.isFile() && entry.name === targetName) {
      results.push(full);
    }
  }
  return results.sort();
}

function rel(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

/**
 * Explicitly read-only POST routes that perform external metadata lookup without
 * writing to the database. Any new mutating route MUST call `revalidateDomain`.
 */
const READ_ONLY_POST_ROUTES = new Set([
  "app/api/workshop-metadata/route.ts"
]);

test("buildPrimaryCategoryMap resolves active category labels and ignores orphaned category IDs", () => {
  const map = buildPrimaryCategoryMap(
    [{ id: "cat-1", name: "차량" }, { id: "cat-2", name: "UI" }],
    [
      { mod_id: "mod-1", category_id: "cat-1" },
      { mod_id: "mod-2", category_id: "deleted-cat" }
    ]
  );
  assert.deepEqual(map.get("mod-1"), { id: "cat-1", label: "차량" });
  assert.equal(map.get("mod-2"), undefined);
});

test("countActiveUnclassifiedMods ignores archived mods even when they still have primary categories", () => {
  const activeModIds = ["mod-a", "mod-b", "mod-c"];
  // mod-archived is archived (not in activeModIds) but still has a primary category row
  const primaryModIds = ["mod-a", "mod-archived-1", "mod-archived-2"];
  assert.equal(countActiveUnclassifiedMods(activeModIds, primaryModIds), 2);
});

test("getAffectedRevalidateTargets maps every domain and filters valid mod UUIDs", () => {
  const validUuid = "10000000-0000-4000-8000-000000000001";
  const modTargets = getAffectedRevalidateTargets("mod", { modIds: [validUuid, "not-a-uuid"] });
  assert.ok(modTargets.some((t) => t.path === "/dashboard"));
  assert.ok(modTargets.some((t) => t.path === "/mods"));
  assert.ok(modTargets.some((t) => t.path === "/profiles/editor"));
  assert.ok(modTargets.some((t) => t.path === `/mods/${validUuid}`));
  assert.ok(!modTargets.some((t) => t.path.includes("not-a-uuid")));

  const catTargets = getAffectedRevalidateTargets("category");
  assert.ok(catTargets.some((t) => t.path === "/mods/[id]" && t.type === "page"));

  // Safe outside Next.js request store (unit test context)
  assert.doesNotThrow(() => revalidateDomain("mod", { modIds: [validUuid] }));
});

test("toEditorCatalogPage propagates primaryCategory into profile editor entries", () => {
  const page = toEditorCatalogPage([
    {
      id: "mod-1",
      title: "Vehicle Pack",
      workshop_id: "3552615247",
      mod_ids: [{ id: "mid-1", value: "VehPack" }],
      primaryCategory: { id: "cat-1", label: "차량" }
    },
    {
      id: "mod-2",
      title: "Unclassified Mod",
      workshop_id: "3552615248",
      mod_ids: [{ id: "mid-2", value: "PlainMod" }],
      primaryCategory: null
    }
  ], 2);

  assert.deepEqual(page.entries[0].category, { id: "cat-1", label: "차량" });
  assert.equal(page.entries[1].category, undefined);
});

test("GUARD: next.config.ts disables dynamic client router caching (staleTimes.dynamic = 0)", () => {
  const configPath = path.join(REPO_ROOT, "next.config.ts");
  const content = fs.readFileSync(configPath, "utf8");
  assert.match(content, /staleTimes\s*:\s*\{[^}]*dynamic\s*:\s*0/);
});

test("GUARD: every private page exports dynamic = 'force-dynamic'", () => {
  const privatePages = walkFiles(path.join(REPO_ROOT, "app/(private)"), "page.tsx");
  assert.ok(privatePages.length >= 6, "Expected private pages under app/(private)");
  for (const file of privatePages) {
    const content = fs.readFileSync(file, "utf8");
    assert.match(
      content,
      /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/,
      `${rel(file)} must export dynamic = "force-dynamic" so cross-screen updates are never stale`
    );
  }
});

test("GUARD: every API route exports force-dynamic, sets no-store, and mutating routes call revalidateDomain", () => {
  const apiRoutes = walkFiles(path.join(REPO_ROOT, "app/api"), "route.ts");
  assert.ok(apiRoutes.length >= 10, "Expected API routes under app/api");

  for (const file of apiRoutes) {
    const relative = rel(file);
    const content = fs.readFileSync(file, "utf8");

    assert.match(
      content,
      /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/,
      `${relative} must export dynamic = "force-dynamic"`
    );

    const hasNoStore = content.includes("PRIVATE_NO_STORE_HEADERS")
      || /Cache-Control["']?\s*:\s*["'][^"']*no-store/i.test(content);
    assert.ok(hasNoStore, `${relative} must return Cache-Control: private, no-store`);

    const isMutating = /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/.test(content);
    if (isMutating && !READ_ONLY_POST_ROUTES.has(relative)) {
      assert.match(
        content,
        /\brevalidateDomain\s*\(/,
        `${relative} mutates data and MUST call revalidateDomain(...) from @/lib/data-sync`
      );
    }
  }
  assert.match(PRIVATE_NO_STORE_HEADERS["Cache-Control"], /no-store/);
});

test("GUARD: every SYNC_DOMAIN_PATHS entry maps to an existing private page", () => {
  const domains = Object.keys(SYNC_DOMAIN_PATHS) as SyncDomain[];
  for (const domain of domains) {
    for (const routePath of SYNC_DOMAIN_PATHS[domain]) {
      const pageFile = path.join(REPO_ROOT, "app/(private)", routePath.replace(/^\//, ""), "page.tsx");
      assert.ok(
        fs.existsSync(pageFile),
        `SYNC_DOMAIN_PATHS.${domain} references ${routePath}, but ${rel(pageFile)} does not exist`
      );
    }
  }
});

test("GUARD: every synced domain table is covered by backup export and backup-preview schema", () => {
  const knownBackupTables = new Set<string>([
    ...BACKUP_TABLES,
    ...OPTIONAL_GROUP_BACKUP_TABLES
  ]);
  const exportRoute = fs.readFileSync(
    path.join(REPO_ROOT, "app/api/data-export/route.ts"),
    "utf8"
  );

  for (const [domain, tables] of Object.entries(SYNC_DOMAIN_BACKUP_TABLES)) {
    for (const tableKey of tables) {
      assert.ok(
        knownBackupTables.has(tableKey),
        `Domain '${domain}' backup table '${tableKey}' is missing from lib/backup-preview.ts`
      );
      assert.ok(
        exportRoute.includes(tableKey),
        `Domain '${domain}' backup table '${tableKey}' is missing from app/api/data-export/route.ts`
      );
    }
  }
});
