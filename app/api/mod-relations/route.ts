import { NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { PRIVATE_NO_STORE_HEADERS, revalidateDomain } from "@/lib/data-sync";
import { isSameOriginRequest } from "@/lib/write-origin";
import {
  isTestRelationWriteAllowed, parseRelationDraft
} from "@/lib/mod-relation-review-input";
import { verifyOwnerRelationEvidence } from "@/lib/mod-relation-review-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function reply(data: unknown, status = 200) {
  return Response.json(data, {
    status, headers: PRIVATE_NO_STORE_HEADERS
  });
}

export async function GET() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "조회 권한이 없습니다." }, 403);

  const { data, error } = await access.supabase.from("mod_relations")
    .select("id,kind,subject_mod_id_entry_id,target_mod_id_entry_id,research_record_id,evidence_url,checked_at,approved,approved_at,created_at")
    .eq("owner_id", access.user.id)
    .order("created_at", { ascending: false })
    .limit(501);
  if (error || !data || data.length > 500) {
    return reply({ error: "모드 관계를 전부 조회할 수 없습니다." }, 503);
  }
  return reply({ relations: data });
}

/**
 * A submitted relation is ALWAYS an unapproved draft. The owner cannot set
 * approval fields through this API or via column-scoped Data API grants.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return reply({ error: "요청 출처가 올바르지 않습니다." }, 403);
  }
  if (!isTestRelationWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    return reply({ error: "시험 환경에서만 관계 초안을 저장할 수 있습니다." }, 403);
  }
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "등록 권한이 없습니다." }, 403);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return reply({ error: "입력 크기를 초과했습니다." }, 413);
    body = JSON.parse(raw) as unknown;
  } catch {
    return reply({ error: "JSON 형식이 올바르지 않습니다." }, 400);
  }
  const parsed = parseRelationDraft(body);
  if (!parsed.ok) return reply({ error: "관계 입력 또는 조사 근거가 올바르지 않습니다." }, 400);
  const value = parsed.value;

  const verified = await verifyOwnerRelationEvidence(access, value);
  if (!verified) return reply({ error: "본인 소유 모드와 승인된 조사 근거가 일치하지 않습니다." }, 422);

  const { data, error } = await access.supabase.from("mod_relations")
    .insert({
      owner_id: access.user.id,
      kind: value.kind,
      subject_mod_id_entry_id: value.subjectModIdUuid,
      target_mod_id_entry_id: value.targetModIdUuid,
      research_record_id: value.evidenceRecordId,
      evidence_url: value.sourceUrl,
      checked_at: value.checkedAt
      // approved and approved_at are intentionally omitted.
    })
    .select("id,approved,created_at")
    .single();

  if (error) {
    if (error.code === "23505") return reply({ error: "동일 관계가 이미 등록되었습니다." }, 409);
    if (error.code === "42501") return reply({ error: "이 관계를 저장할 권한이 없습니다." }, 403);
    return reply({ error: "관계 초안을 저장할 수 없습니다." }, 503);
  }
  if (!data || data.approved !== false) {
    return reply({ error: "관계의 미승인 상태를 검증하지 못했습니다." }, 503);
  }
  revalidateDomain("modRelation");
  return reply({ relationId: data.id, approved: false, createdAt: data.created_at }, 201);
}
