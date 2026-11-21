import { NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogModUuid } from "@/lib/catalog-read";
import { planProfileSave } from "@/lib/profile-persistence-plan";
import {
  isTestProfileSnapshotWriteAllowed,
  profileSnapshotErrorStatus,
  toAtomicProfileRpcPayload
} from "@/lib/profile-snapshot-write";
import { isSameOriginRequest } from "@/lib/write-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const MAX_REQUEST_CHARS = 180000;

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}

/**
 * Test-only POST. Deliberately not connected to a button or the production
 * app. The Supabase RPC is the final atomic owner-scoped CAS enforcement.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return reply({ error: "요청 출처가 올바르지 않습니다." }, 403);
  }
  if (!isTestProfileSnapshotWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    return reply({ error: "이 배포에서는 프로필 DB 저장이 차단되어 있습니다." }, 403);
  }

  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "저장 권한이 없습니다." }, 403);

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_REQUEST_CHARS) return reply({ error: "프로필 입력 크기를 초과했습니다." }, 413);
    raw = JSON.parse(text) as unknown;
  } catch {
    return reply({ error: "JSON 입력 형식이 올바르지 않습니다." }, 400);
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return reply({ error: "프로필 저장 형식이 올바르지 않습니다." }, 400);
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.profileId !== "string" || !isCatalogModUuid(body.profileId)
    || typeof body.expectedRevision !== "number"
    || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0
    || body.expectedRevision > 2147483647
    || !Array.isArray(body.selections) || body.selections.length > 500
    || !Array.isArray(body.downloadOnlyWorkshopIds) || body.downloadOnlyWorkshopIds.length > 500) {
    return reply({ error: "프로필 선택 또는 식별자가 올바르지 않습니다." }, 400);
  }

  const { data: profile, error: profileError } = await access.supabase.from("profiles")
    .select("id,owner_id")
    .eq("id", body.profileId)
    .eq("owner_id", access.user.id)
    .maybeSingle();
  if (profileError) return reply({ error: "프로필 조회에 실패했습니다." }, 503);
  if (!profile) return reply({ error: "본인 소유 프로필을 찾지 못했습니다." }, 404);

  const { data: latest, error: revisionError } = await access.supabase.from("profile_revision")
    .select("revision")
    .eq("owner_id", access.user.id)
    .eq("profile_id", profile.id)
    .order("revision", { ascending: false })
    .limit(1);
  if (revisionError) return reply({ error: "프로필 수정 회차를 조회할 수 없습니다." }, 503);
  const revision = latest?.[0]?.revision ?? 0;

  // Lookup candidates only from the authenticated owner's catalog.
  const rows = body.selections as unknown[];
  if (rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
    return reply({ error: "선택 항목 형식이 올바르지 않습니다." }, 400);
  }
  const requested = rows as Record<string, unknown>[];
  if (requested.some(row =>
    typeof row.workshopId !== "string" || row.workshopId.length > 20
    || typeof row.modId !== "string" || row.modId.length > 200)) {
    return reply({ error: "Workshop ID와 Mod ID 형식이 올바르지 않습니다." }, 400);
  }
  const workshopIds = [...new Set(requested.map(row => row.workshopId as string))];
  const modValues = [...new Set(requested.map(row => row.modId as string))];

  const candidates: { entryId: string; ownerId: string; workshopId: string; modId: string }[] = [];
  if (workshopIds.length) {
    const { data: parents, error: parentError } = await access.supabase.from("mods")
      .select("id,owner_id,workshop_id")
      .eq("owner_id", access.user.id)
      .in("workshop_id", workshopIds)
      .limit(501);
    if (parentError || !parents || parents.length > 500) {
      return reply({ error: "카탈로그 모드를 확인하지 못했습니다." }, 503);
    }
    const workshopByParentId = new Map(parents.map(parent => [parent.id, parent.workshop_id]));
    if (parents.length) {
      const { data: entries, error: modError } = await access.supabase.from("mod_ids")
        .select("id,mod_id,value")
        .in("mod_id", parents.map(parent => parent.id))
        .in("value", modValues)
        .limit(1001);
      if (modError || !entries || entries.length > 1000) {
        return reply({ error: "개별 Mod ID 확인에 실패했습니다." }, 503);
      }
      for (const item of entries) {
        const workshopId = workshopByParentId.get(item.mod_id);
        if (workshopId) candidates.push({
          entryId: item.id, ownerId: access.user.id,
          workshopId, modId: item.value
        });
      }
    }
  }

  const planned = planProfileSave(raw, {
    signedInOwnerId: access.user.id,
    profile: { id: profile.id, ownerId: profile.owner_id, revision },
    candidates
  });
  if (!planned.ok) {
    const status = planned.reason === "stale" ? 409
      : planned.reason === "forbidden" ? 403
      : planned.reason === "unresolved" ? 422 : 400;
    return reply({ error: planned.reason }, status);
  }
  const rpcData = toAtomicProfileRpcPayload(planned);
  const { data: savedRevision, error: saveError } = await access.supabase.rpc("save_profile_snapshot", {
    p_profile_id: profile.id,
    ...rpcData
  });
  if (saveError) return reply({ error: saveError.code === "PZ001"
    ? "다른 기기에서 프로필을 먼저 저장했습니다. 최신 내용을 다시 불러와 주세요."
    : "프로필 저장에 실패했습니다.", code: saveError.code },
    profileSnapshotErrorStatus(saveError.code));

  return reply({ profileId: profile.id, revision: savedRevision }, 201);
}
