import { NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/write-origin";
import {
  isTestCategoryWriteAllowed,
  parseCategoryCreate,
  parseCategoryDelete,
  parseCategoryUpdate
} from "@/lib/category-persistence-input";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function GET() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "조회 권한이 없습니다." }, 403);
  const { data, error } = await access.supabase.from("categories")
    .select("id,name,sort_order").eq("owner_id", access.user.id)
    .order("sort_order", { ascending: true }).order("name", { ascending: true }).limit(501);
  if (error || !data || data.length > 500) return reply({ error: "카테고리를 조회하지 못했습니다." }, 503);
  return reply({ categories: data });
}
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))
    || !isTestCategoryWriteAllowed(process.env)) return reply({ error: "이 배포에서 등록할 수 없습니다." }, 403);
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "등록 권한이 없습니다." }, 403);
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return reply({ error: "입력 크기 초과" }, 413);
    body = JSON.parse(raw);
  } catch { return reply({ error: "잘못된 JSON" }, 400); }
  const value = parseCategoryCreate(body);
  if (!value) return reply({ error: "카테고리 이름이 올바르지 않습니다." }, 400);
  const { data, error } = await access.supabase.from("categories")
    .insert({ owner_id: access.user.id, name: value.name }).select("id,name,sort_order").single();
  if (error) return reply({ error: error.code === "23505" ? "이미 존재하는 카테고리입니다." : "카테고리를 저장할 수 없습니다." }, error.code === "23505" ? 409 : 503);
  return reply({ category: data }, 201);
}
export async function PATCH(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))
    || !isTestCategoryWriteAllowed(process.env)) return reply({ error: "이 배포에서 수정할 수 없습니다." }, 403);
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "수정 권한이 없습니다." }, 403);
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return reply({ error: "입력 크기 초과" }, 413);
    body = JSON.parse(raw);
  } catch { return reply({ error: "잘못된 JSON" }, 400); }
  const value = parseCategoryUpdate(body);
  if (!value) return reply({ error: "카테고리 ID와 이름을 확인하세요." }, 400);
  const { data, error } = await access.supabase.from("categories")
    .update({ name: value.name }).eq("id", value.id).eq("owner_id", access.user.id)
    .select("id,name,sort_order").maybeSingle();
  if (error) return reply({ error: error.code === "23505" ? "이미 존재하는 카테고리 이름입니다." : "카테고리를 수정할 수 없습니다." }, error.code === "23505" ? 409 : 503);
  if (!data) return reply({ error: "본인 소유 카테고리가 없습니다." }, 404);
  return reply({ category: data });
}
export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))
    || !isTestCategoryWriteAllowed(process.env)) return reply({ error: "이 배포에서 삭제할 수 없습니다." }, 403);
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "삭제 권한이 없습니다." }, 403);
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 512) return reply({ error: "입력 크기 초과" }, 413);
    body = JSON.parse(raw);
  } catch { return reply({ error: "잘못된 JSON" }, 400); }
  const value = parseCategoryDelete(body);
  if (!value) return reply({ error: "카테고리 ID가 올바르지 않습니다." }, 400);
  const { error } = await access.supabase.rpc("delete_category", { p_category_id: value.id });
  if (error) {
    if (error.code === "42501") return reply({ error: "카테고리에 접근할 수 없습니다." }, 403);
    if (error.code === "P0002") return reply({ error: "본인 소유 카테고리가 없습니다." }, 404);
    return reply({ error: "카테고리를 삭제할 수 없습니다." }, 503);
  }
  return reply({ deleted: true, id: value.id });
}
