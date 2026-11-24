import { NextResponse, type NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import {
  parseBulkModIdBackfillInput,
  parseModIdAddInput,
  parseModIdDeleteInput
} from "@/lib/mod-detail-edit";
import { isSameOriginRequest } from "@/lib/write-origin";

const NO_STORE = { "Cache-Control": "private, no-store" };

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function isWriteEnabled() {
  return isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isTestCategoryWriteAllowed(process.env);
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return reply({ error: "요청 출처가 올바르지 않습니다." }, 403);
  }
  if (!isWriteEnabled()) {
    return reply({ error: "이 배포에서는 Mod ID를 저장할 수 없습니다." }, 403);
  }
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return reply({ error: "이 작업을 수행할 권한이 없습니다." }, 403);
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 200_000) return reply({ error: "요청 크기가 너무 큽니다." }, 413);
    raw = JSON.parse(text);
  } catch {
    return reply({ error: "JSON 형식을 확인해 주세요." }, 400);
  }

  const single = parseModIdAddInput(raw);
  const bulk = single ? { items: [single] } : parseBulkModIdBackfillInput(raw);
  if (!bulk) {
    return reply({ error: "유효한 모드 ID와 Mod ID 목록을 입력해 주세요." }, 400);
  }

  const targetModIds = bulk.items.map(item => item.modId);
  const { data: ownedMods, error: ownedError } = await access.supabase
    .from("mods")
    .select("id")
    .eq("owner_id", access.user.id)
    .in("id", targetModIds);
  if (ownedError) return reply({ error: "모드 소유권 확인에 실패했습니다." }, 500);

  const ownedSet = new Set((ownedMods ?? []).map(row => row.id as string));
  if (ownedSet.size !== targetModIds.length) {
    return reply({ error: "존재하지 않거나 접근할 수 없는 모드가 포함되어 있습니다." }, 404);
  }

  const { data: existingRows, error: existingError } = await access.supabase
    .from("mod_ids")
    .select("mod_id,value")
    .in("mod_id", targetModIds);
  if (existingError) return reply({ error: "기존 Mod ID 조회에 실패했습니다." }, 500);

  const existingByMod = new Map<string, Set<string>>();
  for (const row of existingRows ?? []) {
    const modId = row.mod_id as string;
    const set = existingByMod.get(modId) ?? new Set<string>();
    set.add(row.value as string);
    existingByMod.set(modId, set);
  }

  const rowsToInsert: { mod_id: string; value: string }[] = [];
  let skippedCount = 0;
  for (const item of bulk.items) {
    const existing = existingByMod.get(item.modId) ?? new Set<string>();
    for (const value of item.values) {
      if (existing.has(value)) {
        skippedCount += 1;
      } else {
        rowsToInsert.push({ mod_id: item.modId, value });
        existing.add(value);
      }
    }
  }

  if (rowsToInsert.length === 0) {
    return reply({ addedCount: 0, skippedCount, added: [] }, 200);
  }

  const { data: inserted, error: insertError } = await access.supabase
    .from("mod_ids")
    .insert(rowsToInsert)
    .select("id,mod_id,value");

  if (insertError) {
    if (insertError.code === "23505") {
      return reply({ error: "이미 등록된 Mod ID가 포함되어 있습니다. 새로고침 후 다시 시도해 주세요." }, 409);
    }
    return reply({ error: "Mod ID 저장에 실패했습니다." }, 500);
  }

  return reply({
    addedCount: inserted?.length ?? rowsToInsert.length,
    skippedCount,
    added: (inserted ?? []).map(row => ({
      id: row.id as string,
      modId: row.mod_id as string,
      value: row.value as string
    }))
  }, 201);
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return reply({ error: "요청 출처가 올바르지 않습니다." }, 403);
  }
  if (!isWriteEnabled()) {
    return reply({ error: "이 배포에서는 Mod ID를 삭제할 수 없습니다." }, 403);
  }
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return reply({ error: "이 작업을 수행할 권한이 없습니다." }, 403);
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 4_000) return reply({ error: "요청 크기가 너무 큽니다." }, 413);
    raw = JSON.parse(text);
  } catch {
    return reply({ error: "JSON 형식을 확인해 주세요." }, 400);
  }

  const parsed = parseModIdDeleteInput(raw);
  if (!parsed) return reply({ error: "삭제 대상 식별자가 올바르지 않습니다." }, 400);

  const { data: owned, error: ownedError } = await access.supabase
    .from("mods")
    .select("id")
    .eq("id", parsed.modId)
    .eq("owner_id", access.user.id)
    .maybeSingle();
  if (ownedError) return reply({ error: "모드 소유권 확인에 실패했습니다." }, 500);
  if (!owned) return reply({ error: "모드를 찾을 수 없습니다." }, 404);

  const { data: deleted, error: deleteError } = await access.supabase
    .from("mod_ids")
    .delete()
    .eq("id", parsed.modIdEntryId)
    .eq("mod_id", parsed.modId)
    .select("id");

  if (deleteError) {
    if (deleteError.code === "23503") {
      return reply({ error: "이 Mod ID는 저장된 서버 프로필이나 관계 기록에서 사용 중이라 삭제할 수 없습니다." }, 409);
    }
    if (deleteError.code === "42501") {
      return reply({ error: "DB 삭제 권한이 아직 적용되지 않았습니다. 시험 DB 마이그레이션 SQL을 적용해 주세요." }, 403);
    }
    return reply({ error: "Mod ID 삭제에 실패했습니다." }, 500);
  }
  if (!deleted || deleted.length === 0) {
    return reply({ error: "삭제할 Mod ID를 찾지 못했습니다." }, 404);
  }

  return reply({ deletedId: parsed.modIdEntryId }, 200);
}
