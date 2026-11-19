import assert from "node:assert/strict";
import test from "node:test";
import { addProfileModSelections } from "../lib/profile-mod-id-integration";
import {
  catalogSearchFilters,
  mergeEditorCatalog,
  toEditorCatalogPage,
  type CatalogRow
} from "../lib/profile-editor-catalog";

const primary = "9000000001";
const secondary = "9000000002";
const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";
const rows: CatalogRow[] = [
  {
    title: "First Workshop", workshop_id: primary,
    mod_ids: [
      { id: firstId, value: " Shared " },
      { id: firstId, value: "Shared" },
      { id: secondId, value: "More" },
      { id: null, value: " " }
    ]
  },
  { title: "Second Workshop", workshop_id: secondary, mod_ids: [{ id: secondId, value: "Shared" }] },
  { title: "No Mod ID", workshop_id: "9000000003", mod_ids: [] }
];

test("maps Mod IDs and UUIDs per Workshop, including duplicates and items without IDs", () => {
  const { entries } = toEditorCatalogPage(rows, rows.length);
  assert.deepEqual(entries, [
    { title: "First Workshop", workshopId: primary, modIds: [{ value: "Shared", uuid: firstId }, { value: "More", uuid: secondId }] },
    { title: "Second Workshop", workshopId: secondary, modIds: [{ value: "Shared", uuid: secondId }] },
    { title: "No Mod ID", workshopId: "9000000003", modIds: [] }
  ]);
  assert.equal(rows[0].mod_ids?.[0].value, " Shared ");
});

test("does not guess a UUID when different rows collapse to the same trimmed ID", () => {
  const ambiguous = toEditorCatalogPage([{
    title: "Ambiguous",
    workshop_id: primary,
    mod_ids: [{ id: firstId, value: "Shared" }, { id: secondId, value: "Shared " }]
  }], 1);
  assert.deepEqual(ambiguous.entries[0].modIds, [{ value: "Shared" }]);
});

test("uses a cursor when more matches remain even when the API returns a short page", () => {
  assert.equal(toEditorCatalogPage(rows.slice(0, 2), 104).nextCursor, secondary);
  assert.equal(toEditorCatalogPage(rows.slice(0, 2), null).nextCursor, secondary);
  assert.equal(toEditorCatalogPage(rows.slice(0, 2), 2).nextCursor, null);
  assert.equal(toEditorCatalogPage([], null).nextCursor, null);
});

test("merges fetched pages without duplicating Workshops or discarding earlier choices", () => {
  const { entries } = toEditorCatalogPage(rows, rows.length);
  const combined = mergeEditorCatalog([entries[0], entries[1]], [
    { ...entries[1], title: "Updated second Workshop" },
    entries[2]
  ]);
  assert.deepEqual(combined.map(({ workshopId }) => workshopId), [primary, secondary, "9000000003"]);
  assert.strictEqual(combined[0], entries[0]);
  assert.equal(combined[1].title, "Updated second Workshop");
});

test("keeps selected Mod ID UUIDs, includes only explicit choices and appends unknown categories", () => {
  const { entries } = toEditorCatalogPage(rows, rows.length);
  const catalog = entries.map(({ workshopId, modIds }) => ({ workshopId, modIds: modIds.map(({ value }) => value) }));
  const earlier = { workshopId: "9000000010", modId: "Existing", primaryCategoryId: "maps", enabled: true };
  const firstOption = entries[0].modIds[0];
  const secondOption = entries[1].modIds[0];
  const result = addProfileModSelections(catalog, [earlier], [
    { workshopId: primary, modId: firstOption.value, modIdUuid: firstOption.uuid },
    { workshopId: secondary, modId: secondOption.value, modIdUuid: secondOption.uuid }
  ]);
  assert.ok(result.ok);
  assert.strictEqual(result.selections[0], earlier);
  assert.deepEqual(result.selections.slice(1).map(({ workshopId, modIdUuid, primaryCategoryId }) =>
    [workshopId, modIdUuid, primaryCategoryId]
  ), [[primary, firstId, undefined], [secondary, secondId, undefined]]);
  assert.deepEqual(result.warnings, [{ code: "duplicate-mod-id", modId: "Shared", workshopIds: [primary, secondary] }]);
});

test("escapes search text both as a literal regex and as a quoted PostgREST operand", () => {
  const query = '맵 (v2.0), "지도" [test]* 50% _ path\\folder';
  const { pattern, or } = catalogSearchFilters(query);
  const match = new RegExp(pattern, "i");
  assert.ok(match.test(`prefix ${query} suffix`));
  assert.equal(match.test(query.replace("v2.0", "v2x0")), false);
  const operands = or.match(/"(?:[^"\\]|\\.)*"/g) ?? [];
  assert.equal(operands.length, 2);
  assert.ok(operands.every((operand) => JSON.parse(operand) === pattern));
  assert.equal(or.endsWith(",matching.not.is.null"), true);
});
