import { NextRequest, NextResponse } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { parseProfileCreateInput } from "@/lib/profile-name";
import { isTestProfileSnapshotWriteAllowed } from "@/lib/profile-snapshot-write";
import { isSameOriginRequest } from "@/lib/write-origin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

function isProfileWriteAllowed() {
  return isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isTestProfileSnapshotWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isTestCategoryWriteAllowed(process.env);
}

export async function GET() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return reply({ error: "이 작업을 수행할 권한이 없습니다." }, 403);
  }
  const { data, error } = await access.supabase
    .from("profiles")
    .select("id,name,created_at")
    .eq("owner_id", access.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return reply({ error: "프로필 목록을 불러오지 못했습니다." }, 503);
  return reply({ profiles: data ?? [] }, 200);
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return reply({ error: "요청 출처가 올바르지 않습니다." }, 403);
  }
  if (!isProfileWriteAllowed()) {
    return reply({ error: "이 배포에서는 서버 프로필을 생성할 수 없습니다." }, 403);
  }
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return reply({ error: "프로필 생성 권한이 없습니다." }, 403);
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 2_000) return reply({ error: "입력 크기를 초과했습니다." }, 413);
    raw = JSON.parse(text) as unknown;
  } catch {
    return reply({ error: "JSON 입력 형식이 올바르지 않습니다." }, 400);
  }

  const parsed = parseProfileCreateInput(raw);
  if (!parsed) {
    return reply({ error: "프로필 이름은 1~120자 이내로 입력해 주세요." }, 400);
  }

  const { data, error } = await access.supabase
    .from("profiles")
    .insert({ owner_id: access.user.id, name: parsed.name })
    .select("id,name,created_at")
    .single();

  if (error || !data) {
    return reply({ error: "프로필 생성에 실패했습니다." }, 500);
  }

  return reply({ profile: data }, 201);
}
