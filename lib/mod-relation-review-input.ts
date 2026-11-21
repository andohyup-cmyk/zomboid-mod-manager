import type { ReviewedRelationKind } from "./reviewed-mod-relations";

const TEST_DB = "https://smofdbjgcgdmscamknpw.supabase.co";
const TEST_PROJECT = "prj_XYLhTcgMEscWoUCB5UHZoDebfwPQ";
const TEST_BRANCH = "feature/test-mod-relation-review-flow-20261121";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELATION_KINDS: readonly string[] = ["requires", "incompatibleMods", "loadBefore", "loadAfter"];

function exactHttpsOrigin(input: string | undefined): string | null {
  if (!input) return null;
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "https:") return null;
    return input === parsed.origin || input === parsed.origin + "/" ? parsed.origin : null;
  } catch { return null; }
}

export function isTestRelationWriteAllowed(
  env: Readonly<Record<string, string | undefined>>,
  supabaseUrl: string | undefined
): boolean {
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_TARGET_ENV !== "production"
    && env.MOD_RELATION_TEST_WRITE_ENABLED === "true"
    && env.VERCEL_PROJECT_ID === TEST_PROJECT
    && env.VERCEL_GIT_COMMIT_REF === TEST_BRANCH
    && exactHttpsOrigin(env.NEXT_PUBLIC_SUPABASE_URL) === TEST_DB
    && exactHttpsOrigin(supabaseUrl) === TEST_DB;
}

export type DraftRelationInput = Readonly<{
  kind: ReviewedRelationKind;
  subjectModIdUuid: string;
  targetModIdUuid: string;
  evidenceRecordId: string;
  sourceUrl: string;
  checkedAt: string;
}>;
export type ApproveRelationInput = Readonly<{ relationId: string; confirm: true }>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: "invalid-input" };

function record(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : null;
}

function hasExactlyKeys(obj: Record<string, unknown>, keys: readonly string[]): boolean {
  const seen = Object.keys(obj);
  return seen.length === keys.length && seen.every(key => keys.includes(key));
}

function canonicalUUID(input: unknown): string | null {
  return typeof input === "string" && UUID.test(input) ? input.toLowerCase() : null;
}
function validDate(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const d = new Date(input + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === input;
}
function validSourceUrl(input: string): boolean {
  if (input !== input.trim() || input.length < 8 || input.length > 2000) return false;
  try {
    const url = new URL(input);
    return (url.protocol === "https:" || url.protocol === "http:")
      && !url.username && !url.password && url.hash === "";
  } catch { return false; }
}

export function parseRelationDraft(input: unknown): Parsed<DraftRelationInput> {
  const obj = record(input);
  if (!obj || !hasExactlyKeys(obj, [
    "kind", "subjectModIdUuid", "targetModIdUuid", "evidenceRecordId", "sourceUrl", "checkedAt"
  ])) return { ok: false, reason: "invalid-input" };
  const subject = canonicalUUID(obj.subjectModIdUuid);
  const target = canonicalUUID(obj.targetModIdUuid);
  const evidence = canonicalUUID(obj.evidenceRecordId);
  if (typeof obj.kind !== "string" || !RELATION_KINDS.includes(obj.kind)
    || !subject || !target || !evidence || subject === target
    || typeof obj.checkedAt !== "string" || !validDate(obj.checkedAt)
    || typeof obj.sourceUrl !== "string" || !validSourceUrl(obj.sourceUrl)) {
    return { ok: false, reason: "invalid-input" };
  }
  return { ok: true, value: {
    kind: obj.kind as ReviewedRelationKind,
    subjectModIdUuid: subject,
    targetModIdUuid: target,
    evidenceRecordId: evidence,
    sourceUrl: obj.sourceUrl,
    checkedAt: obj.checkedAt
  } };
}

export function parseRelationApproval(input: unknown): Parsed<ApproveRelationInput> {
  const obj = record(input);
  if (!obj || !hasExactlyKeys(obj, ["relationId","confirm"]) || obj.confirm !== true) {
    return { ok: false, reason: "invalid-input" };
  }
  const relationId = canonicalUUID(obj.relationId);
  return relationId
    ? { ok: true, value: { relationId, confirm: true } }
    : { ok: false, reason: "invalid-input" };
}
