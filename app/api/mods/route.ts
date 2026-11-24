import { isSameOriginRequest } from "@/lib/write-origin";
import { NextResponse, type NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { normalizeResearchRecord } from "@/lib/workshop";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ error: "요청 출처가 올바르지 않습니다." }, { status: 403 });
  }
  if (!isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    && !isTestCategoryWriteAllowed(process.env)) {
    return NextResponse.json(
      { error: "이 배포에서는 모드 등록을 저장할 수 없습니다." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return NextResponse.json({ error: "이 작업을 수행할 권한이 없습니다." }, { status: 403 });
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 32000) return NextResponse.json({ error: "입력 크기를 초과했습니다." }, { status: 413 });
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "JSON 형식을 확인해 주세요." }, { status: 400 });
  }

  const parsed = normalizeResearchRecord(raw);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // The SQL function performs one atomic transaction, with ownership and RLS checks.
  const { data, error } = await access.supabase.rpc("approve_research_record", {
    p_payload: parsed.record
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "이미 등록된 Workshop ID입니다." }, { status: 409 });
    }
    return NextResponse.json({ error: "데이터 저장에 실패했습니다. 데이터베이스 설정을 확인하세요." }, { status: 500 });
  }
  return NextResponse.json({ id: data }, { status: 201 });
}
