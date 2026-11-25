import { NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { PRIVATE_NO_STORE_HEADERS, revalidateDomain } from "@/lib/data-sync";
import { readBoundedResponseText, ResponseTooLargeError } from "@/lib/response-limit";
import { parseSteamWorkshopDetails } from "@/lib/steam-metadata";
import { isSameOriginRequest } from "@/lib/write-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEAM_DETAILS_URL = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
const STEAM_BATCH_SIZE = 50;
const MAX_RESPONSE_BYTES = 2_000_000;

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

function isWriteEnabled(): boolean {
  return isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isTestCategoryWriteAllowed(process.env);
}

/**
 * Refreshes ONLY `steam_updated_at` for all active owner mods from Steam public API.
 * Never overwrites `description` or `short_description` so curated descriptions stay intact.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return reply({ error: "요청 출처가 올바르지 않습니다." }, 403);
  }
  if (!isWriteEnabled()) {
    return reply({ error: "이 배포에서는 업데이트 날짜를 갱신할 수 없습니다." }, 403);
  }
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") {
    return reply({ error: "갱신 권한이 없습니다." }, 403);
  }

  const modsRes = await access.supabase
    .from("mods")
    .select("id,workshop_id,steam_updated_at")
    .eq("owner_id", access.user.id)
    .eq("is_archived", false)
    .limit(300);

  if (modsRes.error) {
    if (modsRes.error.code === "42703") {
      return reply({ error: "DB에 steam_updated_at 컬럼이 아직 없습니다. 시험 DB 마이그레이션 SQL을 먼저 실행해 주세요." }, 400);
    }
    return reply({ error: "등록된 모드 목록을 불러오지 못했습니다." }, 503);
  }

  const activeMods = (modsRes.data ?? []) as { id: string; workshop_id: string; steam_updated_at: string | null }[];
  if (activeMods.length === 0) {
    return reply({ total: 0, updated: 0, unchanged: 0, failed: 0 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const updatedByWorkshop = new Map<string, string>();
  const uniqueWorkshops = [...new Set(activeMods.map((mod) => mod.workshop_id))];

  for (let i = 0; i < uniqueWorkshops.length; i += STEAM_BATCH_SIZE) {
    const chunk = uniqueWorkshops.slice(i, i + STEAM_BATCH_SIZE);
    const form = new URLSearchParams({ itemcount: String(chunk.length) });
    chunk.forEach((wid, idx) => form.set(`publishedfileids[${idx}]`, wid));
    try {
      const response = await fetch(STEAM_DETAILS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000)
      });
      if (!response.ok) continue;
      const raw = await readBoundedResponseText(response, MAX_RESPONSE_BYTES);
      const parsed = parseSteamWorkshopDetails(chunk, JSON.parse(raw) as unknown, today);
      for (const [wid, iso] of Object.entries(parsed.steamUpdatedAtByWorkshopId)) {
        if (iso) updatedByWorkshop.set(wid, iso);
      }
    } catch (error) {
      if (error instanceof ResponseTooLargeError) {
        return reply({ error: "Steam 응답이 허용 크기를 초과했습니다." }, 502);
      }
    }
  }

  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let permissionError = false;

  const toUpdate: { id: string; nextIso: string }[] = [];
  for (const mod of activeMods) {
    const nextIso = updatedByWorkshop.get(mod.workshop_id);
    if (!nextIso) {
      failed += 1;
      continue;
    }
    const prevMs = mod.steam_updated_at ? Date.parse(mod.steam_updated_at) : NaN;
    const nextMs = Date.parse(nextIso);
    if (Number.isFinite(prevMs) && prevMs === nextMs) {
      unchanged += 1;
      continue;
    }
    toUpdate.push({ id: mod.id, nextIso });
  }

  // Update in small parallel batches to stay fast on mobile without overloading Supabase.
  const DB_CONCURRENCY = 10;
  for (let i = 0; i < toUpdate.length; i += DB_CONCURRENCY) {
    const slice = toUpdate.slice(i, i + DB_CONCURRENCY);
    const results = await Promise.all(
      slice.map(({ id, nextIso }) =>
        access.supabase
          .from("mods")
          .update({ steam_updated_at: nextIso })
          .eq("id", id)
          .eq("owner_id", access.user.id)
      )
    );
    for (const res of results) {
      if (res.error) {
        if (res.error.code === "42501") permissionError = true;
        failed += 1;
      } else {
        updated += 1;
      }
    }
  }

  if (permissionError && updated === 0) {
    return reply({ error: "DB 업데이트 날짜 수정 권한이 아직 없습니다. 시험 DB 마이그레이션 SQL을 실행해 주세요." }, 403);
  }

  if (updated > 0) {
    revalidateDomain("mod");
  }

  return reply({
    total: activeMods.length,
    updated,
    unchanged,
    failed
  });
}
