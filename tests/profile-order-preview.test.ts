import assert from "node:assert/strict";
import test from "node:test";
import type { ProfileModSelection } from "../lib/profile-mod-id-state";
import { moveProfileMod } from "../lib/profile-mod-order";
import type { ProfileOrderRule } from "../lib/profile-mod-recommended-order";
import {
  calculateProfileOrderPreview,
  getApplicableProfileOrder,
  isBlockingProfileOrderWarning,
  isCurrentProfileOrderPreview,
  type ProfileOrderPreviewOptions
} from "../lib/profile-order-preview";

const first = Object.freeze({ workshopId: "1234567890", modId: "Fleet", primaryCategoryId: "vehicles", enabled: true });
const disabled = Object.freeze({ workshopId: "1234567890", modId: "Disabled", enabled: false });
const last = Object.freeze({ workshopId: "1234567890", modId: "Map", primaryCategoryId: "maps", enabled: true });
const draft = Object.freeze<readonly ProfileModSelection[]>([first, disabled, last]);
const priority = { categoryPriority: ["maps", "vehicles"] };
const evidence = { verified: true, verificationNote: "Synthetic test record" };

test("calculates a preview independently and retains disabled positions and every identity", () => {
  const preview = calculateProfileOrderPreview(draft, priority);
  assert.deepEqual(draft, [first, disabled, last]);
  assert.deepEqual(preview.result.currentOrder, draft);
  const approved = getApplicableProfileOrder(preview, draft, priority);
  assert.deepEqual(approved, [last, disabled, first]);
  assert.strictEqual(approved?.[1], disabled);
  assert.deepEqual(new Set(approved), new Set(draft));
});

test("rejects an old preview after reorder, selection, state, revert or options changes", () => {
  const preview = calculateProfileOrderPreview(draft, priority);
  const changes = [
    moveProfileMod(draft, 1, 2),
    [first, last],
    [{ ...first, enabled: false }, disabled, last],
    [...draft, { ...first, modId: "New" }],
    [...draft]
  ];
  for (const current of changes) {
    assert.equal(isCurrentProfileOrderPreview(preview, current, priority), false);
    assert.equal(getApplicableProfileOrder(preview, current, priority), null);
  }
  assert.equal(getApplicableProfileOrder(preview, draft, { categoryPriority: ["vehicles", "maps"] }), null);
});

test("distinguishes applyable incompatibility warnings from blocked requirements and cycles", () => {
  const incompatible: ProfileOrderRule = { kind: "incompatibleMods", mod: first, target: last, evidence };
  const missing: ProfileOrderRule = { kind: "requires", mod: first, target: { modId: "Missing" }, evidence };
  const warningOptions: ProfileOrderPreviewOptions = { ...priority, rules: [incompatible] };
  const warningPreview = calculateProfileOrderPreview(draft, warningOptions);
  assert.equal(warningPreview.result.status, "needs-review");
  assert.equal(warningPreview.result.warnings.some(isBlockingProfileOrderWarning), false);
  assert.deepEqual(getApplicableProfileOrder(warningPreview, draft, warningOptions), [last, disabled, first]);

  const blockedOptions: ProfileOrderPreviewOptions = { ...priority, rules: [missing] };
  const blocked = calculateProfileOrderPreview(draft, blockedOptions);
  assert.equal(blocked.result.status, "blocked");
  assert.equal(blocked.result.warnings.some(isBlockingProfileOrderWarning), true);
  assert.equal(getApplicableProfileOrder(blocked, draft, blockedOptions), null);

  const cycleOptions: ProfileOrderPreviewOptions = {
    ...priority,
    rules: [
      { kind: "loadBefore", mod: first, target: last, evidence },
      { kind: "loadAfter", mod: first, target: last, evidence }
    ]
  };
  const cycle = calculateProfileOrderPreview(draft, cycleOptions);
  assert.equal(cycle.result.warnings.some(isBlockingProfileOrderWarning), true);
  assert.equal(getApplicableProfileOrder(cycle, draft, cycleOptions), null);
});

test("keeps the apply action unavailable when the recommendation matches the current order", () => {
  const options = { categoryPriority: [] };
  const preview = calculateProfileOrderPreview(draft, options);
  assert.deepEqual(preview.result.changes, []);
  assert.equal(getApplicableProfileOrder(preview, draft, options), null);
});
