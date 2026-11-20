import { isSameOriginRequest } from "@/lib/write-origin";
import { NextRequest, NextResponse } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { prepareResearchQueueBatch } from "@/lib/research-queue";
import { normalizeResearchRecord } from "@/lib/workshop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}

function writesAllowed(): boolean {
  // Keep all Preview deployments read-only until separate DB/RLS verification.
  return isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export async function GET(request: NextRequest) {
  const offsetText = request.nextUrl.searchParams.get("offset") ?? "0";
  if (!/^(0|[1-9][0-9]*)$/.test(offsetText)) return respond({ error: "페이지 위치가 올바르지 않습니다." }, 400);
  const offset = Number(offsetText);
  if (!Number.isSafeInteger(offset) || offset > 10000 || offset % 100 !== 0) {
    return respond({ error: "페이지 위치가 올바르지 않습니다." }, 400);
  }
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return respond({ error: "접근 권한이 없습니다." }, 403);

  const { data, error } = await access.supabase.from("research_queue")
    .select("id,workshop_id,source,payload,created_at,updated_at")
    .eq("owner_id", access.user.id)
    .eq("status", "pending")
    .order("updated_at", { ascending: false })
    .range(offset, offset + 100);

  if (error) return respond({ error: "영구 대기함을 읽지 못했습니다. DB 적용 상태를 확인해 주세요." }, 503);

  const errors: string[] = [];
  const nextOffset = (data ?? []).length > 100 ? offset + 100 : null;
  const records = (data ?? []).slice(0, 100).flatMap((item) => {
    const normalized = normalizeResearchRecord(item.payload);
    if (!normalized.record || normalized.record.workshopId !== item.workshop_id) {
      errors.push(`Workshop ID ${item.workshop_id}: 저장된 조사 데이터 형식 오류`);
      return [];
    }
    return [{
      id: item.id as string,
      source: item.source as string,
      record: normalized.record,
      createdAt: item.created_at as string,
      updatedAt: item.updated_at as string
    }];
  });
  if (records.length === 0) return respond({ records, errors, alreadyRegistered: 0, nextOffset });
  const { data: registered, error: registeredError } = await access.supabase.from("mods")
    .select("workshop_id")
    .eq("owner_id", access.user.id)
    .in("workshop_id", [...new Set(records.map(item => item.record.workshopId))]);
  if (registeredError) return respond({ error: "등록된 카탈로그를 확인하지 못했습니다." }, 500);
  const approvedIds = new Set((registered ?? []).map(item => item.workshop_id));
  return respond({
    records: records.filter(item => !approvedIds.has(item.record.workshopId)),
    alreadyRegistered: approvedIds.size,
    nextOffset,
    errors
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) return respond({ error: "요청 출처가 올바르지 않습니다." }, 403);
  if (!writesAllowed()) return respond({ error: "이 배포는 영구 대기함 쓰기가 차단되어 있습니다." }, 403);
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return respond({ error: "접근 권한이 없습니다." }, 403);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 200000) return respond({ error: "요청 크기를 초과했습니다." }, 413);
    body = JSON.parse(raw);
  } catch {
    return respond({ error: "올바른 JSON 형식이 아닙니다." }, 400);
  }

  const items = (body as { items?: unknown } | null)?.items;
  const validated = prepareResearchQueueBatch(items);
  if (!validated.items) return respond({ error: validated.error ?? "대기함 입력 오류" }, 400);

  const updatedAt = new Date().toISOString();
  const rows = validated.items.map((item) => ({
    ...item,
    owner_id: access.user.id,
    status: "pending",
    updated_at: updatedAt
  }));
  // Does not touch mods or call approve_research_record: catalog approval is separate.
  const { data, error } = await access.supabase.from("research_queue")
    .upsert(rows, { onConflict: "owner_id,workshop_id,source" })
    .select("id");
  if (error) return respond({ error: "영구 대기함 저장에 실패했습니다." }, 500);
  return respond({ saved: data?.length ?? 0 }, 201);
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) return respond({ error: "요청 출처가 올바르지 않습니다." }, 403);
  if (!writesAllowed()) return respond({ error: "이 배포는 영구 대기함 변경이 차단되어 있습니다." }, 403);
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return respond({ error: "접근 권한이 없습니다." }, 403);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 3000) return respond({ error: "요청 크기를 초과했습니다." }, 413);
    body = JSON.parse(raw);
  } catch {
    return respond({ error: "올바른 JSON 형식이 아닙니다." }, 400);
  }

  const ids = (body as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20
    || ids.some(id => typeof id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    || new Set(ids).size !== ids.length) {
    return respond({ error: "대기함 항목 ID는 1~20개이며 중복되지 않아야 합니다." }, 400);
  }

  // Soft dismissal: no database DELETE. UI must ask for confirmation first.
  const { data, error } = await access.supabase.from("research_queue")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("owner_id", access.user.id)
    .in("id", ids as string[])
    .eq("status", "pending")
    .select("id");
  if (error) return respond({ error: "대기함 항목 상태를 바꾸지 못했습니다." }, 500);
  return respond({ dismissed: data?.length ?? 0 });
}
