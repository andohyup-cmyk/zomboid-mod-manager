import { NextRequest, NextResponse } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { canonicalWorkshopId, normalizeResearchRecord } from "@/lib/workshop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEAM_DETAILS_URL = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
const PROJECT_ZOMBOID_APP_ID = 108600;
const MAX_IDS = 5;
const MAX_RESPONSE_BYTES = 1_000_000;

function respond(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}

// Steam's public metadata is not an AI compatibility assessment.
// No catalog or database writes occur in this route.
export async function POST(request: NextRequest) {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return respond({ error: "이 작업을 수행할 권한이 없습니다." }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "올바른 JSON 요청이 아닙니다." }, 400);
  }
  const rawIds = (body as { workshopIds?: unknown } | null)?.workshopIds;
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > MAX_IDS) {
    return respond({ error: "Workshop ID는 한 번에 1~5개 입력해 주세요." }, 400);
  }
  const ids = rawIds.map(id => canonicalWorkshopId(id));
  if (ids.some(id => id === null) || new Set(ids).size !== ids.length) {
    return respond({ error: "유효하지 않거나 중복된 Workshop ID가 있습니다." }, 400);
  }

  const form = new URLSearchParams({ itemcount: String(ids.length) });
  ids.forEach((id, index) => form.set(`publishedfileids[${index}]`, id!));
  let details: unknown;
  try {
    const response = await fetch(STEAM_DETAILS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      return respond({ error: "Steam 조회에 실패했습니다. 잠시 후 다시 시도해 주세요." }, 502);
    }
    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_BYTES) {
      return respond({ error: "Steam 응답이 허용 크기를 초과했습니다." }, 502);
    }
    details = JSON.parse(raw);
  } catch {
    return respond({ error: "Steam 연결에 실패했거나 시간이 초과됐습니다." }, 502);
  }

  const payload = details as { response?: { publishedfiledetails?: unknown } } | null;
  const items = payload?.response?.publishedfiledetails;
  if (!Array.isArray(items)) {
    return respond({ error: "Steam 응답 형식을 확인할 수 없습니다." }, 502);
  }

  const records = [];
  const errors: string[] = [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const detail = item as Record<string, unknown>;
      if (typeof detail.publishedfileid === "string") byId.set(detail.publishedfileid, detail);
    }
  }
  for (const id of ids as string[]) {
    const detail = byId.get(id);
    if (!detail || detail.result !== 1) {
      errors.push(`Workshop ID ${id}: 공개 정보를 조회하지 못했습니다.`);
      continue;
    }
    if (Number(detail.consumer_app_id) !== PROJECT_ZOMBOID_APP_ID) {
      errors.push(`Workshop ID ${id}: Project Zomboid 항목이 아닙니다.`);
      continue;
    }
    const record = normalizeResearchRecord({
      workshopId: id,
      title: detail.title,
      description: typeof detail.description === "string" ? detail.description.slice(0, 4000) : "",
      modIds: [],
      sourceUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
      sources: [`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`],
      checkedAt: new Date().toISOString().slice(0, 10),
      verificationStatus: "unverified",
      buildCompatibility: "unverified",
      multiplayerCompatibility: "unverified"
    });
    if (record.record) records.push(record.record);
    else errors.push(`Workshop ID ${id}: ${record.error}`);
  }
  return respond({ records, errors, source: "steam-public-metadata", aiAnalyzed: false });
}
