import { isSameOriginRequest } from "@/lib/write-origin";
import { NextRequest, NextResponse } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { canonicalWorkshopId } from "@/lib/workshop";
import { parseSteamWorkshopDetails } from "@/lib/steam-metadata";
import { classifySteamTags, type SuggestedCategories } from "@/lib/steam-category-rules";
import { attachPcModIdsToResearchRecords } from "@/lib/repo-workshop-audit";
import { readBoundedResponseText, ResponseTooLargeError } from "@/lib/response-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEAM_DETAILS_URL = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
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
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) return respond({ error: "요청 출처가 올바르지 않습니다." }, 403);
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
    const raw = await readBoundedResponseText(response, MAX_RESPONSE_BYTES);
    details = JSON.parse(raw);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) return respond({ error: "Steam 응답이 허용 크기를 초과했습니다." }, 502);
    return respond({ error: "Steam 연결에 실패했거나 시간이 초과됐습니다." }, 502);
  }

  const parsed = parseSteamWorkshopDetails(ids as string[], details, new Date().toISOString().slice(0, 10));
  if (parsed.errors.length > 0 && parsed.records.length === 0
    && parsed.errors[0] === "Steam 응답 형식을 확인할 수 없습니다.") {
    return respond({ error: parsed.errors[0] }, 502);
  }
  const records = attachPcModIdsToResearchRecords(parsed.records);
  const suggestedCategoriesByWorkshopId: Record<string, SuggestedCategories> = {};
  for (const [wid, tags] of Object.entries(parsed.tagsByWorkshopId)) {
    suggestedCategoriesByWorkshopId[wid] = classifySteamTags(tags);
  }
  return respond({
    ...parsed,
    records,
    suggestedCategoriesByWorkshopId,
    source: "steam-public-metadata",
    aiAnalyzed: false
  });
}
