import { NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/write-origin";
import { isTestRelationWriteAllowed, parseRelationApproval } from "@/lib/mod-relation-review-input";
import { verifyOwnerRelationEvidence } from "@/lib/mod-relation-review-server";
import type { DraftRelationInput } from "@/lib/mod-relation-review-input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function reply(data: unknown, status = 200) {
  return Response.json(data, {
    status, headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}

/**
 * Approval is a separate explicit POST: no auto-approval on draft creation,
 * GET, research import, page visit or automated code execution.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return reply({ error: "요청 출처가 올바르지 않습니다." }, 403);
  }
  if (!isTestRelationWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    return reply({ error: "시험 환경에서만 관계 승인을 저장할 수 있습니다." }, 403);
  }
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "승인 권한이 없습니다." }, 403);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return reply({ error: "입력 크기를 초과했습니다." }, 413);
    body = JSON.parse(raw) as unknown;
  } catch {
    return reply({ error: "JSON 형식이 올바르지 않습니다." }, 400);
  }
  const parsed = parseRelationApproval(body);
  if (!parsed.ok) {
    return reply({ error: "명시적인 승인 확인과 관계 ID가 필요합니다." }, 400);
  }
  const { relationId } = parsed.value;

  const { data: stored, error: findError } = await access.supabase.from("mod_relations")
    .select("id,owner_id,kind,subject_mod_id_entry_id,target_mod_id_entry_id,research_record_id,evidence_url,checked_at,approved")
    .eq("id", relationId)
    .eq("owner_id", access.user.id)
    .maybeSingle();
  if (findError) return reply({ error: "승인 대상을 읽을 수 없습니다." }, 503);
  if (!stored) return reply({ error: "해당 관계를 찾을 수 없습니다." }, 404);
  if (stored.approved) return reply({ error: "이미 승인된 관계입니다." }, 409);

  const draft: DraftRelationInput = {
    kind: stored.kind as DraftRelationInput["kind"],
    subjectModIdUuid: stored.subject_mod_id_entry_id,
    targetModIdUuid: stored.target_mod_id_entry_id,
    evidenceRecordId: stored.research_record_id,
    sourceUrl: stored.evidence_url,
    checkedAt: stored.checked_at
  };
  if (!await verifyOwnerRelationEvidence(access, draft)) {
    return reply({ error: "승인 전에 모드 소유권과 근거를 재검토해야 합니다." }, 422);
  }

  const { data: approved, error: updateError } = await access.supabase.from("mod_relations")
    .update({ approved: true, approved_at: new Date().toISOString() })
    .eq("id", relationId)
    .eq("owner_id", access.user.id)
    .eq("approved", false)
    .select("id,approved,approved_at")
    .maybeSingle();

  if (updateError) {
    if (updateError.code === "42501") return reply({ error: "해당 관계를 승인할 권한이 없습니다." }, 403);
    return reply({ error: "관계를 승인할 수 없습니다." }, 503);
  }
  if (!approved || !approved.approved) {
    return reply({ error: "다른 요청에서 승인 상태가 먼저 변경되었습니다." }, 409);
  }
  return reply({ relationId: approved.id, approved: true, approvedAt: approved.approved_at });
}
