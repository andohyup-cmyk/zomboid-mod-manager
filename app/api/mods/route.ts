import { NextResponse, type NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { normalizeResearchRecord } from "@/lib/workshop";
import { isReadOnlyDeployment } from "@/lib/deployment-safety";

export async function POST(request: NextRequest) {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return NextResponse.json({ error: "이 작업을 수행할 권한이 없습니다." }, { status: 403 });
  }

  // Preview deployments may point to the production Supabase project.
  // Do not save until database isolation has been explicitly verified.
  if (isReadOnlyDeployment(process.env.VERCEL_ENV)) {
    return NextResponse.json(
      { error: "시험 앱은 데이터 보호를 위해 읽기 전용입니다. 기존 모드 등록은 운영 앱에서만 가능합니다." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
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
