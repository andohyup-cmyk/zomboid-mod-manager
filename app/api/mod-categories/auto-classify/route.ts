import { NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { PRIVATE_NO_STORE_HEADERS, revalidateDomain } from "@/lib/data-sync";
import { readBoundedResponseText, ResponseTooLargeError } from "@/lib/response-limit";
import {
  classifySteamTags,
  getCategoryPresetSortOrder,
  parseAutoClassifyApplyInput
} from "@/lib/steam-category-rules";
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
  return isTestCategoryWriteAllowed(process.env)
    || isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * Read-only preview: fetches Steam public tags for owner's active mods and maps
 * them to the 9 in-game load-order categories without writing to the database.
 */
export async function GET(request: NextRequest) {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "조회 권한이 없습니다." }, 403);

  const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "unclassified";

  const [modsRes, categoriesRes, primaryRes] = await Promise.all([
    access.supabase.from("mods")
      .select("id,title,workshop_id")
      .eq("owner_id", access.user.id)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(300),
    access.supabase.from("categories")
      .select("id,name,sort_order")
      .eq("owner_id", access.user.id)
      .limit(500),
    access.supabase.from("mod_category_primary")
      .select("mod_id")
      .eq("owner_id", access.user.id)
      .limit(1000)
  ]);

  if (modsRes.error || categoriesRes.error || primaryRes.error) {
    return reply({ error: "카탈로그 또는 카테고리 정보를 불러오지 못했습니다." }, 503);
  }

  const classifiedSet = new Set((primaryRes.data ?? []).map((row) => row.mod_id as string));
  const existingCategoryNames = new Set((categoriesRes.data ?? []).map((row) => row.name as string));

  const activeMods = (modsRes.data ?? []) as { id: string; title: string; workshop_id: string }[];
  const targets = scope === "all"
    ? activeMods
    : activeMods.filter((mod) => !classifiedSet.has(mod.id));

  if (targets.length === 0) {
    return reply({
      scope,
      totalTargetCount: 0,
      classifiedCount: 0,
      unclassifiedCount: 0,
      failedCount: 0,
      categoriesToCreate: [],
      existingCategoryNames: [...existingCategoryNames],
      items: []
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const tagsByWorkshopId = new Map<string, string[]>();
  const failedWorkshops = new Set<string>();
  const uniqueWorkshopIds = [...new Set(targets.map((mod) => mod.workshop_id))];

  for (let i = 0; i < uniqueWorkshopIds.length; i += STEAM_BATCH_SIZE) {
    const chunk = uniqueWorkshopIds.slice(i, i + STEAM_BATCH_SIZE);
    const form = new URLSearchParams({ itemcount: String(chunk.length) });
    chunk.forEach((id, index) => form.set(`publishedfileids[${index}]`, id));
    try {
      const response = await fetch(STEAM_DETAILS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000)
      });
      if (!response.ok) {
        for (const wid of chunk) failedWorkshops.add(wid);
        continue;
      }
      const raw = await readBoundedResponseText(response, MAX_RESPONSE_BYTES);
      const parsed = parseSteamWorkshopDetails(chunk, JSON.parse(raw) as unknown, today);
      for (const wid of chunk) {
        if (wid in parsed.tagsByWorkshopId) {
          tagsByWorkshopId.set(wid, parsed.tagsByWorkshopId[wid]);
        } else {
          failedWorkshops.add(wid);
        }
      }
    } catch (error) {
      if (error instanceof ResponseTooLargeError) {
        return reply({ error: "Steam 응답이 허용 크기를 초과했습니다." }, 502);
      }
      for (const wid of chunk) failedWorkshops.add(wid);
    }
  }

  const neededCategories = new Set<string>();
  const items: {
    modId: string;
    workshopId: string;
    title: string;
    alreadyClassified: boolean;
    categoryNames: readonly string[];
    primaryCategoryName: string | null;
    lookupFailed: boolean;
  }[] = [];

  let classifiedCount = 0;
  let unclassifiedCount = 0;
  let failedCount = 0;

  for (const mod of targets) {
    if (failedWorkshops.has(mod.workshop_id)) {
      failedCount += 1;
      items.push({
        modId: mod.id,
        workshopId: mod.workshop_id,
        title: mod.title,
        alreadyClassified: classifiedSet.has(mod.id),
        categoryNames: [],
        primaryCategoryName: null,
        lookupFailed: true
      });
      continue;
    }
    const suggestion = classifySteamTags(tagsByWorkshopId.get(mod.workshop_id) ?? []);
    if (suggestion.categoryNames.length > 0 && suggestion.primaryCategoryName) {
      classifiedCount += 1;
      for (const name of suggestion.categoryNames) neededCategories.add(name);
    } else {
      unclassifiedCount += 1;
    }
    items.push({
      modId: mod.id,
      workshopId: mod.workshop_id,
      title: mod.title,
      alreadyClassified: classifiedSet.has(mod.id),
      categoryNames: suggestion.categoryNames,
      primaryCategoryName: suggestion.primaryCategoryName,
      lookupFailed: false
    });
  }

  const categoriesToCreate = [...neededCategories]
    .filter((name) => !existingCategoryNames.has(name))
    .map((name) => ({ name, sortOrder: getCategoryPresetSortOrder(name) ?? 0 }))
    .sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999) || a.name.localeCompare(b.name, "ko"));

  return reply({
    scope,
    totalTargetCount: targets.length,
    classifiedCount,
    unclassifiedCount,
    failedCount,
    categoriesToCreate,
    existingCategoryNames: [...existingCategoryNames],
    items
  });
}

/**
 * Explicit user-approved apply: creates missing categories (with load-order sort_order 1..9)
 * and assigns multi-category memberships + 1 primary category via save_mod_categories RPC.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return reply({ error: "요청 출처가 올바르지 않습니다." }, 403);
  }
  if (!isWriteEnabled()) {
    return reply({ error: "이 배포에서는 카테고리 자동 적용을 저장할 수 없습니다." }, 403);
  }
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "저장 권한이 없습니다." }, 403);

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 250_000) return reply({ error: "입력 크기 초과" }, 413);
    raw = JSON.parse(text) as unknown;
  } catch {
    return reply({ error: "잘못된 JSON 형식입니다." }, 400);
  }

  const parsed = parseAutoClassifyApplyInput(raw);
  if (!parsed) {
    return reply({ error: "적용할 모드와 카테고리 목록이 올바르지 않습니다." }, 400);
  }

  const existingRes = await access.supabase.from("categories")
    .select("id,name,sort_order")
    .eq("owner_id", access.user.id)
    .limit(500);
  if (existingRes.error) {
    return reply({ error: "기존 카테고리를 조회하지 못했습니다." }, 503);
  }

  const categoryIdByName = new Map<string, string>();
  for (const row of existingRes.data ?? []) {
    categoryIdByName.set(row.name as string, row.id as string);
  }

  const neededNames = new Set<string>();
  for (const item of parsed.items) {
    for (const name of item.categoryNames) neededNames.add(name);
  }

  const missingNames = [...neededNames]
    .filter((name) => !categoryIdByName.has(name))
    .sort((a, b) => (getCategoryPresetSortOrder(a) ?? 999) - (getCategoryPresetSortOrder(b) ?? 999));

  const createdCategories: string[] = [];
  if (missingNames.length > 0) {
    const rowsToInsert = missingNames.map((name) => ({
      owner_id: access.user.id,
      name,
      sort_order: getCategoryPresetSortOrder(name) ?? 0
    }));
    const { data: inserted, error: insertError } = await access.supabase
      .from("categories")
      .insert(rowsToInsert)
      .select("id,name");

    if (insertError) {
      // Recover cleanly from concurrent duplicate creation (23505) by re-reading owner categories.
      if (insertError.code !== "23505") {
        return reply({ error: "자동 카테고리를 생성하지 못했습니다." }, 503);
      }
      const reload = await access.supabase.from("categories")
        .select("id,name")
        .eq("owner_id", access.user.id)
        .limit(500);
      if (reload.error) {
        return reply({ error: "카테고리 재조회에 실패했습니다." }, 503);
      }
      for (const row of reload.data ?? []) {
        categoryIdByName.set(row.name as string, row.id as string);
      }
    } else {
      for (const row of inserted ?? []) {
        categoryIdByName.set(row.name as string, row.id as string);
        createdCategories.push(row.name as string);
      }
    }
  }

  let appliedCount = 0;
  let failedCount = 0;
  const appliedModIds: string[] = [];

  for (const item of parsed.items) {
    const categoryIds = item.categoryNames
      .map((name) => categoryIdByName.get(name))
      .filter((id): id is string => typeof id === "string");
    const primaryCategoryId = categoryIdByName.get(item.primaryCategoryName) ?? null;

    if (categoryIds.length !== item.categoryNames.length || !primaryCategoryId) {
      failedCount += 1;
      continue;
    }

    const { error } = await access.supabase.rpc("save_mod_categories", {
      p_mod_id: item.modId,
      p_category_ids: categoryIds,
      p_primary_category_id: primaryCategoryId
    });
    if (error) {
      failedCount += 1;
    } else {
      appliedCount += 1;
      appliedModIds.push(item.modId);
    }
  }

  if (createdCategories.length > 0) {
    revalidateDomain("category");
  }
  if (appliedModIds.length > 0) {
    revalidateDomain("modCategory", { modIds: appliedModIds.length <= 20 ? appliedModIds : undefined });
  }

  return reply({
    createdCategories,
    appliedCount,
    failedCount
  }, 200);
}
