import { isCatalogModUuid } from "./catalog-read";

/**
 * Read-only mutation preview logic for a future, separately approved server API.
 * Never trust a browser-supplied snapshot; fetch it with owner_id and RLS on the server.
 */
export type CatalogMutationSnapshot = Readonly<{
  id: string;
  title: string;
  description: string;
  isArchived: boolean;
  updatedAt: string;
}>;

export type CatalogMutationPatch = Readonly<{
  title?: string;
  description?: string;
  is_archived?: boolean;
}>;

export type CatalogMutationResult =
  | Readonly<{ ok: true; modId: string; expectedUpdatedAt: string; patch: CatalogMutationPatch }>
  | Readonly<{ ok: false; reason: "invalid" | "stale" | "unchanged"; message: string }>;

const COMMON_KEYS = ["action", "modId", "expectedUpdatedAt"] as const;
const EDIT_KEYS = ["title", "description"] as const;

function failure(reason: "invalid" | "stale" | "unchanged", message: string): CatalogMutationResult {
  return { ok: false, reason, message };
}

function objectInput(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input);
}

/**
 * Plan only metadata edits and archive state transitions.
 *
 * Workshop ID, owner ID, real game Mod IDs, source research records, and profile selections
 * are intentionally not writable through this validator.
 * A future server handler must additionally enforce same-origin auth, allowlist, RLS,
 * owner_id, and an atomic updated_at compare-and-set before executing a patch.
 */
export function planCatalogMutation(
  input: unknown,
  snapshot: CatalogMutationSnapshot
): CatalogMutationResult {
  if (!objectInput(input)) return failure("invalid", "변경 요청 형식이 올바르지 않습니다.");
  const action = input.action;
  if (action !== "edit_metadata" && action !== "archive" && action !== "restore") {
    return failure("invalid", "지원하지 않는 변경 작업입니다.");
  }
  const allowedKeys: readonly string[] = action === "edit_metadata"
    ? [...COMMON_KEYS, ...EDIT_KEYS]
    : [...COMMON_KEYS];
  if (Object.keys(input).some(key => !allowedKeys.includes(key))) {
    return failure("invalid", "수정할 수 없는 필드가 포함되어 있습니다.");
  }
  if (typeof input.modId !== "string" || !isCatalogModUuid(input.modId) ||
      input.modId.toLowerCase() !== snapshot.id.toLowerCase()) {
    return failure("invalid", "모드 식별자가 올바르지 않습니다.");
  }
  if (typeof input.expectedUpdatedAt !== "string" || !input.expectedUpdatedAt) {
    return failure("invalid", "마지막 변경 시점이 필요합니다.");
  }
  if (input.expectedUpdatedAt !== snapshot.updatedAt) {
    return failure("stale", "다른 변경이 먼저 반영되었습니다. 최신 내용을 다시 불러와 주세요.");
  }

  if (action === "archive") {
    return snapshot.isArchived
      ? failure("unchanged", "이미 보관된 모드입니다.")
      : { ok: true, modId: snapshot.id, expectedUpdatedAt: snapshot.updatedAt, patch: { is_archived: true } };
  }
  if (action === "restore") {
    return !snapshot.isArchived
      ? failure("unchanged", "이미 사용 중인 모드입니다.")
      : { ok: true, modId: snapshot.id, expectedUpdatedAt: snapshot.updatedAt, patch: { is_archived: false } };
  }

  const patch: { title?: string; description?: string } = {};
  if ("title" in input) {
    if (typeof input.title !== "string") return failure("invalid", "모드 이름은 문자열이어야 합니다.");
    const title = input.title.trim();
    if (!title || title.length > 200 || title.includes("\u0000")) {
      return failure("invalid", "모드 이름은 1~200자여야 합니다.");
    }
    if (title !== snapshot.title) patch.title = title;
  }
  if ("description" in input) {
    if (typeof input.description !== "string") return failure("invalid", "설명은 문자열이어야 합니다.");
    const description = input.description.trim();
    if (description.length > 4000 || description.includes("\u0000")) {
      return failure("invalid", "모드 설명은 최대 4000자여야 합니다.");
    }
    if (description !== snapshot.description) patch.description = description;
  }
  if (Object.keys(patch).length === 0) {
    return failure("unchanged", "변경할 내용이 없습니다.");
  }
  return { ok: true, modId: snapshot.id, expectedUpdatedAt: snapshot.updatedAt, patch };
}
