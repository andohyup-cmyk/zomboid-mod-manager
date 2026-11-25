import { NextResponse, type NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogModUuid } from "@/lib/catalog-read";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { parseModDetailPatchInput } from "@/lib/mod-detail-edit";
import { isSameOriginRequest } from "@/lib/write-origin";

const NO_STORE = { "Cache-Control": "private, no-store" };

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return reply({ error: "요청 출처가 올바르지 않습니다." }, 403);
  }
  if (!isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    && !isTestCategoryWriteAllowed(process.env)) {
    return reply({ error: "이 배포에서는 모드 상세 정보를 수정할 수 없습니다." }, 403);
  }

  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return reply({ error: "이 작업을 수행할 권한이 없습니다." }, 403);
  }

  const { id } = await context.params;
  if (!isCatalogModUuid(id)) {
    return reply({ error: "모드 식별자가 올바르지 않습니다." }, 400);
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 16_000) return reply({ error: "입력 크기를 초과했습니다." }, 413);
    raw = JSON.parse(text);
  } catch {
    return reply({ error: "JSON 형식을 확인해 주세요." }, 400);
  }

  const parsed = parseModDetailPatchInput(raw);
  if (!parsed.ok) return reply({ error: parsed.error }, 400);

  const { data, error } = await access.supabase
    .from("mods")
    .update({ ...parsed.patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", access.user.id)
    .select("id,description,verification_status,build_compatibility,multiplayer_compatibility,researched_at,is_archived,updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") {
      return reply({ error: "DB 수정 권한이 아직 적용되지 않았습니다. 시험 DB 마이그레이션 SQL을 적용해 주세요." }, 403);
    }
    return reply({ error: "모드 상세 수정에 실패했습니다." }, 500);
  }
  if (!data) {
    return reply({ error: "모드를 찾을 수 없습니다." }, 404);
  }

  return reply({ mod: data }, 200);
}
