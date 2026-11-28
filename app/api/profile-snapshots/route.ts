import { NextRequest } from "next/server";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogModUuid } from "@/lib/catalog-read";
import { planProfileSave } from "@/lib/profile-persistence-plan";
import { reconstructProfileSnapshot } from "@/lib/profile-snapshot-read";
import { projectCatalogEvidence, type CatalogEvidenceParent } from "@/lib/catalog-evidence-output";
import { buildSavedProfileOutput } from "@/lib/saved-profile-output";
import { projectReviewedRelations, type ReviewedRelationRow } from "@/lib/reviewed-mod-relations";
import { planSavedRelationTargetCoverage } from "@/lib/saved-relation-target-coverage";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import {
  buildPrimaryCategoryMap,
  PRIVATE_NO_STORE_HEADERS,
  revalidateDomain,
  type PrimaryCategoryInfo
} from "@/lib/data-sync";
import {
  isTestProfileSnapshotWriteAllowed,
  profileSnapshotErrorStatus,
  toAtomicProfileRpcPayload
} from "@/lib/profile-snapshot-write";
import { stripWorkshopSuffixFromTitle } from "@/lib/steam-description";
import { isSameOriginRequest } from "@/lib/write-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = PRIVATE_NO_STORE_HEADERS;
const MAX_REQUEST_CHARS = 180000;

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}

/**
 * Atomic owner-scoped profile snapshot save.
 * The Supabase RPC enforces owner scope and optimistic CAS revision checks.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return reply({ error: "요청 출처가 올바르지 않습니다." }, 403);
  }
  if (!isTestProfileSnapshotWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    && !isTestCategoryWriteAllowed(process.env)
    && !isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
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

  revalidateDomain("profileSnapshot");
  return reply({ profileId: profile.id, revision: savedRevision }, 201);
}

/**
 * Read-only latest full revision. Rows are immutable and all reads are scoped
 * to the SAME revision, even if another save starts during these queries.
 */
export async function GET(request: NextRequest) {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return reply({ error: "조회 권한이 없습니다." }, 403);

  const profileId = request.nextUrl.searchParams.get("profileId");
  // Prefix is a caller decision. Do not assume the B42.22 Mod ID prefix.
  const prefixChoice = request.nextUrl.searchParams.get("outputPrefix");
  if (prefixChoice !== null && prefixChoice !== "none" && prefixChoice !== "backslash") {
    return reply({ error: "출력 접두사 선택이 올바르지 않습니다." }, 400);
  }
  if (!profileId || !isCatalogModUuid(profileId)) {
    return reply({ error: "프로필 식별자가 올바르지 않습니다." }, 400);
  }
  const { data: profile, error: profileError } = await access.supabase.from("profiles")
    .select("id,owner_id")
    .eq("id", profileId)
    .eq("owner_id", access.user.id)
    .maybeSingle();
  if (profileError) return reply({ error: "프로필을 조회하지 못했습니다." }, 503);
  if (!profile) return reply({ error: "프로필이 없습니다." }, 404);

  const { data: latest, error: revisionError } = await access.supabase.from("profile_revision")
    .select("revision")
    .eq("profile_id", profile.id)
    .eq("owner_id", access.user.id)
    .order("revision", { ascending: false })
    .limit(1);
  if (revisionError) return reply({ error: "저장 회차를 조회하지 못했습니다." }, 503);
  const revision = latest?.[0]?.revision ?? 0;
  if (revision === 0) {
    return reply({ profileId: profile.id, revision, selections: [],
      downloadOnlyWorkshopIds: [] });
  }

  const [choiceResult, downloadResult] = await Promise.all([
    access.supabase.from("profile_mod_choices")
      .select("mod_id_entry_id,enabled,load_order")
      .eq("owner_id", access.user.id)
      .eq("profile_id", profile.id)
      .eq("revision", revision)
      .order("load_order")
      .limit(501),
    access.supabase.from("profile_downloads")
      .select("workshop_id,load_order")
      .eq("owner_id", access.user.id)
      .eq("profile_id", profile.id)
      .eq("revision", revision)
      .order("load_order")
      .limit(501)
  ]);
  if (choiceResult.error || downloadResult.error || !choiceResult.data
    || !downloadResult.data || choiceResult.data.length > 500
    || downloadResult.data.length > 500) {
    return reply({ error: "저장된 선택 목록을 모두 확인할 수 없습니다." }, 503);
  }

  type LoadedParent = CatalogEvidenceParent & { title: string };
  const ids = choiceResult.data.map(item => item.mod_id_entry_id);
  let entries: Array<{ id: string; mod_id: string; value: string }> = [];
  let parents: LoadedParent[] = [];
  if (ids.length) {
    const { data, error } = await access.supabase.from("mod_ids")
      .select("id,mod_id,value")
      .in("id", ids)
      .limit(501);
    if (error || !data || data.length !== ids.length) {
      return reply({ error: "게임 Mod ID를 모두 확인하지 못했습니다." }, 503);
    }
    entries = data;
    const parentIds = [...new Set(entries.map(item => item.mod_id))];
    const parentResult = await access.supabase.from("mods")
      .select("id,owner_id,title,workshop_id,source_url,verification_status,build_compatibility,multiplayer_compatibility,researched_at,is_archived")
      .eq("owner_id", access.user.id)
      .in("id", parentIds)
      .limit(501);
    if (parentResult.error || !parentResult.data
      || parentResult.data.length !== parentIds.length) {
      return reply({ error: "Workshop 소유권을 확인하지 못했습니다." }, 503);
    }
    parents = parentResult.data as LoadedParent[];
  }

  const restored = reconstructProfileSnapshot(
    access.user.id, choiceResult.data, downloadResult.data, entries, parents
  );
  if (!restored) return reply({ error: "프로필 저장 내용 검증에 실패했습니다." }, 503);

  const parentWorkshops = new Set(parents.map(p => p.workshop_id));
  const extraDownloadWorkshops = restored.downloadOnlyWorkshopIds.filter(wid => !parentWorkshops.has(wid));
  const [categoriesRes, primaryRes, downloadModsRes] = await Promise.all([
    parents.length
      ? access.supabase.from("categories").select("id,name").eq("owner_id", access.user.id).limit(500)
      : Promise.resolve({ data: null, error: null }),
    parents.length
      ? access.supabase.from("mod_category_primary").select("mod_id,category_id")
          .eq("owner_id", access.user.id).in("mod_id", parents.map(p => p.id)).limit(501)
      : Promise.resolve({ data: null, error: null }),
    extraDownloadWorkshops.length
      ? access.supabase.from("mods").select("workshop_id,title,is_archived")
          .eq("owner_id", access.user.id).in("workshop_id", extraDownloadWorkshops).limit(501)
      : Promise.resolve({ data: null, error: null })
  ]);

  const primaryByMod = !categoriesRes.error && !primaryRes.error
    ? buildPrimaryCategoryMap(
        (categoriesRes.data ?? []) as { id: string; name: string }[],
        (primaryRes.data ?? []) as { mod_id: string; category_id: string }[]
      )
    : new Map<string, PrimaryCategoryInfo>();

  const byWorkshopId: Record<string, {
    title: string;
    isArchived: boolean;
    primaryCategory: PrimaryCategoryInfo | null;
  }> = {};
  for (const parent of parents) {
    byWorkshopId[parent.workshop_id] = {
      title: stripWorkshopSuffixFromTitle(parent.title),
      isArchived: parent.is_archived,
      primaryCategory: primaryByMod.get(parent.id) ?? null
    };
  }
  for (const row of (downloadModsRes.data ?? []) as { workshop_id: string; title: string; is_archived: boolean }[]) {
    if (!byWorkshopId[row.workshop_id]) {
      byWorkshopId[row.workshop_id] = {
        title: stripWorkshopSuffixFromTitle(row.title),
        isArchived: row.is_archived,
        primaryCategory: null
      };
    }
  }

  const payload = { profileId: profile.id, revision, ...restored, catalogMeta: { byWorkshopId } };
  if (prefixChoice === null) return reply(payload);

  // Basic output only: the selected, owner-verified Mod ID membership is
  // known here, but category rules/relationships/compatibility evidence are
  // NOT loaded. Do not represent this as a full B42.22 compatibility audit.
  const ownerParents = new Map(parents.map(item => [item.id, item]));
  const sourceBindings = entries.flatMap(entry => {
    const parent = ownerParents.get(entry.mod_id);
    return parent ? [{
      modIdUuid: entry.id, workshopId: parent.workshop_id, modId: entry.value
    }] : [];
  });
  // Only approved owner-scoped catalog records are eligible as claim evidence.
  // Do not read/persist arbitrary free-text claims as verified dependencies.
  let researchRows: Array<{ id: string; mod_id: string; raw_payload: unknown; created_at: string }> = [];
  if (parents.length) {
    const { data, error } = await access.supabase.from("research_records")
      .select("id,mod_id,raw_payload,created_at")
      .in("mod_id", parents.map(parent => parent.id))
      .order("created_at", { ascending: false })
      .limit(1001);
    if (error || !data || data.length > 1000) {
      return reply({ error: "카탈로그 조사 근거를 완전히 조회하지 못했습니다." }, 503);
    }
    researchRows = data;
  }
  const projected = projectCatalogEvidence(
    access.user.id, sourceBindings, parents, researchRows
  );
  if (!projected.ok) {
    return reply({ error: "카탈로그 조사 근거의 소유권·출처 검증에 실패했습니다." }, 503);
  }
  // Rules matter only when their subject is enabled in this revision.
  // Keep disabled choices in sourceBindings so an enabled dependency pointing
  // at one is still detected as missing rather than being auto-activated.
  const activeIds = restored.selections
    .filter(item => item.enabled)
    .map(item => item.modIdUuid);
  // The owner/RLS filter is still mandatory even for read-only lookups.
  let relationRows: ReviewedRelationRow[] = [];
  if (activeIds.length) {
    const { data, error } = await access.supabase.from("mod_relations")
      .select("id,owner_id,kind,subject_mod_id_entry_id,target_mod_id_entry_id,research_record_id,evidence_url,checked_at,approved")
      .eq("owner_id", access.user.id)
      .in("subject_mod_id_entry_id", activeIds)
      .limit(501);
    if (error || !data || data.length > 500) {
      return reply({ error: "프로필 관련 모드 관계를 전부 조회할 수 없습니다." }, 503);
    }
    relationRows = data.map(item => ({
      id: item.id, ownerId: item.owner_id,
      kind: item.kind as ReviewedRelationRow["kind"],
      subjectModIdUuid: item.subject_mod_id_entry_id,
      targetModIdUuid: item.target_mod_id_entry_id,
      evidenceRecordId: item.research_record_id,
      sourceUrl: item.evidence_url, checkedAt: item.checked_at,
      approved: item.approved
    }));
  }
  const coverage = planSavedRelationTargetCoverage(sourceBindings, relationRows, activeIds);
  if (!coverage.ok) {
    return reply({ error: "프로필 관련 관계의 대상 목록을 검증할 수 없습니다." }, 503);
  }

  // A required target may exist in the owner's catalog but NOT be selected.
  // Resolve its provider-qualified identity only for rule validation.
  // Do not add it to the saved selections or generated settings.
  const ruleIdentities = [...sourceBindings];
  if (coverage.missingTargetUuids.length) {
    const { data: targetEntries, error: targetError } = await access.supabase
      .from("mod_ids").select("id,mod_id,value")
      .in("id", coverage.missingTargetUuids)
      .limit(501);
    if (targetError || !targetEntries
      || targetEntries.length !== coverage.missingTargetUuids.length) {
      return reply({ error: "필수 관계 대상의 게임 Mod ID를 검증할 수 없습니다." }, 503);
    }
    const targetParentIds = [...new Set(targetEntries.map(item => item.mod_id))];
    const { data: targetParents, error: targetParentError } = await access.supabase
      .from("mods").select("id,owner_id,workshop_id")
      .eq("owner_id", access.user.id)
      .in("id", targetParentIds)
      .limit(501);
    if (targetParentError || !targetParents
      || targetParents.length !== targetParentIds.length) {
      return reply({ error: "관계 대상 Workshop 소유권을 검증할 수 없습니다." }, 503);
    }
    const parentWorkshop = new Map(targetParents.map(item => [item.id, item.workshop_id]));
    for (const item of targetEntries) {
      const workshopId = parentWorkshop.get(item.mod_id);
      if (!workshopId) {
        return reply({ error: "관계 대상의 Workshop 연결을 찾을 수 없습니다." }, 503);
      }
      ruleIdentities.push({ modIdUuid: item.id, workshopId, modId: item.value });
    }
  }

  const reviewed = projectReviewedRelations(
    access.user.id, ruleIdentities, projected.evidence, coverage.relevant
  );
  if (!reviewed.ok) {
    return reply({ error: "모드 관계의 소유권·출처 검증에 실패했습니다." }, 503);
  }
  const output = buildSavedProfileOutput(
    restored, sourceBindings,
    { catalog: projected.catalog, archivedWorkshopIds: projected.archivedWorkshopIds },
    { categoryPriority: [], rules: reviewed.rules },
    { modIdPrefix: prefixChoice === "backslash" ? "\\" : "" }
  );
  if (!output.ok) return reply({ error: "출력용 Mod ID 출처 검증에 실패했습니다." }, 503);
  return reply({
    ...payload,
    outputPreview: {
      scope: "owner-catalog-recorded-compatibility-claims",
      prefix: prefixChoice,
      preview: output.report.preview,
      issues: output.report.issues,
      catalogEvidence: projected.evidence,
      reviewedRelations: { verifiedCount: reviewed.rules.length, withheld: reviewed.withheld },
      // No copy authorization: verified dependencies, group rules and B42.22
      // build-specific sources are not yet persisted/loaded.
      readyForCopy: false
    }
  });
}
