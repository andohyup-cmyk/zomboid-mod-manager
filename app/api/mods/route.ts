import { isSameOriginRequest } from "@/lib/write-origin";
import { NextResponse, type NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { PRIVATE_NO_STORE_HEADERS, revalidateDomain } from "@/lib/data-sync";
import { normalizeResearchRecord } from "@/lib/workshop";

export const dynamic = "force-dynamic";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return reply({ error: "요청 출처가 올바르지 않습니다." }, 403);
  }
  if (!isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    && !isTestCategoryWriteAllowed(process.env)) {
    return reply({ error: "이 배포에서는 모드 등록을 저장할 수 없습니다." }, 403);
  }

  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return reply({ error: "이 작업을 수행할 권한이 없습니다." }, 403);
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 32000) return reply({ error: "입력 크기를 초과했습니다." }, 413);
    raw = JSON.parse(text);
  } catch {
    return reply({ error: "JSON 형식을 확인해 주세요." }, 400);
  }

  const parsed = normalizeResearchRecord(raw);
  if (parsed.error) return reply({ error: parsed.error }, 400);

  // The SQL function performs one atomic transaction, with ownership and RLS checks.
  const { data, error } = await access.supabase.rpc("approve_research_record", {
    p_payload: parsed.record
  });

  if (error) {
    if (error.code === "23505") {
      return reply({ error: "이미 등록된 Workshop ID입니다." }, 409);
    }
    return reply({ error: "데이터 저장에 실패했습니다. 데이터베이스 설정을 확인하세요." }, 500);
  }
  revalidateDomain("mod", typeof data === "string" ? { modIds: [data] } : undefined);
  return reply({ id: data }, 201);
}
