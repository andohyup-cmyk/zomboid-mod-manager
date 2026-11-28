import assert from "node:assert/strict";
import test from "node:test";
import {
  planProfileSave,
  type TrustedProfileSaveContext
} from "../lib/profile-persistence-plan";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const profileId = "33333333-3333-4333-8333-333333333333";
const entryA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const entryB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const entryC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const entryD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const idOne = "3552615247";
const idTwo = "2142622992";

const context: TrustedProfileSaveContext = Object.freeze({
  signedInOwnerId: owner,
  profile: Object.freeze({ id: profileId, ownerId: owner, revision: 7 }),
  candidates: Object.freeze([
    Object.freeze({ entryId: entryA, ownerId: owner, workshopId: idOne, modId: "Main" }),
    Object.freeze({ entryId: entryB, ownerId: owner, workshopId: idOne, modId: "Optional" }),
    Object.freeze({ entryId: entryC, ownerId: owner, workshopId: idTwo, modId: "Main" })
  ])
});

const selection = (workshopId: string, modId: string, enabled: boolean, modIdUuid?: string) =>
  modIdUuid === undefined ? { workshopId, modId, enabled } : { workshopId, modId, enabled, modIdUuid };
const request = (selections: unknown[], downloadOnlyWorkshopIds: unknown[] = [], expectedRevision = 7) =>
  ({ profileId, expectedRevision, selections, downloadOnlyWorkshopIds });
const reject = (raw: unknown, ctx = context) => {
  const result = planProfileSave(raw, ctx);
  assert.equal(result.ok, false);
  return result.ok ? null : result.reason;
};

test("preserves explicit pair identities, disabled slots and selection order", () => {
  const result = planProfileSave(request([
    selection(idOne, "Optional", false, entryB),
    selection(idTwo, "Main", true, entryC),
    selection(idOne, "Main", true, entryA)
  ], [idTwo, idOne]), context);
  assert.deepEqual(result, {
    ok: true,
    expectedRevision: 7,
    choices: [
      { profile_id: profileId, mod_id_entry_id: entryB, enabled: false, load_order: 0 },
      { profile_id: profileId, mod_id_entry_id: entryC, enabled: true, load_order: 1 },
      { profile_id: profileId, mod_id_entry_id: entryA, enabled: true, load_order: 2 }
    ],
    downloads: [
      { profile_id: profileId, workshop_id: idTwo, load_order: 0 },
      { profile_id: profileId, workshop_id: idOne, load_order: 1 }
    ]
  });
});

test("distinct Workshop providers of the same game Mod ID are never conflated", () => {
  const result = planProfileSave(request([
    selection(idOne, "Main", true),
    selection(idTwo, "Main", false)
  ]), context);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.choices.map(c => c.mod_id_entry_id), [entryA, entryC]);
});

test("pair lookup can resolve a unique server-verified Mod ID when import omitted UUID", () => {
  const result = planProfileSave(request([selection(idOne, "Optional", true)]), context);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.choices[0].mod_id_entry_id, entryB);
});

test("a mismatched claimed candidate UUID is never accepted", () => {
  assert.equal(reject(request([selection(idOne, "Optional", true, entryA)])), "unresolved");
  assert.equal(reject(request([selection(idOne, "Optional", true, other)])), "unresolved");
});

test("unknown Workshop/Mod ID pairs never become automatic selections", () => {
  assert.equal(reject(request([selection(idOne, "Nonexistent", true)])), "unresolved");
  assert.equal(reject(request([selection("3652615247", "Main", true)])), "unresolved");
});

test("stale revision and wrong profile are blocked before constructing rows", () => {
  assert.equal(reject(request([], [], 6)), "stale");
  assert.equal(reject({ ...request([]), profileId: other }), "forbidden");
});

test("owner mismatch forbids saving; cross-owner catalog rows fail closed", () => {
  assert.equal(reject(request([]), {
    ...context, signedInOwnerId: other
  }), "forbidden");
  assert.equal(reject(request([]), {
    ...context, candidates: [...context.candidates, {
      entryId: entryD, ownerId: other, workshopId: "3652615247", modId: "Other"
    }]
  }), "forbidden");
});

test("duplicate pairs and duplicate download-only Workshops are rejected", () => {
  assert.equal(reject(request([
    selection(idOne, "Main", true), selection(idOne, "Main", false)
  ])), "ambiguous");
  assert.equal(reject(request([], [idOne, idOne])), "ambiguous");
});

test("ambiguous catalog pair or one UUID reused for different pairs is rejected", () => {
  assert.equal(reject(request([]), {
    ...context, candidates: [...context.candidates, {
      entryId: entryD, ownerId: owner, workshopId: idOne, modId: "Main"
    }]
  }), "ambiguous");
  assert.equal(reject(request([]), {
    ...context, candidates: [...context.candidates, {
      entryId: entryA, ownerId: owner, workshopId: idOne, modId: "Other"
    }]
  }), "ambiguous");
});

test("empty draft can be planned without activating mods or downloading anything", () => {
  assert.deepEqual(planProfileSave(request([]), context), {
    ok: true, expectedRevision: 7, choices: [], downloads: []
  });
});

test("download-only Workshop does not need a Mod ID and stays explicit", () => {
  const result = planProfileSave(request([], ["3620000001"]), context);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.downloads, [{
    profile_id: profileId, workshop_id: "3620000001", load_order: 0
  }]);
});

test("invalid IDs and unsafe Mod ID characters are rejected", () => {
  for (const item of [
    selection("0003552615247", "Main", true),
    selection("bad", "Main", true),
    selection(idOne, "Bad;Mod", true),
    selection(idOne, "Bad\nMod", true),
    selection(idOne, "  Main ", true),
    selection(idOne, "Main", "yes" as unknown as boolean),
    { ...selection(idOne, "Main", true), modIdUuid: "not-uuid" }
  ]) assert.equal(reject(request([item])), "invalid");
  assert.equal(reject(request([], ["0003552615247"])), "invalid");
  assert.equal(reject(request([], ["bad"])), "invalid");
});

test("untrusted metadata, owners or legacy rows cannot be mass-assigned", () => {
  assert.equal(reject({ ...request([]), ownerId: other }), "invalid");
  assert.equal(reject({ ...request([]), profile_mods: [] }), "invalid");
  assert.equal(reject(request([{ ...selection(idOne, "Main", true), load_order: 99 }])), "invalid");
  assert.equal(reject(request([{ ...selection(idOne, "Main", true), primaryCategoryId: "wrong" }])), "invalid");
});

test("invalid request containers, revisions and candidate contexts are rejected", () => {
  for (const value of [null, [], "", { ...request([]), selections: null },
    { ...request([]), downloadOnlyWorkshopIds: null },
    { ...request([]), expectedRevision: -1 },
    { ...request([]), expectedRevision: 7.5 }]) {
    assert.equal(reject(value), "invalid");
  }
  assert.equal(reject(request([]), { ...context, profile: { ...context.profile, revision: -1 } }), "invalid");
});

test("500 selections are supported; 501 are rejected", () => {
  const candidates = Array.from({ length: 501 }, (_, i) => ({
    entryId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    ownerId: owner, workshopId: "3552615247", modId: `M${i}`
  }));
  const newCtx = { ...context, candidates };
  const selections = candidates.map(c => selection(c.workshopId, c.modId, true, c.entryId));
  const result = planProfileSave(request(selections.slice(0, 500)), newCtx);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.choices.length, 500);
  assert.equal(reject(request(selections), newCtx), "invalid");
});

test("does not mutate frozen inputs or trusted catalog state", () => {
  const selected = Object.freeze([Object.freeze(selection(idOne, "Main", false))]);
  const payload = Object.freeze({ profileId, expectedRevision: 7, selections: selected,
    downloadOnlyWorkshopIds: Object.freeze([idTwo]) });
  const before = JSON.stringify({ context, payload });
  assert.equal(planProfileSave(payload, context).ok, true);
  assert.equal(JSON.stringify({ context, payload }), before);
});
